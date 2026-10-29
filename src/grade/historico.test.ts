import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../testes/suporte/banco";
import { criarPonte } from "../../testes/suporte/ponte";
import type { Instrucao, Origem, ResultadoEscrita } from "../db";
import { criarHistorico, type Dependencias } from "./historico";

const SEMENTE = `
  INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
  INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
    VALUES (1, 1, 'Cálculo', 1, 4, 0), (2, 2, 'Física', 1, 2, 0);
  INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4), (2, 1, 2);
  INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, fixada)
    VALUES (1, 1, 0, 0, 1, 1, 1), (1, 1, 0, 1, 1, 1, 0), (2, 1, 1, 0, 2, 1, 0);`;

let banco: DatabaseSync;
let deps: Dependencias;
/** Origem de cada escrita que passou por `deps.transacao`, na ordem. */
let gravacoes: (Origem | undefined)[];
/**
 * Quando preenchido, a próxima escrita da grade avisa que chegou e espera ser
 * solta: é como o teste controla o intercalamento de chamadas assíncronas.
 */
let reter: { chegou: Portao; solta: Portao } | null;

interface Portao {
  aberto: Promise<void>;
  abrir: () => void;
}
function portao(): Portao {
  let abrir!: () => void;
  const aberto = new Promise<void>((r) => (abrir = r));
  return { aberto, abrir };
}

const aulas = (curso: number) =>
  banco.prepare("SELECT dia, hora, fixada FROM alocacoes WHERE curso_id = ? ORDER BY dia, hora").all(curso).map((l) => ({ ...(l as object) }));

const apagar = (dia: number, hora: number): Instrucao => ({
  sql: "DELETE FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND dia = ? AND hora = ?",
  params: [dia, hora],
});

