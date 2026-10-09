import type { Alocacao, Pesos, Problema } from "./tipos";

/**
 * Custo brando de uma grade completa. Nada aqui invalida uma solução — só
 * separa uma grade boa de uma grade meramente possível.
 *
 * As parcelas e a razão de cada uma estão em `docs/regras.md`; aqui fica só a
 * conta.
 */
export function custoTotal(problema: Problema, alocacoes: Alocacao[], pesos: Pesos): number {
  const optativa = optativas(problema);
  const obrigatorias = alocacoes.filter((a) => !optativa.has(a.disciplinaId));
  return (
    buracos(problema, alocacoes, (a) => `p${a.professorId}`) * pesos.buracoProfessor +
    // A turma é quem cursa as obrigatórias. O buraco que uma optativa abre não
    // é de quem não a escolheu — e contá-lo anularia a isenção de contraturno.
    buracos(problema, obrigatorias, (a) => `t${a.periodo}`) * pesos.buracoAluno +
    contraturno(problema, obrigatorias) * pesos.contraturno +
    excessoDeContraturno(problema, obrigatorias) * pesos.excessoContraturno +
    optativaSemTurno(problema, alocacoes) * pesos.optativaSemTurno +
    salaAceitavel(problema, alocacoes) * pesos.salaAceitavel +
    preferenciaDeDias(problema, alocacoes) * pesos.preferenciaDias
  );
}

function optativas(problema: Problema): Set<number> {
  return new Set(problema.fatias.filter((f) => f.optativa).map((f) => f.disciplinaId));
}

/**
 * Horários vagos entre a primeira e a última aula do dia. Serve tanto para o
 * professor quanto para a turma: a conta é a mesma, muda só o agrupamento.
 */
export function buracos(
  _problema: Problema,
  alocacoes: Alocacao[],
  chave: (a: Alocacao) => string,
): number {
  const porDia = new Map<string, number[]>();
  for (const a of alocacoes) {
    const k = `${chave(a)}:${a.dia}`;
    const lista = porDia.get(k);
    if (lista) lista.push(a.hora);
    else porDia.set(k, [a.hora]);
  }
  let total = 0;
  for (const horas of porDia.values()) {
    horas.sort((x, y) => x - y);
    const vao = horas[horas.length - 1] - horas[0] + 1;
    total += vao - horas.length;
  }
  return total;
}

/**
 * Aulas obrigatórias fora do turno do período, descontadas as de turno
 * forçado: forçar é decisão de cadastro, e o turno forçado já é regra dura.
 */
function contraturno(problema: Problema, alocacoes: Alocacao[]): number {
  const turnoDoPeriodo = new Map(problema.periodos.map((p) => [p.numero, p.turno]));
  const turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const forcado = new Map(
    problema.fatias.map((f) => [`${f.disciplinaId}:${f.professorId}`, f.turno]),
  );
  let n = 0;
  for (const a of alocacoes) {
    const esperado = forcado.get(`${a.disciplinaId}:${a.professorId}`)
      ?? turnoDoPeriodo.get(a.periodo);
    if (turnoDaHora.get(a.hora) !== esperado) n++;
  }
  return n;
}

/**
 * Quantas disciplinas obrigatórias a mais do que o permitido escaparam do
 * turno do período — as de turno forçado inclusive, porque o aluno vai e
 * volta do mesmo jeito. Optativas não contam: ver `optativaSemTurno`.
 */
function excessoDeContraturno(problema: Problema, alocacoes: Alocacao[]): number {
  const turnoDoPeriodo = new Map(problema.periodos.map((p) => [p.numero, p.turno]));
  const turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const fora = new Map<number, Set<number>>();
  for (const a of alocacoes) {
    if (turnoDaHora.get(a.hora) !== turnoDoPeriodo.get(a.periodo)) {
      const s = fora.get(a.periodo) ?? new Set<number>();
      s.add(a.disciplinaId);
      fora.set(a.periodo, s);
    }
  }
  let excesso = 0;
  for (const p of problema.periodos) {
    const quantas = fora.get(p.numero)?.size ?? 0;
    if (quantas > p.maxContraturno) excesso += quantas - p.maxContraturno;
  }
  return excesso;
}

/**
 * Períodos com optativa ofertada em que nenhuma ficou inteira no turno. O
 * gerador é livre para mandar optativas ao contraturno, mas quem cursa uma só
 * não deveria ter de voltar ao campus por ela.
 */
function optativaSemTurno(problema: Problema, alocacoes: Alocacao[]): number {
  const turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const porDisciplina = new Map<number, Alocacao[]>();
  for (const a of alocacoes) porDisciplina.set(a.disciplinaId, [...(porDisciplina.get(a.disciplinaId) ?? []), a]);

  let n = 0;
  for (const p of problema.periodos) {
    const ids = new Set(problema.fatias.filter((f) => f.optativa && f.periodo === p.numero).map((f) => f.disciplinaId));
    if (ids.size === 0) continue;
    const algumaNoTurno = [...ids].some((id) => {
      const aulas = porDisciplina.get(id) ?? [];
      return aulas.length > 0 && aulas.every((a) => turnoDaHora.get(a.hora) === p.turno);
    });
    if (!algumaNoTurno) n++;
  }
  return n;
}

/** Aulas em sala que a disciplina lista só como "aceitável". */
function salaAceitavel(problema: Problema, alocacoes: Alocacao[]): number {
  const aceitaveis = new Set(
    problema.fatias.flatMap((f) => f.salas.filter((s) => s.preferencia === 2).map((s) => `${f.disciplinaId}:${s.id}`)),
  );
  return alocacoes.filter((a) => a.salaId != null && aceitaveis.has(`${a.disciplinaId}:${a.salaId}`)).length;
}

/**
 * Quanto a distribuição dos dias contraria a preferência do professor, pesada
 * pelo quanto aquele professor se importa.
 *
 * `consecutivos` conta cada intervalo entre dias de aula; `intercalados` conta
 * cada par de dias colados. Quem é indiferente não pontua. O máximo de dias
 * não entra aqui: é regra dura (D15).
 */
function preferenciaDeDias(problema: Problema, alocacoes: Alocacao[]): number {
  const diasPorProfessor = new Map<number, Set<number>>();
  for (const a of alocacoes) {
    const s = diasPorProfessor.get(a.professorId) ?? new Set<number>();
    s.add(a.dia);
    diasPorProfessor.set(a.professorId, s);
  }

  let total = 0;
  for (const prof of problema.professores) {
    const dias = [...(diasPorProfessor.get(prof.id) ?? [])].sort((x, y) => x - y);
    if (dias.length === 0) continue;

    if (prof.prefDias === "indiferente" || prof.peso === 0 || dias.length < 2) continue;

    let penalidade = 0;
    for (let i = 1; i < dias.length; i++) {
      const vao = dias[i] - dias[i - 1];
      if (prof.prefDias === "consecutivos") penalidade += vao - 1;
      else if (vao === 1) penalidade += 1;
    }
    total += penalidade * prof.peso;
  }
  return total;
}
