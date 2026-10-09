import { describe, expect, it } from "vitest";
import { contextoMinimo } from "../../testes/suporte/regras";
import { avisosDaFatia } from "./avisos";

const turnos = contextoMinimo().turnoDaHora;
const a = (dia: number, hora: number) => ({ dia, hora });

describe("avisosDaFatia", () => {
  it("nada a dizer de uma fatia em padrão cadastrado", () => {
    expect(avisosDaFatia([a(0, 0), a(0, 1), a(2, 0), a(2, 1)], 4, false, ["2+2", "3+1"], turnos)).toEqual([]);
  });

  it("padrão fora da tabela, só quando a fatia está completa", () => {
    expect(avisosDaFatia([a(0, 0), a(1, 0), a(2, 0), a(3, 0)], 4, false, ["2+2"], turnos)).toEqual([
      "padrão 1+1+1+1 não cadastrado",
    ]);
    expect(avisosDaFatia([a(0, 0)], 4, false, ["2+2"], turnos)).toEqual([]);
  });

  it("dois blocos no mesmo dia", () => {
    expect(avisosDaFatia([a(0, 0), a(0, 3)], 4, false, ["2+2"], turnos)).toEqual(["dois blocos no mesmo dia"]);
  });

  it("bloco não atravessa a troca de turno", () => {
    expect(avisosDaFatia([a(0, 5), a(0, 6)], 2, false, ["1+1"], turnos)).toEqual(["dois blocos no mesmo dia"]);
  });

  it("sem padrão para o total da fatia", () => {
    expect(avisosDaFatia([], 7, false, undefined, turnos)).toEqual(["sem padrão de bloco para 7 aula(s)"]);
  });

  it("blocos livres não tem padrão a cumprir", () => {
    expect(avisosDaFatia([a(0, 0), a(1, 0), a(2, 0)], 3, true, undefined, turnos)).toEqual([]);
  });
});
