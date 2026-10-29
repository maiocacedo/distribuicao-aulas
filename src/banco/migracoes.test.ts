import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { criarBanco } from "../../testes/suporte/banco";
import { DESCRICOES, checksum, migracoesDoApp, migrar, type Migracao } from "./migracoes";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Os checksums gravados em `_sqlx_migrations` por um banco de verdade do
 * desktop (lidos de uma cópia, uma vez; o teste não lê banco nenhum). Se um
 * destes deixar de bater, um banco do desktop deixa de abrir no navegador.
 */
const DO_DESKTOP: Record<number, string> = {
  1: "8F76ACDE9597A065DF2490058440257730C4F2B51058AD2BB738A6B7B9370613A349D0F2F8CF044078C7FBBA8D607298",
  2: "E5C5133FFD4821CB3DCA85AF1640399EE5C1717D8FCE017E2BBE48D131302534DE8283C2E26BEB84B2A1967678AC5BCB",
  3: "D9A01A055D923EB749EDBB3C4B433ECE049C33171FEBB6D1FBA5A8E884EE9BC9055320EE075A6CDA98701A984CBCCEF5",
  4: "E9D7C1B6508D6A743D62D25B4B3DB285167ED69F7FE4CCA973B5C5D188CF58A97B0C77553874DB19E3ACAD3C53BC3278",
  5: "EFCBDA5ED955A037697C1D1F8731DDFB8F20C0708B99C213606F5731F2BAA674E39BFEB7E32ECE21B2083C4A11A3D947",
  6: "9A59918E817C80D0B1BF6C6D1C38283823EE7A65D25FDECF74896EF3C78683A037211B5EA79347B10C4DAD838E1A9A63",
  7: "E94CFE09B4FE062A798CB4970B9D86703C366D813798F3BD355D68CC9A409520B104C87C340C0CFE084D54B50F4B709A",
  8: "FD969F48D148124A802BB5A97E09AAD82EB1AD8FE910627CFA6163C43D455E3C9993234C195B9AF4134CC878DC482326",
  9: "67049664BA5B520F4995FA363F2E6D2D4B00DD06209146F000F96EC8825BD45F278FCED87FD58B6C676980021BB7538C",
  10: "4F0D07FBB69C3C5338B2674DD662FC24979F8BEAF5702FDCF9A9D3CB79A857C2E1C7EA461A518631028623623B6CEFCA",
};

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

let sqlite3: Sqlite3Static;
beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
  sqlite3.config.warn = () => {};
});

const novo = (): Database => {
  const db = new sqlite3.oo1.DB(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
};

const registradas = (db: Database) =>
  db.selectObjects("SELECT version, description, installed_on, success, checksum, execution_time FROM _sqlx_migrations ORDER BY version");

describe("as migrações do aplicativo", () => {
  it("são as mesmas de `migracoes()` no Rust: versão, descrição e arquivo", () => {
    const rust = readFileSync(join(RAIZ, "src-tauri", "src", "lib.rs"), "utf-8");
    const doRust = [
      ...rust.matchAll(/version: (\d+),\s*description: "([^"]*)",\s*sql: include_str!\("\.\.\/\.\.\/scripts\/migracoes\/([^"]+)"\)/g),
    ].map(([, v, descricao, arquivo]) => ({ versao: Number(v), descricao, arquivo }));
    expect(doRust.length).toBeGreaterThan(0);
    expect(doRust.map(({ versao, descricao }) => ({ versao, descricao }))).toEqual(
      Object.entries(DESCRICOES).map(([v, descricao]) => ({ versao: Number(v), descricao })),
    );
    const pasta = join(RAIZ, "scripts", "migracoes");
    expect(readdirSync(pasta).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()).toEqual(doRust.map((m) => m.arquivo));
    // O texto que o Vite entrega é byte a byte o do disco, que é o que o `include_str!` embute.
    const doApp = migracoesDoApp();
    expect(doApp.map((m) => m.versao)).toEqual(doRust.map((m) => m.versao));
    doApp.forEach((m, i) => expect(m.sql).toBe(readFileSync(join(pasta, doRust[i].arquivo), "utf-8")));
  });

  it("o checksum é o que o desktop gravou, versão por versão", async () => {
    const calculados: Record<number, string> = {};
    for (const m of migracoesDoApp()) calculados[m.versao] = hex(await checksum(m.sql));
    expect(calculados).toEqual(DO_DESKTOP);
  });
});

