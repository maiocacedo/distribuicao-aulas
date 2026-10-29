import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarBanco } from "../../testes/suporte/banco";
import { conferirComoSqlx, migracoesDoDesktop, registrarComoSqlx } from "../../testes/suporte/sqlx";
import { abrirArquivo, exportar, montarExemplo, montarVazio, resumir } from "./arquivo";
import { migracoesDoApp, migrar } from "./migracoes";

const MASSA = readFileSync(fileURLToPath(new URL("../../testes/massa/engenharia_v9.sql", import.meta.url)), "utf-8");
const naMassa = (tabela: string) => MASSA.split(`INSERT INTO ${tabela} `).length - 1;

let sqlite3: Sqlite3Static;
let pasta: string;
beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
  sqlite3.config.warn = () => {};
  pasta = mkdtempSync(join(tmpdir(), "banco-navegador-"));
});
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

/** Grava a imagem num arquivo e o abre com o SQLite do Node, como o desktop abriria o `.db`. */
function abrirNoNode(bytes: Uint8Array, nome: string): DatabaseSync {
  const caminho = join(pasta, nome);
  writeFileSync(caminho, bytes);
  return new DatabaseSync(caminho);
}

/** O banco do Node em bytes de arquivo. */
function bytesDoNode(db: DatabaseSync, nome: string): Uint8Array {
  const caminho = join(pasta, nome);
  db.exec(`VACUUM INTO '${caminho.replace(/'/g, "''")}'`);
  return new Uint8Array(readFileSync(caminho));
}

const linhas = (db: Database, sql: string) => db.selectObjects(sql).map((l) => ({ ...l }));
const linhasNode = (db: DatabaseSync, sql: string) => db.prepare(sql).all().map((l) => ({ ...(l as object) }));

const TABELAS_DE_DADOS = ["cursos", "periodos", "disciplinas", "disciplina_professores", "professores", "salas", "alocacoes", "configuracao", "padroes_blocos", "tipos_disciplina"];

describe("montar", () => {
  it("vazio: só as migrações, com o curso que a 005 cria", async () => {
    const db = await montarVazio(sqlite3);
    expect(resumir(db)).toEqual({ cursos: 1, professores: 0, disciplinas: 0 });
    expect(db.selectValue("SELECT COUNT(*) FROM _sqlx_migrations")).toBe(migracoesDoApp().length);
  });

  it("exemplo: os mesmos dados que os testes montam no Node com a massa", async () => {
    const db = await montarExemplo(sqlite3, MASSA);
    expect(resumir(db).professores).toBe(naMassa("professores"));
    const node = criarBanco();
    for (const t of TABELAS_DE_DADOS) {
      const q = `SELECT * FROM ${t} ORDER BY 1, 2`;
      expect(linhas(db, q), t).toEqual(linhasNode(node, q));
    }
    expect(db.selectValue("SELECT COUNT(*) FROM _sqlx_migrations")).toBe(migracoesDoApp().length);
  });

  it("massa sem a linha da versão é recusada", async () => {
    await expect(montarExemplo(sqlite3, "INSERT INTO cursos (nome) VALUES ('x');")).rejects.toThrow(/esquema: N/);
  });
});

