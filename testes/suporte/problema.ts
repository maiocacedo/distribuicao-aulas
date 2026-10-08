import type { Alocacao, Fatia, HorarioDoDia, Problema } from "../../src/solver/tipos";

/** M1..M6 = índices 0..5 (manhã); T1..T6 = 6..11 (tarde). */
const HORARIOS: HorarioDoDia[] = Array.from({ length: 12 }, (_, i) => ({
  indice: i,
  turno: i < 6 ? "manha" : "tarde",
}));

export function problemaMinimo(extra: Partial<Problema> = {}): Problema {
  return {
    dias: 6,
    horarios: HORARIOS,
    periodos: [{ numero: 1, turno: "manha", maxContraturno: 0 }],
    fatias: [],
    padroes: {
      1: [{ partes: [1], custo: 0 }],
      2: [
        { partes: [2], custo: 0 },
        { partes: [1, 1], custo: 5 },
      ],
      4: [
        { partes: [2, 2], custo: 0 },
        { partes: [3, 1], custo: 1 },
      ],
    },
    salas: [],
    professores: [{ id: 1, prefDias: "indiferente", peso: 0, maxDias: null }],
    indisponiveis: [],
    turnosSabado: ["manha"],
    fixadas: [],
    ...extra,
  };
}

export function fatia(extra: Partial<Fatia> = {}): Fatia {
  return {
    disciplinaId: 1,
    professorId: 1,
    nome: "Disciplina",
    periodo: 1,
    aulas: 2,
    permiteSabado: false,
    turno: null,
    optativa: false,
    exigeSala: false,
    tipoSala: null,
    salas: [],
    prioridade: 2,
    blocosLivres: false,
    ...extra,
  };
}

export function aula(dia: number, hora: number, extra: Partial<Alocacao> = {}): Alocacao {
  return { periodo: 1, dia, hora, disciplinaId: 1, professorId: 1, salaId: null, ...extra };
}

/** Chaves de indisponibilidade para todo horário de todos os dias, menos os `livres` [dia, hora]. */
export function indisponivelExceto(professorId: number, dias: number, livres: [number, number][]): string[] {
  const saida: string[] = [];
  for (let d = 0; d < dias; d++)
    for (const h of HORARIOS)
      if (!livres.some(([ld, lh]) => ld === d && lh === h.indice)) saida.push(`${professorId}:${d}:${h.indice}`);
  return saida;
}
