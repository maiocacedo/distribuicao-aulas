import { impedimentoDeHorario, salasPossiveis } from "../../regras/impedimentos";
import { Ocupacao } from "../../regras/ocupacao";
import type { AulaOcupada } from "../../regras/tipos";
import { blocoCabeNoDia, padroesDe } from "../blocos";
import { contextoDe } from "../contexto";
import { custoTotal } from "../custo";
import {
  PESOS_PADRAO,
  type Alocacao,
  type Fatia,
  type Pesos,
  type Problema,
  type Resultado,
} from "../tipos";

export interface Opcoes {
  pesos?: Pesos;
  /** Teto de tentativas de posicionamento antes de desistir da busca exata. */
  maxPassos?: number;
  /** Rodadas de melhoria depois de achar uma solução viável. */
  rodadasDeMelhoria?: number;
  semente?: number;
}

/** Gerador determinístico: a mesma entrada dá sempre a mesma grade. */
function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Bloco {
  dia: number;
  horaInicio: number;
  tamanho: number;
  salaId: number | null;
}

/**
 * Estado mutável da busca. A ocupação é a do módulo de regras — a mesma que a
 * grade manual monta —, já com as aulas dos outros cursos e as fixadas.
 */
class Estado {
  oc: Ocupacao;
  colocados = new Map<string, Bloco[]>(); // fatia -> blocos

  constructor(problema: Problema) {
    this.oc = new Ocupacao(problema.cursoId, problema.externas);
    for (const a of problema.fixadas) this.oc.colocar({ ...a, cursoId: problema.cursoId });
  }
}

/** Horários vagos entre a primeira e a última aula; hora repetida conta uma vez. */
export function buracosNaLista(horas: number[]): number {
  if (horas.length === 0) return 0;
  const distintas = new Set(horas);
  return Math.max(...distintas) - Math.min(...distintas) + 1 - distintas.size;
}

/** Buracos que o bloco acrescenta (ou fecha, se negativo) a um dia que já tem `dia`. */
export function variacaoDeBuracos(dia: number[], bloco: number[]): number {
  return buracosNaLista([...dia, ...bloco]) - buracosNaLista(dia);
}

interface SituacaoDoTurno {
  /** Obrigatórias do período que já têm aula fora do turno dele. */
  obrigatoriasFora: Set<number>;
  /** Optativas do período com aula já posta -> todas no turno até agora. */
  optativasDoPeriodo: Map<number, boolean>;
}

/** Horas do dia já ocupadas, antes do bloco: a base da nota marginal. */
interface BaseDoDia {
  horasPeriodo: number[];
  horasProfessor: number[];
}

const idDe = (f: Fatia) => `${f.disciplinaId}:${f.professorId}`;

/**
 * Solver v2 (subprojeto 3). Nasceu como cópia exata do v1 (`../solver.ts`);
 * as tarefas do plano `docs/superpowers/plans/2026-11-06-solver-v2.md` o
 * mudam passo a passo, com benchmark a cada uma.
 */
export function resolver(problema: Problema, opcoes: Opcoes = {}): Resultado {
  const it = resolverEmPassos(problema, opcoes);
  let passo = it.next();
  while (!passo.done) passo = it.next();
  return passo.value;
}

/** Andamento da busca, entregue a quem acompanha o gerador. */
export interface Progresso {
  fase: "construcao" | "melhoria";
  /** 0 na construção. */
  rodada: number;
  /** Total previsto de rodadas de melhoria. */
  rodadas: number;
  melhorCusto: number;
}

/** O que quem acompanha pode mandar de volta a cada passo. */
export type Comando = "parar" | undefined;

/**
 * Mesma busca de `resolver`, mas cede o controle ao fim da construção e a
 * cada 100 rodadas de melhoria: um Web Worker mostra o progresso e, recebendo
 * "parar", encerra devolvendo a melhor grade vista até ali.
 */