describe("migrar", () => {
  it("banco vazio: aplica todas e registra como o sqlx", async () => {
    const db = novo();
    await migrar(db, migracoesDoApp());
    const linhas = registradas(db);
    expect(linhas.map((l) => [l.version, l.description, l.success])).toEqual(
      Object.entries(DESCRICOES).map(([v, d]) => [Number(v), d, 1]),
    );
    for (const l of linhas) {
      expect(hex(l.checksum as Uint8Array)).toBe(DO_DESKTOP[l.version as number]);
      expect(l.installed_on).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(l.execution_time).toBeGreaterThanOrEqual(0);
    }
    expect(db.selectValue("SELECT typeof(checksum) FROM _sqlx_migrations LIMIT 1")).toBe("blob");
    expect(db.selectValue("SELECT sql FROM sqlite_master WHERE name = '_sqlx_migrations'")).toBe(
      "CREATE TABLE _sqlx_migrations (\n    version BIGINT PRIMARY KEY,\n    description TEXT NOT NULL,\n" +
        "    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    success BOOLEAN NOT NULL,\n" +
        "    checksum BLOB NOT NULL,\n    execution_time BIGINT NOT NULL\n)",
    );
  });

  it("o esquema resultante é o mesmo que os testes montam no Node", async () => {
    const db = novo();
    await migrar(db, migracoesDoApp());
    const esquema = (linhas: unknown[]) => linhas.map((l) => ({ ...(l as object) }));
    const sql = "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE '_sqlx%' AND name NOT LIKE 'sqlite_%' ORDER BY type, name";
    const node = criarBanco({ massa: false });
    expect(esquema(db.selectObjects(sql))).toEqual(esquema(node.prepare(sql).all()));
    // E os dados que as migrações semeiam (o curso da 005, a configuração).
    for (const t of ["cursos", "configuracao", "horarios", "tipos_disciplina"]) {
      const q = `SELECT * FROM ${t} ORDER BY 1`;
      expect(esquema(db.selectObjects(q))).toEqual(esquema(node.prepare(q).all()));
    }
  });

  it("banco já migrado até uma versão continua dali, sem mexer no que estava", async () => {
    const db = novo();
    const todas = migracoesDoApp();
    await migrar(db, todas.slice(0, 9));
    db.exec("UPDATE _sqlx_migrations SET installed_on = '2000-01-01 00:00:00'");
    await migrar(db, todas);
    const linhas = registradas(db);
    expect(linhas).toHaveLength(todas.length);
    expect(linhas.slice(0, 9).every((l) => l.installed_on === "2000-01-01 00:00:00")).toBe(true);
    expect(linhas[9].installed_on).not.toBe("2000-01-01 00:00:00");
    // Abrir de novo não faz nada.
    await migrar(db, todas);
    expect(registradas(db)).toEqual(linhas);
  });

  it("checksum diferente do gravado: recusa, e não aplica as seguintes", async () => {
    const db = novo();
    const todas = migracoesDoApp();
    await migrar(db, todas.slice(0, 2));
    const mudada: Migracao[] = [todas[0], { ...todas[1], sql: todas[1].sql + "\n" }, ...todas.slice(2)];
    await expect(migrar(db, mudada)).rejects.toThrow(/migração 2 .*checksum não bate/);
    expect(registradas(db)).toHaveLength(2);
  });

  it("migração pela metade (success = 0): recusa", async () => {
    const db = novo();
    const todas = migracoesDoApp();
    await migrar(db, todas.slice(0, 1));
    db.exec("UPDATE _sqlx_migrations SET success = 0");
    await expect(migrar(db, todas)).rejects.toThrow(/migração 1 .*pela metade/);
  });

  it("versão gravada que o aplicativo não tem: recusa (banco de um aplicativo mais novo)", async () => {
    const db = novo();
    const todas = migracoesDoApp();
    await migrar(db, todas);
    db.exec("INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (99, 'futura', 1, x'00', 0)");
    await expect(migrar(db, todas)).rejects.toThrow(/migração 99, que este aplicativo não conhece/);
  });

  it("uma migração que falha não deixa nada dela nem registro", async () => {
    const db = novo();
    const quebrada: Migracao[] = [
      { versao: 1, descricao: "um", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY);" },
      { versao: 2, descricao: "dois", sql: "CREATE TABLE b (id INTEGER); INSERT INTO nao_existe VALUES (1);" },
    ];
    await expect(migrar(db, quebrada)).rejects.toThrow(/migração 2 falhou: .*no such table: nao_existe/);
    expect(registradas(db).map((l) => l.version)).toEqual([1]);
    expect(db.selectValue("SELECT COUNT(*) FROM sqlite_master WHERE name = 'b'")).toBe(0);
  });

  it("a migração roda com a chave estrangeira ligada", async () => {
    const db = new sqlite3.oo1.DB(":memory:");
    db.exec("PRAGMA foreign_keys = OFF");
    const comFk: Migracao[] = [
      {
        versao: 1,
        descricao: "um",
        sql: "CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE f (p_id INTEGER REFERENCES p(id)); INSERT INTO f VALUES (5);",
      },
    ];
    await expect(migrar(db, comFk)).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});
