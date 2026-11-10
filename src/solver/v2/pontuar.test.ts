import { describe, expect, it } from "vitest";
import { aula, fatia, problemaMinimo } from "../../../testes/suporte/problema";
import { buracosNaLista, resolver, variacaoDeBuracos } from "./solver";

describe("solver v2 — buracos sem hora repetida", () => {
  it("conta os vazios entre a primeira e a última aula", () => {
    expect(buracosNaLista([])).toBe(0);
    expect(buracosNaLista([2])).toBe(0);
    expect(buracosNaLista([0, 2])).toBe(1);
    expect(buracosNaLista([4, 0, 2])).toBe(2);
  });

  it("hora repetida conta uma vez e nunca dá buraco negativo", () => {
    expect(buracosNaLista([3, 3])).toBe(0);
    expect(buracosNaLista([1, 1, 1])).toBe(0);
    expect(variacaoDeBuracos([2, 4], [2])).toBe(0);
  });
});

describe("solver v2 — nota marginal", () => {
  it("o bloco que fecha um buraco sai mais barato que um dia vazio", () => {
    const fecha = variacaoDeBuracos([0, 2], [1]);
    const diaVazio = variacaoDeBuracos([], [1]);
    expect(fecha).toBe(-1);
    expect(diaVazio).toBe(0);
    expect(fecha).toBeLessThan(diaVazio);
  });

  it("na busca, a aula nova vai para o dia em que fecha o buraco da turma", () => {
    // Dia 3 já tem buraco na hora 1 (aulas fixadas nas horas 0 e 2).
    const p = problemaMinimo({
      professores: [
        { id: 1, prefDias: "indiferente", peso: 0, maxDias: null },
        { id: 2, prefDias: "indiferente", peso: 0, maxDias: null },
      ],
      fatias: [
        fatia({ disciplinaId: 1, professorId: 1, aulas: 2 }),
        fatia({ disciplinaId: 2, professorId: 2, aulas: 1 }),
      ],
      fixadas: [aula(3, 0), aula(3, 2)],
    });
    const r = resolver(p, { rodadasDeMelhoria: 0 });
    const nova = r.alocacoes.find((a) => a.disciplinaId === 2)!;
    expect([nova.dia, nova.hora]).toEqual([3, 1]);
  });

  it("professor e período com o mesmo número não se misturam", () => {
    // O professor 2 dá aula ao período 1; o período 2 tem aulas nas horas 0 e 3
    // do dia 0. Isso não é buraco nem do professor 2 nem do período 1.
    const p = problemaMinimo({
      periodos: [
        { numero: 1, turno: "manha", maxContraturno: 0 },
        { numero: 2, turno: "manha", maxContraturno: 0 },
      ],
      professores: [
        { id: 2, prefDias: "indiferente", peso: 0, maxDias: null },
        { id: 3, prefDias: "indiferente", peso: 0, maxDias: null },
      ],
      fatias: [
        fatia({ disciplinaId: 1, professorId: 3, periodo: 2, aulas: 2 }),
        fatia({ disciplinaId: 2, professorId: 2, periodo: 1, aulas: 1 }),
      ],
      fixadas: [
        aula(0, 0, { periodo: 2, disciplinaId: 1, professorId: 3 }),
        aula(0, 3, { periodo: 2, disciplinaId: 1, professorId: 3 }),
      ],
    });
    const r = resolver(p, { rodadasDeMelhoria: 0 });
    const nova = r.alocacoes.find((a) => a.disciplinaId === 2)!;
    expect([nova.dia, nova.hora]).toEqual([0, 0]);
  });
});
