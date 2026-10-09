/**
 * As regras duras de célula, num lugar só. O solver e a grade manual montam a
 * mesma `Ocupacao` e fazem a mesma pergunta — "esta aula pode ir aqui?" — e
 * por isso não podem discordar. O auditor (`src/solver/conferir.ts`) fica de
 * fora de propósito: ele reimplementa as regras para pegar erro daqui.
 *
 * A numeração D1..D16 é a de `docs/regras.md`.
 */

export type Turno = "manha" | "tarde";

export interface HorarioRegra {
  indice: number;
  turno: Turno;
}

/** O que não muda enquanto a grade é montada. */
export interface Contexto {
  /** Curso em montagem. Aula de outro curso ocupa professor e sala, nunca período. */
  cursoId: number;
  dias: number;
  horarios: HorarioRegra[];
  turnoDaHora: Map<number, Turno>;
  turnosDoCurso: Turno[];
  turnosSabado: Turno[];
  /** Chaves "professorId:dia:hora". */
  indisponiveis: Set<string>;
  /** Professor → máximo de dias distintos na semana. Ausente = sem limite. */
  maxDias: Map<number, number>;
  salas: { id: number; tipo: string }[];
}

export interface SalaAceita {
  id: number;
  /** 1 = ideal, 2 = aceitável. */
  preferencia: 1 | 2;
}

/** O que as regras precisam saber de uma fatia (disciplina × professor). */
export interface FatiaRegras {
  disciplinaId: number;
  professorId: number;
  periodo: number;
  permiteSabado: boolean;
  /** Turno forçado; `null` = qualquer turno do curso. */
  turno: Turno | null;
  exigeSala: boolean;
  /** Exige sala deste tipo; `null` = sem exigência de tipo. */
  tipoSala: string | null;
  /** Salas específicas aceitas; vazio = qualquer uma que sirva. */
  salas: SalaAceita[];
  ofertada: boolean;
}

export interface AulaOcupada {
  cursoId: number;
  periodo: number;
  dia: number;
  hora: number;
  disciplinaId: number;
  professorId: number;
  salaId: number | null;
}

/** Por que uma aula não pode ir (ou não deveria estar) num horário. */
export type Motivo =
  | { regra: "faixa" }
  | { regra: "D16" }
  | { regra: "D1"; aula: AulaOcupada }
  | { regra: "D5" }
  | { regra: "D5-turno"; turnosSabado: Turno[] }
  | { regra: "D13" }
  | { regra: "D14"; turno: Turno }
  | { regra: "D4"; professorId: number }
  | { regra: "D2"; aula: AulaOcupada }
  | { regra: "D15"; professorId: number; limite: number }
  | { regra: "D3"; aula: AulaOcupada }
  | { regra: "D3-sem-sala" }
  | { regra: "sala-invalida"; salaId: number | null };

export function criarContexto(base: Omit<Contexto, "turnoDaHora">): Contexto {
  return { ...base, turnoDaHora: new Map(base.horarios.map((h) => [h.indice, h.turno])) };
}
