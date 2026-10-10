import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Leitor } from "../../src/solver/carregar";
import type { Alocacao } from "../../src/solver/tipos";
import { converter } from "./ponte";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const MIGRACOES = join(RAIZ, "scripts", "migracoes");
const MASSA = join(RAIZ, "testes", "massa", "engenharia_v9.sql");

function migracoes(): { versao: number; sql: string }[] {
  return readdirSync(MIGRACOES)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort()
    .map((f) => ({ versao: Number(f.slice(0, 3)), sql: readFileSync(join(MIGRACOES, f), "utf-8") }));
}

/**
 * Banco em memória montado como o do usuário: migrações reais até a versão em
 * que a massa foi gravada, a massa, e as migrações restantes. Cada migração
 * roda numa transação com a chave estrangeira ligada, como faz o sqlx.
 *
 * `antes[N]` é SQL executado logo antes da migração N, ainda no esquema
 * anterior: é como se testa o que uma migração faz com dado que a massa não tem.
 */
export function criarBanco({
  massa = true,
  antes = {},
}: { massa?: boolean; antes?: Record<number, string> } = {}): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const texto = massa ? readFileSync(MASSA, "utf-8") : "";
  const versaoMassa = massa ? Number(/-- esquema: (\d+)/.exec(texto)?.[1]) : 0;
  if (massa && !versaoMassa) throw new Error("massa sem a linha '-- esquema: N'");

  const aplicar = (sql: string) => {
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };

  const migrar = (m: { versao: number; sql: string }) => {
    if (antes[m.versao]) aplicar(antes[m.versao]);
    aplicar(m.sql);
  };

  const todas = migracoes();
  for (const m of todas.filter((m) => m.versao <= versaoMassa)) migrar(m);
  if (massa) aplicar(texto);
  for (const m of todas.filter((m) => m.versao > versaoMassa)) migrar(m);
  return db;
}

/** Leitor para `carregarProblema` sobre um banco de teste. */
export function lerDe(db: DatabaseSync): Leitor {
  return async <T,>(sql: string, params: unknown[] = []) =>
    db.prepare(sql).all(...params.map(converter)).map((linha) => ({ ...(linha as object) })) as T[];
}

/** A grade gravada de um curso, no formato do solver. */
export function lerAlocacoes(db: DatabaseSync, cursoId: number): Alocacao[] {
  const linhas = db
    .prepare("SELECT periodo, dia, hora, disciplina_id, professor_id, sala_id FROM alocacoes WHERE curso_id = ?")
    .all(cursoId) as {
    periodo: number;
    dia: number;
    hora: number;
    disciplina_id: number;
    professor_id: number;
    sala_id: number | null;
  }[];
  return linhas.map((a) => ({
    periodo: a.periodo,
    dia: a.dia,
    hora: a.hora,
    disciplinaId: a.disciplina_id,
    professorId: a.professor_id,
    salaId: a.sala_id,
  }));
}