beforeEach(() => {
  banco = criarBanco({ massa: false });
  banco.exec(SEMENTE);
  const ponte = criarPonte(banco);
  const ouvintes = new Set<(o: Origem) => void>();
  gravacoes = [];
  reter = null;
  deps = {
    consultar: lerDe(banco),
    transacao: async (instrucoes, opcoes = {}) => {
      gravacoes.push(opcoes.origem);
      if (opcoes.origem === "grade" && reter) {
        const { chegou, solta } = reter;
        reter = null;
        chegou.abrir();
        await solta.aberto;
      }
      const r = ponte("transacao", { instrucoes });
      if (!r.ok) throw new Error(r.erro);
      ouvintes.forEach((o) => o(opcoes.origem ?? "cadastro"));
      return r.valor as ResultadoEscrita;
    },
    aoEscrever: (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
  };
});

describe("histórico da grade", () => {
  it("começa vazio", () => {
    const h = criarHistorico(deps);
    expect(h.estado()).toEqual({ podeDesfazer: false, rotulo: null, versao: 0 });
  });

  it("desfaz a última ação e devolve a grade como estava, com a fixação", async () => {
    const h = criarHistorico(deps);
    const antes = aulas(1);
    await h.executarNaGrade(1, "Limpar o 1º período", [{ sql: "DELETE FROM alocacoes WHERE curso_id = 1" }]);
    expect(aulas(1)).toEqual([]);
    expect(h.estado()).toMatchObject({ podeDesfazer: true, rotulo: "Limpar o 1º período" });

    expect(await h.desfazer()).toBe("Limpar o 1º período");
    expect(aulas(1)).toEqual(antes);
    expect(h.estado().podeDesfazer).toBe(false);
  });

  it("desfaz em ordem, da mais recente para a mais antiga", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    expect(await h.desfazer()).toBe("B");
    expect(aulas(1)).toHaveLength(1);
    expect(await h.desfazer()).toBe("A");
    expect(aulas(1)).toHaveLength(2);
  });

  it("não toca nas aulas de outro curso", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.desfazer();
    expect(aulas(2)).toHaveLength(1);
  });

  it("uma escrita de cadastro zera o histórico", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await deps.transacao([{ sql: "UPDATE professores SET nome = 'Ana S.' WHERE id = 1" }]);
    expect(h.estado().podeDesfazer).toBe(false);
    expect(await h.desfazer()).toBeNull();
  });

  it("a própria ação da grade e o desfazer não zeram o histórico", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    await h.desfazer();
    expect(h.estado()).toMatchObject({ podeDesfazer: true, rotulo: "A" });
  });

  it("uma ação que falha não entra no histórico", async () => {
    const h = criarHistorico(deps);
    await expect(h.executarNaGrade(1, "A", [{ sql: "DELETE FROM tabela_que_nao_existe" }])).rejects.toThrow();
    expect(h.estado().podeDesfazer).toBe(false);
  });

  it("guarda no máximo 50 ações", async () => {
    const h = criarHistorico(deps);
    for (let i = 0; i < 55; i++)
      await h.executarNaGrade(1, `ação ${i}`, [
        { sql: "UPDATE alocacoes SET fixada = 1 - fixada WHERE curso_id = 1 AND dia = 0 AND hora = 1" },
      ]);
    let desfeitas = 0;
    while (await h.desfazer()) desfeitas++;
    expect(desfeitas).toBe(50);
  });

  it("se a restauração falha, zera o histórico e propaga o erro", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    // A disciplina some por fora: reinserir as aulas dela viola a chave estrangeira.
    banco.exec("DELETE FROM alocacoes WHERE disciplina_id = 1; DELETE FROM disciplina_professores WHERE disciplina_id = 1; DELETE FROM disciplinas WHERE id = 1;");
    const antesDaTentativa = [aulas(1), aulas(2)];
    await expect(h.desfazer()).rejects.toThrow();
    expect(h.estado().podeDesfazer).toBe(false);
    // A transação é tudo ou nada: o DELETE que veio antes do INSERT que falhou não vale.
    expect([aulas(1), aulas(2)]).toEqual(antesDaTentativa);
  });

  it("avisa quem assina e troca a referência do estado só quando muda", async () => {
    const h = criarHistorico(deps);
    let avisos = 0;
    h.assinar(() => avisos++);
    const inicial = h.estado();
    expect(h.estado()).toBe(inicial);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    expect(avisos).toBe(1);
    expect(h.estado()).not.toBe(inicial);
    const versao = h.estado().versao;
    await h.desfazer();
    expect(h.estado().versao).toBe(versao + 1);
  });

  it("limpar zera", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    h.limpar();
    expect(h.estado().podeDesfazer).toBe(false);
  });

  it("cancelar a assinatura faz o ouvinte parar de ser avisado", async () => {
    const h = criarHistorico(deps);
    let avisos = 0;
    const cancelar = h.assinar(() => avisos++);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    expect(avisos).toBe(1);
    cancelar();
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    await h.desfazer();
    expect(avisos).toBe(1);
  });

  it("limpar com a pilha cheia avisa os assinantes; com a pilha vazia, não", async () => {
    const h = criarHistorico(deps);
    let avisos = 0;
    h.assinar(() => avisos++);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    expect(avisos).toBe(1);
    const cheio = h.estado();
    h.limpar();
    expect(avisos).toBe(2);
    expect(h.estado()).not.toBe(cheio);
    const vazio = h.estado();
    h.limpar();
    expect(avisos).toBe(2);
    expect(h.estado()).toBe(vazio);
  });
});

