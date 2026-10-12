import type { Instrucao, Origem, ResultadoEscrita } from "../db";

export interface EstadoDoHistorico {
  podeDesfazer: boolean;
  /** O que o próximo "desfazer" desfaz. */
  rotulo: string | null;
  /** Sobe a cada desfazer: as telas de grade recarregam quando muda. */
  versao: number;
}

export interface Dependencias {
  consultar: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  transacao: (instrucoes: Instrucao[], opcoes?: { origem?: Origem }) => Promise<ResultadoEscrita>;
  aoEscrever: (ouvinte: (origem: Origem) => void) => () => void;
}

interface Registro {
  rotulo: string;
  cursoId: number;
  /** A grade inteira do curso antes da ação. */
  antes: Record<string, unknown>[];
}

const LIMITE = 50;

/**
 * Desfazer das ações da grade, em memória.
 *
 * Guarda a grade inteira do curso antes de cada ação e, para desfazer, apaga e
 * reinsere. É mais simples que guardar o inverso de cada ação e não tem como
 * ficar incoerente: o que volta é exatamente o que estava gravado.
 *
 * Qualquer escrita que não seja da grade zera a pilha: restaurar aulas sobre um
 * cadastro que mudou poderia recriar o que o cadastro acabou de invalidar.
 *
 * Duas coisas mantêm isso verdadeiro quando as chamadas se cruzam (duplo
 * Ctrl+Z, duas ações seguidas, troca de curso no meio de uma gravação):
 *
 * - Fila: `executarNaGrade` e `desfazer` rodam uma de cada vez, na ordem em que
 *   foram chamadas. Ler o "antes" e gravar não são atômicos entre si, e dois
 *   desfazer lendo o mesmo topo descartariam uma ação sem desfazê-la.
 * - Época: um contador que sobe a cada invalidação (`limpar` e escrita que não
 *   é da grade). Uma ação que começou numa época e terminou noutra fica gravada
 *   no banco, mas não entra na pilha: o "antes" dela é anterior à invalidação.
 */
export function criarHistorico({ consultar, transacao, aoEscrever }: Dependencias) {
  let pilha: Registro[] = [];
  let versao = 0;
  let epoca = 0;
  let atual: EstadoDoHistorico = { podeDesfazer: false, rotulo: null, versao };
  const ouvintes = new Set<() => void>();
  // Nunca rejeita: a falha de uma chamada não pode travar nem contaminar as seguintes.
  let fila: Promise<unknown> = Promise.resolve();

  function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = fila.then(tarefa);
    fila = resultado.catch(() => {});
    return resultado;
  }

  /** Só avisa e troca a referência de `estado()` se algo mudou de fato. */
  function publicar() {
    const topo = pilha[pilha.length - 1];
    const podeDesfazer = pilha.length > 0;
    const rotulo = topo?.rotulo ?? null;
    if (atual.podeDesfazer === podeDesfazer && atual.rotulo === rotulo && atual.versao === versao) return;
    atual = { podeDesfazer, rotulo, versao };
    ouvintes.forEach((o) => o());
  }

  function limpar() {
    // Sobe mesmo com a pilha vazia: pode haver uma ação em voo cujo "antes" já é velho.
    epoca++;
    pilha = [];
    publicar();
  }

  aoEscrever((origem) => {
    if (origem !== "grade") limpar();
  });

  /**
   * Grava as instruções como uma ação da grade e a põe no histórico.
   *
   * As instruções devem se limitar às `alocacoes` do curso: é só isso que o
   * desfazer guarda e restaura.
   */
  function executarNaGrade(cursoId: number, rotulo: string, instrucoes: Instrucao[]) {
    // Anotada na chamada, não na vez da fila: se o histórico for invalidado
    // enquanto esta ação espera, o curso pode já ser outro.
    const epocaDaChamada = epoca;
    return naFila(async () => {
      const antes = await consultar<Record<string, unknown>>("SELECT * FROM alocacoes WHERE curso_id = ?", [cursoId]);
      const resultado = await transacao(instrucoes, { origem: "grade" });
      if (epoca === epocaDaChamada) {
        pilha = [...pilha, { rotulo, cursoId, antes }].slice(-LIMITE);
        publicar();
      }
      return resultado;
    });
  }

  function desfazer(): Promise<string | null> {
    return naFila(desfazerDoTopo);
  }

  async function desfazerDoTopo(): Promise<string | null> {
    const registro = pilha[pilha.length - 1];
    if (!registro) return null;
    const epocaDoInicio = epoca;
    const instrucoes: Instrucao[] = [
      { sql: "DELETE FROM alocacoes WHERE curso_id = ?", params: [registro.cursoId] },
      ...registro.antes.map((linha) => {
        const colunas = Object.keys(linha);
        return {
          sql: `INSERT INTO alocacoes (${colunas.join(", ")}) VALUES (${colunas.map(() => "?").join(", ")})`,
          params: colunas.map((c) => linha[c]),
        };
      }),
    ];
    try {
      await transacao(instrucoes, { origem: "grade" });
    } catch (e) {
      // Qualquer falha na restauração zera a pilha, até uma passageira: por
      // escolha, já que não dá para saber se o que está guardado ainda cabe no
      // banco, e tentar de novo com um retrato duvidoso é pior que perder o histórico.
      pilha = [];
      publicar();
      throw e;
    }
    // Se a pilha foi zerada enquanto restaurava, não sobra registro para tirar:
    // a restauração valeu (versao sobe e as telas recarregam), mas nada ressuscita.
    if (epoca === epocaDoInicio) pilha = pilha.slice(0, -1);
    versao++;
    publicar();
    return registro.rotulo;
  }

  return {
    executarNaGrade,
    desfazer,
    limpar,
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    estado: () => atual,
  };
}
