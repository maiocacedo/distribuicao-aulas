import { describe, expect, it } from "vitest";
import { aulaOcupada, contextoMinimo, fatiaRegras } from "../../testes/suporte/regras";
import { Ocupacao } from "./ocupacao";
import { reatribuirSalas } from "./reatribuir";

const SALAS = [
  { id: 1, tipo: "Sala de Aula" },
  { id: 2, tipo: "Laboratório" },
  { id: 3, tipo: "Laboratório" },
];
const ctx = contextoMinimo({ salas: SALAS });

/** Fatia que passou a exigir laboratório; as aulas dela estão na sala 1. */
const fatia = fatiaRegras({ exigeSala: true, tipoSala: "Laboratório" });
const aula = (extra: Parameters<typeof aulaOcupada>[0] = {}) =>
  aulaOcupada({ disciplinaId: 1, professorId: 1, salaId: 1, ...extra });

describe("reatribuirSalas", () => {
  it("leva a aula para a primeira sala válida e livre, e a ocupação acompanha", () => {
    const a = aula();
    const oc = new Ocupacao(1, [a]);
    const item = { aula: a, fatia };
    const r = reatribuirSalas(ctx, oc, [item]);
    expect(r.trocas).toEqual([{ item, sala: 2 }]);
    expect(r.trocas[0].item).toBe(item);
    expect(r.semSala).toEqual([]);
    expect(oc.daSala(1, 0, 0)).toBeUndefined();
    expect(oc.daSala(2, 0, 0)).toEqual({ ...a, salaId: 2 });
  });

  it("pula a sala tomada, mesmo que por outro curso", () => {
    const a = aula();
    const oc = new Ocupacao(1, [a, aulaOcupada({ cursoId: 2, salaId: 2 })]);
    expect(reatribuirSalas(ctx, oc, [{ aula: a, fatia }]).trocas.map((t) => t.sala)).toEqual([3]);
  });

  it("prefere a sala da aula vizinha da mesma fatia no mesmo dia", () => {
    const a = aula({ hora: 1 });
    const vizinha = aula({ hora: 0, salaId: 3 });
    const oc = new Ocupacao(1, [vizinha, a]);
    expect(reatribuirSalas(ctx, oc, [{ aula: a, fatia }]).trocas.map((t) => t.sala)).toEqual([3]);
  });

  it("a vizinha pode ser a aula seguinte", () => {
    const a = aula({ hora: 0 });
    const vizinha = aula({ hora: 1, salaId: 3 });
    const oc = new Ocupacao(1, [a, vizinha]);
    expect(reatribuirSalas(ctx, oc, [{ aula: a, fatia }]).trocas.map((t) => t.sala)).toEqual([3]);
  });

  it("o bloco inteiro vai para a mesma sala: a segunda aula segue a troca da primeira", () => {
    const primeira = aula({ hora: 0 });
    const segunda = aula({ hora: 1 });
    // A sala 2 só está tomada no primeiro horário; sozinha, a segunda aula iria para ela.
    const oc = new Ocupacao(1, [primeira, segunda, aulaOcupada({ periodo: 2, salaId: 2 })]);
    const r = reatribuirSalas(ctx, oc, [
      { aula: primeira, fatia },
      { aula: segunda, fatia },
    ]);
    expect(r.trocas.map((t) => t.sala)).toEqual([3, 3]);
  });

  it("não segue a sala de outra disciplina do mesmo professor, nem a de outro dia", () => {
    const a = aula({ hora: 1 });
    const outraDisciplina = aulaOcupada({ hora: 0, disciplinaId: 2, professorId: 1, salaId: 3 });
    const outroDia = aula({ dia: 1, hora: 0, salaId: 3 });
    const oc = new Ocupacao(1, [outraDisciplina, outroDia, a]);
    expect(reatribuirSalas(ctx, oc, [{ aula: a, fatia }]).trocas.map((t) => t.sala)).toEqual([2]);
  });

  it("a sala da vizinha que não serve à fatia não é seguida", () => {
    const a = aula({ hora: 1 });
    const vizinha = aula({ hora: 0, salaId: 1 });
    const oc = new Ocupacao(1, [vizinha, a]);
    expect(reatribuirSalas(ctx, oc, [{ aula: a, fatia }]).trocas.map((t) => t.sala)).toEqual([2]);
  });

  it("sem sala válida livre: a aula fica de fora e deixa a ocupação", () => {
    const a = aula();
    const item = { aula: a, fatia };
    const oc = new Ocupacao(1, [
      a,
      aulaOcupada({ periodo: 2, professorId: 8, salaId: 2 }),
      aulaOcupada({ cursoId: 2, professorId: 7, salaId: 3 }),
    ]);
    const r = reatribuirSalas(ctx, oc, [item]);
    expect(r.trocas).toEqual([]);
    expect(r.semSala).toEqual([item]);
    expect(r.semSala[0]).toBe(item);
    expect(oc.daSala(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)).toBeUndefined();
  });

  it("não existe sala do tipo: todas ficam de fora", () => {
    const a = aula();
    const oc = new Ocupacao(1, [a]);
    const r = reatribuirSalas(ctx, oc, [{ aula: a, fatia: fatiaRegras({ exigeSala: true, tipoSala: "Outro" }) }]);
    expect(r.semSala).toHaveLength(1);
  });

  it("fatia que deixou de ocupar sala fica sem sala", () => {
    const a = aula();
    const oc = new Ocupacao(1, [a]);
    const r = reatribuirSalas(ctx, oc, [{ aula: a, fatia: fatiaRegras({ exigeSala: false }) }]);
    expect(r.trocas.map((t) => t.sala)).toEqual([null]);
    expect(oc.daSala(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)).toEqual({ ...a, salaId: null });
  });

  it("só precisa das salas do contexto", () => {
    const a = aula();
    expect(reatribuirSalas({ salas: SALAS }, new Ocupacao(1, [a]), [{ aula: a, fatia }]).trocas).toHaveLength(1);
  });
});
