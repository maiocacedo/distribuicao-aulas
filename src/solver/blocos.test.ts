import { describe, expect, it } from "vitest";
import { aula, fatia, problemaMinimo } from "../../testes/suporte/problema";
import { blocoCabeNoDia, particoes } from "./blocos";
import { buracos, custoTotal } from "./custo";

describe("blocos", () => {
  it("particoes lista as partições decrescentes", () => {
    expect(particoes(4)).toEqual([[4], [3, 1], [2, 2], [2, 1, 1], [1, 1, 1, 1]]);
  });

  it("blocoCabeNoDia respeita a troca de turno e o fim do dia", () => {
    const p = problemaMinimo();
    expect(blocoCabeNoDia(p, 4, 2)).toBe(true);
    expect(blocoCabeNoDia(p, 5, 2)).toBe(false);
    expect(blocoCabeNoDia(p, 11, 2)).toBe(false);
  });
});

describe("custo", () => {
  it("buracos conta horários vagos entre a primeira e a última aula", () => {
    expect(buracos(problemaMinimo(), [aula(0, 0), aula(0, 3)], (a) => `p${a.professorId}`)).toBe(2);
  });

  it("contraturno conta aula fora do turno do período", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 1 })] });
    const pesos = {
      padraoForaDoIdeal: 0,
      buracoProfessor: 0,
      buracoAluno: 0,
      contraturno: 1,
      preferenciaDias: 0,
      excessoContraturno: 0,
      salaAceitavel: 0,
    };
    expect(custoTotal(p, [aula(0, 6)], pesos)).toBe(1);
    expect(custoTotal(p, [aula(0, 0)], pesos)).toBe(0);
  });
});
