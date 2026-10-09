import { describe, expect, it } from "vitest";
import { aulaOcupada, contextoMinimo, fatiaRegras } from "../../testes/suporte/regras";
import { escolherSala, impedimento, impedimentoDeHorario, salasPossiveis, violacoesDaAula } from "./impedimentos";
import { Ocupacao } from "./ocupacao";
import type { Motivo } from "./tipos";

const regra = (m: Motivo | null) => m?.regra ?? null;
const vazia = () => new Ocupacao(1);
const SALAS = [
  { id: 1, tipo: "Sala de Aula" },
  { id: 2, tipo: "Laboratório" },
];

describe("impedimentoDeHorario", () => {
  it("aceita horário livre", () => {
    expect(impedimentoDeHorario(contextoMinimo(), vazia(), fatiaRegras(), 0, 0)).toBeNull();
  });

  it("faixa: dia ou hora fora da grade", () => {
    const ctx = contextoMinimo({ dias: 5 });
    expect(regra(impedimentoDeHorario(ctx, vazia(), fatiaRegras(), 5, 0))).toBe("faixa");
    expect(regra(impedimentoDeHorario(ctx, vazia(), fatiaRegras(), 0, 12))).toBe("faixa");
  });

  it("D16: disciplina não ofertada", () => {
    expect(regra(impedimentoDeHorario(contextoMinimo(), vazia(), fatiaRegras({ ofertada: false }), 0, 0))).toBe("D16");
  });

  it("D1: horário do período ocupado", () => {
    const oc = new Ocupacao(1, [aulaOcupada()]);
    expect(regra(impedimentoDeHorario(contextoMinimo(), oc, fatiaRegras(), 0, 0))).toBe("D1");
  });

  it("D1 não vale entre cursos: o 1º período de outro curso é outra turma", () => {
    const oc = new Ocupacao(1, [aulaOcupada({ cursoId: 2 })]);
    expect(impedimentoDeHorario(contextoMinimo(), oc, fatiaRegras(), 0, 0)).toBeNull();
  });

  it("D5: sábado sem permissão", () => {
    expect(regra(impedimentoDeHorario(contextoMinimo(), vazia(), fatiaRegras(), 5, 0))).toBe("D5");
  });

  it("D5-turno: sábado à tarde", () => {
    const m = impedimentoDeHorario(contextoMinimo(), vazia(), fatiaRegras({ permiteSabado: true }), 5, 6);
    expect(m).toEqual({ regra: "D5-turno", turnosSabado: ["manha"] });
  });

  it("D13: fora dos turnos do curso", () => {
    const ctx = contextoMinimo({ turnosDoCurso: ["manha"] });
    expect(regra(impedimentoDeHorario(ctx, vazia(), fatiaRegras(), 0, 6))).toBe("D13");
  });

  it("D14: turno forçado", () => {
    const f = fatiaRegras({ turno: "tarde" });
    expect(impedimentoDeHorario(contextoMinimo(), vazia(), f, 0, 0)).toEqual({ regra: "D14", turno: "tarde" });
    expect(impedimentoDeHorario(contextoMinimo(), vazia(), f, 0, 6)).toBeNull();
  });

  it("D4: indisponibilidade", () => {
    const ctx = contextoMinimo({ indisponiveis: new Set(["1:0:0"]) });
    expect(regra(impedimentoDeHorario(ctx, vazia(), fatiaRegras(), 0, 0))).toBe("D4");
  });

  it("D2: professor ocupado em outro curso", () => {
    const oc = new Ocupacao(1, [aulaOcupada({ cursoId: 2, professorId: 1 })]);
    const m = impedimentoDeHorario(contextoMinimo(), oc, fatiaRegras(), 0, 0);
    expect(m?.regra).toBe("D2");
    expect(m?.regra === "D2" && m.aula.cursoId).toBe(2);
  });

  it("D15: máximo de dias conta só dia novo", () => {
    const ctx = contextoMinimo({ maxDias: new Map([[1, 1]]) });
    const oc = new Ocupacao(1, [aulaOcupada({ professorId: 1, disciplinaId: 1, dia: 0, hora: 3 })]);
    expect(impedimentoDeHorario(ctx, oc, fatiaRegras(), 1, 0)).toEqual({ regra: "D15", professorId: 1, limite: 1 });
    expect(impedimentoDeHorario(ctx, oc, fatiaRegras(), 0, 0)).toBeNull();
  });
});

