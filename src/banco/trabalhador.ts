import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { migracoesDoApp, migrar } from "./migracoes";
import { consultar, transacao } from "./sqlite";

/**
 * O worker do banco do navegador: uma conexão só, e um pedido de cada vez, na
 * ordem em que chegaram — a mesma garantia da conexão única que o `transacao`
 * do Rust adquire. Sem a fila, uma leitura podia cair no meio de uma
 * transação de outra tela.
 *
 * Fica num worker porque o VFS `opfs-sahpool` usa os acessos síncronos ao
 * armazenamento de origem, que só existem em worker. Ele foi escolhido por não
 * exigir os cabeçalhos COOP/COEP (o VFS `opfs` exige): o `dist/` serve em
 * qualquer servidor estático, e o servidor de dev não precisa de nada.
 *
 * Protocolo: pedido `{ id, tipo, dados }`, resposta `{ id, ok: true, valor }`
 * ou `{ id, ok: false, erro }`, com `erro` sendo a mensagem do SQLite como ele
 * a deu (é nela que `mensagemErro` reconhece "FOREIGN KEY constraint failed").
 */

export type Pedido =
  | { id: number; tipo: "abrir" }
  | { id: number; tipo: "consultar"; dados: { sql: string; params: unknown[] } }
  | { id: number; tipo: "transacao"; dados: { instrucoes: { sql: string; params?: unknown[] }[] } };

export type Resposta = { id: number; ok: true; valor: unknown } | { id: number; ok: false; erro: string };

/** O arquivo do banco dentro do VFS. */
export const ARQUIVO = "/distribuicao.db";

interface Aberto {
  sqlite3: Sqlite3Static;
  db: Database;
  persistente: boolean;
}

/**
 * Sem armazenamento de origem (janela anônima de alguns navegadores, navegador
 * antigo, endereço que não é seguro) o banco fica em memória e a tela avisa.
 * `getDirectory` é tentado de verdade porque há navegador que tem a API e a
 * recusa na janela anônima.
 */
async function temArmazenamento(): Promise<boolean> {
  const handle = (globalThis as { FileSystemFileHandle?: { prototype: object } }).FileSystemFileHandle;
  if (!handle || !("createSyncAccessHandle" in handle.prototype)) return false;
  try {
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

async function abrir(): Promise<Aberto> {
  const sqlite3 = await sqlite3InitModule();
  let db: Database;
  let persistente = false;
  if (await temArmazenamento()) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({});
      db = new pool.OpfsSAHPoolDb(ARQUIVO);
      persistente = true;
    } catch (e) {
      // Com o armazenamento disponível, cair para a memória esconderia o
      // problema e faria o usuário trabalhar num banco que some. O caso comum
      // é o app aberto em outra aba: o VFS só aceita uma por vez.
      throw new Error(
        "Não foi possível abrir o banco deste navegador. Se o aplicativo já está aberto em outra aba, " +
          `feche-a e recarregue esta página. (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  } else {
    db = new sqlite3.oo1.DB(":memory:");
  }
  db.exec("PRAGMA foreign_keys = ON");
  await migrar(db, migracoesDoApp());
  return { sqlite3, db, persistente };
}

const aberto = abrir();
// A falha de abertura é respondida a cada pedido; aqui só se evita o aviso de
// promessa rejeitada sem ninguém olhando.
aberto.catch(() => {});

async function atender(pedido: Pedido): Promise<Resposta> {
  try {
    const { sqlite3, db, persistente } = await aberto;
    switch (pedido.tipo) {
      case "abrir":
        return { id: pedido.id, ok: true, valor: { persistente } };
      case "consultar":
        return { id: pedido.id, ok: true, valor: consultar(sqlite3, db, pedido.dados.sql, pedido.dados.params) };
      case "transacao":
        return { id: pedido.id, ok: true, valor: transacao(sqlite3, db, pedido.dados.instrucoes) };
    }
  } catch (e) {
    return { id: pedido.id, ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

const escopo = self as unknown as {
  onmessage: (e: MessageEvent<Pedido>) => void;
  postMessage: (r: Resposta) => void;
};

let fila: Promise<void> = Promise.resolve();
escopo.onmessage = (e) => {
  // `atender` nunca rejeita: a fila não para por causa de um pedido que falhou.
  fila = fila.then(() => atender(e.data).then((r) => escopo.postMessage(r)));
};
