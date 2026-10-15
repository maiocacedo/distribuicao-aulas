import type { Database, SqlValue, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import type { Instrucao, ResultadoEscrita } from "../db";

/**
 * O que o banco do navegador faz sobre uma conexão aberta do SQLite em
 * WebAssembly, imitando o desktop ponto a ponto: as telas foram escritas (e os
 * e2e conferidos) contra o plugin SQL do Tauri e o comando `transacao` do Rust,
 * e uma diferença aqui só apareceria no navegador, onde ninguém testa à mão.
 *
 * Os parâmetros chegam como o Tauri os entregaria: já passados por JSON (quem
 * manda é `navegador.ts`). Por isso só há null, booleano, número finito,
 * texto, lista e objeto.
 */

/**
 * Como o `amarrar` de `src-tauri/src/lib.rs`: booleano vira 0/1 (o sqlx grava
 * `bool` como inteiro), número inteiro vai como inteiro e o resto como real,
 * lista e objeto viram texto JSON.
 */
export function amarrarEscrita(v: unknown): SqlValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/**
 * Como o `select` do plugin SQL (wrapper.rs): ele amarra todo número como
 * `f64`, isto é, REAL, e o que não é nulo, texto nem número (booleano, lista,
 * objeto) como texto JSON — `true` vira o texto 'true', não 1. Parece estranho,
 * mas é o que o desktop faz; imitar evita uma consulta que só funcione aqui.
 *
 * Devolve `{ real }` para o número, que precisa de amarração própria: o SQLite
 * em WebAssembly amarraria um inteiro do JavaScript como INTEGER.
 */
export function amarrarLeitura(v: unknown): null | string | { real: number } {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? { real: v } : null;
  return JSON.stringify(v);
}

/**
 * Como o plugin devolve cada valor (decode/sqlite.rs), pelo tipo do valor e
 * não da coluna: INTEGER e REAL viram número (0/1 continuam número, nunca
 * booleano), TEXT vira texto, NULL vira null e BLOB vira lista de bytes. O
 * inteiro grande demais para o JavaScript chega como BigInt aqui e vira número,
 * como o JSON do Tauri faria.
 */
export function valorDaLinha(v: SqlValue): unknown {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Uint8Array) return Array.from(v);
  return v;
}

export function consultar(sqlite3: Sqlite3Static, db: Database, sql: string, params: unknown[] = []) {
  const linhas: Record<string, unknown>[] = [];
  const stmt = db.prepare(sql);
  try {
    params.forEach((p, i) => {
      const v = amarrarLeitura(p);
      if (v !== null && typeof v === "object") sqlite3.capi.sqlite3_bind_double(stmt, i + 1, v.real);
      else stmt.bind(i + 1, v);
    });
    while (stmt.step()) {
      const linha = stmt.get({}) as Record<string, SqlValue>;
      const saida: Record<string, unknown> = {};
      for (const [coluna, valor] of Object.entries(linha)) saida[coluna] = valorDaLinha(valor);
      linhas.push(saida);
    }
  } finally {
    stmt.finalize();
  }
  return linhas;
}

/**
 * O comando `transacao` do Rust: chave estrangeira ligada FORA da transação
 * (dentro dela o PRAGMA é ignorado sem aviso), tudo ou nada, `rowsAffected`
 * somado e `lastInsertId` da última instrução. O COMMIT fica dentro do `try`:
 * com restrição adiada ele pode falhar, e a transação continuaria aberta.
 */
export function transacao(sqlite3: Sqlite3Static, db: Database, instrucoes: Instrucao[]): ResultadoEscrita {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("BEGIN");
  let rowsAffected = 0;
  let lastInsertId = 0;
  try {
    for (const i of instrucoes) {
      const params = (i.params ?? []).map(amarrarEscrita);
      db.exec({ sql: i.sql, bind: params.length ? params : undefined });
      rowsAffected += db.changes();
      lastInsertId = Number(sqlite3.capi.sqlite3_last_insert_rowid(db));
    }
    db.exec("COMMIT");
  } catch (e) {
    // Se o próprio SQLite já desfez a transação, não há o que desfazer: o erro
    // que importa é o primeiro.
    try {
      db.exec("ROLLBACK");
    } catch {
      /* nada aberto */
    }
    throw e;
  }
  return { rowsAffected, lastInsertId };
}
