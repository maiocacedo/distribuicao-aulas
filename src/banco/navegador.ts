import type { Motor } from "../db";
import type { Pedido, Resposta } from "./trabalhador";

/**
 * O banco do navegador, do lado da página: manda cada pedido ao worker
 * (`trabalhador.ts`, onde o SQLite em WebAssembly roda) e devolve a resposta
 * como o Tauri devolveria. Este módulo só é carregado fora do Tauri, por
 * import dinâmico em `db.ts`: o desktop não baixa nem o worker nem o
 * WebAssembly.
 *
 * Os parâmetros passam por JSON antes de sair, como no IPC do Tauri: `NaN` vira
 * null, data vira texto, `undefined` numa lista vira null. Sem isso o worker
 * receberia, pela cópia estruturada, valores que o desktop nunca vê.
 */

const NOME = "distribuicao.db";

const trabalhador = new Worker(new URL("./trabalhador.ts", import.meta.url), { type: "module" });

const pendentes = new Map<number, { resolver: (v: unknown) => void; rejeitar: (e: Error) => void }>();
let ultimoId = 0;
let quebrado: Error | null = null;

trabalhador.onmessage = (e: MessageEvent<Resposta>) => {
  const r = e.data;
  const p = pendentes.get(r.id);
  if (!p) return;
  pendentes.delete(r.id);
  if (r.ok) p.resolver(r.valor);
  else p.rejeitar(new Error(r.erro));
};

// O worker que nem chega a carregar (o script ou o WebAssembly não vieram)
// não responde mais nada: tudo o que espera e tudo o que vier falha com o motivo.
trabalhador.onerror = (e) => {
  e.preventDefault();
  quebrado = new Error(`O banco do navegador não carregou: ${e.message || "erro no worker"}`);
  pendentes.forEach((p) => p.rejeitar(quebrado!));
  pendentes.clear();
};

type SemId<P> = P extends Pedido ? Omit<P, "id"> : never;

function pedir<T>(pedido: SemId<Pedido>): Promise<T> {
  if (quebrado) return Promise.reject(quebrado);
  const id = ++ultimoId;
  return new Promise<T>((resolver, rejeitar) => {
    pendentes.set(id, { resolver: resolver as (v: unknown) => void, rejeitar });
    trabalhador.postMessage({ ...pedido, id });
  });
}

const comoJson = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// Sem isso o navegador pode apagar os dados do site quando falta espaço. Se ele
// negar, segue igual: não há o que o usuário possa fazer na hora.
navigator.storage?.persist?.().catch(() => {});

const abertura = pedir<{ persistente: boolean }>({ tipo: "abrir" });
// Quem precisa da abertura (`emMemoria`) recebe a rejeição; esta linha só evita
// o aviso global de promessa rejeitada antes de alguém perguntar.
abertura.catch(() => {});

export const motorNavegador: Motor = {
  banco: async () => NOME,
  consultar: <T,>(sql: string, params: unknown[]) =>
    pedir<T[]>({ tipo: "consultar", dados: { sql, params: comoJson(params) } }),
  transacao: (instrucoes) => pedir({ tipo: "transacao", dados: { instrucoes: comoJson(instrucoes) } }),
  emMemoria: () => abertura.then((a) => !a.persistente),
};
