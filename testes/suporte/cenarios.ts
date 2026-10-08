import type { Problema } from "../../src/solver/tipos";

/** O mesmo gerador congruencial do solver: cenários reproduzíveis por semente. */
export function lcg(semente: number): () => number {
  let s = semente >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export function comSalas(p: Problema, n: number): Problema {
  return { ...p, salas: p.salas.slice(0, n) };
}

/** Cada professor perde um dia inteiro, de segunda a sexta, sorteado pela semente. */
export function indisponivelUmDia(p: Problema, semente: number): Problema {
  const rnd = lcg(semente);
  const indisponiveis = [...p.indisponiveis];
  for (const prof of p.professores) {
    const dia = Math.floor(rnd() * 5);
    for (const h of p.horarios) indisponiveis.push(`${prof.id}:${dia}:${h.indice}`);
  }
  return { ...p, indisponiveis };
}

export interface Cenario {
  nome: string;
  montar: (p: Problema) => Problema;
}

export const CENARIOS: Cenario[] = [
  { nome: "massa real", montar: (p) => p },
  { nome: "6 salas + 1 dia indisponível", montar: (p) => indisponivelUmDia(comSalas(p, 6), 77) },
  { nome: "3 salas + 1 dia indisponível", montar: (p) => indisponivelUmDia(comSalas(p, 3), 77) },
];
