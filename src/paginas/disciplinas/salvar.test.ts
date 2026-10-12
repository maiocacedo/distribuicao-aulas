import { describe, expect, it } from "vitest";
import type { Motivo } from "../../regras/tipos";
import { motivosParaMostrar, novo, validarRascunho, type Rascunho } from "./salvar";

it("omite o motivo de sala quando a aula tem outro", () => {
  const sala = { regra: "sala-invalida" } as Motivo;
  const oferta = { regra: "D16" } as Motivo;
  expect(motivosParaMostrar([sala, oferta])).toEqual([oferta]);
  expect(motivosParaMostrar([sala])).toEqual([sala]);
  expect(motivosParaMostrar([])).toEqual([]);
});

describe("validarRascunho", () => {
  const rascunho = (mudancas: Partial<Rascunho> = {}): Rascunho => ({
    ...novo(1, 1),
    nome: "Cálculo",
    aulas_semanais: 4,
    fatias: [{ professor_id: 1, aulas: 4 }],
    ...mudancas,
  });

  it("deixa passar o rascunho completo", () => {
    expect(validarRascunho(rascunho())).toBeNull();
  });

  it("acusa o nome vazio no campo do nome", () => {
    expect(validarRascunho(rascunho({ nome: "  " }))).toEqual({ nome: "O nome é obrigatório." });
  });

  it("acusa as aulas por semana fora de 1 a 40 ou fracionadas", () => {
    for (const aulas_semanais of [0, 41, 2.5]) {
      const fatias = [{ professor_id: 1, aulas: aulas_semanais }];
      expect(validarRascunho(rascunho({ aulas_semanais, fatias }))?.aulas).toBe("Use um número inteiro de 1 a 40.");
    }
    expect(validarRascunho(rascunho({ aulas_semanais: 40, fatias: [{ professor_id: 1, aulas: 40 }] }))).toBeNull();
  });

  it("sem fatia, acusa o grupo e aponta o botão de adicionar", () => {
    expect(validarRascunho(rascunho({ fatias: [] }))).toEqual({
      fatias: { mensagem: "Atribua a disciplina a pelo menos um professor.", controle: "adicionar", posicoes: [] },
    });
  });

  it("acusa a fatia com aulas que não são um inteiro de 1 para cima", () => {
    const fatias = [
      { professor_id: 1, aulas: 4 },
      { professor_id: 2, aulas: 0 },
    ];
    expect(validarRascunho(rascunho({ fatias }))?.fatias).toEqual({
      mensagem: "Cada fatia precisa de um número inteiro de aulas, 1 ou mais.",
      controle: "aulas",
      posicoes: [1],
    });
  });

  it("acusa a soma das fatias que não fecha com a disciplina, em todas as caixas de aulas", () => {
    const fatias = [
      { professor_id: 1, aulas: 2 },
      { professor_id: 2, aulas: 1 },
    ];
    expect(validarRascunho(rascunho({ fatias }))?.fatias).toEqual({
      mensagem: "As fatias dos professores somam 3 aula(s), mas a disciplina tem 4. Os dois têm de fechar.",
      controle: "aulas",
      posicoes: [0, 1],
    });
  });

  it("acusa a fatia sem professor no seletor dela", () => {
    const fatias = [
      { professor_id: 1, aulas: 2 },
      { professor_id: 0, aulas: 2 },
    ];
    expect(validarRascunho(rascunho({ fatias }))?.fatias).toEqual({
      mensagem: "Há uma fatia sem professor escolhido.",
      controle: "professor",
      posicoes: [1],
    });
  });

  it("devolve juntas as recusas de campos diferentes", () => {
    const erros = validarRascunho(rascunho({ nome: "", aulas_semanais: 0, fatias: [] }));
    expect(Object.keys(erros ?? {}).sort()).toEqual(["aulas", "fatias", "nome"]);
  });
});
