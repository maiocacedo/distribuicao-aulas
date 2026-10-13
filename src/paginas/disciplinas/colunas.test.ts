import { describe, expect, it } from "vitest";
import { marcasDe } from "./colunas";
import { novo, type Linha } from "./salvar";

const linha = (mudancas: Partial<Linha> = {}): Linha => {
  const { fatias: _f, salas: _s, aceitaveis: _a, modoSala: _m, ...disciplina } = novo(1, 1);
  return { ...disciplina, tipo_nome: null, professores: null, aulas_distribuidas: 4, n_salas: 0, n_aulas: 0, ...mudancas };
};

describe("marcasDe", () => {
  it("a disciplina comum não tem marca", () => {
    expect(marcasDe(linha())).toBe("");
  });

  it("o tipo de sala exigido vira a etiqueta \"só <tipo>\"", () => {
    expect(marcasDe(linha({ tipo_sala: "Laboratório" }))).toBe("só Laboratório");
  });

  it("a lista de salas diz quantas são", () => {
    expect(marcasDe(linha({ n_salas: 2 }))).toBe("2 sala(s)");
  });

  // O texto é a chave de ordenação da coluna: a ordem das marcas é o que põe
  // juntas as disciplinas com o mesmo comportamento.
  it("as marcas saem sempre na mesma ordem: oferta, sala, blocos, sábado, turno, prioridade", () => {
    const todas = linha({
      ofertada: 0,
      exige_sala: 0,
      tipo_sala: "Laboratório",
      n_salas: 2,
      blocos_livres: 1,
      permite_sabado: 1,
      turno: "tarde",
      prioridade: 1,
    });
    expect(marcasDe(todas)).toBe("não ofertada · sem sala · só Laboratório · 2 sala(s) · livre · sábado · tarde · prio. alta");
    expect(marcasDe(linha({ prioridade: 3, permite_sabado: 1 }))).toBe("sábado · prio. baixa");
  });
});
