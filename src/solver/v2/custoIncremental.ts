import type { Alocacao, Pesos, Problema, ProfessorPref, Turno } from "../tipos";

function chaveDaAula(a: Alocacao): string {
  return `${a.periodo}:${a.dia}:${a.hora}:${a.disciplinaId}:${a.professorId}:${a.salaId ?? -1}`;
}

function removerUm(lista: number[], valor: number): void {
  const i = lista.indexOf(valor);
  if (i !== -1) {
    lista[i] = lista[lista.length - 1];
    lista.pop();
  }
}

/**
 * Mesma conta de `buracos` em `custo.ts`: vão entre o menor e o maior horário
 * do dia descontado do total de aulas na lista (com repetição, se houver).
 */
function buracosDaLista(horas: number[]): number {
  if (horas.length === 0) return 0;
  let min = horas[0];
  let max = horas[0];
  for (let i = 1; i < horas.length; i++) {
    const h = horas[i];
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return max - min + 1 - horas.length;
}

/**
 * Mantém o mesmo valor de `custoTotal` ao longo de remoções e adições de
 * aulas, recalculando apenas as chaves (professor+dia, período+dia, período,
 * professor e disciplina optativa) tocadas em cada operação.
 *
 * Na Fase 2 do solver v2, cada rodada mexe em uma única fatia (2 a 4 aulas)
 * de uma grade com mais de 200: atualizar só o que mudou evita reconstruir e
 * varrer a grade inteira a cada tentativa.
 */
export class CustoIncremental {
  private readonly pesos: Pesos;
  private readonly optativas: Set<number>;
  private readonly turnoDoPeriodo: Map<number, Turno>;
  private readonly turnoDaHora: Map<number, Turno>;
  private readonly forcado: Map<string, Turno | null>;
  private readonly maxContraturnoPorPeriodo: Map<number, number>;
  private readonly optativasPorPeriodo = new Map<number, { turno: Turno; ids: number[] }>();
  private readonly periodosDaOptativa = new Map<number, number[]>();
  private readonly aceitaveis: Set<string>;
  private readonly professores: Map<number, ProfessorPref>;

  /** Contagem por aula completa para remover por igualdade de todos os campos. */
  private readonly presentes = new Map<string, number>();
  /** professorId -> (dia -> lista de horas alocadas no dia). */
  private readonly horasPorProfessor = new Map<number, Map<number, number[]>>();
  /** "periodo:dia" -> lista de horas de obrigatórias alocadas no dia. */
  private readonly horasPorPeriodoDia = new Map<string, number[]>();
  /** periodo -> (disciplinaId obrigatória -> aulas fora do turno do período). */
  private readonly foraPorPeriodo = new Map<number, Map<number, number>>();
  /** disciplinaId optativa -> horas das aulas alocadas. */
  private readonly horasPorOptativa = new Map<number, number[]>();

  private custo = 0;

  constructor(problema: Problema, pesos: Pesos, iniciais: Alocacao[]) {
    this.pesos = pesos;
    this.optativas = new Set(problema.fatias.filter((f) => f.optativa).map((f) => f.disciplinaId));
    this.turnoDoPeriodo = new Map(problema.periodos.map((p) => [p.numero, p.turno]));
    this.turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
    this.forcado = new Map(
      problema.fatias.map((f) => [`${f.disciplinaId}:${f.professorId}`, f.turno]),
    );
    this.maxContraturnoPorPeriodo = new Map(
      problema.periodos.map((p) => [p.numero, p.maxContraturno]),
    );
    this.aceitaveis = new Set(
      problema.fatias.flatMap((f) =>
        f.salas.filter((s) => s.preferencia === 2).map((s) => `${f.disciplinaId}:${s.id}`),
      ),
    );
    this.professores = new Map(problema.professores.map((p) => [p.id, p]));

    for (const p of problema.periodos) {
      const ids = [
        ...new Set(
          problema.fatias
            .filter((f) => f.optativa && f.periodo === p.numero)
            .map((f) => f.disciplinaId),
        ),
      ];
      if (ids.length === 0) continue;
      this.optativasPorPeriodo.set(p.numero, { turno: p.turno, ids });
      for (const id of ids) {
        const lista = this.periodosDaOptativa.get(id) ?? [];
        lista.push(p.numero);
        this.periodosDaOptativa.set(id, lista);
      }
      // Sem aulas alocadas ainda, nenhuma optativa do período está no turno.
      this.custo += this.pesos.optativaSemTurno;
    }

    this.adicionar(iniciais);
  }

  adicionar(aulas: Alocacao[]): void {
    for (const a of aulas) {
      const chave = chaveDaAula(a);
      this.presentes.set(chave, (this.presentes.get(chave) ?? 0) + 1);

      this.adicionarNoProfessor(a.professorId, a.dia, a.hora);

      if (this.optativas.has(a.disciplinaId)) {
        this.alterarOptativa(a.disciplinaId, a.hora, true);
      } else {
        this.adicionarNoPeriodoDia(a.periodo, a.dia, a.hora);
        if (this.ehContraturno(a)) this.custo += this.pesos.contraturno;
        if (this.turnoDaHora.get(a.hora) !== this.turnoDoPeriodo.get(a.periodo)) {
          this.alterarForaDoPeriodo(a.periodo, a.disciplinaId, true);
        }
      }

      if (a.salaId != null && this.aceitaveis.has(`${a.disciplinaId}:${a.salaId}`)) {
        this.custo += this.pesos.salaAceitavel;
      }
    }
  }

  remover(aulas: Alocacao[]): void {
    for (const a of aulas) {
      const chave = chaveDaAula(a);
      const qtd = this.presentes.get(chave) ?? 0;
      if (qtd === 0) continue;
      if (qtd === 1) this.presentes.delete(chave);
      else this.presentes.set(chave, qtd - 1);

      this.removerDoProfessor(a.professorId, a.dia, a.hora);

      if (this.optativas.has(a.disciplinaId)) {
        this.alterarOptativa(a.disciplinaId, a.hora, false);
      } else {
        this.removerDoPeriodoDia(a.periodo, a.dia, a.hora);
        if (this.ehContraturno(a)) this.custo -= this.pesos.contraturno;
        if (this.turnoDaHora.get(a.hora) !== this.turnoDoPeriodo.get(a.periodo)) {
          this.alterarForaDoPeriodo(a.periodo, a.disciplinaId, false);
        }
      }

      if (a.salaId != null && this.aceitaveis.has(`${a.disciplinaId}:${a.salaId}`)) {
        this.custo -= this.pesos.salaAceitavel;
      }
    }
  }

  total(): number {
    return this.custo;
  }

  private ehContraturno(a: Alocacao): boolean {
    const esperado =
      this.forcado.get(`${a.disciplinaId}:${a.professorId}`) ??
      this.turnoDoPeriodo.get(a.periodo);
    return this.turnoDaHora.get(a.hora) !== esperado;
  }

  private adicionarNoProfessor(professorId: number, dia: number, hora: number): void {
    let porDia = this.horasPorProfessor.get(professorId);
    if (!porDia) {
      porDia = new Map();
      this.horasPorProfessor.set(professorId, porDia);
    }
    const horas = porDia.get(dia);
    if (!horas) {
      // Primeiro horário do professor neste dia: 1 aula não tem buraco, mas o
      // conjunto de dias do professor mudou.
      this.custo -= this.custoPreferenciaProfessor(professorId);
      porDia.set(dia, [hora]);
      this.custo += this.custoPreferenciaProfessor(professorId);
    } else {
      this.custo -= buracosDaLista(horas) * this.pesos.buracoProfessor;
      horas.push(hora);
      this.custo += buracosDaLista(horas) * this.pesos.buracoProfessor;
    }
  }

  private removerDoProfessor(professorId: number, dia: number, hora: number): void {
    const porDia = this.horasPorProfessor.get(professorId);
    const horas = porDia?.get(dia);
    if (!porDia || !horas) return;
    if (horas.length === 1) {
      this.custo -= this.custoPreferenciaProfessor(professorId);
      porDia.delete(dia);
      this.custo += this.custoPreferenciaProfessor(professorId);
    } else {
      this.custo -= buracosDaLista(horas) * this.pesos.buracoProfessor;
      removerUm(horas, hora);
      this.custo += buracosDaLista(horas) * this.pesos.buracoProfessor;
    }
  }

  private custoPreferenciaProfessor(professorId: number): number {
    const prof = this.professores.get(professorId);
    if (!prof || prof.prefDias === "indiferente" || prof.peso === 0) return 0;
    const porDia = this.horasPorProfessor.get(professorId);
    if (!porDia || porDia.size < 2) return 0;
    const dias = [...porDia.keys()].sort((x, y) => x - y);
    let penalidade = 0;
    for (let i = 1; i < dias.length; i++) {
      const vao = dias[i] - dias[i - 1];
      if (prof.prefDias === "consecutivos") penalidade += vao - 1;
      else if (vao === 1) penalidade += 1;
    }
    return penalidade * prof.peso * this.pesos.preferenciaDias;
  }

  private adicionarNoPeriodoDia(periodo: number, dia: number, hora: number): void {
    const chave = `${periodo}:${dia}`;
    const horas = this.horasPorPeriodoDia.get(chave);
    if (!horas) {
      this.horasPorPeriodoDia.set(chave, [hora]);
    } else {
      this.custo -= buracosDaLista(horas) * this.pesos.buracoAluno;
      horas.push(hora);
      this.custo += buracosDaLista(horas) * this.pesos.buracoAluno;
    }
  }

  private removerDoPeriodoDia(periodo: number, dia: number, hora: number): void {
    const chave = `${periodo}:${dia}`;
    const horas = this.horasPorPeriodoDia.get(chave);
    if (!horas) return;
    if (horas.length === 1) {
      this.horasPorPeriodoDia.delete(chave);
    } else {
      this.custo -= buracosDaLista(horas) * this.pesos.buracoAluno;
      removerUm(horas, hora);
      this.custo += buracosDaLista(horas) * this.pesos.buracoAluno;
    }
  }

  private alterarForaDoPeriodo(periodo: number, disciplinaId: number, entrando: boolean): void {
    const max = this.maxContraturnoPorPeriodo.get(periodo);
    if (max === undefined) return;
    let fora = this.foraPorPeriodo.get(periodo);
    if (!fora) {
      fora = new Map();
      this.foraPorPeriodo.set(periodo, fora);
    }
    const antes = fora.get(disciplinaId) ?? 0;
    if (entrando) {
      if (antes === 0) {
        if (fora.size >= max) this.custo += this.pesos.excessoContraturno;
        fora.set(disciplinaId, 1);
      } else {
        fora.set(disciplinaId, antes + 1);
      }
    } else if (antes === 1) {
      if (fora.size > max) this.custo -= this.pesos.excessoContraturno;
      fora.delete(disciplinaId);
    } else if (antes > 1) {
      fora.set(disciplinaId, antes - 1);
    }
  }

  private alterarOptativa(disciplinaId: number, hora: number, entrando: boolean): void {
    const periodos = this.periodosDaOptativa.get(disciplinaId);
    if (periodos) {
      for (const p of periodos) this.custo -= this.custoOptativaPeriodo(p);
    }
    let horas = this.horasPorOptativa.get(disciplinaId);
    if (entrando) {
      if (!horas) {
        horas = [hora];
        this.horasPorOptativa.set(disciplinaId, horas);
      } else {
        horas.push(hora);
      }
    } else if (horas) {
      if (horas.length === 1) this.horasPorOptativa.delete(disciplinaId);
      else removerUm(horas, hora);
    }
    if (periodos) {
      for (const p of periodos) this.custo += this.custoOptativaPeriodo(p);
    }
  }

  private custoOptativaPeriodo(periodo: number): number {
    const info = this.optativasPorPeriodo.get(periodo);
    if (!info) return 0;
    const algumaNoTurno = info.ids.some((id) => {
      const horas = this.horasPorOptativa.get(id);
      return (
        horas !== undefined &&
        horas.length > 0 &&
        horas.every((h) => this.turnoDaHora.get(h) === info.turno)
      );
    });
    return algumaNoTurno ? 0 : this.pesos.optativaSemTurno;
  }
}
