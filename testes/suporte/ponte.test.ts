import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { NOME_DO_BANCO, criarPonte } from "./ponte";

function bancoMinimo() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE pai (id INTEGER PRIMARY KEY, nome TEXT, dados TEXT);
    CREATE TABLE filho (id INTEGER PRIMARY KEY, pai_id INTEGER NOT NULL REFERENCES pai(id));
  `);
  return db;
}

describe("ponte de IPC", () => {
  it("responde banco e load como o app espera", () => {
    const ponte = criarPonte(bancoMinimo());
    expect(ponte("banco")).toEqual({ ok: true, valor: NOME_DO_BANCO });
    expect(ponte("plugin:sql|load", { db: "sqlite:x.db" })).toEqual({ ok: true, valor: "sqlite:x.db" });
  });

  it("converte booleano em 0/1 como o amarrar do Rust", () => {
    const r = criarPonte(bancoMinimo())("plugin:sql|select", { query: "SELECT ? AS v", values: [true] });
    expect(r).toEqual({ ok: true, valor: [{ v: 1 }] });
  });

  it("grava array como texto JSON", () => {
    const db = bancoMinimo();
    const ponte = criarPonte(db);
    ponte("transacao", { instrucoes: [{ sql: "INSERT INTO pai (nome, dados) VALUES (?, ?)", params: ["a", [1, 2]] }] });
    expect({ ...(db.prepare("SELECT dados FROM pai").get() as object) }).toEqual({ dados: "[1,2]" });
  });

  it("transacao devolve linhas afetadas e último id", () => {
    const r = criarPonte(bancoMinimo())("transacao", {
      instrucoes: [
        { sql: "INSERT INTO pai (nome) VALUES (?)", params: ["a"] },
        { sql: "INSERT INTO pai (nome) VALUES (?)", params: ["b"] },
      ],
    });
    expect(r).toEqual({ ok: true, valor: { rowsAffected: 2, lastInsertId: 2 } });
  });

  it("desfaz tudo quando uma instrução viola chave estrangeira", () => {
    const db = bancoMinimo();
    const r = criarPonte(db)("transacao", {
      instrucoes: [
        { sql: "INSERT INTO pai (nome) VALUES (?)", params: ["a"] },
        { sql: "INSERT INTO filho (pai_id) VALUES (?)", params: [999] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.erro).toMatch(/FOREIGN KEY constraint failed/);
    expect({ ...(db.prepare("SELECT COUNT(*) AS n FROM pai").get() as object) }).toEqual({ n: 0 });
  });

  it("rejeita comando que não simula", () => {
    expect(criarPonte(bancoMinimo())("plugin:sql|execute")).toEqual({
      ok: false,
      erro: "comando não simulado: plugin:sql|execute",
    });
  });

  it("injeta falha por padrão de SQL", () => {
    const r = criarPonte(bancoMinimo(), { falharQuando: /FROM pai/ })("plugin:sql|select", {
      query: "SELECT * FROM pai",
      values: [],
    });
    expect(r).toEqual({ ok: false, erro: "falha simulada: SELECT * FROM pai" });
  });

  it("falha só a partir da vez pedida", () => {
    const ponte = criarPonte(bancoMinimo(), { falharAPartirDe: { quando: /FROM pai/, vez: 2 } });
    const ler = () => ponte("plugin:sql|select", { query: "SELECT * FROM pai", values: [] });
    expect(ler().ok).toBe(true);
    expect(ler()).toEqual({ ok: false, erro: "falha simulada: SELECT * FROM pai" });
    expect(ler().ok).toBe(false);
  });
});
