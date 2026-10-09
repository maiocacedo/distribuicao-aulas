import { criarContexto, type Contexto } from "../regras/tipos";
import type { Problema } from "./tipos";

/** O contexto das regras a partir do problema — que é serializável e por isso não guarda Set nem Map. */
export function contextoDe(p: Problema): Contexto {
  return criarContexto({
    cursoId: p.cursoId,
    dias: p.dias,
    horarios: p.horarios,
    turnosDoCurso: p.turnosDoCurso,
    turnosSabado: p.turnosSabado,
    indisponiveis: new Set(p.indisponiveis),
    maxDias: new Map(p.professores.filter((x) => x.maxDias != null).map((x) => [x.id, x.maxDias!])),
    salas: p.salas,
  });
}
