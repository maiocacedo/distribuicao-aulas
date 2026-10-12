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
 */
export function criarHistorico({ consultar, transacao, aoEscrever }: Dependencias) {
  let pilha: Registro[] = [];
  let versao = 0;
  let atual: EstadoDoHistorico = { podeDesfazer: false, rotulo: null, versao };
  const ouvintes = new Set<() => void>();

  function publicar() {
    const topo = pilha[pilha.length - 1];
    atual = { podeDesfazer: pilha.length > 0, rotulo: topo?.rotulo ?? null, versao };
    ouvintes.forEach((o) => o());
  }

  function limpar() {
    if (pilha.length === 0) return;
    pilha = [];
    publicar();
  }

  aoEscrever((origem) => {
    if (origem !== "grade") limpar();
  });

  async function executarNaGrade(cursoId: number, rotulo: string, instrucoes: Instrucao[]) {
    const antes = await consultar<Record<string, unknown>>("SELECT * FROM alocacoes WHERE curso_id = ?", [cursoId]);
    const resultado = await transacao(instrucoes, { origem: "grade" });
    pilha = [...pilha, { rotulo, cursoId, antes }].slice(-LIMITE);
    publicar();
    return resultado;
  }

  async function desfazer(): Promise<string | null> {
    const registro = pilha[pilha.length - 1];
    if (!registro) return null;
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
      // O que está guardado não cabe mais no banco; o resto da pilha também não.
      pilha = [];
      publicar();
      throw e;
    }
    pilha = pilha.slice(0, -1);
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