describe("abrirArquivo", () => {
  it("o exportado volta igual, sem migrar de novo", async () => {
    const origem = await montarExemplo(sqlite3, MASSA);
    const registro = linhas(origem, "SELECT * FROM _sqlx_migrations ORDER BY version");
    const db = await abrirArquivo(sqlite3, exportar(sqlite3, origem));
    expect(linhas(db, "SELECT * FROM _sqlx_migrations ORDER BY version")).toEqual(registro);
    expect(resumir(db)).toEqual(resumir(origem));
  });

  it("banco de uma versão anterior recebe as migrações que faltam", async () => {
    const antigo = new sqlite3.oo1.DB(":memory:");
    await migrar(antigo, migracoesDoApp().slice(0, 9));
    const db = await abrirArquivo(sqlite3, exportar(sqlite3, antigo));
    expect(db.selectValue("SELECT MAX(version) FROM _sqlx_migrations")).toBe(migracoesDoApp().length);
  });

  it("recusa o que não é banco SQLite", async () => {
    const texto = new TextEncoder().encode("isto não é um banco ".repeat(20));
    await expect(abrirArquivo(sqlite3, texto)).rejects.toThrow("não é um banco SQLite");
    await expect(abrirArquivo(sqlite3, new Uint8Array(0))).rejects.toThrow("não é um banco SQLite");
  });

  it("recusa banco SQLite que não é deste aplicativo", async () => {
    const outro = new sqlite3.oo1.DB(":memory:");
    outro.exec("CREATE TABLE notas (id INTEGER PRIMARY KEY, texto TEXT); INSERT INTO notas (texto) VALUES ('a')");
    await expect(abrirArquivo(sqlite3, exportar(sqlite3, outro))).rejects.toThrow(/falta o registro de migrações/);
  });

  it("recusa banco cujo registro não bate com as migrações (checksum)", async () => {
    const db = await montarVazio(sqlite3);
    db.exec("UPDATE _sqlx_migrations SET checksum = x'00' WHERE version = 3");
    await expect(abrirArquivo(sqlite3, exportar(sqlite3, db))).rejects.toThrow(/não pode ser importado.*migração 3.*checksum/);
  });

  it("recusa banco sem as tabelas do aplicativo", async () => {
    const db = await montarVazio(sqlite3);
    db.exec("DROP TABLE alocacoes");
    await expect(abrirArquivo(sqlite3, exportar(sqlite3, db))).rejects.toThrow(/faltam as tabelas alocacoes/);
  });

  it("recusa banco corrompido", async () => {
    const bytes = exportar(sqlite3, await montarExemplo(sqlite3, MASSA));
    bytes.fill(0xab, 4096, bytes.length); // as páginas depois da primeira viram lixo
    await expect(abrirArquivo(sqlite3, bytes)).rejects.toThrow(/corrompido|não é um banco SQLite/);
  });
});

describe("compatível com o desktop", () => {
  it("navegador → desktop: o arquivo exportado abre no SQLite do Node e o sqlx não teria o que aplicar", async () => {
    const db = await montarExemplo(sqlite3, MASSA);
    const node = abrirNoNode(exportar(sqlite3, db), "exportado.db");
    try {
      expect(conferirComoSqlx(node)).toEqual([]);
      expect(linhasNode(node, "SELECT COUNT(*) AS n FROM professores")).toEqual([{ n: naMassa("professores") }]);
      expect(linhasNode(node, "PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
    } finally {
      node.close();
    }
  });

  it("desktop → navegador: um banco com o registro do sqlx entra sem migrar de novo", async () => {
    const desktop = criarBanco();
    registrarComoSqlx(desktop);
    const db = await abrirArquivo(sqlite3, bytesDoNode(desktop, "desktop.db"));
    expect(linhas(db, "SELECT version, execution_time FROM _sqlx_migrations ORDER BY version")).toEqual(
      migracoesDoApp().map((m) => ({ version: m.versao, execution_time: 1000 })),
    );
    expect(resumir(db).professores).toBe(naMassa("professores"));
  });

  it("desktop na versão da massa → navegador: aplica só as que faltam, e os dados passam por elas", async () => {
    // O banco como o desktop o deixaria na versão 9: migrações até lá, os
    // dados, e o registro do sqlx de cada uma.
    const desktop = new DatabaseSync(":memory:");
    desktop.exec("PRAGMA foreign_keys = ON");
    const versaoDaMassa = Number(/-- esquema: (\d+)/.exec(MASSA)?.[1]);
    for (const m of migracoesDoDesktop().filter((m) => m.versao <= versaoDaMassa)) desktop.exec(m.sql);
    desktop.exec(MASSA);
    registrarComoSqlx(desktop, versaoDaMassa);

    const db = await abrirArquivo(sqlite3, bytesDoNode(desktop, "desktop-v9.db"));
    const registro = linhas(db, "SELECT version, execution_time FROM _sqlx_migrations ORDER BY version");
    expect(registro.filter((l) => l.execution_time === 1000).map((l) => l.version)).toEqual(
      migracoesDoApp().filter((m) => m.versao <= versaoDaMassa).map((m) => m.versao),
    );
    expect(registro.map((l) => l.version)).toEqual(migracoesDoApp().map((m) => m.versao));
    const hoje = criarBanco();
    for (const t of TABELAS_DE_DADOS) {
      const q = `SELECT * FROM ${t} ORDER BY 1, 2`;
      expect(linhas(db, q), t).toEqual(linhasNode(hoje, q));
    }
  });
});
