import type { Instrucao } from "../../db";
import { escolherSala, salasPossiveis } from "../../regras/impedimentos";
import { Ocupacao } from "../../regras/ocupacao";
import type { Contexto, FatiaRegras } from "../../regras/tipos";
import type { Aula, Fatia } from "./usarGrade";

/** A chave de uma aula na tabela: (curso, período, dia, hora). */
const ONDE = "WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?";
const chave = (a: Aula) => [a.cursoId, a.periodo, a.dia, a.hora];

export function alocar(cursoId: number, periodo: number, dia: number, hora: number, f: Fatia, salaId: number | null): Instrucao {
  return {
    sql: `INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [cursoId, periodo, dia, hora, f.disciplina_id, f.professor_id, salaId],
  };
}

export function mover(a: Aula, dia: number, hora: number, salaId: number | null): Instrucao {
  return { sql: `UPDATE alocacoes SET dia = ?, hora = ?, sala_id = ? ${ONDE}`, params: [dia, hora, salaId, ...chave(a)] };
}

export function remover(a: Aula): Instrucao {
  return { sql: `DELETE FROM alocacoes ${ONDE}`, params: chave(a) };
}

export function trocarSala(a: Aula, salaId: number | null): Instrucao {
  return { sql: `UPDATE alocacoes SET sala_id = ? ${ONDE}`, params: [salaId, ...chave(a)] };
}

export function fixar(a: Aula, fixada: boolean): Instrucao {
  return { sql: `UPDATE alocacoes SET fixada = ? ${ONDE}`, params: [fixada ? 1 : 0, ...chave(a)] };
}

/** Fixar protege a aula do gerador; limpar à mão também não a leva. */
export function limpar(cursoId: number, periodo: number): Instrucao {
  return { sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND fixada = 0", params: [cursoId, periodo] };
}

/** Se as duas são a mesma linha da tabela (a mesma chave), ainda que em objetos diferentes. */
export const mesmaAula = (a: Aula, b: Aula) =>
  a.cursoId === b.cursoId && a.periodo === b.periodo && a.dia === b.dia && a.hora === b.hora;

/**
 * A ocupação sem a aula que está sendo movida, para ela não conflitar consigo
 * mesma. Sai pela chave, e não pelo objeto: cada recarga traz objetos novos, e
 * a aula que está em mãos desde antes dela continua sendo a mesma aula.
 */
export function semAOrigem(cursoId: number, aulas: Aula[], origem: Aula): Ocupacao {
  return new Ocupacao(cursoId, aulas.filter((a) => !mesmaAula(a, origem)));
}

/**
 * A sala da aula no destino: a mesma, se continua servindo e está livre lá;
 * senão a regra de sempre (vizinha, ideal, aceitável).
 */
export function salaAoMover(
  ctx: Contexto,
  oc: Ocupacao,
  regras: FatiaRegras,
  origem: Aula,
  dia: number,
  hora: number,
  salaVizinha: number | null,
): number | null {
  const serve = origem.salaId != null && salasPossiveis(ctx, regras).some((s) => s.id === origem.salaId);
  if (serve && !oc.daSala(origem.salaId!, dia, hora)) return origem.salaId;
  return escolherSala(ctx, oc, regras, dia, hora, salaVizinha) ?? null;
}
