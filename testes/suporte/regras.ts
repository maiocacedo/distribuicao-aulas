import { criarContexto, type AulaOcupada, type Contexto, type FatiaRegras, type Turno } from "../../src/regras/tipos";

/** M1..M6 = índices 0..5 (manhã); T1..T6 = 6..11 (tarde). Igual a `problemaMinimo`. */
export const HORARIOS_REGRAS = Array.from({ length: 12 }, (_, i) => ({
  indice: i,
  turno: (i < 6 ? "manha" : "tarde") as Turno,
}));

export function contextoMinimo(extra: Partial<Omit<Contexto, "turnoDaHora">> = {}): Contexto {
  return criarContexto({
    cursoId: 1,
    dias: 6,
    horarios: HORARIOS_REGRAS,
    turnosDoCurso: ["manha", "tarde"],
    turnosSabado: ["manha"],
    indisponiveis: new Set(),
    maxDias: new Map(),
    salas: [],
    ...extra,
  });
}

export function fatiaRegras(extra: Partial<FatiaRegras> = {}): FatiaRegras {
  return {
    disciplinaId: 1,
    professorId: 1,
    periodo: 1,
    permiteSabado: false,
    turno: null,
    exigeSala: false,
    tipoSala: null,
    salas: [],
    ofertada: true,
    ...extra,
  };
}

/** Aula de OUTRA disciplina e OUTRO professor, salvo o que se passar. */
export function aulaOcupada(extra: Partial<AulaOcupada> = {}): AulaOcupada {
  return { cursoId: 1, periodo: 1, dia: 0, hora: 0, disciplinaId: 9, professorId: 9, salaId: null, ...extra };
}
