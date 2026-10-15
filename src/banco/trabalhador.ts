/// <reference types="vite/client" />
import sqlite3InitModule, { type Database, type SAHPoolUtil, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { abrirArquivo, exportar, montarExemplo, montarVazio, resumir, type Resumo } from "./arquivo";
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
 *
 * Trocar o banco (página "Dados do navegador") também acontece aqui, e só
 * aqui: este worker tem a trava e os arquivos do VFS, e qualquer outra
 * conexão seria recusada. Depois da troca ele não atende mais nada; a página
 * recarrega, e o worker novo abre o banco novo.
 */

/** Com o que a página "Dados do navegador" substitui o banco. */
export type Substituto = { por: "arquivo"; bytes: Uint8Array } | { por: "exemplo" } | { por: "vazio" };

export type Pedido =
  | { id: number; tipo: "abrir" }
  | { id: number; tipo: "consultar"; dados: { sql: string; params: unknown[] } }
  | { id: number; tipo: "transacao"; dados: { instrucoes: { sql: string; params?: unknown[] }[] } }
  | { id: number; tipo: "exportar" }
  | { id: number; tipo: "conferir"; dados: { bytes: Uint8Array } }
  | { id: number; tipo: "substituir"; dados: Substituto };

export type Resposta = { id: number; ok: true; valor: unknown } | { id: number; ok: false; erro: string };

export type { Resumo };

/** O arquivo do banco dentro do VFS. */
export const ARQUIVO = "/distribuicao.db";

/** O nome da trava que dá o banco a uma aba só (`travarOBanco`). */
const TRAVA = "distribuicao.db";

/**
 * Quanto se espera pela trava. A recarga da página (a de toda troca de banco,
 * inclusive) cria um worker novo antes de o antigo terminar de morrer; sem
 * espera, o novo acharia a trava ainda presa e recusaria. Uma aba de fato
 * aberta ao lado nunca a solta, e é recusada depois desse tempo.
 */
const ESPERA_DA_TRAVA = 2000;

interface Aberto {
  sqlite3: Sqlite3Static;
  db: Database;
  persistente: boolean;
  /** O VFS, quando o banco está no armazenamento de origem; é por ele que se troca o arquivo. */
  pool: SAHPoolUtil | null;
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
 * solta sozinho quando a aba fecha ou recarrega. Devolve a função que a solta
 * antes disso (abertura que falhou).
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
function travarOBanco(): Promise<() => void> {
  const travas = (navigator as { locks?: LockManager }).locks;
  if (!travas) return Promise.resolve(() => {});
  return new Promise((pegou, recusou) => {
    travas
      // A promessa devolvida segura a trava até `soltar` ser chamada, o que em
      // geral não acontece: ela fica com este worker até ele terminar.
      .request(TRAVA, { signal: AbortSignal.timeout(ESPERA_DA_TRAVA) }, () => new Promise<void>((soltar) => pegou(soltar)))
      .catch(recusou);
  });
}

/** O motivo entre parênteses: a espera da trava vencida é a outra aba, dito em português. */
function motivoDaRecusa(e: unknown): string {
  if (e instanceof DOMException && e.name === "TimeoutError") return "o banco está em uso em outra aba";
  return e instanceof Error ? e.message : String(e);
}

async function abrirNoArmazenamento(sqlite3: Sqlite3Static): Promise<Aberto> {
  let soltar = () => {};
  let pool: SAHPoolUtil | null = null;
  let db: Database | null = null;
  try {
    try {
      soltar = await travarOBanco();
      pool = await sqlite3.installOpfsSAHPoolVfs({});
      db = new pool.OpfsSAHPoolDb(ARQUIVO);
    } catch (e) {
      // Com o armazenamento disponível, cair para a memória esconderia o
      // problema e faria o usuário trabalhar num banco que some. O caso comum
      // é o app aberto em outra aba: a trava (e o VFS) só aceitam uma por vez.
      throw new Error(
        "Não foi possível abrir o banco deste navegador. Se o aplicativo já está aberto em outra aba, " +
          `feche-a e recarregue esta página. (${motivoDaRecusa(e)})`,
      );
    }
    db.exec("PRAGMA foreign_keys = ON");
    await migrar(db, migracoesDoApp());
    return { sqlite3, db, persistente: true, pool };
  } catch (e) {
    // A aba que não abriu não pode ficar com o banco: solta os arquivos do VFS
    // e a trava, para outra aba (ou esta, recarregada) conseguir abrir.
    try {
      (db as Database | null)?.close();
      (pool as SAHPoolUtil | null)?.pauseVfs();
    } catch {
      /* o erro que importa é o primeiro */
    }
    soltar();
    throw e;
  }
}

async function abrir(): Promise<Aberto> {
  const sqlite3 = await sqlite3InitModule();
  if (await temArmazenamento()) return abrirNoArmazenamento(sqlite3);
  const db = new sqlite3.oo1.DB(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  await migrar(db, migracoesDoApp());
  return { sqlite3, db, persistente: false, pool: null };
}

const aberto = abrir();
// A falha de abertura é respondida a cada pedido; aqui só se evita o aviso de
// promessa rejeitada sem ninguém olhando.
aberto.catch(() => {});

/** Depois de uma troca, o banco aberto não é mais o do arquivo: nada mais é atendido. */
let trocado = false;

/**
 * Monta o banco novo à parte, já migrado, e só então fecha o atual e grava a
 * imagem do novo no lugar do arquivo, pelo próprio VFS. Uma recusa na
 * montagem (arquivo que não é banco, checksum que não bate) não toca no banco.
 *
 * A gravação é o ponto frágil: o `importDb` escreve por cima do arquivo e, se
 * a escrita sai curta (disco cheio, cota do site), desassocia o arquivo — o
 * banco anterior some junto. Por isso a imagem do anterior é guardada antes de
 * fechá-lo e, se a gravação falha, regravada e reaberta neste mesmo worker: o
 * app segue no banco de antes, sem recarga, como se a troca não tivesse sido
 * pedida (o histórico de desfazer ainda é desse banco). Se nem a regravação
 * der certo, não há banco a reabrir; aí sim o worker para e o aviso manda
 * importar uma cópia.
 *
 * Em memória só "vazio" faz sentido: a troca termina numa recarga, e a
 * recarga apaga o banco em memória — que é exatamente começar vazio.
 */
async function substituir(a: Aberto, s: Substituto): Promise<void> {
  if (!a.persistente && s.por !== "vazio")
    throw new Error("Este navegador não guarda os dados: o banco trocado sumiria na recarga que termina a troca.");
  let novo: Database | null = null;
  if (s.por === "arquivo") novo = await abrirArquivo(a.sqlite3, s.bytes);
  else if (s.por === "exemplo") {
    // Import dinâmico: os dados de exemplo só são baixados por quem os pede.
    const massa = (await import("../../testes/massa/engenharia_v9.sql?raw")).default;
    novo = await montarExemplo(a.sqlite3, massa);
  } else if (a.persistente) novo = await montarVazio(a.sqlite3);

  const imagem = novo ? exportar(a.sqlite3, novo) : null;
  novo?.close();
  const { pool } = a;
  if (!pool || !imagem) {
    trocado = true;
    a.db.close();
    return;
  }

  const anterior = exportar(a.sqlite3, a.db);
  a.db.close();
  try {
    await pool.importDb(ARQUIVO, imagem);
  } catch (falha) {
    try {
      await pool.importDb(ARQUIVO, anterior);
      a.db = new pool.OpfsSAHPoolDb(ARQUIVO);
      a.db.exec("PRAGMA foreign_keys = ON");
    } catch {
      trocado = true;
      throw new Error("A troca falhou e o banco anterior não pôde ser regravado. Importe uma cópia exportada.");
    }
    console.error("troca do banco:", falha);
    throw new Error("A troca falhou; o banco anterior foi mantido.");
  }
  trocado = true;
}

async function atender(pedido: Pedido): Promise<Resposta> {
  try {
    const a = await aberto;
    if (trocado) throw new Error("O banco deste navegador foi trocado: recarregue a página.");
    const { sqlite3, db, persistente } = a;
    switch (pedido.tipo) {
      case "abrir":
        return { id: pedido.id, ok: true, valor: { persistente } };
      case "consultar":
        return { id: pedido.id, ok: true, valor: consultar(sqlite3, db, pedido.dados.sql, pedido.dados.params) };
      case "transacao":
        return { id: pedido.id, ok: true, valor: transacao(sqlite3, db, pedido.dados.instrucoes) };
      case "exportar":
        return { id: pedido.id, ok: true, valor: exportar(sqlite3, db) };
      case "conferir": {
        const conferido = await abrirArquivo(sqlite3, pedido.dados.bytes);
        const resumo = resumir(conferido);
        conferido.close();
        return { id: pedido.id, ok: true, valor: resumo };
      }
      case "substituir":
        await substituir(a, pedido.dados);
        return { id: pedido.id, ok: true, valor: null };
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
