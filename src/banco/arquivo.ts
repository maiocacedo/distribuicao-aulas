import type { Database, Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { migracoesDoApp, migrar } from "./migracoes";

/**
 * O banco do navegador como arquivo: o que a página "Dados do navegador" põe
 * no lugar do banco (um arquivo importado, o exemplo, um banco vazio) e o que
 * ela baixa. Tudo é montado e conferido num banco em memória, à parte; o
 * banco de verdade só é trocado (em `trabalhador.ts`) quando o novo está
 * pronto, já migrado. Uma recusa na montagem não toca no que o usuário tem; a
 * falha na gravação do novo é tratada lá (o anterior é regravado).
 *
 * O arquivo exportado é o mesmo formato que o desktop grava, com o mesmo
 * `_sqlx_migrations`: copiado para a pasta do aplicativo instalado, abre lá.
 */

/** O que um banco tem, para a confirmação dizer o que vai entrar. */
export interface Resumo {
  cursos: number;
  professores: number;
  disciplinas: number;
}

/** Tabelas que todo banco deste aplicativo tem depois de migrado. */
const TABELAS = ["cursos", "periodos", "disciplinas", "professores", "salas", "alocacoes", "configuracao"];

const CABECALHO = "SQLite format 3\0";

/** A imagem do banco, como o arquivo `.db` que o SQLite gravaria. */
export function exportar(sqlite3: Sqlite3Static, db: Database): Uint8Array {
  return sqlite3.capi.sqlite3_js_db_export(db);
}

export function resumir(db: Database): Resumo {
  const contar = (tabela: string) => Number(db.selectValue(`SELECT COUNT(*) FROM ${tabela}`));
  return { cursos: contar("cursos"), professores: contar("professores"), disciplinas: contar("disciplinas") };
}

function novo(sqlite3: Sqlite3Static): Database {
  const db = new sqlite3.oo1.DB(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

/** Um banco recém-criado: só as migrações, como na primeira abertura. */
export async function montarVazio(sqlite3: Sqlite3Static): Promise<Database> {
  const db = novo(sqlite3);
  try {
    await migrar(db, migracoesDoApp());
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

/**
 * O exemplo, montado como `testes/suporte/banco.ts` monta a massa dos testes:
 * as migrações até a versão em que a massa foi gravada (a linha
 * `-- esquema: N` dela), a massa numa transação com a chave estrangeira
 * ligada, e as migrações restantes — que levam os dados da massa ao esquema
 * de hoje, como fariam com o banco de um usuário.
 */
export async function montarExemplo(sqlite3: Sqlite3Static, massa: string): Promise<Database> {
  const versao = Number(/-- esquema: (\d+)/.exec(massa)?.[1]);
  if (!versao) throw new Error("os dados de exemplo não dizem a versão do esquema ('-- esquema: N')");
  const todas = migracoesDoApp();
  const db = novo(sqlite3);
  try {
    await migrar(db, todas.filter((m) => m.versao <= versao));
    db.exec("BEGIN");
    try {
      db.exec(massa);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    await migrar(db, todas);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

/**
 * Abre um arquivo escolhido pelo usuário num banco em memória e o confere:
 * tem de ser um banco SQLite íntegro, ter o registro de migrações do sqlx e,
 * depois das migrações que faltarem, as tabelas do aplicativo. As recusas do
 * registro (migração pela metade, versão desconhecida, checksum diferente) são
 * as de `migrar`, as mesmas do desktop.
 */
export async function abrirArquivo(sqlite3: Sqlite3Static, bytes: Uint8Array): Promise<Database> {
  const naoEBanco = () => new Error("O arquivo não é um banco deste aplicativo: não é um banco SQLite.");
  if (bytes.length < 100 || new TextDecoder().decode(bytes.subarray(0, 16)) !== CABECALHO) throw naoEBanco();

  // Os bytes 18 e 19 dizem se o banco está em WAL; um banco em memória não
  // abre em WAL. 1 é o modo de diário comum, o mesmo que o VFS grava ao
  // importar.
  const copia = bytes.slice();
  copia[18] = 1;
  copia[19] = 1;

  const db = new sqlite3.oo1.DB(":memory:");
  try {
    const ponteiro = sqlite3.wasm.allocFromTypedArray(copia);
    const flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
    db.checkRc(sqlite3.capi.sqlite3_deserialize(db, "main", ponteiro, copia.length, copia.length, flags));
    let integro: unknown;
    try {
      integro = db.selectValue("PRAGMA quick_check");
    } catch {
      throw naoEBanco();
    }
    if (integro !== "ok") throw new Error("O arquivo é um banco SQLite, mas está corrompido.");

    const temRegistro = db.selectValue("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'");
    if (temRegistro === undefined)
      throw new Error(
        "O arquivo é um banco SQLite, mas não é um banco deste aplicativo: falta o registro de migrações.",
      );

    db.exec("PRAGMA foreign_keys = ON");
    try {
      await migrar(db, migracoesDoApp());
    } catch (e) {
      throw new Error(`Este banco não pode ser importado. ${e instanceof Error ? e.message : String(e)}`);
    }

    const faltam = TABELAS.filter(
      (t) => db.selectValue("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [t]) === undefined,
    );
    if (faltam.length)
      throw new Error(
        `O arquivo é um banco SQLite, mas não é um banco deste aplicativo: faltam as tabelas ${faltam.join(", ")}.`,
      );
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
