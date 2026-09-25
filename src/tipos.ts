/** Espelha o esquema em `scripts/schema.sql`. */

export type Turno = "manha" | "tarde" | "noite";

export const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export interface Horario {
  indice: number;
  /** Como a grade chama este horário: M1, T3, N2... É o identificador visível. */
  codigo: string;
  /** Hora de início. Informação de apoio — as aulas não têm todas a mesma duração. */
  rotulo: string;
  turno: Turno;
  duracao_min: number;
}

export const TURNOS: { valor: Turno; rotulo: string; inicial: string }[] = [
  { valor: "manha", rotulo: "Manhã", inicial: "M" },
  { valor: "tarde", rotulo: "Tarde", inicial: "T" },
  { valor: "noite", rotulo: "Noite", inicial: "N" },
];

export interface Curso {
  id: number;
  nome: string;
  /** Turnos que o curso ocupa, em ordem: "manha,tarde", "tarde,noite"… */
  turnos: string;
  /** Quantas horas de currículo equivalem a 1 aula por semana. */
  horas_por_aula_semanal: number;
  observacao: string | null;
}

export interface Periodo {
  curso_id: number;
  numero: number;
  turno: Turno;
  permite_contraturno: number;
  max_disciplinas_contraturno: number;
}

export interface Professor {
  id: number;
  nome: string;
  pref_dias: "consecutivos" | "intercalados" | "indiferente";
  pref_dias_peso: number;
  max_dias_semana: number | null;
  observacao: string | null;
}

/**
 * Os tipos de sala são fechados de propósito: o requisito de sala de uma
 * disciplina se apoia neles, e uma lista aberta viraria "Laboratorio" e
 * "Laboratório" convivendo. "Outro" absorve o que não for nenhum dos dois.
 *
 * Se um dia forem precisos mais, é acrescentar aqui — a coluna no banco é
 * texto livre e não impõe nada.
 */
export const TIPOS_SALA = ["Sala de Aula", "Laboratório", "Outro"] as const;

export interface Sala {
  id: number;
  nome: string;
  tipo: string;
  capacidade: number;
}

export interface TipoDisciplina {
  id: number;
  nome: string;
  exige_sala: number;
  tipo_sala: string | null;
  blocos_livres: number;
  prioridade: number;
  permite_sabado: number;
  optativa: number;
}

export interface Disciplina {
  id: number;
  curso_id: number;
  nome: string;
  /** Forma curta usada na célula da grade; vazio = usa o nome completo. */
  abreviacao: string | null;
  tipo_id: number | null;
  periodo: number;
  aulas_semanais: number;
  permite_sabado: number;
  turno: Turno | null;
  optativa: number;
  exige_sala: number;
  tipo_sala: string | null;
  blocos_livres: number;
  prioridade: number;
  observacao: string | null;
}

/** Fatia da carga horária de uma disciplina atribuída a um professor. */
export interface DisciplinaProfessor {
  disciplina_id: number;
  professor_id: number;
  aulas: number;
}

export interface Alocacao {
  curso_id: number;
  periodo: number;
  dia: number;
  hora: number;
  disciplina_id: number;
  professor_id: number;
  sala_id: number | null;
  fixada: number;
}

export interface PadraoBloco {
  aulas: number;
  padrao: string;
  custo: number;
}
