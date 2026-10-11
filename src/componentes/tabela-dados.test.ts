import { describe, expect, it } from "vitest";
import type { Row } from "@tanstack/react-table";
import { compararValores, normalizar, ordenarPorDesempate, pertence } from "./tabela-dados";

describe("ordenarPorDesempate", () => {
  it("ordena em pt-BR, com acento no lugar", () => {
    const nomes = ["Zoologia", "Álgebra", "Cálculo"].map((nome) => ({ nome }));
    expect(ordenarPorDesempate(nomes, (l) => l.nome).map((l) => l.nome)).toEqual(["Álgebra", "Cálculo", "Zoologia"]);
  });

  it("não altera o array recebido", () => {
    const entrada = [{ nome: "Zoologia" }, { nome: "Álgebra" }];
    const copia = [...entrada];
    const saida = ordenarPorDesempate(entrada, (l) => l.nome);
    expect(entrada).toEqual(copia);
    expect(saida).not.toBe(entrada);
  });

  it("mantém a ordem relativa de quem tem o mesmo texto de desempate", () => {
    const entrada = [
      { id: 1, nome: "Ana" },
      { id: 2, nome: "Ana" },
      { id: 3, nome: "Ana" },
    ];
    expect(ordenarPorDesempate(entrada, (l) => l.nome).map((l) => l.id)).toEqual([1, 2, 3]);
  });
});

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

describe("pertence", () => {
  // Da linha do TanStack o filtro só usa `getValue`.
  const linha = (valor: unknown) => ({ getValue: () => valor }) as unknown as Row<unknown>;

  it("sem nada marcado, toda linha passa", () => {
    expect(pertence(linha("manhã"), "turno", [])).toBe(true);
    expect(pertence(linha(null), "turno", [])).toBe(true);
  });

  it("passa a linha cujo valor está entre os marcados", () => {
    expect(pertence(linha("manhã"), "turno", ["tarde", "manhã"])).toBe(true);
    expect(pertence(linha(2), "periodo", [1, 2])).toBe(true);
  });

  it("não passa a linha cujo valor não foi marcado", () => {
    expect(pertence(linha("noite"), "turno", ["tarde", "manhã"])).toBe(false);
    expect(pertence(linha(null), "turno", ["manhã"])).toBe(false);
  });
});
