import { describe, expect, it } from "vitest";
import { mesmaCarga, type Carga } from "./arrasto";
import type { Aula, Fatia } from "./usarGrade";

const fatia = (extra: Partial<Fatia> = {}) => ({ disciplina_id: 1, professor_id: 1, periodo: 1, ...extra }) as Fatia;

const aula = (extra: Partial<Aula> = {}): Aula => ({
  cursoId: 1, periodo: 1, dia: 0, hora: 0, disciplinaId: 1, professorId: 1, salaId: 1,
  fixada: 0, disciplina: "Cálculo", professor: "Ana Souza", sala: null, curso: "Alfa", ...extra,
});

const pendencia = (extra: Partial<Fatia> = {}): Carga => ({ tipo: "fatia", fatia: fatia(extra) });
const daMalha = (extra: Partial<Aula> = {}): Carga => ({ tipo: "aula", aula: aula(extra), fatia: fatia() });

describe("mesmaCarga", () => {
  it("a aula recarregada no meio do arrasto continua a mesma, com a sala que tiver", () => {
    expect(mesmaCarga(daMalha(), daMalha({ salaId: 2 }))).toBe(true);
  });

  it("outra aula no mesmo horário não é a que foi pega", () => {
    expect(mesmaCarga(daMalha(), daMalha({ disciplinaId: 2 }))).toBe(false);
    expect(mesmaCarga(daMalha(), daMalha({ professorId: 2 }))).toBe(false);
  });

  it("a aula do mesmo horário em outro período ou outro curso não é a que foi pega", () => {
    expect(mesmaCarga(daMalha(), daMalha({ periodo: 2 }))).toBe(false);
    expect(mesmaCarga(daMalha(), daMalha({ cursoId: 2 }))).toBe(false);
  });

  it("a aula em outro horário não é a que foi pega", () => {
    expect(mesmaCarga(daMalha(), daMalha({ dia: 1 }))).toBe(false);
    expect(mesmaCarga(daMalha(), daMalha({ hora: 1 }))).toBe(false);
  });

  it("a pendência é a mesma pela fatia", () => {
    expect(mesmaCarga(pendencia(), pendencia())).toBe(true);
    expect(mesmaCarga(pendencia(), pendencia({ disciplina_id: 2 }))).toBe(false);
    expect(mesmaCarga(pendencia(), pendencia({ professor_id: 2 }))).toBe(false);
  });

  it("pendência e aula não se confundem, nem com a mesma fatia", () => {
    expect(mesmaCarga(pendencia(), daMalha())).toBe(false);
    expect(mesmaCarga(daMalha(), pendencia())).toBe(false);
  });
});