export function* resolverEmPassos(
  problema: Problema,
  opcoes: Opcoes = {},
): Generator<Progresso, Resultado, Comando> {
  const pesos = opcoes.pesos ?? PESOS_PADRAO;
  const maxPassos = opcoes.maxPassos ?? 300_000;
  const rodadas = opcoes.rodadasDeMelhoria ?? 4000;
  const comeco = Date.now();

  const turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const turnoDoPeriodo = new Map(problema.periodos.map((p) => [p.numero, p.turno]));
  const ctx = contextoDe(problema);

  /** Salas que atendem o requisito, ideais primeiro (D6–D8). */
  const salasPorFatia = new Map(problema.fatias.map((f) => [idDe(f), salasPossiveis(ctx, f).map((s) => s.id)]));
  const aceitaveis = new Map(
    problema.fatias.map((f) => [idDe(f), new Set(f.salas.filter((s) => s.preferencia === 2).map((s) => s.id))]),
  );

  const optativas = new Set(problema.fatias.filter((f) => f.optativa).map((f) => f.disciplinaId));
  const optativasPorPeriodo = new Map<number, number[]>();
  for (const f of problema.fatias) {
    if (!f.optativa) continue;
    const ids = optativasPorPeriodo.get(f.periodo) ?? [];
    if (!ids.includes(f.disciplinaId)) ids.push(f.disciplinaId);
    optativasPorPeriodo.set(f.periodo, ids);
  }
  const maxContraturnoDe = new Map(problema.periodos.map((p) => [p.numero, p.maxContraturno]));

  /**
   * A sala em que o bloco inteiro cabe, `null` se a fatia não usa sala, ou
   * `undefined` se o bloco não pode ir ali. As regras de horário são as do
   * módulo compartilhado com a grade manual.
   */
  function livre(e: Estado, f: Fatia, dia: number, h0: number, tam: number): number | null | undefined {
    for (let i = 0; i < tam; i++) {
      if (impedimentoDeHorario(ctx, e.oc, f, dia, problema.horarios[h0 + i].indice)) return undefined;
    }
    if (!f.exigeSala) return null;
    for (const s of salasPorFatia.get(idDe(f))!) {
      let cabe = true;
      for (let i = 0; i < tam && cabe; i++) {
        if (e.oc.daSala(s, dia, problema.horarios[h0 + i].indice)) cabe = false;
      }
      if (cabe) return s;
    }
    return undefined;
  }

  /** Horas do dia ocupadas por aulas que contam como da turma (as obrigatórias). */
  function horasDoPeriodo(e: Estado, periodo: number, dia: number): number[] {
    const horas: number[] = [];
    for (const h of problema.horarios) {
      const a = e.oc.noPeriodo(periodo, dia, h.indice);
      if (a && !optativas.has(a.disciplinaId)) horas.push(h.indice);
    }
    return horas;
  }

  function horasDoProfessor(e: Estado, professorId: number, dia: number): number[] {
    const horas: number[] = [];
    for (const h of problema.horarios) if (e.oc.doProfessor(professorId, dia, h.indice)) horas.push(h.indice);
    return horas;
  }

  /**
   * O que a grade em andamento já diz sobre o turno do período da fatia: quais
   * obrigatórias já escaparam dele e como estão as optativas. Calculado uma vez
   * por bloco a colocar — o estado não muda enquanto os candidatos são
   * pontuados. Conta as fixadas, os blocos de outras fatias e os já postos
   * desta (`saida`).
   */
  function situacaoDoTurno(e: Estado, f: Fatia, saida: Bloco[]): SituacaoDoTurno {
    const turnoP = turnoDoPeriodo.get(f.periodo);
    const obrigatoriasFora = new Set<number>();
    const optativasDoPeriodo = new Map<number, boolean>();
    const ver = (periodo: number, disciplinaId: number, hora: number) => {
      if (periodo !== f.periodo) return;
      const fora = turnoDaHora.get(hora) !== turnoP;
      if (optativas.has(disciplinaId)) {
        optativasDoPeriodo.set(disciplinaId, (optativasDoPeriodo.get(disciplinaId) ?? true) && !fora);
      } else if (fora) obrigatoriasFora.add(disciplinaId);
    };
    const verBlocos = (g: Fatia, blocos: Bloco[]) => {
      for (const b of blocos)
        for (let i = 0; i < b.tamanho; i++) ver(g.periodo, g.disciplinaId, problema.horarios[b.horaInicio + i].indice);
    };
    for (const a of problema.fixadas) ver(a.periodo, a.disciplinaId, a.hora);
    for (const [id, blocos] of e.colocados) verBlocos(fatiasEfetivas.get(id)!, blocos);
    verBlocos(f, saida);
    return { obrigatoriasFora, optativasDoPeriodo };
  }

  /**
   * Nota marginal do candidato: quanto o bloco piora (ou melhora) a grade, e
   * não como o dia fica depois dele. Um dia que já tinha buraco não é punido
   * por isso — e o bloco que fecha o buraco sai com nota negativa, que é o
   * certo: a nota absoluta preferia o dia vazio e deixava o buraco aberto.
   * Imita as parcelas de `custoTotal` que um bloco mede sozinho;
   * `preferenciaDias` fica de fora porque depende dos dias todos do professor.
   * Serve só para ordenar candidatos, não para decidir.
   */
  function pontuar(
    f: Fatia,
    h0: number,
    tam: number,
    sala: number | null,
    base: BaseDoDia,
    situacao: SituacaoDoTurno,
  ): number {
    const horas = Array.from({ length: tam }, (_, i) => problema.horarios[h0 + i].indice);
    let p = variacaoDeBuracos(base.horasProfessor, horas) * pesos.buracoProfessor;
    const turnoP = turnoDoPeriodo.get(f.periodo);
    const foraDoTurno = horas.some((h) => turnoDaHora.get(h) !== turnoP);
    // Optativa no contraturno não custa: quem cobra é `optativaSemTurno`, no
    // custo total. E o buraco que ela abre na turma não é de quem não a cursa.
    if (!f.optativa) {
      const esperado = f.turno ?? turnoP;
      for (const h of horas) if (turnoDaHora.get(h) !== esperado) p += pesos.contraturno;
      p += variacaoDeBuracos(base.horasPeriodo, horas) * pesos.buracoAluno;
      // A disciplina que ainda não estava fora e agora sai, com o período já
      // no limite, é exatamente o que `excessoDeContraturno` passa a contar.
      if (
        foraDoTurno &&
        !situacao.obrigatoriasFora.has(f.disciplinaId) &&
        situacao.obrigatoriasFora.size >= maxContraturnoDe.get(f.periodo)!
      ) {
        p += pesos.excessoContraturno;
      }
    } else if (foraDoTurno && (situacao.optativasDoPeriodo.get(f.disciplinaId) ?? true)) {
      // Tira do turno uma optativa que ainda estava inteira nele. Só custa se
      // for a última: outra já no turno — ou ainda por colocar — segura a parcela.
      const outraNoTurno = (optativasPorPeriodo.get(f.periodo) ?? []).some(
        (id) => id !== f.disciplinaId && (situacao.optativasDoPeriodo.get(id) ?? true),
      );
      if (!outraNoTurno) p += pesos.optativaSemTurno;
    }
    if (sala != null && aceitaveis.get(idDe(f))!.has(sala)) p += tam * pesos.salaAceitavel;
    return p;
  }

  function aulaDe(f: Fatia, b: Bloco, i: number): AulaOcupada {
    return {
      cursoId: problema.cursoId,
      periodo: f.periodo,
      dia: b.dia,
      hora: problema.horarios[b.horaInicio + i].indice,
      disciplinaId: f.disciplinaId,
      professorId: f.professorId,
      salaId: b.salaId,
    };
  }

  function ocupar(e: Estado, f: Fatia, b: Bloco, ligar: boolean) {
    for (let i = 0; i < b.tamanho; i++) {
      if (ligar) e.oc.colocar(aulaDe(f, b, i));
      else e.oc.retirar(aulaDe(f, b, i));
    }
  }

  let passos = 0;

  /**
   * Coloca os blocos de uma fatia, um dia diferente para cada.
   * Dias distintos por construção: 2+2 no mesmo dia seria 4 seguidas, que é
   * outro padrão — e a tabela de padrões é quem decide se 4 vale.
   */
  function colocarBlocos(e: Estado, f: Fatia, partes: number[], i: number, usados: Set<number>, saida: Bloco[]): boolean {
    if (i === partes.length) return true;
    const tam = partes[i];
    const proibidos = diasProibidos.get(idDe(f));

    const situacao = situacaoDoTurno(e, f, saida);
    const candidatos: { b: Bloco; nota: number }[] = [];
    for (let dia = 0; dia < problema.dias; dia++) {
      if (usados.has(dia) || proibidos?.has(dia)) continue;
      if (dia === 5 && !f.permiteSabado) continue;
      // A base do dia vale para todos os horários dele: só o bloco muda.
      const base: BaseDoDia = {
        horasPeriodo: horasDoPeriodo(e, f.periodo, dia),
        horasProfessor: horasDoProfessor(e, f.professorId, dia),
      };
      for (let h0 = 0; h0 < problema.horarios.length; h0++) {
        if (!blocoCabeNoDia(problema, h0, tam)) continue;
        // Sábado à tarde não existe: o bloco inteiro tem de cair num turno
        // que o sábado tenha.
        if (dia === 5 && !problema.turnosSabado.includes(problema.horarios[h0].turno))
          continue;
        if (++passos > maxPassos) return false;
        const sala = livre(e, f, dia, h0, tam);
        if (sala === undefined) continue;
        candidatos.push({
          b: { dia, horaInicio: h0, tamanho: tam, salaId: sala },
          nota: pontuar(f, h0, tam, sala, base, situacao),
        });
      }
    }
    candidatos.sort((a, b) => a.nota - b.nota);

    for (const c of candidatos) {
      ocupar(e, f, c.b, true);
      usados.add(c.b.dia);
      saida.push(c.b);
      if (colocarBlocos(e, f, partes, i + 1, usados, saida)) return true;
      saida.pop();
      usados.delete(c.b.dia);
      ocupar(e, f, c.b, false);
      if (passos > maxPassos) return false;
    }
    return false;
  }

  function colocarFatia(e: Estado, f: Fatia): boolean {
    for (const padrao of padroesDe(f, problema)) {
      const saida: Bloco[] = [];
      if (colocarBlocos(e, f, padrao.partes, 0, new Set(), saida)) {
        e.colocados.set(idDe(f), saida);
        return true;
      }
      if (passos > maxPassos) return false;
    }
    return false;
  }

  function retirarFatia(e: Estado, f: Fatia) {
    const blocos = e.colocados.get(idDe(f));
    if (!blocos) return;
    for (const b of blocos) ocupar(e, f, b, false);
    e.colocados.delete(idDe(f));
  }

  // Ordem de colocação: prioridade alta primeiro, depois as mais difíceis —
  // mais aulas e menos liberdade. Quem tem prioridade 3 vai por último, no que
  // sobrar, que é exatamente o comportamento pedido para Projetos e TCCs.
  // As fatias como o solver de fato as vê: com as aulas fixadas descontadas.
  const fatiasEfetivas = new Map<string, Fatia>();

  const ordem = [...problema.fatias].sort(
    (a, b) =>
      a.prioridade - b.prioridade ||
      Number(a.permiteSabado) - Number(b.permiteSabado) ||
      b.aulas - a.aulas ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );

  const estado = new Estado(problema);
  const faltantes: { fatia: Fatia; motivo: string }[] = [];

  // Aulas que o usuário fixou já estão no lugar: descontam da fatia, e o dia
  // delas sai do jogo para o resto não encostar e virar um bloco maior sem
  // querer. A sobra é alocada com blocos livres — um padrão como 2+2 deixa de
  // fazer sentido quando metade já foi decidida à mão.
  const fixasPorFatia = new Map<string, { n: number; dias: Set<number> }>();
  for (const a of problema.fixadas) {
    const k = `${a.disciplinaId}:${a.professorId}`;
    const atual = fixasPorFatia.get(k) ?? { n: 0, dias: new Set<number>() };
    atual.n += 1;
    atual.dias.add(a.dia);
    fixasPorFatia.set(k, atual);
  }

  const diasProibidos = new Map<string, Set<number>>();

  for (const original of ordem) {
    const fixas = fixasPorFatia.get(idDe(original));
    const f: Fatia = fixas
      ? { ...original, aulas: original.aulas - fixas.n, blocosLivres: true }
      : original;
    if (fixas) diasProibidos.set(idDe(f), fixas.dias);
    if (f.aulas <= 0) continue;
    if (padroesDe(f, problema).length === 0) {
      faltantes.push({
        fatia: f,
        motivo: `não há padrão de bloco cadastrado para ${f.aulas} aula(s)`,
      });
      continue;
    }
    fatiasEfetivas.set(idDe(f), f);
    if (!colocarFatia(estado, f)) {
      faltantes.push({
        fatia: f,
        motivo:
          passos > maxPassos
            ? "busca interrompida no limite de tentativas"
            : "não sobrou horário que atenda todas as restrições",
      });
    }
  }

  // ---- melhoria: tira uma fatia e recoloca, ficando com o que baratear ----
  const sorteio = aleatorio(opcoes.semente ?? 12345);
  const colocadas = [...fatiasEfetivas.values()].filter((f) => estado.colocados.has(idDe(f)));
  let melhor = custoTotal(problema, materializar(estado, problema, fatiasEfetivas), pesos);

  let interrompido = false;
  // Fim da construção: a primeira grade completa já existe e pode ser vista.
  if ((yield { fase: "construcao", rodada: 0, rodadas, melhorCusto: melhor }) === "parar") {
    interrompido = true;
  }

  for (let r = 0; !interrompido && r < rodadas && colocadas.length > 0; r++) {
    const f = colocadas[Math.floor(sorteio() * colocadas.length)];
    const anterior = estado.colocados.get(idDe(f))!;
    retirarFatia(estado, f);
    const antesDosPassos = passos;
    try {
      if (!colocarFatia(estado, f)) {
        // Não recolocou: devolve exatamente onde estava.
        for (const b of anterior) ocupar(estado, f, b, true);
        estado.colocados.set(idDe(f), anterior);
      } else {
        const agora = custoTotal(problema, materializar(estado, problema, fatiasEfetivas), pesos);
        if (agora <= melhor) {
          melhor = agora;
        } else {
          retirarFatia(estado, f);
          for (const b of anterior) ocupar(estado, f, b, true);
          estado.colocados.set(idDe(f), anterior);
        }
      }
    } finally {
      // A melhoria não consome o orçamento da busca — nem quando a rodada
      // falha (B7: antes, a falha deixava os passos somados e as rodadas
      // seguintes estouravam o teto em cascata).
      passos = antesDosPassos;
    }
    // O cede fica fora do try: a rodada já terminou e o estado é o melhor visto
    // (só se aceita custo igual ou menor), então parar aqui devolve uma grade válida.
    if ((r + 1) % 100 === 0) {
      if ((yield { fase: "melhoria", rodada: r + 1, rodadas, melhorCusto: melhor }) === "parar") {
        interrompido = true;
      }
    }
  }

  return {
    completo: faltantes.length === 0,
    alocacoes: materializar(estado, problema, fatiasEfetivas),
    faltantes,
    custo: melhor,
    passos,
    milissegundos: Date.now() - comeco,
    ...(interrompido ? { interrompido: true } : {}),
  };
}

function materializar(
  e: Estado,
  problema: Problema,
  efetivas: Map<string, Fatia>,
): Alocacao[] {
  const porId = efetivas;
  const saida: Alocacao[] = [...problema.fixadas];
  for (const [id, blocos] of e.colocados) {
    const f = porId.get(id)!;
    for (const b of blocos) {
      for (let i = 0; i < b.tamanho; i++) {
        saida.push({
          periodo: f.periodo,
          dia: b.dia,
          hora: problema.horarios[b.horaInicio + i].indice,
          disciplinaId: f.disciplinaId,
          professorId: f.professorId,
          salaId: b.salaId,
        });
      }
    }
  }
  return saida;
}
