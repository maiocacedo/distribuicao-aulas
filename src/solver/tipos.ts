/**
 * O problema de montagem da grade, isolado do banco e da interface.
 *
 * Nada aqui conhece SQLite ou React: é uma descrição do problema e uma
 * solução. Isso permite rodar o solver fora do aplicativo, contra dados reais,
 * que é a única forma honesta de saber se ele presta.
 */

export type Turno = "manha" | "tarde" | "noite";

export interface HorarioDoDia {
  indice: number;
  turno: Turno;
}

export interface PeriodoDoCurso {
  numero: number;
  turno: Turno;
  maxContraturno: number;
}

export interface ProfessorPref {
  id: number;
  prefDias: "consecutivos" | "intercalados" | "indiferente";
  peso: number;
  maxDias: number | null;
}

export interface SalaDisponivel {
  id: number;
  tipo: string;
}

/**
 * A unidade que o solver aloca: a fatia de uma disciplina que pertence a um
 * professor. Uma disciplina dividida entre dois professores são duas fatias
 * independentes, cada uma com seus próprios blocos.
 */
export interface Fatia {
  disciplinaId: number;
  professorId: number;
  nome: string;
  periodo: number;
  aulas: number;
  permiteSabado: boolean;
  /** Turno forçado da disciplina; `null` = segue o turno do período. */
  turno: Turno | null;
  optativa: boolean;
  exigeSala: boolean;
  /** Exige sala deste tipo; `null` = sem exigência de tipo. */
  tipoSala: string | null;
  /** Salas específicas aceitas; vazio = qualquer uma que sirva. */
  salas: number[];
  prioridade: number;
  blocosLivres: boolean;
}

export interface PadraoDeBloco {
  partes: number[];
  custo: number;
}

export interface Problema {
  dias: number;
  horarios: HorarioDoDia[];
  periodos: PeriodoDoCurso[];
  fatias: Fatia[];
  /** Padrões por número de aulas. Ausente = aquela carga não tem como ser dividida. */
  padroes: Record<number, PadraoDeBloco[]>;
  salas: SalaDisponivel[];
  professores: ProfessorPref[];
  /** Chaves "professorId:dia:hora" em que o professor não pode dar aula. */
  indisponiveis: string[];
  /** Turnos que existem no sábado. Sábado à tarde não existe na instituição. */
  turnosSabado: Turno[];
  /** Aulas que o gerador não pode mexer. */
  fixadas: Alocacao[];
}

export interface Alocacao {
  periodo: number;
  dia: number;
  hora: number;
  disciplinaId: number;
  professorId: number;
  salaId: number | null;
}

export interface Pesos {
  padraoForaDoIdeal: number;
  buracoProfessor: number;
  buracoAluno: number;
  contraturno: number;
  preferenciaDias: number;
  excessoContraturno: number;
}

/**
 * Calibrados contra a grade real do curso (223 aulas), comparando com a versão
 * feita à mão. Contraturno pesa bem mais que buraco de propósito: uma janela
 * custa ao aluno uma hora vaga, enquanto uma aula no outro turno custa a ele
 * voltar ao campus. Com contraturno valendo pouco, o solver fechava todas as
 * janelas empurrando aula para o outro turno — 42 aulas fora contra as 18 da
 * grade manual.
 */
export const PESOS_PADRAO: Pesos = {
  padraoForaDoIdeal: 1,
  buracoProfessor: 8,
  buracoAluno: 8,
  contraturno: 30,
  preferenciaDias: 3,
  excessoContraturno: 20,
};

export interface Resultado {
  /** Verdadeiro quando todas as fatias couberam. */
  completo: boolean;
  alocacoes: Alocacao[];
  /** Fatias que não couberam, com o motivo mais provável. */
  faltantes: { fatia: Fatia; motivo: string }[];
  custo: number;
  passos: number;
  milissegundos: number;
}
