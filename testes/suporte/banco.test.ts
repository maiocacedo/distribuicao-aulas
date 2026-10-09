import { describe, expect, it } from "vitest";
import { criarBanco } from "./banco";

const um = (db: ReturnType<typeof criarBanco>, sql: string) =>
  ({ ...(db.prepare(sql).get() as Record<string, unknown>) });

describe("criarBanco", () => {
  it("sem massa sai igual à primeira abertura do app", () => {
    const db = criarBanco({ massa: false });
    expect(um(db, "SELECT COUNT(*) AS n, MIN(nome) AS nome FROM cursos")).toEqual({ n: 1, nome: "Curso" });
    expect(um(db, "SELECT COUNT(*) AS n FROM horarios")).toEqual({ n: 12 });
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

describe("migração 010 sobre a massa", () => {
  it("tira a noite, as views e permite_contraturno", () => {
    const db = criarBanco();
    expect(um(db, "SELECT COUNT(*) AS n FROM horarios WHERE turno = 'noite'")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'view'")).toEqual({ n: 0 });
    const colunas = (db.prepare("PRAGMA table_info(periodos)").all() as { name: string }[]).map((c) => c.name);
    expect(colunas).not.toContain("permite_contraturno");
    expect(um(db, "SELECT COUNT(*) AS n FROM configuracao WHERE chave = 'versao_schema'")).toEqual({ n: 0 });
  });

  it("desconta as optativas do máximo no contraturno", () => {
    const db = criarBanco();
    const linhas = db
      .prepare("SELECT numero, max_disciplinas_contraturno AS m FROM periodos WHERE curso_id = 1 AND numero IN (2, 7, 8) ORDER BY numero")
      .all()
      .map((l) => ({ ...(l as object) }));
    expect(linhas).toEqual([
      { numero: 2, m: 0 },
      { numero: 7, m: 0 },
      { numero: 8, m: 0 },
    ]);
  });

  it("toda disciplina nasce ofertada e nada da grade se perde", () => {
    const db = criarBanco();
    expect(um(db, "SELECT COUNT(*) AS n FROM disciplinas WHERE ofertada <> 1")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM alocacoes WHERE curso_id = 1")).toEqual({ n: 219 });
    expect(
      um(db, `SELECT SUM(dp.aulas) AS n FROM disciplina_professores dp
              JOIN disciplinas d ON d.id = dp.disciplina_id WHERE d.curso_id = 1`),
    ).toEqual({ n: 223 });
  });

  it("excluir o curso leva períodos, disciplinas e aulas junto", () => {
    const db = criarBanco();
    db.exec("INSERT INTO cursos (id, nome) VALUES (2, 'Outro')");
    db.exec("DELETE FROM cursos WHERE id = 1");
    expect(um(db, "SELECT COUNT(*) AS n FROM disciplinas")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM periodos")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM alocacoes")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM disciplina_professores")).toEqual({ n: 0 });
  });

  it("excluir um período com disciplinas continua recusado", () => {
    const db = criarBanco();
    expect(() => db.exec("DELETE FROM periodos WHERE curso_id = 1 AND numero = 1")).toThrow(/FOREIGN KEY/);
  });
});