describe("salas", () => {
  it("salasPossiveis: nenhuma quando não exige; por tipo; por lista com ideais primeiro; qualquer", () => {
    const ctx = contextoMinimo({ salas: SALAS });
    expect(salasPossiveis(ctx, fatiaRegras())).toEqual([]);
    expect(salasPossiveis(ctx, fatiaRegras({ exigeSala: true, tipoSala: "Laboratório" })).map((s) => s.id)).toEqual([2]);
    const lista = fatiaRegras({
      exigeSala: true,
      salas: [
        { id: 1, preferencia: 2 },
        { id: 2, preferencia: 1 },
      ],
    });
    expect(salasPossiveis(ctx, lista).map((s) => s.id)).toEqual([2, 1]);
    expect(salasPossiveis(ctx, fatiaRegras({ exigeSala: true })).map((s) => s.id)).toEqual([1, 2]);
  });

  it("escolherSala: null quando não exige, pula ocupada, respeita a preferida, undefined quando nenhuma serve", () => {
    const ctx = contextoMinimo({ salas: SALAS });
    const f = fatiaRegras({ exigeSala: true });
    expect(escolherSala(ctx, vazia(), fatiaRegras(), 0, 0)).toBeNull();
    expect(escolherSala(ctx, new Ocupacao(1, [aulaOcupada({ cursoId: 2, salaId: 1 })]), f, 0, 0)).toBe(2);
    expect(escolherSala(ctx, vazia(), f, 0, 0, 2)).toBe(2);
    expect(escolherSala(ctx, new Ocupacao(1, [aulaOcupada({ cursoId: 2, salaId: 2 })]), f, 0, 0, 2)).toBe(1);
    const cheia = new Ocupacao(1, [aulaOcupada({ cursoId: 2, salaId: 1 }), aulaOcupada({ cursoId: 3, salaId: 2 })]);
    expect(escolherSala(ctx, cheia, f, 0, 0)).toBeUndefined();
  });

  it("impedimento diz qual sala está tomada, ou que não há sala possível", () => {
    const ctx = contextoMinimo({ salas: [SALAS[0]] });
    const oc = new Ocupacao(1, [aulaOcupada({ cursoId: 2, salaId: 1 })]);
    const m = impedimento(ctx, oc, fatiaRegras({ exigeSala: true }), 0, 0);
    expect(m?.regra === "D3" && m.aula.cursoId).toBe(2);
    expect(regra(impedimento(ctx, vazia(), fatiaRegras({ exigeSala: true, tipoSala: "Laboratório" }), 0, 0))).toBe(
      "D3-sem-sala",
    );
    expect(impedimento(ctx, vazia(), fatiaRegras({ exigeSala: true }), 0, 0)).toBeNull();
  });
});

