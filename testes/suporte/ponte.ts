import type { DatabaseSync } from "node:sqlite";

/**
 * Simulação do IPC do Tauri sobre um SQLite do Node, para testar o front sem o
 * binário. Cobre só o que o app usa; qualquer outro comando é rejeitado, para
 * que um uso novo apareça como falha em vez de passar despercebido.
 *
 * A semântica de `transacao` segue `src-tauri/src/lib.rs`: chave estrangeira
 * ligada, tudo ou nada, e parâmetros convertidos como no `amarrar`.
 */

export type Valor = null | number | bigint | string | Uint8Array;
export type Resposta = { ok: true; valor: unknown } | { ok: false; erro: string };
export interface OpcoesPonte {
  /** Toda consulta ou instrução cujo SQL casar com isto falha. */
  falharQuando?: RegExp;
  /** Cada comando recebido é anotado aqui, na ordem — para contar escritas. */
  registro?: string[];
}

interface Instrucao {
  sql: string;
  params?: unknown[];
}

export const NOME_DO_BANCO = "sqlite:distribuicao.db";

/** Como o `amarrar` do Rust: booleano vira 0/1; array e objeto viram texto JSON. */
export function converter(v: unknown): Valor {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return JSON.stringify(v);
}

export function criarPonte(db: DatabaseSync, opcoes: OpcoesPonte = {}) {
  function verificar(sql: string) {
    if (opcoes.falharQuando?.test(sql)) throw new Error(`falha simulada: ${sql}`);
  }

  function transacao(instrucoes: Instrucao[]) {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("BEGIN");
    let rowsAffected = 0;
    let lastInsertId = 0;
    try {
      for (const i of instrucoes) {
        verificar(i.sql);
        const r = db.prepare(i.sql).run(...(i.params ?? []).map(converter));
        rowsAffected += Number(r.changes);
        lastInsertId = Number(r.lastInsertRowid);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { rowsAffected, lastInsertId };
  }

  function executar(cmd: string, args: Record<string, unknown>): unknown {
    opcoes.registro?.push(cmd);
    switch (cmd) {
      case "banco":
        return NOME_DO_BANCO;
      case "plugin:sql|load":
        return args.db;
      case "plugin:sql|select": {
        const query = String(args.query);
        verificar(query);
        const valores = ((args.values as unknown[]) ?? []).map(converter);
        return db.prepare(query).all(...valores).map((linha) => ({ ...(linha as object) }));
      }
      case "transacao":
        return transacao(args.instrucoes as Instrucao[]);
      default:
        throw new Error(`comando não simulado: ${cmd}`);
    }
  }

  return (cmd: string, args: Record<string, unknown> = {}): Resposta => {
    try {
      return { ok: true, valor: executar(cmd, args) };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  };
}
