import type { AulaOcupada } from "./tipos";

const chave = (quem: number, dia: number, hora: number) => `${quem}:${dia}:${hora}`;

/** A identidade de uma aula é a chave primária de `alocacoes`. */
const mesma = (x: AulaOcupada, a: AulaOcupada) =>
  x.cursoId === a.cursoId && x.periodo === a.periodo && x.dia === a.dia && x.hora === a.hora;

interface Posicao {
  i: number;
  aula: AulaOcupada;
}

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

  /** `true` se a aula estava na ocupação e saiu. */
  retirar(a: AulaOcupada): boolean {
    if (!desempilhar(this.professores, chave(a.professorId, a.dia, a.hora), a)) return false;
    if (a.cursoId === this.cursoId) desempilhar(this.periodos, chave(a.periodo, a.dia, a.hora), a);
    if (a.salaId != null) desempilhar(this.salas, chave(a.salaId, a.dia, a.hora), a);
    const dias = this.dias.get(a.professorId)!;
    const n = (dias.get(a.dia) ?? 0) - 1;
    if (n > 0) dias.set(a.dia, n);
    else dias.delete(a.dia);
    return true;
  }

  /**
   * Roda `fazer` com a aula fora da ocupação e a devolve EXATAMENTE onde
   * estava. Recolocar com `colocar` não serve: se houver duas aulas no mesmo
   * lugar, a retirada e a volta trocariam a ordem e `doProfessor` passaria a
   * devolver a outra; e uma aula que nunca esteve aqui seria inserida. Se ela
   * não está na ocupação, não há nada a tirar nem a repor.
   */
  sem<T>(a: AulaOcupada, fazer: () => T): T {
    const kProf = chave(a.professorId, a.dia, a.hora);
    const doProf = tirar(this.professores, kProf, a);
    if (!doProf) return fazer();
    const kPer = chave(a.periodo, a.dia, a.hora);
    const doPer = a.cursoId === this.cursoId ? tirar(this.periodos, kPer, a) : null;
    const kSala = a.salaId != null ? chave(a.salaId, a.dia, a.hora) : null;
    const daSala = kSala != null ? tirar(this.salas, kSala, a) : null;
    // A ordem dos dias também faz parte do estado: guardá-la inteira é mais
    // simples e mais fiel do que desfazer a contagem.
    const diasAntes = new Map(this.dias.get(a.professorId));
    const dias = this.dias.get(a.professorId)!;
    const n = (dias.get(a.dia) ?? 0) - 1;
    if (n > 0) dias.set(a.dia, n);
    else dias.delete(a.dia);
    try {
      return fazer();
    } finally {
      reinserir(this.professores, kProf, doProf);
      if (doPer) reinserir(this.periodos, kPer, doPer);
      if (daSala) reinserir(this.salas, kSala!, daSala);
      this.dias.set(a.professorId, diasAntes);
    }
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

/** Tira a primeira aula igual a `a` da lista e diz de onde e qual era. */
function tirar(m: Map<string, AulaOcupada[]>, k: string, a: AulaOcupada): Posicao | null {
  const lista = m.get(k);
  const i = lista ? lista.findIndex((x) => mesma(x, a)) : -1;
  if (i < 0) return null;
  const [aula] = lista!.splice(i, 1);
  if (lista!.length === 0) m.delete(k);
  return { i, aula };
}

function reinserir(m: Map<string, AulaOcupada[]>, k: string, p: Posicao): void {
  const lista = m.get(k);
  if (lista) lista.splice(p.i, 0, p.aula);
  else m.set(k, [p.aula]);
}

function desempilhar(m: Map<string, AulaOcupada[]>, k: string, a: AulaOcupada): boolean {
  return tirar(m, k, a) !== null;
}