describe("violacoesDaAula", () => {
  const propria = aulaOcupada({ disciplinaId: 1, professorId: 1 });

  it("a aula não conflita consigo mesma", () => {
    const oc = new Ocupacao(1, [propria]);
    expect(violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), propria)).toEqual([]);
  });

  it("acusa todas as regras violadas de uma vez", () => {
    const noSabado = { ...propria, dia: 5, hora: 6 };
    const oc = new Ocupacao(1, [noSabado]);
    expect(violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), noSabado).map((m) => m.regra)).toEqual(["D5", "D5-turno"]);
  });

  it("acusa sala fora do requisito e choque de sala com outro curso", () => {
    const ctx = contextoMinimo({ salas: SALAS });
    const naSala1 = { ...propria, salaId: 1 };
    const oc = new Ocupacao(1, [naSala1, aulaOcupada({ cursoId: 2, salaId: 1 })]);
    expect(violacoesDaAula(ctx, oc, fatiaRegras({ exigeSala: true, tipoSala: "Laboratório" }), naSala1).map((m) => m.regra)).toEqual([
      "sala-invalida",
    ]);
    expect(violacoesDaAula(ctx, oc, fatiaRegras({ exigeSala: true }), naSala1).map((m) => m.regra)).toEqual(["D3"]);
  });

  it("devolve a ocupação como estava", () => {
    const oc = new Ocupacao(1, [propria]);
    violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), propria);
    expect(oc.noPeriodo(1, 0, 0)).toEqual(propria);
  });

  it("não insere na ocupação uma aula que não estava nela", () => {
    const oc = vazia();
    violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), propria);
    expect(oc.doProfessor(1, 0, 0)).toBeUndefined();
    expect(oc.noPeriodo(1, 0, 0)).toBeUndefined();
    expect(oc.diasDoProfessor(1).size).toBe(0);
  });

  it("com duas aulas no mesmo lugar, a ordem não muda", () => {
    const outra = aulaOcupada({ cursoId: 2, disciplinaId: 8, professorId: 1 });
    const oc = new Ocupacao(1, [propria, outra]);
    violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), propria);
    expect(oc.doProfessor(1, 0, 0)).toBe(propria);
    violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), outra);
    expect(oc.doProfessor(1, 0, 0)).toBe(propria);
  });

  it("acusa o professor que passou do máximo de dias, na aula do dia excedente", () => {
    const ctx = contextoMinimo({ maxDias: new Map([[1, 1]]) });
    const noDia0 = { ...propria, dia: 0 };
    const noDia1 = { ...propria, dia: 1 };
    const oc = new Ocupacao(1, [noDia0, noDia1]);
    // Cada aula é julgada sem ela mesma: a do dia 1 vê só o dia 0 e já está no limite.
    expect(violacoesDaAula(ctx, oc, fatiaRegras(), noDia1)).toEqual([{ regra: "D15", professorId: 1, limite: 1 }]);
    expect(violacoesDaAula(ctx, oc, fatiaRegras(), noDia0)).toEqual([{ regra: "D15", professorId: 1, limite: 1 }]);
  });

  it("D15 não acusa quando todas as aulas cabem no limite", () => {
    const ctx = contextoMinimo({ maxDias: new Map([[1, 2]]) });
    const noDia0 = { ...propria, dia: 0 };
    const noDia1 = { ...propria, dia: 1 };
    const oc = new Ocupacao(1, [noDia0, noDia1]);
    expect(violacoesDaAula(ctx, oc, fatiaRegras(), noDia1)).toEqual([]);
  });

  it("fora da grade para na faixa, sem acusar o resto", () => {
    const fora = { ...propria, dia: 5, hora: 12 };
    const oc = new Ocupacao(1, [fora]);
    // Sábado sem permissão também valeria, mas depois de "faixa" nada mais é dito.
    expect(violacoesDaAula(contextoMinimo({ dias: 5 }), oc, fatiaRegras(), fora)).toEqual([{ regra: "faixa" }]);
  });

  it("sala-invalida: aula sem sala quando a fatia exige, e sala quando não exige", () => {
    const ctx = contextoMinimo({ salas: SALAS });
    const semSala = { ...propria, salaId: null };
    const comSala = { ...propria, salaId: 1 };
    expect(violacoesDaAula(ctx, new Ocupacao(1, [semSala]), fatiaRegras({ exigeSala: true }), semSala)).toEqual([
      { regra: "sala-invalida", salaId: null },
    ]);
    expect(violacoesDaAula(ctx, new Ocupacao(1, [comSala]), fatiaRegras(), comSala)).toEqual([
      { regra: "sala-invalida", salaId: 1 },
    ]);
  });
});
