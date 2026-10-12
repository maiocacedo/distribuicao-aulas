import { describe, expect, it } from "vitest";
import { contextoMinimo, fatiaRegras } from "../../../testes/suporte/regras";
import { alocar, fixar, limpar, mover, remover, salaAoMover, semAOrigem, trocarSala } from "./acoes";
import type { Aula, Fatia } from "./usarGrade";

const aula = (dia: number, hora: number, salaId: number | null, extra: Partial<Aula> = {}): Aula => ({
  cursoId: 1, periodo: 1, dia, hora, disciplinaId: 1, professorId: 1, salaId,
  fixada: 0, disciplina: "Cálculo", professor: "Ana Souza", sala: null, curso: "Alfa", ...extra,
});

describe("instruções", () => {
  it("mover troca dia, hora e sala da aula certa", () => {
    expect(mover(aula(0, 0, 1), 2, 3, 4)).toEqual({
      sql: "UPDATE alocacoes SET dia = ?, hora = ?, sala_id = ? WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
      params: [2, 3, 4, 1, 1, 0, 0],
    });
  });

  it("remover, trocar sala e fixar miram a aula pela chave", () => {
    const chave = [1, 1, 0, 0];
    expect(remover(aula(0, 0, 1)).params).toEqual(chave);
    expect(trocarSala(aula(0, 0, 1), null).params).toEqual([null, ...chave]);
    expect(fixar(aula(0, 0, 1), true).params).toEqual([1, ...chave]);
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
