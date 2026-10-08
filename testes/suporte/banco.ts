import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
 */
export function criarBanco({ massa = true }: { massa?: boolean } = {}): DatabaseSync {
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

  const todas = migracoes();
  for (const m of todas.filter((m) => m.versao <= versaoMassa)) aplicar(m.sql);
  if (massa) aplicar(texto);
  for (const m of todas.filter((m) => m.versao > versaoMassa)) aplicar(m.sql);
  return db;
}
