import type { Aula, Fatia } from "./usarGrade";

/** O que se arrasta: uma pendência, ou uma aula da malha (com a fatia dela). */
export type Carga = { tipo: "fatia"; fatia: Fatia } | { tipo: "aula"; aula: Aula; fatia: Fatia };

/** Onde se solta: um horário vazio, ou o painel de pendências (remove a aula). */
export type Alvo = { tipo: "celula"; dia: number; hora: number } | { tipo: "pendencias" };
