import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { Motor } from "../db";
import type { Resumo } from "./trabalhador";

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

/**
 * O banco do desktop como arquivo (Geral › Dados). Exportar grava uma cópia na
 * pasta Downloads e devolve o caminho. Importar é em duas metades: `conferir`
 * grava o arquivo ao lado do banco e diz o que ele tem, sem tocar no atual;
 * `aplicar` põe o conferido no lugar, guarda o atual como
 * `distribuicao.db.anterior` e reinicia o app.
 */
export const arquivoDoDesktop = {
  exportar: (nome: string) => invoke<string>("exportar_banco", { nome }),
  // O corpo do invoke vai em bytes, sem passar por JSON.
  conferir: (bytes: Uint8Array) => invoke<Resumo>("conferir_importacao", bytes),
  aplicar: () => invoke<void>("aplicar_importacao"),
};
