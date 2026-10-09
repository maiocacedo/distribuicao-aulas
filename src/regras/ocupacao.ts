import type { AulaOcupada } from "./tipos";

const chave = (quem: number, dia: number, hora: number) => `${quem}:${dia}:${hora}`;

/** A identidade de uma aula é a chave primária de `alocacoes`. */
const mesma = (x: AulaOcupada, a: AulaOcupada) =>
  x.cursoId === a.cursoId && x.periodo === a.periodo && x.dia === a.dia && x.hora === a.hora;

const NENHUM_DIA: ReadonlyMap<number, number> = new Map();

/**
 * Quem ocupa cada (dia, hora): por período (só do curso em montagem), por
 * professor e por sala (de todos os cursos).
 *
 * Listas, e não um valor só, porque um banco anterior às regras entre cursos
 * pode trazer o mesmo professor em dois lugares. A ocupação precisa
 * representar o choque para que o diagnóstico o mostre, e retirar uma das
 * aulas não pode apagar a outra.
 */
export class Ocupacao {
  private periodos = new Map<string, AulaOcupada[]>();
  private professores = new Map<string, AulaOcupada[]>();
  private salas = new Map<string, AulaOcupada[]>();
  private dias = new Map<number, Map<number, number>>();

  constructor(
    readonly cursoId: number,
    aulas: AulaOcupada[] = [],
  ) {
    for (const a of aulas) this.colocar(a);
  }

  colocar(a: AulaOcupada): void {
    if (a.cursoId === this.cursoId) empilhar(this.periodos, chave(a.periodo, a.dia, a.hora), a);
    empilhar(this.professores, chave(a.professorId, a.dia, a.hora), a);
    if (a.salaId != null) empilhar(this.salas, chave(a.salaId, a.dia, a.hora), a);
    const dias = this.dias.get(a.professorId) ?? new Map<number, number>();
    dias.set(a.dia, (dias.get(a.dia) ?? 0) + 1);
    this.dias.set(a.professorId, dias);
  }

  retirar(a: AulaOcupada): void {
    if (!desempilhar(this.professores, chave(a.professorId, a.dia, a.hora), a)) return;
    if (a.cursoId === this.cursoId) desempilhar(this.periodos, chave(a.periodo, a.dia, a.hora), a);
    if (a.salaId != null) desempilhar(this.salas, chave(a.salaId, a.dia, a.hora), a);
    const dias = this.dias.get(a.professorId)!;
    const n = (dias.get(a.dia) ?? 0) - 1;
    if (n > 0) dias.set(a.dia, n);
    else dias.delete(a.dia);
  }

  noPeriodo(periodo: number, dia: number, hora: number): AulaOcupada | undefined {
    return this.periodos.get(chave(periodo, dia, hora))?.[0];
  }

  doProfessor(professorId: number, dia: number, hora: number): AulaOcupada | undefined {
    return this.professores.get(chave(professorId, dia, hora))?.[0];
  }

  daSala(salaId: number, dia: number, hora: number): AulaOcupada | undefined {
    return this.salas.get(chave(salaId, dia, hora))?.[0];
  }

  /** Dia → quantas aulas o professor tem nele, somando todos os cursos. */
  diasDoProfessor(professorId: number): ReadonlyMap<number, number> {
    return this.dias.get(professorId) ?? NENHUM_DIA;
  }
}

function empilhar(m: Map<string, AulaOcupada[]>, k: string, a: AulaOcupada) {
  const lista = m.get(k);
  if (lista) lista.push(a);
  else m.set(k, [a]);
}

function desempilhar(m: Map<string, AulaOcupada[]>, k: string, a: AulaOcupada): boolean {
  const lista = m.get(k);
  const i = lista ? lista.findIndex((x) => mesma(x, a)) : -1;
  if (i < 0) return false;
  lista!.splice(i, 1);
  if (lista!.length === 0) m.delete(k);
  return true;
}
