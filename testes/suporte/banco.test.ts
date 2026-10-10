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

  it("desconta do máximo no contraturno só as optativas com turno forçado", () => {
    const db = criarBanco();
    const linhas = db
      .prepare("SELECT numero, max_disciplinas_contraturno AS m FROM periodos WHERE curso_id = 1 AND numero IN (2, 7, 8) ORDER BY numero")
      .all()
      .map((l) => ({ ...(l as object) }));
    expect(linhas).toEqual([
      { numero: 2, m: 0 },
      { numero: 7, m: 1 },
      { numero: 8, m: 1 },
    ]);
  });

  it("limpa o turno forçado das optativas e mantém o das obrigatórias", () => {
    const db = criarBanco();
    expect(
      um(db, `SELECT COUNT(*) AS n FROM disciplinas d
               JOIN periodos p ON p.curso_id = d.curso_id AND p.numero = d.periodo
              WHERE d.optativa = 1 AND d.turno IS NOT NULL AND d.turno <> p.turno`),
    ).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM disciplinas WHERE optativa = 0 AND turno = 'tarde'")).toEqual({ n: 2 });
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

/**
 * O que a massa não exercita: ela não tem noite nem período com mais optativas
 * forçadas do que o máximo. O dado entra logo antes da 010, no esquema da 009.
 */
describe("migração 010 sobre dado que a massa não tem", () => {
  const NOTURNO = "(SELECT MIN(indice) FROM horarios WHERE turno = 'noite')";
  const SEMENTE = `
    UPDATE cursos SET turnos = 'manha,tarde,noite' WHERE id = 1;
    INSERT INTO cursos (id, nome, turnos) VALUES (2, 'Dois', 'manha,noite'), (3, 'Três', 'noite'), (4, 'Quatro', 'tarde,noite');
    INSERT INTO periodos (curso_id, numero, turno, max_disciplinas_contraturno)
      VALUES (1, 1, 'noite', 0), (1, 2, 'manha', 1), (2, 1, 'noite', 0), (3, 1, 'noite', 0), (4, 1, 'noite', 0);
    INSERT INTO professores (id, nome) VALUES (1, 'Professor 01');
    INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, turno, optativa, exige_sala) VALUES
      (1, 1, 'Noturna', 1, 2, 'noite', 0, 0),
      (2, 1, 'Optativa A', 2, 1, 'tarde', 1, 0),
      (3, 1, 'Optativa B', 2, 1, 'tarde', 1, 0),
      (4, 1, 'Obrigatória', 2, 1, 'tarde', 0, 0);
    INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
    INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id)
      VALUES (1, 1, 0, 0, 1, 1), (1, 1, 0, ${NOTURNO}, 1, 1);
    INSERT INTO indisponibilidades (professor_id, dia, hora) VALUES (1, 1, 0), (1, 1, ${NOTURNO});
    INSERT INTO configuracao (chave, valor) VALUES ('turnos_sabado', 'manha,noite')
      ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor;`;
  const migrado = () => criarBanco({ massa: false, antes: { 10: SEMENTE } });
  const coluna = (db: ReturnType<typeof criarBanco>, sql: string) =>
    db.prepare(sql).all().map((l) => Object.values(l as object)[0]);

  it("apaga aula e indisponibilidade em horário noturno, e só elas", () => {
    const db = migrado();
    expect(coluna(db, "SELECT hora FROM alocacoes")).toEqual([0]);
    expect(coluna(db, "SELECT hora FROM indisponibilidades")).toEqual([0]);
  });

  it("turno forçado 'noite' de disciplina vira NULL", () => {
    expect(um(migrado(), "SELECT turno FROM disciplinas WHERE id = 1")).toEqual({ turno: null });
  });

  it("tira a noite dos turnos do curso; curso só noturno volta ao padrão", () => {
    expect(coluna(migrado(), "SELECT turnos FROM cursos ORDER BY id")).toEqual(["manha,tarde", "manha", "manha,tarde", "tarde"]);
  });

  it("período noturno vai para a tarde se o curso a ocupa, senão para a manhã", () => {
    const db = migrado();
    expect(coluna(db, "SELECT turno FROM periodos WHERE numero = 1 ORDER BY curso_id")).toEqual(["tarde", "manha", "tarde", "tarde"]);
    // Nenhum período fica num turno que o curso não ocupa.
    expect(
      um(db, `SELECT COUNT(*) AS n FROM periodos p JOIN cursos c ON c.id = p.curso_id
               WHERE ',' || c.turnos || ',' NOT LIKE '%,' || p.turno || ',%'`),
    ).toEqual({ n: 0 });
  });

  it("tira a noite dos turnos do sábado; sábado só noturno volta à manhã", () => {
    expect(um(migrado(), "SELECT valor FROM configuracao WHERE chave = 'turnos_sabado'")).toEqual({ valor: "manha" });
    const soNoite = criarBanco({
      massa: false,
      antes: { 10: "UPDATE configuracao SET valor = 'noite' WHERE chave = 'turnos_sabado'" },
    });
    expect(um(soNoite, "SELECT valor FROM configuracao WHERE chave = 'turnos_sabado'")).toEqual({ valor: "manha" });
  });

  it("o máximo no contraturno não fica negativo com mais optativas forçadas do que ele", () => {
    const db = migrado();
    expect(um(db, "SELECT max_disciplinas_contraturno AS m FROM periodos WHERE curso_id = 1 AND numero = 2")).toEqual({ m: 0 });
    expect(coluna(db, "SELECT turno FROM disciplinas WHERE id IN (2, 3, 4) ORDER BY id")).toEqual([null, null, "tarde"]);
  });
});
