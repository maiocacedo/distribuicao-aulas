import { motorTauri } from "./banco/tauri";
import type { Substituto } from "./banco/trabalhador";

/**
 * A fronteira com o banco. Por baixo há dois motores com a mesma semântica: o
 * do desktop (o plugin SQL do Tauri e o comando `transacao` do Rust, em
 * `banco/tauri.ts`) e o do navegador (SQLite em WebAssembly num worker, em
 * `banco/navegador.ts`). Quem usa o banco não sabe qual está rodando.
 *
 * A escolha é em tempo de execução: a mesma compilação serve ao Tauri e a um
 * navegador comum. O motor do navegador entra por import dinâmico, e o desktop
 * nunca baixa o WebAssembly.
 */
export interface Motor {
  /** O nome do banco: a URL do sqlx no desktop, o arquivo no armazenamento do navegador. */
  banco(): Promise<string>;
  consultar<T>(sql: string, params: unknown[]): Promise<T[]>;
  transacao(instrucoes: Instrucao[]): Promise<ResultadoEscrita>;
  /** true quando nada do que se grava sobrevive a fechar a página. */
  emMemoria(): Promise<boolean>;
}

let doNavegador: Promise<typeof import("./banco/navegador")> | null = null;

function moduloDoNavegador() {
  if (!doNavegador) doNavegador = import("./banco/navegador");
  return doNavegador;
}

function navegador(): Promise<Motor> {
  return moduloDoNavegador().then((m) => m.motorNavegador);
}

const viaNavegador: Motor = {
  banco: () => navegador().then((m) => m.banco()),
  consultar: <T,>(sql: string, params: unknown[]) => navegador().then((m) => m.consultar<T>(sql, params)),
  transacao: (instrucoes) => navegador().then((m) => m.transacao(instrucoes)),
  emMemoria: () => navegador().then((m) => m.emMemoria()),
};

/** O Tauri injeta `__TAURI_INTERNALS__` antes de qualquer script da página. */
export function noNavegador(): boolean {
  return !("__TAURI_INTERNALS__" in globalThis);
}

function motor(): Motor {
  return noNavegador() ? viaNavegador : motorTauri;
}

export type { Resumo, Substituto } from "./banco/trabalhador";

/**
 * O banco do navegador como arquivo (página "Dados do navegador"). Só existe
 * fora do Tauri: no desktop o banco é um arquivo no disco, e quem o copia é o
 * usuário.
 */
export const arquivoDoBanco = {
  exportar: () => moduloDoNavegador().then((m) => m.arquivoDoBanco.exportar()),
  conferir: (bytes: Uint8Array) => moduloDoNavegador().then((m) => m.arquivoDoBanco.conferir(bytes)),
  substituir: (s: Substituto) => moduloDoNavegador().then((m) => m.arquivoDoBanco.substituir(s)),
};

export function banco(): Promise<string> {
  return motor().banco();
}

/** Se o banco vive só na memória da página (navegador sem armazenamento de origem). */
export function bancoEmMemoria(): Promise<boolean> {
  return motor().emMemoria();
}

export function consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return motor().consultar<T>(sql, params);
}

export interface Instrucao {
  sql: string;
  params?: unknown[];
}

export interface ResultadoEscrita {
  rowsAffected: number;
  lastInsertId: number;
}

/**
 * De onde vem uma escrita: a grade tem desfazer; cadastro invalida o histórico.
 *
 * `"grade"` é só do histórico (`historico.executarNaGrade` e o desfazer). Uma
 * escrita de grade feita direto por `transacao` com essa origem não zera a pilha
 * nem entra nela, e o desfazer seguinte a reverteria sem aviso. As telas usam
 * `historico.executarNaGrade`.
 */
export type Origem = "grade" | "cadastro";

const ouvintes = new Set<(origem: Origem) => void>();

/** Avisa a cada escrita concluída, venha de qual motor vier. Devolve a função que cancela a assinatura. */
export function aoEscrever(ouvinte: (origem: Origem) => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Tudo ou nada: uma falha no meio desfaz as instruções anteriores. */
export async function transacao(
  instrucoes: Instrucao[],
  opcoes: { origem?: Origem } = {},
): Promise<ResultadoEscrita> {
  const resultado = await motor().transacao(instrucoes);
  // Cada ouvinte é protegido: a gravação já aconteceu, e um ouvinte que lança não
  // pode fazer quem gravou achar que falhou (nem impedir que os seguintes saibam).
  ouvintes.forEach((o) => {
    try {
      o(opcoes.origem ?? "cadastro");
    } catch (e) {
      console.error("ouvinte de escrita falhou", e);
    }
  });
  return resultado;
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
