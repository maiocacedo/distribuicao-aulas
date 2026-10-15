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

/** O nome da trava que dá o banco a uma aba só (`travarOBanco`). */
const TRAVA = "distribuicao.db";

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

/**
 * Uma aba por vez no banco, garantido por uma trava exclusiva (Web Locks)
 * tomada ANTES de instalar o VFS e mantida pela vida do worker: o navegador a
 * solta sozinho quando a aba fecha ou recarrega.
 *
 * O VFS sozinho não basta. Ele recusa a segunda aba quando os arquivos do pool
 * já existem (cada um só aceita um acesso síncrono), mas na primeira abertura,
 * com o pool vazio, as duas abas o listam vazio, cada uma cria os seus
 * arquivos, e `/distribuicao.db` passa a existir duas vezes: o que uma aba
 * grava fica num arquivo que a próxima abertura talvez nunca veja.
 *
 * O banco em memória não pede a trava: ali nada é compartilhado, cada aba tem
 * o seu, e o aviso de memória já diz que nada fica.
 *
 * Sem a API de travas (navegador antigo) segue sem ela: é a proteção do VFS de
 * antes, que só falha na primeira abertura simultânea.
 */
function travarOBanco(): Promise<void> {
  const travas = (navigator as { locks?: LockManager }).locks;
  if (!travas) return Promise.resolve();
  return new Promise((pegou, recusou) => {
    travas
      .request(TRAVA, { ifAvailable: true }, (trava) => {
        if (!trava) {
          recusou(new Error("o banco já está em uso por outra aba"));
          return;
        }
        pegou();
        // Nunca resolve: a trava fica com este worker até ele terminar.
        return new Promise<never>(() => {});
      })
      .catch(recusou);
  });
}

async function abrir(): Promise<Aberto> {
  const sqlite3 = await sqlite3InitModule();
  let db: Database;
  let persistente = false;
  if (await temArmazenamento()) {
    try {
      await travarOBanco();
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

/**
 * Uma resposta que não se deixa copiar para a página (`postMessage` lança)
 * vira resposta de erro: quem pediu não fica esperando para sempre.
 */
function responder(r: Resposta) {
  try {
    escopo.postMessage(r);
  } catch (e) {
    escopo.postMessage({
      id: r.id,
      ok: false,
      erro: `a resposta do banco não pôde ser enviada: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

let fila: Promise<void> = Promise.resolve();
escopo.onmessage = (e) => {
  // `atender` nunca rejeita, e o `catch` cobre o resto: um elo rejeitado
  // pararia a fila, porque o `then` seguinte não roda sobre ele.
  fila = fila
    .then(() => atender(e.data))
    .then(responder)
    .catch((erro) => console.error("worker do banco: pedido sem resposta", erro));
};
