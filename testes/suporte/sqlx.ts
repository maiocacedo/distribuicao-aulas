import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/**
 * O que o desktop faz com `_sqlx_migrations`, escrito à parte do código do
 * navegador: a lista vem de `migracoes()` em `src-tauri/src/lib.rs` (versão,
 * descrição, arquivo), e o checksum é o SHA-384 do Node sobre os bytes do
 * arquivo — como o `include_str!` e o sqlx. É a régua para provar que um banco
 * do navegador abre no desktop sem rodar o Tauri, e para montar um banco "como
 * o desktop teria".
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

export interface MigracaoDoDesktop {
  versao: number;
  descricao: string;
  sql: string;
  checksum: Buffer;
}

export function migracoesDoDesktop(): MigracaoDoDesktop[] {
  const rust = readFileSync(join(RAIZ, "src-tauri", "src", "lib.rs"), "utf-8");
  const lista = [
    ...rust.matchAll(/version: (\d+),\s*description: "([^"]*)",\s*sql: include_str!\("\.\.\/\.\.\/(scripts\/migracoes\/[^"]+)"\)/g),
  ].map(([, versao, descricao, arquivo]) => {
    const bytes = readFileSync(join(RAIZ, arquivo));
    return {
      versao: Number(versao),
      descricao,
      sql: bytes.toString("utf-8"),
      checksum: createHash("sha384").update(bytes).digest(),
    };
  });
  if (lista.length === 0) throw new Error("nenhuma migração achada em lib.rs");
  return lista;
}

/**
 * O `Migrator::run` do sqlx até o ponto de aplicar: recusa o que ele recusaria
 * (migração pela metade, versão que o desktop não tem, checksum diferente) e
 * devolve as versões que ele aplicaria ao abrir o banco.
 */
export function conferirComoSqlx(db: DatabaseSync): number[] {
  const desktop = migracoesDoDesktop();
  const linhas = db
    .prepare("SELECT version, description, success, checksum FROM _sqlx_migrations ORDER BY version")
    .all() as { version: number; description: string; success: number; checksum: Uint8Array }[];
  const pelaMetade = linhas.find((l) => !l.success);
  if (pelaMetade) throw new Error(`Dirty(${pelaMetade.version})`);
  for (const l of linhas) {
    const m = desktop.find((d) => d.versao === Number(l.version));
    if (!m) throw new Error(`VersionMissing(${l.version})`);
    if (!Buffer.from(l.checksum).equals(m.checksum)) throw new Error(`VersionMismatch(${l.version})`);
  }
  return desktop.filter((m) => !linhas.some((l) => Number(l.version) === m.versao)).map((m) => m.versao);
}

/**
 * Registra em `_sqlx_migrations`, como o sqlx, as migrações até `ate` — para
 * um banco montado por `criarBanco` (que aplica as migrações sem registrá-las)
 * ficar como um banco do desktop.
 */
export function registrarComoSqlx(db: DatabaseSync, ate = Infinity) {
  db.exec(`CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
)`);
  const inserir = db.prepare(
    "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (?, ?, TRUE, ?, 1000)",
  );
  for (const m of migracoesDoDesktop().filter((m) => m.versao <= ate)) inserir.run(m.versao, m.descricao, m.checksum);
}
