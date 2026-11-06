import { describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../../testes/suporte/banco";
import { carregarProblema } from "../carregar";
import { conferir } from "../conferir";
import { custoTotal } from "../custo";
import { PESOS_PADRAO } from "../tipos";
import { resolver, resolverEmPassos } from "./solver";

const problemaDaMassa = () => carregarProblema(1, lerDe(criarBanco()));

describe("solver v2 — Fase 2 com Top-K e LAHC", () => {
  it("a mesma semente dá a mesma grade", async () => {
    const p = await problemaDaMassa();
    const a = resolver(p, { semente: 3, rodadasDeMelhoria: 400 });
    const b = resolver(p, { semente: 3, rodadasDeMelhoria: 400 });
    expect(b.alocacoes).toEqual(a.alocacoes);
    expect(b.custo).toBe(a.custo);
    expect(b.faltantes.length).toBe(a.faltantes.length);
  });

  it("a melhoria nunca piora o custo da construção, e a grade segue válida", async () => {
    const p = await problemaDaMassa();
    const sem = resolver(p, { semente: 2, rodadasDeMelhoria: 0 });
    const com = resolver(p, { semente: 2, rodadasDeMelhoria: 2000 });
    expect(com.custo).toBeLessThanOrEqual(sem.custo);
    expect(conferir(p, com.alocacoes)).toEqual([]);
    // O custo informado é o da grade devolvida — a melhor, não a última do LAHC.
    expect(com.custo).toBe(custoTotal(p, com.alocacoes, PESOS_PADRAO));
  });

  it("baixa o custo da massa real (a Fase 2 de uma fatia só ficava em 870)", async () => {
    const p = await problemaDaMassa();
    const r = resolver(p, { semente: 2, rodadasDeMelhoria: 2000 });
    expect(r.custo).toBeLessThan(800);
  });

  it("parar no meio devolve a melhor grade vista, não a corrente do LAHC", async () => {
    const p = await problemaDaMassa();
    const it = resolverEmPassos(p, { semente: 5, rodadasDeMelhoria: 2000 });
    let passo = it.next();
    let ultimo = Infinity;
    let cedidos = 0;
    while (!passo.done && cedidos < 4) {
      if (passo.value.fase === "melhoria") {
        // O progresso informa o melhor custo visto: nunca sobe.
        expect(passo.value.melhorCusto).toBeLessThanOrEqual(ultimo);
        ultimo = passo.value.melhorCusto;
        cedidos++;
      }
      passo = it.next(cedidos === 4 ? "parar" : undefined);
    }
    expect(passo.done).toBe(true);
    const r = passo.value as ReturnType<typeof resolver>;
    expect(r.interrompido).toBe(true);
    expect(r.custo).toBe(ultimo);
    expect(r.custo).toBe(custoTotal(p, r.alocacoes, PESOS_PADRAO));
    expect(conferir(p, r.alocacoes)).toEqual([]);
  });

  it("a lista de faltantes corresponde à grade devolvida", async () => {
    const p = await problemaDaMassa();
    const r = resolver(p, { semente: 1, rodadasDeMelhoria: 800 });
    expect(r.completo).toBe(r.faltantes.length === 0);
    const postas = new Set(r.alocacoes.map((a) => `${a.disciplinaId}:${a.professorId}`));
    for (const f of r.faltantes) expect(postas.has(`${f.fatia.disciplinaId}:${f.fatia.professorId}`)).toBe(false);
  });
});
