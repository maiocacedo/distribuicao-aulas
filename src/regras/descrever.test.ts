import { describe, expect, it } from "vitest";
import { aulaOcupada } from "../../testes/suporte/regras";
import { curto, descrever, type Nomes } from "./descrever";

const nomes: Nomes = {
  cursoAtual: 1,
  professor: () => "Ana Maria Souza",
  curso: (id) => (id === 2 ? "Beta" : "Alfa"),
  sala: () => "A01",
};

describe("descrever", () => {
  it("encurta o nome", () => {
    expect(curto("Ana Maria Souza")).toBe("A. Souza");
    expect(curto("Ana")).toBe("Ana");
  });

  it("professor no mesmo curso e em outro", () => {
    expect(descrever({ regra: "D2", aula: aulaOcupada({ periodo: 2 }) }, nomes)).toBe("A. Souza no 2º período");
    expect(descrever({ regra: "D2", aula: aulaOcupada({ cursoId: 2 }) }, nomes)).toBe("A. Souza em Beta (1º)");
  });

  it("sala tomada no mesmo curso e em outro", () => {
    expect(descrever({ regra: "D3", aula: aulaOcupada({ salaId: 1, periodo: 3 }) }, nomes)).toBe("Sala A01 ocupada (3º per.)");
    expect(descrever({ regra: "D3", aula: aulaOcupada({ cursoId: 2, salaId: 1 }) }, nomes)).toBe("Sala A01 ocupada (Beta, 1º)");
  });

  it("regras de cadastro", () => {
    expect(descrever({ regra: "D15", professorId: 1, limite: 2 }, nomes)).toBe("A. Souza no máx. de 2 dia(s)");
    expect(descrever({ regra: "D5-turno", turnosSabado: ["manha"] }, nomes)).toBe("Sábado só tem aula de manhã");
    expect(descrever({ regra: "D14", turno: "tarde" }, nomes)).toBe("Disciplina só à tarde");
    expect(descrever({ regra: "D14", turno: "manha" }, nomes)).toBe("Disciplina só de manhã");
    expect(descrever({ regra: "D4", professorId: 1 }, nomes)).toBe("A. Souza indisponível");
    expect(descrever({ regra: "D5" }, nomes)).toBe("Sábado desmarcado no cadastro");
  });
});
