/// <reference types="vite/client" />
// Os tipos de `import.meta.glob`: o projeto de tipos de `testes/` também chega a
// este arquivo, pelos imports, e ele não carrega o `vite/client`.
import type { Database } from "@sqlite.org/sqlite-wasm";

/**
 * As migrações do banco do navegador são os mesmos arquivos de
 * `scripts/migracoes/` que o desktop embute com `include_str!`, e ficam
 * registradas em `_sqlx_migrations` exatamente como o sqlx (por baixo do plugin
 * SQL do Tauri) as registra. É isso que deixa um banco passar de um lado para
 * o outro: o desktop abre um banco feito aqui sem reaplicar nada, e um banco do
 * desktop continua aqui da versão em que está.
 *
 * O Vite lê os arquivos do disco como o `include_str!`: os bytes são os mesmos,
 * e com eles o checksum.
 */
const ARQUIVOS = import.meta.glob<string>("../../scripts/migracoes/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * A descrição de cada versão, como está em `migracoes()` de
 * `src-tauri/src/lib.rs` — o sqlx a grava, mas não a confere. Um teste compara
 * esta lista com a do Rust, para que uma migração nova não fique de fora aqui.
 */
export const DESCRICOES: Record<number, string> = {
  1: "esquema inicial",
  2: "codigo e duracao dos horarios",
  3: "unidade e a aula, nao a hora",
  4: "conversao horas de curriculo para aulas semanais",
  5: "varios cursos compartilhando professores e salas",
  6: "requisito de sala por tipo",
  7: "abreviacao da disciplina",
  8: "horarios fixos da instituicao, turnos por curso",
  9: "sabado so de manha",
  10: "regras e integridade",
};

export interface Migracao {
  versao: number;
  descricao: string;
  sql: string;
}

/** As migrações do aplicativo, em ordem de versão. */
export function migracoesDoApp(): Migracao[] {
  return Object.entries(ARQUIVOS)
    .map(([caminho, sql]) => {
      const versao = Number(/\/(\d{3})_[^/]*\.sql$/.exec(caminho)?.[1]);
      const descricao = DESCRICOES[versao];
      if (!descricao) throw new Error(`a migração ${caminho} não tem descrição em DESCRICOES`);
      return { versao, descricao, sql };
    })
    .sort((a, b) => a.versao - b.versao);
}

/**
 * O checksum do sqlx (sqlx-core, migrate/migration.rs): SHA-384 dos bytes do
 * texto da migração, sem tirar nem pôr nada — nem a quebra de linha final.
 */
export async function checksum(sql: string): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "Este endereço não é seguro para o navegador (falta crypto.subtle): abra o aplicativo por http://localhost ou por https.",
    );
  return new Uint8Array(await crypto.subtle.digest("SHA-384", new TextEncoder().encode(sql)));
}

const iguais = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * O `Migrator::run` do sqlx, na mesma ordem e com as mesmas recusas:
 *
 * - uma migração gravada com `success = 0` ficou pela metade, e o banco não
 *   abre (`MigrateError::Dirty`);
 * - uma versão gravada que o aplicativo não tem quer dizer banco de uma versão
 *   mais nova do aplicativo (`VersionMissing`);
 * - uma versão gravada com checksum diferente quer dizer que o arquivo mudou
 *   depois de aplicado (`VersionMismatch`).
 *
 * As que faltam são aplicadas em ordem, cada uma numa transação com a chave
 * estrangeira ligada (o sqlx liga por padrão em toda conexão), e registradas
 * na mesma transação. O tempo de execução, em nanossegundos, é gravado depois,
 * como faz o sqlx.
 */
export async function migrar(db: Database, migracoes: Migracao[]): Promise<void> {
  const somas = new Map<number, Uint8Array>();
  for (const m of migracoes) somas.set(m.versao, await checksum(m.sql));

  // O mesmo texto do sqlx-sqlite (migrate.rs): o SQLite guarda o CREATE como
  // foi escrito, e o esquema fica igual ao de um banco do desktop.
  db.exec(`
CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
);
                `);

  const pelaMetade = db.selectValue(
    "SELECT version FROM _sqlx_migrations WHERE success = false ORDER BY version LIMIT 1",
  );
  if (pelaMetade !== undefined)
    throw new Error(
      `A migração ${pelaMetade} deste banco ficou pela metade (success = 0). O banco não foi aberto.`,
    );

  const aplicadas = new Map<number, Uint8Array>();
  for (const l of db.selectObjects("SELECT version, checksum FROM _sqlx_migrations ORDER BY version"))
    aplicadas.set(Number(l.version), l.checksum as Uint8Array);

  for (const versao of aplicadas.keys())
    if (!somas.has(versao))
      throw new Error(
        `Este banco tem a migração ${versao}, que este aplicativo não conhece: ele foi gravado por uma versão mais nova do aplicativo. O banco não foi aberto.`,
      );

  for (const m of migracoes) {
    const soma = somas.get(m.versao)!;
    const gravada = aplicadas.get(m.versao);
    if (gravada) {
      if (!iguais(gravada, soma))
        throw new Error(
          `A migração ${m.versao} gravada neste banco não é a deste aplicativo (o checksum não bate): o arquivo mudou depois de aplicado. O banco não foi aberto.`,
        );
      continue;
    }
    const inicio = performance.now();
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.exec({
        sql: "INSERT INTO _sqlx_migrations ( version, description, success, checksum, execution_time ) VALUES ( ?1, ?2, TRUE, ?3, -1 )",
        bind: [m.versao, m.descricao, soma],
      });
      db.exec("COMMIT");
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* nada aberto */
      }
      throw new Error(`A migração ${m.versao} falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
    db.exec({
      sql: "UPDATE _sqlx_migrations SET execution_time = ?1 WHERE version = ?2",
      bind: [Math.round((performance.now() - inicio) * 1e6), m.versao],
    });
  }
}
