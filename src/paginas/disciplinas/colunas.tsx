import type { Linha } from "./salvar";

/**
 * As marcas viram um texto ordenável para que disciplinas com o mesmo
 * comportamento fiquem juntas — é assim que se acha "todas as sem sala".
 */
export function marcasDe(l: Linha): string {
  return [
    !l.ofertada ? "não ofertada" : "",
    !l.exige_sala ? "sem sala" : "",
    l.tipo_sala ? `só ${l.tipo_sala}` : "",
    l.n_salas > 0 ? `${l.n_salas} sala(s)` : "",
    l.blocos_livres ? "livre" : "",
    l.permite_sabado ? "sábado" : "",
    l.turno ?? "",
    l.prioridade !== 2 ? `prio. ${l.prioridade === 1 ? "alta" : "baixa"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
