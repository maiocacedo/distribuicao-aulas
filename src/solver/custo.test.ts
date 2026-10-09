import { describe, expect, it } from "vitest";
import { aula, fatia, problemaMinimo } from "../../testes/suporte/problema";
import { custoTotal } from "./custo";
import type { Pesos } from "./tipos";

const ZERO: Pesos = {
  buracoProfessor: 0,
  buracoAluno: 0,
  contraturno: 0,
  preferenciaDias: 0,
  excessoContraturno: 0,
  optativaSemTurno: 0,
  salaAceitavel: 0,
};
const so = (extra: Partial<Pesos>): Pesos => ({ ...ZERO, ...extra });

const opt = (disciplinaId: number) => fatia({ disciplinaId, professorId: disciplinaId, optativa: true });
const daOpt = (disciplinaId: number, dia: number, hora: number) => aula(dia, hora, { disciplinaId, professorId: disciplinaId });

describe("custoTotal", () => {
  it("optativa no contraturno não paga contraturno nem excesso", () => {
    const p = problemaMinimo({ fatias: [opt(1)] });
    const grade = [daOpt(1, 0, 6), daOpt(1, 0, 7)];
    expect(custoTotal(p, grade, so({ contraturno: 1, excessoContraturno: 1 }))).toBe(0);
  });

  it("obrigatória no contraturno paga as duas coisas", () => {
    const p = problemaMinimo({ fatias: [fatia()] });
    expect(custoTotal(p, [aula(0, 6), aula(0, 7)], so({ contraturno: 1 }))).toBe(2);
    expect(custoTotal(p, [aula(0, 6), aula(0, 7)], so({ excessoContraturno: 1 }))).toBe(1);
  });

  it("optativaSemTurno cobra quando nenhuma optativa do período ficou no turno", () => {
    const p = problemaMinimo({ fatias: [opt(1), opt(2)] });
    const ambasNaTarde = [daOpt(1, 0, 6), daOpt(1, 0, 7), daOpt(2, 1, 6), daOpt(2, 1, 7)];
    const umaDeManha = [daOpt(1, 0, 0), daOpt(1, 0, 1), daOpt(2, 1, 6), daOpt(2, 1, 7)];
    expect(custoTotal(p, ambasNaTarde, so({ optativaSemTurno: 1 }))).toBe(1);
    expect(custoTotal(p, umaDeManha, so({ optativaSemTurno: 1 }))).toBe(0);
  });

  it("optativa só conta como no turno com todas as aulas nele", () => {
    const p = problemaMinimo({ fatias: [opt(1)] });
    expect(custoTotal(p, [daOpt(1, 0, 5), daOpt(1, 0, 6)], so({ optativaSemTurno: 1 }))).toBe(1);
  });

  it("sala aceitável custa por aula", () => {
    const p = problemaMinimo({
      salas: [1, 2].map((id) => ({ id, tipo: "Sala de Aula" })),
      fatias: [
        fatia({
          exigeSala: true,
          salas: [
            { id: 1, preferencia: 1 },
            { id: 2, preferencia: 2 },
          ],
        }),
      ],
    });
    expect(custoTotal(p, [aula(0, 0, { salaId: 2 }), aula(0, 1, { salaId: 2 })], so({ salaAceitavel: 1 }))).toBe(2);
    expect(custoTotal(p, [aula(0, 0, { salaId: 1 }), aula(0, 1, { salaId: 1 })], so({ salaAceitavel: 1 }))).toBe(0);
  });

  it("buraco da turma ignora optativas", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 1 }), opt(2)] });
    const grade = [aula(0, 0), daOpt(2, 0, 3), daOpt(2, 0, 4)];
    expect(custoTotal(p, grade, so({ buracoAluno: 1 }))).toBe(0);
  });

  it("max_dias_semana não entra no custo: é regra dura", () => {
    const p = problemaMinimo({
      professores: [{ id: 1, prefDias: "indiferente", peso: 0, maxDias: 1 }],
      fatias: [fatia()],
    });
    expect(custoTotal(p, [aula(0, 0), aula(1, 0)], so({ preferenciaDias: 1 }))).toBe(0);
  });
});
