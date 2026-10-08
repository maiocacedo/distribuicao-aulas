import { describe, expect, it } from "vitest";
import { aula, fatia, problemaMinimo } from "../../testes/suporte/problema";
import { conferir } from "./conferir";

const tipos = (v: { tipo: string }[]) => v.map((x) => x.tipo);

describe("conferir", () => {
  it("aceita uma grade válida", () => {
    const p = problemaMinimo({ fatias: [fatia()] });
    expect(conferir(p, [aula(0, 0), aula(0, 1)])).toEqual([]);
  });

  it("acusa duas aulas no mesmo horário do período", () => {
    const p = problemaMinimo({
      fatias: [fatia({ aulas: 1 }), fatia({ disciplinaId: 2, professorId: 2, aulas: 1 })],
    });
    expect(tipos(conferir(p, [aula(0, 0), aula(0, 0, { disciplinaId: 2, professorId: 2 })]))).toContain("periodo");
  });

  it("acusa professor em dois lugares", () => {
    const p = problemaMinimo({
      periodos: [
        { numero: 1, turno: "manha", maxContraturno: 0 },
        { numero: 2, turno: "manha", maxContraturno: 0 },
      ],
      fatias: [fatia({ aulas: 1 }), fatia({ disciplinaId: 2, periodo: 2, aulas: 1 })],
    });
    expect(tipos(conferir(p, [aula(0, 0), aula(0, 0, { disciplinaId: 2, periodo: 2 })]))).toContain("professor");
  });

  it("acusa sala em dois lugares", () => {
    const p = problemaMinimo({
      periodos: [
        { numero: 1, turno: "manha", maxContraturno: 0 },
        { numero: 2, turno: "manha", maxContraturno: 0 },
      ],
      salas: [{ id: 1, tipo: "Sala de Aula" }],
      fatias: [
        fatia({ aulas: 1, exigeSala: true }),
        fatia({ disciplinaId: 2, professorId: 2, periodo: 2, aulas: 1, exigeSala: true }),
      ],
    });
    const alocs = [aula(0, 0, { salaId: 1 }), aula(0, 0, { disciplinaId: 2, professorId: 2, periodo: 2, salaId: 1 })];
    expect(tipos(conferir(p, alocs))).toContain("sala");
  });

  it("acusa aula em horário indisponível", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 1 })], indisponiveis: ["1:0:0"] });
    expect(tipos(conferir(p, [aula(0, 0)]))).toEqual(["indisponivel"]);
  });

  it("acusa sábado sem permissão e sábado à tarde", () => {
    const semPermissao = problemaMinimo({ fatias: [fatia({ aulas: 1 })] });
    expect(tipos(conferir(semPermissao, [aula(5, 0)]))).toEqual(["sabado"]);
    const aTarde = problemaMinimo({ fatias: [fatia({ aulas: 1, permiteSabado: true })] });
    expect(tipos(conferir(aTarde, [aula(5, 6)]))).toEqual(["sabado"]);
  });

  it("acusa requisito de sala violado", () => {
    const salas = [
      { id: 1, tipo: "Sala de Aula" },
      { id: 2, tipo: "Laboratório" },
    ];
    const casos = [
      { f: fatia({ aulas: 1, exigeSala: true, tipoSala: "Laboratório" }), sala: 1 },
      { f: fatia({ aulas: 1, exigeSala: true, salas: [2] }), sala: 1 },
      { f: fatia({ aulas: 1, exigeSala: true }), sala: null },
      { f: fatia({ aulas: 1, exigeSala: false }), sala: 1 },
    ];
    for (const c of casos) {
      const p = problemaMinimo({ salas, fatias: [c.f] });
      expect(tipos(conferir(p, [aula(0, 0, { salaId: c.sala })]))).toEqual(["requisito-sala"]);
    }
  });

  it("acusa fatia alocada pela metade", () => {
    const p = problemaMinimo({ fatias: [fatia()] });
    expect(tipos(conferir(p, [aula(0, 0)]))).toEqual(["contagem"]);
  });

  it("acusa padrão fora da tabela e dois blocos no mesmo dia", () => {
    const quatro = problemaMinimo({ fatias: [fatia({ aulas: 4 })] });
    expect(tipos(conferir(quatro, [aula(0, 0), aula(1, 0), aula(2, 0), aula(3, 0)]))).toEqual(["padrao"]);
    const mesmoDia = problemaMinimo({ fatias: [fatia()] });
    expect(tipos(conferir(mesmoDia, [aula(0, 0), aula(0, 2)]))).toContain("padrao");
  });

  it("aceita qualquer partição em blocos livres", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 4, blocosLivres: true })] });
    expect(conferir(p, [aula(0, 0), aula(1, 0), aula(2, 0), aula(3, 0)])).toEqual([]);
  });

  it("acusa bloco atravessando a troca de turno", () => {
    const p = problemaMinimo({ fatias: [fatia()] });
    expect(tipos(conferir(p, [aula(0, 5), aula(0, 6)]))).toContain("bloco-turno");
  });
});
