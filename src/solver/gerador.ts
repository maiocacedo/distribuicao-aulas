import type { Problema, Resultado } from "./tipos";
import type { PedidoGerador, RespostaGerador } from "./trabalhador";
import type { Progresso } from "./v2/solver";

/**
 * Lado da página do gerador de grade: mantém um único Web Worker criado sob
 * demanda e encaminha o andamento e o pedido de parada de cada geração pelo
 * identificador dela.
 */

export type VersaoGerador = "v1" | "v2";

export interface Geracao {
  resultado: Promise<Resultado>;
  parar(): void;
}

interface Pendente {
  aoProgredir: (p: Progresso) => void;
  resolver: (r: Resultado) => void;
  rejeitar: (e: Error) => void;
}

let trabalhador: Worker | null = null;
let carregou = false;
let ultimoId = 0;
const pendentes = new Map<number, Pendente>();

function obterTrabalhador(): Worker {
  if (trabalhador) return trabalhador;
  carregou = false;
  const w = new Worker(new URL("./trabalhador.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<RespostaGerador>) => {
    carregou = true;
    const r = e.data;
    const p = pendentes.get(r.id);
    if (!p) return;
    if (r.tipo === "progresso") {
      p.aoProgredir(r.progresso);
      return;
    }
    pendentes.delete(r.id);
    if (r.tipo === "fim") p.resolver(r.resultado);
    else p.rejeitar(new Error(r.erro));
  };
  // Erro antes da primeira resposta significa que o worker nem chegou a
  // carregar: rejeita quem espera e limpa a referência para a próxima tentativa
  // criar outro.
  w.onerror = (e) => {
    if (carregou) {
      console.error("worker do gerador:", e.message);
      return;
    }
    e.preventDefault();
    trabalhador = null;
    const erro = new Error(`O gerador não carregou: ${e.message || "erro no worker"}`);
    pendentes.forEach((p) => p.rejeitar(erro));
    pendentes.clear();
  };
  trabalhador = w;
  return w;
}

export function gerarGrade(
  problema: Problema,
  versao: VersaoGerador,
  aoProgredir: (p: Progresso) => void,
): Geracao {
  const id = ++ultimoId;
  const w = obterTrabalhador();
  const resultado = new Promise<Resultado>((resolver, rejeitar) => {
    pendentes.set(id, { aoProgredir, resolver, rejeitar });
    const pedido: PedidoGerador = { tipo: "gerar", id, versao, problema };
    w.postMessage(pedido);
  });
  let parado = false;
  return {
    resultado,
    parar() {
      if (parado || !pendentes.has(id) || !trabalhador) return;
      parado = true;
      const pedido: PedidoGerador = { tipo: "parar", id };
      trabalhador.postMessage(pedido);
    },
  };
}
