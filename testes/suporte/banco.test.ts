import { describe, expect, it } from "vitest";
import { criarBanco } from "./banco";

const um = (db: ReturnType<typeof criarBanco>, sql: string) =>
  ({ ...(db.prepare(sql).get() as Record<string, unknown>) });

describe("criarBanco", () => {
  it("sem massa sai igual à primeira abertura do app", () => {
    const db = criarBanco({ massa: false });
    expect(um(db, "SELECT COUNT(*) AS n, MIN(nome) AS nome FROM cursos")).toEqual({ n: 1, nome: "Curso" });
    expect(um(db, "SELECT COUNT(*) AS n FROM horarios")).toEqual({ n: 17 });
    expect(um(db, "SELECT COUNT(*) AS n FROM professores")).toEqual({ n: 0 });
  });

  it("com massa carrega o curso anonimizado", () => {
    const db = criarBanco();
    expect(um(db, "SELECT COUNT(*) AS n FROM professores WHERE nome GLOB 'Professor [0-9][0-9]'")).toEqual({ n: 22 });
    expect(um(db, "SELECT COUNT(*) AS n FROM professores")).toEqual({ n: 22 });
    expect(um(db, "SELECT COUNT(*) AS n FROM alocacoes WHERE curso_id = 1")).toEqual({ n: 219 });
    expect(
      um(db, `SELECT SUM(dp.aulas) AS n FROM disciplina_professores dp
              JOIN disciplinas d ON d.id = dp.disciplina_id WHERE d.curso_id = 1`),
    ).toEqual({ n: 223 });
  });

  it("liga a chave estrangeira", () => {
    const db = criarBanco({ massa: false });
    expect(() => db.exec("INSERT INTO disciplina_professores VALUES (999, 999, 1)")).toThrow(/FOREIGN KEY/);
  });
});
