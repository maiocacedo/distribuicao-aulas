import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mensagemErro } from "@/lib/erros";
import { amarrarEscrita, amarrarLeitura, consultar, transacao, valorDaLinha } from "./sqlite";

// O mesmo SQLite em WebAssembly do navegador; no Node ele só abre banco em memória.
let sqlite3: Sqlite3Static;
let db: Database;

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
  // A cada restrição violada o pacote escreve um aviso no console; o erro em si
  // é o que os testes conferem.
  sqlite3.config.warn = () => {};
});

beforeEach(() => {
  db = new sqlite3.oo1.DB(":memory:");
  db.exec(`
    CREATE TABLE pais (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, peso REAL, n INTEGER CHECK (n >= 0), dado BLOB);
    CREATE TABLE filhos (id INTEGER PRIMARY KEY, pai_id INTEGER NOT NULL REFERENCES pais(id));
  `);
});

const ler = (sql: string, params: unknown[] = []) => consultar(sqlite3, db, sql, params);
const gravar = (...instrucoes: { sql: string; params?: unknown[] }[]) => transacao(sqlite3, db, instrucoes);

describe("amarração", () => {
  it("escrita: como o `amarrar` do Rust", () => {
    expect([null, undefined, true, false, 3, 2.5, "x", [1, 2], { a: 1 }].map(amarrarEscrita)).toEqual([
      null,
      null,
      1,
      0,
      3,
      2.5,
      "x",
      "[1,2]",
      '{"a":1}',
    ]);
  });

  it("leitura: como o `select` do plugin, número como real e booleano como texto JSON", () => {
    expect([null, "x", 3, true, [1]].map(amarrarLeitura)).toEqual([null, "x", { real: 3 }, "true", "[1]"]);
  });

  it("valor da linha: BigInt vira número e BLOB vira lista de bytes", () => {
    expect([1, 2.5, "t", null, 7n, new Uint8Array([1, 255])].map(valorDaLinha)).toEqual([1, 2.5, "t", null, 7, [1, 255]]);
  });
});

describe("consultar", () => {
  it("linhas como objetos, com os tipos do plugin: 0/1 número, real, texto, null, BLOB", () => {
    gravar({ sql: "INSERT INTO pais (nome, peso, n, dado) VALUES (?, ?, ?, ?)", params: ["a", 1.5, 0, null] });
    db.exec("INSERT INTO pais (nome, n, dado) VALUES ('b', 1, x'01ff')");
    expect(ler("SELECT id, nome, peso, n, dado FROM pais ORDER BY id")).toEqual([
      { id: 1, nome: "a", peso: 1.5, n: 0, dado: null },
      { id: 2, nome: "b", peso: null, n: 1, dado: [1, 255] },
    ]);
  });

  it("o número do parâmetro vai como REAL, como no plugin, e ainda casa com a coluna inteira", () => {
    gravar({ sql: "INSERT INTO pais (nome) VALUES ('a')" });
    expect(ler("SELECT typeof(?) AS t", [1])).toEqual([{ t: "real" }]);
    expect(ler("SELECT nome FROM pais WHERE id = ?", [1])).toEqual([{ nome: "a" }]);
  });

  it("SQL inválido rejeita com a mensagem do SQLite", () => {
    expect(() => ler("SELECT * FROM nao_existe")).toThrow(/no such table: nao_existe/);
  });
});

describe("transacao", () => {
  it("soma as linhas afetadas e devolve o id da última instrução", () => {
    const r = gravar(
      { sql: "INSERT INTO pais (nome) VALUES (?)", params: ["a"] },
      { sql: "INSERT INTO pais (nome) VALUES (?)", params: ["b"] },
      { sql: "UPDATE pais SET n = 1" },
    );
    expect(r).toEqual({ rowsAffected: 4, lastInsertId: 2 });
  });

  it("booleano grava 0/1 e lista grava texto JSON", () => {
    gravar({ sql: "INSERT INTO pais (nome, n) VALUES (?, ?)", params: [["x", 1], true] });
    expect(ler("SELECT nome, n FROM pais")).toEqual([{ nome: '["x",1]', n: 1 }]);
  });

  it("liga a chave estrangeira e desfaz tudo quando uma instrução falha", () => {
    db.exec("PRAGMA foreign_keys = OFF");
    expect(() =>
      gravar(
        { sql: "INSERT INTO pais (nome) VALUES ('a')" },
        { sql: "INSERT INTO filhos (pai_id) VALUES (99)" },
      ),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(ler("SELECT COUNT(*) AS n FROM pais")).toEqual([{ n: 0 }]);
    // A conexão segue usável: nada ficou aberto.
    expect(gravar({ sql: "INSERT INTO pais (nome) VALUES ('a')" })).toEqual({ rowsAffected: 1, lastInsertId: 1 });
  });

  it("COMMIT recusado por restrição adiada desfaz a transação", () => {
    db.exec(`CREATE TABLE adiada (id INTEGER PRIMARY KEY,
               pai_id INTEGER REFERENCES pais(id) DEFERRABLE INITIALLY DEFERRED)`);
    expect(() => gravar({ sql: "INSERT INTO adiada (pai_id) VALUES (5)" })).toThrow(/FOREIGN KEY constraint failed/);
    expect(ler("SELECT COUNT(*) AS n FROM adiada")).toEqual([{ n: 0 }]);
    expect(gravar({ sql: "INSERT INTO pais (nome) VALUES ('a')" }).rowsAffected).toBe(1);
  });

  it("as recusas chegam com as frases que `mensagemErro` reconhece", () => {
    gravar({ sql: "INSERT INTO pais (nome) VALUES ('a')" });
    const erroDe = (sql: string) => {
      try {
        gravar({ sql });
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        // Como chega à tela: o motor do navegador rejeita com `new Error(mensagem)`.
        return mensagemErro(new Error((e as Error).message), "O pai");
      }
      throw new Error("devia ter falhado");
    };
    expect(erroDe("INSERT INTO filhos (pai_id) VALUES (99)")).toBe(
      "O pai está em uso e não pode ser removido. Remova antes os registros que dependem dele.",
    );
    expect(erroDe("INSERT INTO pais (nome) VALUES ('a')")).toBe("Já existe um registro com esse nome.");
    expect(erroDe("INSERT INTO pais (nome, n) VALUES ('b', -1)")).toBe("Algum valor está fora do permitido pelo esquema.");
  });
});
