import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

/**
 * Leituras vão pela pool do plugin; escritas vão pelo comando `transacao` do
 * lado Rust, que envolve tudo numa transação: salvar uma disciplina escreve em
 * várias tabelas, e falhar no meio deixaria o banco num estado que nenhuma
 * tela sabe representar.
 *
 * O nome do banco vem do Rust (comando `banco`): em debug ele pode apontar
 * para outro arquivo, e as migrações são registradas por esse mesmo nome.
 */
let nome: Promise<string> | null = null;
let conexao: Promise<Database> | null = null;

function banco(): Promise<string> {
  if (!nome) nome = invoke<string>("banco");
  return nome;
}

function db(): Promise<Database> {
  if (!conexao) conexao = banco().then((b) => Database.load(b));
  return conexao;
}

export async function consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await db();
  return d.select<T[]>(sql, params);
}

export interface Instrucao {
  sql: string;
  params?: unknown[];
}

export interface ResultadoEscrita {
  rowsAffected: number;
  lastInsertId: number;
}

/** Tudo ou nada: uma falha no meio desfaz as instruções anteriores. */
export async function transacao(instrucoes: Instrucao[]): Promise<ResultadoEscrita> {
  return invoke<ResultadoEscrita>("transacao", { banco: await banco(), instrucoes });
}

export function executar(sql: string, params: unknown[] = []): Promise<ResultadoEscrita> {
  return transacao([{ sql, params }]);
}

/**
 * Reserva o próximo id de uma tabela antes de abrir a transação, para que as
 * instruções seguintes possam referenciá-lo. `last_insert_rowid()` não serve:
 * ele muda a cada INSERT seguinte dentro da mesma transação.
 *
 * Serve porque o aplicativo é de um usuário só — não há outra escrita
 * concorrente para disputar o id.
 */
export async function proximoId(tabela: string): Promise<number> {
  const [linha] = await consultar<{ proximo: number }>(
    `SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM ${tabela}`,
  );
  return linha.proximo;
}

/** Lê uma chave de `configuracao`, ou `undefined` se não existir. */
export async function config(chave: string): Promise<string | undefined> {
  const linhas = await consultar<{ valor: string }>(
    "SELECT valor FROM configuracao WHERE chave = ?",
    [chave],
  );
  return linhas[0]?.valor;
}
