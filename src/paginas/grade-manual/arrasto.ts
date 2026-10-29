import { mesmaAula } from "./acoes";
import { idAula, idFatia, type Aula, type Fatia } from "./usarGrade";

/** O que se arrasta: uma pendência, ou uma aula da malha (com a fatia dela). */
export type Carga = { tipo: "fatia"; fatia: Fatia } | { tipo: "aula"; aula: Aula; fatia: Fatia };

/** Onde se solta: um horário vazio, ou o painel de pendências (remove a aula). */
export type Alvo = { tipo: "celula"; dia: number; hora: number } | { tipo: "pendencias" };

/**
 * Se o que a origem carrega ao soltar ainda é o que foi pego.
 *
 * A carga viva é a da célula (ou da pendência), não a da aula: se a grade muda
 * por baixo da mão — dois desfazer que chegam no meio do arrasto — a célula
 * passa a ser de outra aula, e soltar moveria a que o cartão não mostra. A
 * mesma aula recarregada (outro objeto, talvez com outra sala) continua valendo.
 */
export function mesmaCarga(pega: Carga, viva: Carga): boolean {
  if (pega.tipo === "fatia") return viva.tipo === "fatia" && idFatia(pega.fatia) === idFatia(viva.fatia);
  return viva.tipo === "aula" && mesmaAula(pega.aula, viva.aula) && idAula(pega.aula) === idAula(viva.aula);
}