describe("histórico da grade: chamadas que se cruzam", () => {
  it("dois desfazer sem await entre eles desfazem as duas últimas ações, em ordem", async () => {
    const h = criarHistorico(deps);
    const inicial = aulas(1);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    const versao = h.estado().versao;
    const rotulos = await Promise.all([h.desfazer(), h.desfazer()]);
    expect(rotulos).toEqual(["B", "A"]);
    expect(aulas(1)).toEqual(inicial);
    expect(h.estado()).toMatchObject({ podeDesfazer: false, rotulo: null, versao: versao + 2 });
  });

  it("dois desfazer simultâneos com uma ação só: um devolve o rótulo, o outro null, e o banco é restaurado uma vez", async () => {
    const h = criarHistorico(deps);
    const inicial = aulas(1);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    const antes = gravacoes.length;
    const rotulos = await Promise.all([h.desfazer(), h.desfazer()]);
    expect(rotulos).toEqual(["A", null]);
    expect(gravacoes.length - antes).toBe(1);
    expect(aulas(1)).toEqual(inicial);
    expect(h.estado().podeDesfazer).toBe(false);
  });

  it("duas ações sem await entre elas guardam, cada uma, o 'antes' certo", async () => {
    const h = criarHistorico(deps);
    const inicial = aulas(1);
    await Promise.all([h.executarNaGrade(1, "A", [apagar(0, 0)]), h.executarNaGrade(1, "B", [apagar(0, 1)])]);
    expect(aulas(1)).toEqual([]);
    expect(await h.desfazer()).toBe("B");
    // Só o efeito de B some; o de A continua no banco.
    expect(aulas(1)).toHaveLength(1);
    expect(aulas(1)).not.toEqual(inicial);
    expect(await h.desfazer()).toBe("A");
    expect(aulas(1)).toEqual(inicial);
  });

  it("escrita de cadastro no meio de uma ação em voo: a ação fica gravada, mas não entra no histórico", async () => {
    const h = criarHistorico(deps);
    reter = { chegou: portao(), solta: portao() };
    const { chegou, solta } = reter;
    const acao = h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await chegou.aberto;
    // O "antes" de A já foi lido; o cadastro muda por baixo dele.
    await deps.transacao([{ sql: "UPDATE professores SET nome = 'Ana S.' WHERE id = 1" }]);
    solta.abrir();
    await acao;
    expect(aulas(1)).toHaveLength(1);
    expect(h.estado().podeDesfazer).toBe(false);
    expect(await h.desfazer()).toBeNull();
    expect(aulas(1)).toHaveLength(1);
  });

  it("limpar no meio de uma ação em voo: a ação fica gravada, mas não entra no histórico", async () => {
    const h = criarHistorico(deps);
    reter = { chegou: portao(), solta: portao() };
    const { chegou, solta } = reter;
    const acao = h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await chegou.aberto;
    // Mesmo com a pilha vazia: é a troca de curso, e o registro seria do curso antigo.
    h.limpar();
    solta.abrir();
    await acao;
    expect(aulas(1)).toHaveLength(1);
    expect(h.estado().podeDesfazer).toBe(false);
    expect(await h.desfazer()).toBeNull();
  });

  it("limpar antes de uma ação enfileirada começar também a deixa fora do histórico", async () => {
    const h = criarHistorico(deps);
    reter = { chegou: portao(), solta: portao() };
    const { chegou, solta } = reter;
    const a = h.executarNaGrade(1, "A", [apagar(0, 0)]);
    const b = h.executarNaGrade(1, "B", [apagar(0, 1)]);
    await chegou.aberto;
    h.limpar();
    solta.abrir();
    await Promise.all([a, b]);
    expect(aulas(1)).toEqual([]);
    expect(h.estado().podeDesfazer).toBe(false);
  });

  it("cadastro no meio de um desfazer em voo: a restauração vale, mas não sobra registro", async () => {
    const h = criarHistorico(deps);
    const inicial = aulas(1);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    reter = { chegou: portao(), solta: portao() };
    const { chegou, solta } = reter;
    const desfeito = h.desfazer();
    await chegou.aberto;
    await deps.transacao([{ sql: "UPDATE professores SET nome = 'Ana S.' WHERE id = 1" }]);
    solta.abrir();
    expect(await desfeito).toBe("B");
    expect(aulas(1)).toHaveLength(1);
    expect(aulas(1)).not.toEqual(inicial);
    expect(h.estado()).toMatchObject({ podeDesfazer: false, rotulo: null });
    expect(await h.desfazer()).toBeNull();
  });

  it("uma ação que falha não trava a fila: a seguinte funciona e entra no histórico", async () => {
    const h = criarHistorico(deps);
    const falha = expect(h.executarNaGrade(1, "A", [{ sql: "DELETE FROM tabela_que_nao_existe" }])).rejects.toThrow();
    const ok = h.executarNaGrade(1, "B", [apagar(0, 0)]);
    await falha;
    await ok;
    expect(h.estado()).toMatchObject({ podeDesfazer: true, rotulo: "B" });
    expect(await h.desfazer()).toBe("B");
  });

  it("um desfazer que falha não trava a fila nem contamina o seguinte", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    banco.exec("DELETE FROM alocacoes WHERE disciplina_id = 1; DELETE FROM disciplina_professores WHERE disciplina_id = 1; DELETE FROM disciplinas WHERE id = 1;");
    const falha = expect(h.desfazer()).rejects.toThrow();
    const seguinte = h.desfazer();
    await falha;
    expect(await seguinte).toBeNull();
    await h.executarNaGrade(2, "C", [{ sql: "DELETE FROM alocacoes WHERE curso_id = 2" }]);
    expect(await h.desfazer()).toBe("C");
  });
});
