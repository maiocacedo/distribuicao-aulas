import { describe, expect, it } from "vitest";
import { aulaOcupada } from "../../testes/suporte/regras";
import { Ocupacao } from "./ocupacao";

describe("Ocupacao", () => {
  it("coloca e retira", () => {
    const a = aulaOcupada({ professorId: 1, salaId: 3 });
    const oc = new Ocupacao(1, [a]);
    expect(oc.noPeriodo(1, 0, 0)).toEqual(a);
    expect(oc.doProfessor(1, 0, 0)).toEqual(a);
    expect(oc.daSala(3, 0, 0)).toEqual(a);
    oc.retirar(a);
    expect(oc.noPeriodo(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)).toBeUndefined();
    expect(oc.daSala(3, 0, 0)).toBeUndefined();
  });

  it("aula de outro curso ocupa professor e sala, mas não o período", () => {
    const oc = new Ocupacao(1, [aulaOcupada({ cursoId: 2, professorId: 1, salaId: 3 })]);
    expect(oc.noPeriodo(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)?.cursoId).toBe(2);
    expect(oc.daSala(3, 0, 0)?.cursoId).toBe(2);
  });

  it("conta os dias do professor e esquece o dia que esvaziou", () => {
    const a = aulaOcupada({ professorId: 1, dia: 0, hora: 0 });
    const b = aulaOcupada({ professorId: 1, dia: 0, hora: 1 });
    const c = aulaOcupada({ professorId: 1, dia: 2, hora: 0 });
    const oc = new Ocupacao(1, [a, b, c]);
    expect([...oc.diasDoProfessor(1).entries()]).toEqual([[0, 2], [2, 1]]);
    oc.retirar(c);
    expect([...oc.diasDoProfessor(1).keys()]).toEqual([0]);
    expect(oc.diasDoProfessor(42).size).toBe(0);
  });

  it("representa duas aulas no mesmo lugar e retira a certa", () => {
    const deAlfa = aulaOcupada({ cursoId: 1, professorId: 1 });
    const deBeta = aulaOcupada({ cursoId: 2, professorId: 1 });
    const oc = new Ocupacao(1, [deAlfa, deBeta]);
    oc.retirar(deAlfa);
    expect(oc.doProfessor(1, 0, 0)).toEqual(deBeta);
    expect(oc.diasDoProfessor(1).get(0)).toBe(1);
  });
});
