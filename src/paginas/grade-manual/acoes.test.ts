import { describe, expect, it } from "vitest";
import { contextoMinimo, fatiaRegras } from "../../../testes/suporte/regras";
import { alocar, fixar, limpar, mover, remover, salaAoMover, semAOrigem, trocarSala } from "./acoes";
import type { Aula, Fatia } from "./usarGrade";

const aula = (dia: number, hora: number, salaId: number | null, extra: Partial<Aula> = {}): Aula => ({
  cursoId: 1, periodo: 1, dia, hora, disciplinaId: 1, professorId: 1, salaId,
  fixada: 0, disciplina: "Cálculo", professor: "Ana Souza", sala: null, curso: "Alfa", ...extra,
});

describe("instruções", () => {
  // A aula é a que a tela mostrava: além do lugar, a disciplina e o professor.
  // Se a célula já é de outra aula, a instrução não toca em nenhuma linha.
  const ONDE = "WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ? AND disciplina_id = ? AND professor_id = ?";
  const chave = [1, 1, 0, 0, 7, 3];
  const daTela = () => aula(0, 0, 1, { disciplinaId: 7, professorId: 3 });

  it("mover troca dia, hora e sala da aula certa, se ela não está fixada", () => {
    expect(mover(daTela(), 2, 3, 4)).toEqual({
      sql: `UPDATE alocacoes SET dia = ?, hora = ?, sala_id = ? ${ONDE} AND fixada = 0`,
      params: [2, 3, 4, ...chave],
    });
  });

  it("remover leva a aula que a tela mostrava, se ela não está fixada", () => {
    expect(remover(daTela())).toEqual({ sql: `DELETE FROM alocacoes ${ONDE} AND fixada = 0`, params: chave });
  });

  // Trocar a sala e fixar valem também para a aula fixada (soltar é fixar com 0).
  it("trocar sala e fixar miram a aula que a tela mostrava, fixada ou não", () => {
    expect(trocarSala(daTela(), null)).toEqual({ sql: `UPDATE alocacoes SET sala_id = ? ${ONDE}`, params: [null, ...chave] });
    expect(fixar(daTela(), true)).toEqual({ sql: `UPDATE alocacoes SET fixada = ? ${ONDE}`, params: [1, ...chave] });
  });

  it("limpar poupa as fixadas", () => {
    expect(limpar(1, 2).sql).toMatch(/fixada = 0/);
    expect(limpar(1, 2).params).toEqual([1, 2]);
  });

  it("alocar insere a fatia no horário", () => {
    const f = { disciplina_id: 7, professor_id: 3 } as Fatia;
    expect(alocar(1, 2, 0, 5, f, null).params).toEqual([1, 2, 0, 5, 7, 3, null]);
  });
});

describe("mover", () => {
  const ctx = contextoMinimo({ salas: [{ id: 1, tipo: "Sala de Aula" }, { id: 2, tipo: "Sala de Aula" }] });
  const regras = fatiaRegras({ exigeSala: true });

  it("a aula de origem sai da ocupação", () => {
    const origem = aula(0, 0, 1);
    const oc = semAOrigem(1, [origem], origem);
    expect(oc.daSala(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)).toBeUndefined();
  });

  // Uma recarga no meio do arrasto troca os objetos: a aula em mãos é a mesma
  // linha da tabela, e não o mesmo objeto.
  it("a origem sai pela chave, mesmo sendo outro objeto", () => {
    const outra = aula(1, 0, 2, { disciplinaId: 2, professorId: 2 });
    const oc = semAOrigem(1, [aula(0, 0, 1), outra], aula(0, 0, 1));
    expect(oc.daSala(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(2, 1, 0)).toBe(outra);
  });

  it("a aula do mesmo horário em outro período ou outro curso não é a origem", () => {
    const doSegundo = aula(0, 0, 2, { periodo: 2, disciplinaId: 2, professorId: 2 });
    const deOutroCurso = aula(0, 0, null, { cursoId: 2, disciplinaId: 3, professorId: 3 });
    const oc = semAOrigem(1, [aula(0, 0, 1), doSegundo, deOutroCurso], aula(0, 0, 1));
    expect(oc.doProfessor(2, 0, 0)).toBe(doSegundo);
    expect(oc.doProfessor(3, 0, 0)).toBe(deOutroCurso);
  });

  it("leva a sala quando ela está livre no destino", () => {
    const origem = aula(0, 0, 2);
    const oc = semAOrigem(1, [origem], origem);
    expect(salaAoMover(ctx, oc, regras, origem, 1, 0, null)).toBe(2);
  });

  it("troca de sala quando a de origem está ocupada no destino", () => {
    const origem = aula(0, 0, 1);
    const outra = aula(1, 0, 1, { periodo: 2, disciplinaId: 2, professorId: 2 });
    const oc = semAOrigem(1, [origem, outra], origem);
    expect(salaAoMover(ctx, oc, regras, origem, 1, 0, null)).toBe(2);
  });

  it("troca de sala quando a de origem deixou de servir", () => {
    const origem = aula(0, 0, 1);
    const oc = semAOrigem(1, [origem], origem);
    const soASegunda = fatiaRegras({ exigeSala: true, salas: [{ id: 2, preferencia: 1 }] });
    expect(salaAoMover(ctx, oc, soASegunda, origem, 1, 0, null)).toBe(2);
  });

  it("fica sem sala quando a disciplina não exige", () => {
    const origem = aula(0, 0, null);
    const oc = semAOrigem(1, [origem], origem);
    expect(salaAoMover(ctx, oc, fatiaRegras(), origem, 1, 0, null)).toBeNull();
  });
});
