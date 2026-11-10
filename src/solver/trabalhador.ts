import { resolver } from "./solver";
import type { Problema, Resultado } from "./tipos";
import { resolverEmPassos, type Progresso } from "./v2/solver";

/**
 * O worker da geração de grade: tira a busca do fio da interface para a tela
 * continuar respondendo enquanto o solver roda. No v2, cede a cada passo de
 * progresso para que um pedido de parada possa interromper a melhoria e
 * devolver a melhor grade vista até ali.
 */

export type PedidoGerador =
  | { tipo: "gerar"; id: number; versao: "v1" | "v2"; problema: Problema; semente?: number }
  | { tipo: "parar"; id: number };

export type RespostaGerador =
  | { tipo: "progresso"; id: number; progresso: Progresso }
  | { tipo: "fim"; id: number; resultado: Resultado }
  | { tipo: "erro"; id: number; erro: string };

const escopo = self as unknown as {
  onmessage: (e: MessageEvent<PedidoGerador>) => void;
  postMessage: (r: RespostaGerador) => void;
};

const ativos = new Set<number>();
const parados = new Set<number>();

async function gerar(pedido: Extract<PedidoGerador, { tipo: "gerar" }>): Promise<void> {
  const opcoes = pedido.semente != null ? { semente: pedido.semente } : {};
  try {
    if (pedido.versao === "v1") {
      const resultado = resolver(pedido.problema, opcoes);
      escopo.postMessage({ tipo: "fim", id: pedido.id, resultado });
      return;
    }
    const it = resolverEmPassos(pedido.problema, opcoes);
    let passo = it.next();
    while (!passo.done) {
      escopo.postMessage({ tipo: "progresso", id: pedido.id, progresso: passo.value });
      // Devolve o controle ao laço de eventos para que uma mensagem "parar"
      // chegue ao `onmessage` antes de avançar para o próximo trecho da busca.
      await new Promise<void>((r) => setTimeout(r, 0));
      passo = it.next(parados.has(pedido.id) ? "parar" : undefined);
    }
    escopo.postMessage({ tipo: "fim", id: pedido.id, resultado: passo.value });
  } catch (e) {
    escopo.postMessage({ tipo: "erro", id: pedido.id, erro: String(e) });
  } finally {
    ativos.delete(pedido.id);
    parados.delete(pedido.id);
  }
}

let fila: Promise<void> = Promise.resolve();
escopo.onmessage = (e) => {
  const pedido = e.data;
  // O pedido de parada não entra na fila: precisa marcar a geração em andamento
  // durante a pausa entre um passo e outro da própria execução na fila. Pedidos
  // para ids já encerrados ou desconhecidos são ignorados para não acumular.
  if (pedido.tipo === "parar") {
    if (ativos.has(pedido.id)) parados.add(pedido.id);
    return;
  }
  ativos.add(pedido.id);
  fila = fila
    .then(() => gerar(pedido))
    .catch((erro) => console.error("worker do gerador: pedido sem resposta", erro));
};
