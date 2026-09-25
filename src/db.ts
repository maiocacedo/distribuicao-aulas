import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

const BANCO = "sqlite:distribuicao.db";

/**
 * Leituras vão pela pool do plugin; escritas vão pelo comando `transacao` do
 * lado Rust. A separação não é estética:
 *
 * `PRAGMA foreign_keys` vale por conexão, e o plugin mantém uma pool de várias.
 * Ligá-lo daqui acertaria uma conexão e deixaria as outras sem verificação
 * nenhuma — a integridade referencial ficaria valendo ou não conforme a sorte
 * de qual conexão atendesse a chamada. No comando Rust a mesma conexão é
 * adquirida, configurada e usada, e ainda envolve tudo numa transação.
 */
let conexao: Promise<Database> | null = null;

function db(): Promise<Database> {
  if (!conexao) conexao = Database.load(BANCO);
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
export function transacao(instrucoes: Instrucao[]): Promise<ResultadoEscrita> {
  return invoke<ResultadoEscrita>("transacao", { banco: BANCO, instrucoes });
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
