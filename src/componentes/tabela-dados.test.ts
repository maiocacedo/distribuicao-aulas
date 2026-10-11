import { describe, expect, it } from "vitest";
import { compararValores, normalizar } from "./tabela-dados";

describe("normalizar", () => {
  it("ignora acento e caixa", () => {
    expect(normalizar("Álgebra Linear")).toBe("algebra linear");
    expect(normalizar("LABORATÓRIO")).toBe("laboratorio");
  });
});

describe("compararValores", () => {
  it("compara número como número", () => {
    expect(compararValores(2, 10)).toBeLessThan(0);
  });

  it("compara texto em pt-BR, com acento no lugar", () => {
    expect(["Zoologia", "Álgebra", "Cálculo"].sort(compararValores)).toEqual(["Álgebra", "Cálculo", "Zoologia"]);
  });

  it("trata nulo como texto vazio", () => {
    expect(compararValores(null, "a")).toBeLessThan(0);
  });
});
