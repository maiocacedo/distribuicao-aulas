import { describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../../testes/suporte/banco";
import { carregarProblema } from "../carregar";
import { custoTotal } from "../custo";
import { resolver } from "../solver";
import { PESOS_PADRAO, type Alocacao } from "../tipos";
import { CustoIncremental } from "./custoIncremental";

describe("CustoIncremental", () => {
  it("acompanha custoTotal em 2000 remoções e adições sorteadas", async () => {
    const p = await carregarProblema(1, lerDe(criarBanco()));
    const grade = resolver(p, { rodadasDeMelhoria: 0 }).alocacoes;
    let s = 99;
    const sorteio = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const dentro: Alocacao[] = [...grade];
    const fora: Alocacao[] = [];
    const c = new CustoIncremental(p, PESOS_PADRAO, dentro);
    expect(c.total()).toBe(custoTotal(p, dentro, PESOS_PADRAO));
    for (let i = 0; i < 2000; i++) {
      const tirar = fora.length === 0 || (dentro.length > 0 && sorteio() < 0.5);
      const [de, para] = tirar ? [dentro, fora] : [fora, dentro];
      const k = Math.floor(sorteio() * de.length);
      const [a] = de.splice(k, 1);
      // Hora e dia mexidos para cair em chaves diferentes das originais.
      const movida = tirar ? a : { ...a, dia: Math.floor(sorteio() * 5), hora: a.hora };
      para.push(movida);
      if (tirar) c.remover([a]);
      else c.adicionar([movida]);
      expect(c.total()).toBe(custoTotal(p, dentro, PESOS_PADRAO));
    }
  });
});
