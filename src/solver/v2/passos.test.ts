import { describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../../testes/suporte/banco";
import { carregarProblema } from "../carregar";
import { conferir } from "../conferir";
import { custoTotal } from "../custo";
import { PESOS_PADRAO, type Resultado } from "../tipos";
import { resolver, resolverEmPassos, type Progresso } from "./solver";

const problemaDaMassa = () => carregarProblema(1, lerDe(criarBanco()));

function esgotar(it: Generator<Progresso, Resultado, "parar" | undefined>) {
  const vistos: Progresso[] = [];
  for (;;) {
    const passo = it.next();
    if (passo.done) return { vistos, resultado: passo.value };
    vistos.push(passo.value);
  }
}

describe("solver v2 — execução em passos", () => {
  it("esgotar o gerador dá o mesmo resultado que resolver", async () => {
    const p = await problemaDaMassa();
    const opcoes = { semente: 7, rodadasDeMelhoria: 300 };
    const direto = resolver(p, opcoes);
    const { resultado } = esgotar(resolverEmPassos(p, opcoes));
    expect(resultado.alocacoes).toEqual(direto.alocacoes);
    expect(resultado.custo).toBe(direto.custo);
    expect(resultado.passos).toBe(direto.passos);
    expect(resultado.interrompido).toBeUndefined();
  });

  it("começa pela construção e cede a cada 100 rodadas de melhoria", async () => {
    const p = await problemaDaMassa();
    const { vistos } = esgotar(resolverEmPassos(p, { semente: 7, rodadasDeMelhoria: 300 }));
    expect(vistos[0].fase).toBe("construcao");
    expect(vistos[0].rodada).toBe(0);
    const melhoria = vistos.slice(1);
    expect(melhoria.every((v) => v.fase === "melhoria" && v.rodadas === 300)).toBe(true);
    expect(melhoria.map((v) => v.rodada)).toEqual([100, 200, 300]);
  });

  it("recebendo 'parar' devolve a melhor grade vista, válida e interrompida", async () => {
    const p = await problemaDaMassa();
    const it = resolverEmPassos(p, { semente: 7, rodadasDeMelhoria: 300 });
    let passo = it.next();
    while (!passo.done && passo.value.fase !== "melhoria") passo = it.next();
    expect(passo.done).toBe(false);
    const fim = it.next("parar");
    expect(fim.done).toBe(true);
    const r = fim.value as Resultado;
    expect(r.interrompido).toBe(true);
    expect(conferir(p, r.alocacoes)).toEqual([]);
    expect(r.custo).toBe(custoTotal(p, r.alocacoes, PESOS_PADRAO));
  });
});
