import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { Motor } from "../db";

/**
 * O banco do desktop. Leituras vão pela pool do plugin; escritas vão pelo
 * comando `transacao` do lado Rust, que envolve tudo numa transação: salvar
 * uma disciplina escreve em várias tabelas, e falhar no meio deixaria o banco
 * num estado que nenhuma tela sabe representar.
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

export const motorTauri: Motor = {
  banco,
  async consultar<T>(sql: string, params: unknown[]) {
    const d = await db();
    return d.select<T[]>(sql, params);
  },
  async transacao(instrucoes) {
    return invoke("transacao", { banco: await banco(), instrucoes });
  },
  // O arquivo do desktop sempre fica no disco.
  emMemoria: async () => false,
};
