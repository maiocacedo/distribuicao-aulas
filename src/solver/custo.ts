import type { Alocacao, Pesos, Problema } from "./tipos";

/**
 * Custo brando de uma grade completa. Nada aqui invalida uma solução — só
 * separa uma grade boa de uma grade meramente possível.
 *
 * As parcelas e a razão de cada uma estão em `docs/regras.md`; aqui fica só a
 * conta.
 */
export function custoTotal(
  problema: Problema,
  alocacoes: Alocacao[],
  pesos: Pesos,
): number {
  return (
    buracos(problema, alocacoes, (a) => `p${a.professorId}`) * pesos.buracoProfessor +
    buracos(problema, alocacoes, (a) => `t${a.periodo}`) * pesos.buracoAluno +
    contraturno(problema, alocacoes) * pesos.contraturno +
    excessoDeContraturno(problema, alocacoes) * pesos.excessoContraturno +
    preferenciaDeDias(problema, alocacoes) * pesos.preferenciaDias
  );
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

/** Aulas fora do turno do período, descontadas as que foram forçadas de propósito. */
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
 * Quantas disciplinas a mais do que o permitido escaparam do turno do período.
 * Passar do limite não é proibido, mas é caro — o limite existe porque o aluno
 * não pode ficar indo e voltando o dia inteiro.
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
 * Quanto a distribuição dos dias contraria a preferência do professor, pesada
 * pelo quanto aquele professor se importa.
 *
 * `consecutivos` conta cada intervalo entre dias de aula; `intercalados` conta
 * cada par de dias colados. Quem é indiferente não pontua.
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

    if (prof.maxDias != null && dias.length > prof.maxDias) {
      total += (dias.length - prof.maxDias) * 3;
    }
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
