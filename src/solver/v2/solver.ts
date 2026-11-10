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
import { CustoIncremental } from "./custoIncremental";

export interface Opcoes {
  pesos?: Pesos;
  /** Teto de tentativas da construção (não limita as rodadas de melhoria). */
  maxPassos?: number;
  /** Rodadas de melhoria depois de achar uma solução viável (padrão: 6060, mistura N1/N2). */
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

function alocacoesDaFatia(f: Fatia, blocos: Bloco[], problema: Problema): Alocacao[] {
  return blocos.flatMap((b) => Array.from({ length: b.tamanho }, (_, i) => ({
    periodo: f.periodo,
    dia: b.dia,
    hora: problema.horarios[b.horaInicio + i].indice,
    disciplinaId: f.disciplinaId,
    professorId: f.professorId,
    salaId: b.salaId,
  })));
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
  periodo: ResumoDia;
  professor: ResumoDia;
}

interface ResumoDia { min: number; max: number; qtd: number; mask: number; buracos: number }

function popcount32(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function variacaoRapida(r: ResumoDia, hMin: number, hMax: number, tam: number, mask: number): number {
  if (r.qtd === 0) return hMax - hMin + 1 - tam;
  const novas = tam - popcount32(r.mask & mask);
  return Math.max(r.max, hMax) - Math.min(r.min, hMin) + 1 - r.qtd - novas - r.buracos;
}

const idDe = (f: Fatia) => `${f.disciplinaId}:${f.professorId}`;

/** Solver v2: nota marginal, Top-K e LAHC com movimentos N1/N2; ver spec do solver v2. */
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
  // Mistura de N1 (uma fatia) e N2 (par) sorteada a cada rodada: o par custa
  // cerca do dobro, então as rodadas são as que gastam o tempo de 8000 de uma
  // fatia só (8000 / 1,32). A chance do par foi escolhida estreitando o
  // intervalo no benchmark (ver `testes/benchmark/v2-progresso.md`, Task 6c):
  // poucos pares pioram os cenários apertados, muitos pioram a massa real.
  const rodadas = opcoes.rodadasDeMelhoria ?? 6060;
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
  function resumoDia(ocupada: (hora: number) => boolean): ResumoDia {
    let min = 1e9, max = -1e9, qtd = 0, mask = 0;
    for (const h of problema.horarios) if (ocupada(h.indice)) {
      const bit = 1 << h.indice;
      if ((mask & bit) === 0) { mask |= bit; qtd++; min = Math.min(min, h.indice); max = Math.max(max, h.indice); }
    }
    return qtd === 0 ? { min: 0, max: 0, qtd: 0, mask: 0, buracos: 0 } : { min, max, qtd, mask, buracos: max - min + 1 - qtd };
  }
  function resumoDoPeriodo(e: Estado, periodo: number, dia: number): ResumoDia {
    return resumoDia((hora) => { const a = e.oc.noPeriodo(periodo, dia, hora); return Boolean(a && !optativas.has(a.disciplinaId)); });
  }
  function resumoDoProfessor(e: Estado, professorId: number, dia: number): ResumoDia {
    // Inclui aulas externas de propósito: esta nota só ordena candidatos.
    return resumoDia((hora) => Boolean(e.oc.doProfessor(professorId, dia, hora)));
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
    const hMin = problema.horarios[h0].indice;
    const hMax = problema.horarios[h0 + tam - 1].indice;
    const maskBloco = ((1 << tam) - 1) << hMin;
    let p = variacaoRapida(base.professor, hMin, hMax, tam, maskBloco) * pesos.buracoProfessor;
    const turnoP = turnoDoPeriodo.get(f.periodo);
    const turnoBloco = problema.horarios[h0].turno;
    const foraDoTurno = turnoBloco !== turnoP;
    // Optativa no contraturno não custa: quem cobra é `optativaSemTurno`, no
    // custo total. E o buraco que ela abre na turma não é de quem não a cursa.
    if (!f.optativa) {
      const esperado = f.turno ?? turnoP;
      if (turnoBloco !== esperado) p += tam * pesos.contraturno;
      p += variacaoRapida(base.periodo, hMin, hMax, tam, maskBloco) * pesos.buracoAluno;
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
      // Tira do turno uma optativa que ainda estava inteira nele. Outra ainda
      // não colocada é tratada com otimismo como possível proteção da parcela.
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
  /** O único sorteio da busca: a mesma semente repete a mesma grade. */
  const sorteio = aleatorio(opcoes.semente ?? 12345);

  /**
   * Coloca os blocos de uma fatia, um dia diferente para cada.
   * Dias distintos por construção: 2+2 no mesmo dia seria 4 seguidas, que é
   * outro padrão — e a tabela de padrões é quem decide se 4 vale.
   */
  function colocarBlocos(
    e: Estado,
    f: Fatia,
    partes: number[],
    i: number,
    usados: Set<number>,
    saida: Bloco[],
    topK: number,
    evitar?: Bloco[],
  ): boolean {
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
        periodo: resumoDoPeriodo(e, f.periodo, dia),
        professor: resumoDoProfessor(e, f.professorId, dia),
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

    // Fase 2: em vez de sempre o melhor, sorteia entre os K melhores — é o que
    // tira a busca do mesmo ótimo local. A posição que a fatia já ocupava vai
    // para o fim antes do sorteio: sem isso, a "nova" tentativa repetiria a
    // antiga quase sempre. O sorteado vai à frente; os demais seguem em ordem
    // de nota, para o retrocesso continuar completo. Com K = 1 (Fase 1) nada
    // disso roda e nenhum número é sorteado.
    if (topK > 1 && candidatos.length > 1) {
      if (evitar) {
        const igual = (c: { b: Bloco }) =>
          evitar.some((a) => a.dia === c.b.dia && a.horaInicio === c.b.horaInicio && a.tamanho === c.b.tamanho);
        candidatos.sort((a, b) => Number(igual(a)) - Number(igual(b)));
      }
      let k = Math.min(topK, candidatos.length);
      if (k > 1) {
        const limiteNota = candidatos[0].nota + 16;
        let kBons = 1;
        while (kBons < k && candidatos[kBons].nota <= limiteNota) kBons++;
        k = kBons;
      }
      const [escolhido] = candidatos.splice(Math.floor(sorteio() * k), 1);
      candidatos.unshift(escolhido);
    }

    for (const c of candidatos) {
      ocupar(e, f, c.b, true);
      usados.add(c.b.dia);
      saida.push(c.b);
      if (colocarBlocos(e, f, partes, i + 1, usados, saida, topK, evitar)) return true;
      saida.pop();
      usados.delete(c.b.dia);
      ocupar(e, f, c.b, false);
      if (passos > maxPassos) return false;
    }
    return false;
  }

  function colocarFatia(e: Estado, f: Fatia, topK = 1, evitar?: Bloco[]): boolean {
    const padroes = padroesDe(f, problema);
    if (f.blocosLivres && faltantes.length === 0 && padroes.length > 1) {
      let melhorSaida: Bloco[] | undefined;
      let menorFora = Infinity;
      for (const padrao of padroes) {
        if (melhorSaida && padrao.partes.length > 3) continue;
        const saida: Bloco[] = [];
        if (colocarBlocos(e, f, padrao.partes, 0, new Set(), saida, topK, evitar)) {
          const esperado = f.turno ?? turnoDoPeriodo.get(f.periodo);
          const fora = f.optativa ? 0 : saida.reduce((n, b) => n + (problema.horarios[b.horaInicio].turno === esperado ? 0 : b.tamanho), 0);
          if (fora === 0) { e.colocados.set(idDe(f), saida); return true; }
          for (const b of saida) ocupar(e, f, b, false);
          if (fora < menorFora) { menorFora = fora; melhorSaida = saida; }
        }
        if (passos > maxPassos) break;
      }
      if (melhorSaida) {
        for (const b of melhorSaida) ocupar(e, f, b, true);
        e.colocados.set(idDe(f), melhorSaida);
        return true;
      }
      return false;
    }
    for (const padrao of padroes) {
      const saida: Bloco[] = [];
      if (colocarBlocos(e, f, padrao.partes, 0, new Set(), saida, topK, evitar)) {
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

  // ---- melhoria: tira uma ou duas fatias, ou recupera faltantes, guiada pelo custo ----
  function aulasDe(f: Fatia, blocos: Bloco[]): Alocacao[] {
    return alocacoesDaFatia(f, blocos, problema);
  }

  let colocadas = [...fatiasEfetivas.values()].filter((f) => estado.colocados.has(idDe(f)));
  const iniciais = materializar(estado, problema, fatiasEfetivas);
  let custo = new CustoIncremental(problema, pesos, iniciais);
  /** Custo da grade corrente, que com o LAHC pode estar acima do melhor visto. */
  let atual = custoTotal(problema, iniciais, pesos);
  let melhor = atual;
  // A melhor grade vista: o LAHC aceita pioras, então o estado final pode não ser ela.
  let melhorColocados = new Map(estado.colocados);
  let melhorFaltantes = [...faltantes];

  const TOP_K = 5;
  const CHANCE_DE_FALTANTE = 0.1;
  const CHANCE_DE_PAR = 0.32;
  const RODADAS_SEM_MELHORA = 600;
  // Janela do LAHC: curta demais vira subida pura, longa demais aceita lixo.
  const L = Math.max(50, Math.min(250, Math.floor(rodadas / 8)));
  const historico: number[] = new Array(L).fill(atual);

  /** Volta à melhor grade vista: refaz a ocupação, as listas e o custo incremental. */
  function restaurarMelhor() {
    for (const id of [...estado.colocados.keys()]) retirarFatia(estado, fatiasEfetivas.get(id)!);
    for (const [id, blocos] of melhorColocados) {
      const f = fatiasEfetivas.get(id)!;
      for (const b of blocos) ocupar(estado, f, b, true);
      estado.colocados.set(id, blocos);
    }
    faltantes.splice(0, faltantes.length, ...melhorFaltantes);
    colocadas = [...fatiasEfetivas.values()].filter((f) => estado.colocados.has(idDe(f)));
    // Recriar é mais simples que desfazer fatia por fatia, e só acontece
    // quando a busca estagna ou termina.
    custo = new CustoIncremental(problema, pesos, materializar(estado, problema, fatiasEfetivas));
    atual = melhor;
  }

  let interrompido = false;
  // Fim da construção: a primeira grade completa já existe e pode ser vista.
  if ((yield { fase: "construcao", rodada: 0, rodadas, melhorCusto: melhor }) === "parar") {
    interrompido = true;
  }

  let semMelhora = 0;
  for (let r = 0; !interrompido && r < rodadas; r++) {
    // Faltante que não coube na construção pode caber depois que o resto se mexeu.
    const tentaveis = faltantes.filter((x) => fatiasEfetivas.has(idDe(x.fatia)));
    if (colocadas.length === 0 && tentaveis.length === 0) break;
    const antesDosPassos = passos;
    try {
      if (tentaveis.length > 0 && (colocadas.length === 0 || sorteio() < CHANCE_DE_FALTANTE)) {
        const alvo = tentaveis[Math.floor(sorteio() * tentaveis.length)];
        if (colocarFatia(estado, alvo.fatia, TOP_K)) {
          faltantes.splice(faltantes.indexOf(alvo), 1);
          colocadas.push(alvo.fatia);
          custo.adicionar(aulasDe(alvo.fatia, estado.colocados.get(idDe(alvo.fatia))!));
          // Uma fatia a menos faltando vale mais que qualquer custo: o custo não
          // vê faltantes, e a grade com menos faltantes passa a ser a melhor
          // mesmo que `melhor` suba (o colocar soma as aulas da fatia ao custo).
          atual = custo.total();
          melhor = atual;
          melhorColocados = new Map(estado.colocados);
          melhorFaltantes = [...faltantes];
          historico.fill(atual);
          semMelhora = 0;
        } else if (tentaveis.length >= 2) {
          const outro = tentaveis.find((x) => x !== alvo && alvo.fatia.aulas + x.fatia.aulas >= 5 && alvo.fatia.aulas + x.fatia.aulas <= 6);
          const soma = outro ? alvo.fatia.aulas + outro.fatia.aulas : 0;
          const grandes = outro ? colocadas.filter((g) => g.exigeSala === alvo.fatia.exigeSala && g.aulas >= soma) : [];
          if (outro && grandes.length > 0) {
            const grande = grandes[Math.floor(sorteio() * grandes.length)];
            const blocosGrandes = estado.colocados.get(idDe(grande))!;
            const aulasGrandes = aulasDe(grande, blocosGrandes);
            retirarFatia(estado, grande);
            custo.remover(aulasGrandes);
            let postoAlvo = colocarFatia(estado, alvo.fatia, TOP_K);
            let aulasAlvo: Alocacao[] = [];
            if (postoAlvo) { aulasAlvo = aulasDe(alvo.fatia, estado.colocados.get(idDe(alvo.fatia))!); custo.adicionar(aulasAlvo); }
            const postoOutro = postoAlvo && colocarFatia(estado, outro.fatia, TOP_K);
            if (postoOutro) {
              custo.adicionar(aulasDe(outro.fatia, estado.colocados.get(idDe(outro.fatia))!));
              faltantes.splice(faltantes.indexOf(alvo), 1);
              faltantes.splice(faltantes.indexOf(outro), 1);
              faltantes.push({ fatia: grande, motivo: "trocada por duas menores" });
              colocadas.splice(colocadas.indexOf(grande), 1, alvo.fatia, outro.fatia);
              atual = custo.total(); melhor = atual; melhorColocados = new Map(estado.colocados);
              melhorFaltantes = [...faltantes]; historico.fill(atual); semMelhora = 0;
            } else {
              if (postoAlvo) { custo.remover(aulasAlvo); retirarFatia(estado, alvo.fatia); }
              for (const b of blocosGrandes) ocupar(estado, grande, b, true);
              estado.colocados.set(idDe(grande), blocosGrandes);
              custo.adicionar(aulasGrandes);
            }
          }
        }
      } else {
        // N1 recoloca uma fatia; N2, duas do mesmo período de uma vez. Sozinha, a
        // fatia que está no contraturno não tem como entrar no turno porque quem
        // o ocupa (uma optativa, outra obrigatória) também está parada: tirar as
        // duas e recolocá-las em ordem sorteada é o passo que desfaz isso. Período
        // com uma fatia só cai no movimento simples.
        const grupo = [colocadas[Math.floor(sorteio() * colocadas.length)]];
        if (sorteio() < CHANCE_DE_PAR) {
          const vizinhas = colocadas.filter((g) => g !== grupo[0] && g.periodo === grupo[0].periodo);
          if (vizinhas.length > 0) {
            grupo.push(vizinhas[Math.floor(sorteio() * vizinhas.length)]);
            if (sorteio() < 0.5) grupo.reverse();
          }
        }
        const anteriores = grupo.map((g) => estado.colocados.get(idDe(g))!);
        const aulasAnteriores = grupo.map((g, k) => aulasDe(g, anteriores[k]));
        for (const g of grupo) retirarFatia(estado, g);
        for (const aulas of aulasAnteriores) custo.remover(aulas);
        const aulasNovas: Alocacao[][] = [];
        let recolocou = true;
        for (let k = 0; k < grupo.length && recolocou; k++) {
          recolocou = colocarFatia(estado, grupo[k], TOP_K, anteriores[k]);
          if (recolocou) {
            aulasNovas.push(aulasDe(grupo[k], estado.colocados.get(idDe(grupo[k]))!));
            custo.adicionar(aulasNovas[k]);
          }
        }
        // Devolve o grupo exatamente onde estava (na falha ou na rejeição).
        const desfazer = () => {
          for (let k = aulasNovas.length - 1; k >= 0; k--) custo.remover(aulasNovas[k]);
          for (const g of grupo) retirarFatia(estado, g);
          grupo.forEach((g, k) => {
            for (const b of anteriores[k]) ocupar(estado, g, b, true);
            estado.colocados.set(idDe(g), anteriores[k]);
            custo.adicionar(aulasAnteriores[k]);
          });
        };
        if (!recolocou) {
          desfazer();
        } else {
          const agora = custo.total();
          // LAHC: aceita também uma piora, desde que não passe do custo que a
          // busca tinha L rodadas atrás.
          if (agora <= atual || agora <= historico[r % L]) atual = agora;
          else desfazer();
        }
        if (atual < historico[r % L]) historico[r % L] = atual;
        if (atual < melhor) {
          melhor = atual;
          melhorColocados = new Map(estado.colocados);
          semMelhora = 0;
        } else if (++semMelhora >= RODADAS_SEM_MELHORA) {
          // Muito tempo sem ganho: a deriva do LAHC não está levando a lugar
          // nenhum, volta ao melhor ponto e recomeça dali.
          restaurarMelhor();
          semMelhora = 0;
        }
      }
    } finally {
      // A melhoria não consome o orçamento da busca — nem quando a rodada
      // falha (B7: antes, a falha deixava os passos somados e as rodadas
      // seguintes estouravam o teto em cascata).
      passos = antesDosPassos;
    }
    // O cede fica fora do try: a rodada já terminou. `melhorCusto` é o melhor
    // visto, não o corrente; parar aqui restaura essa grade abaixo.
    if ((r + 1) % 100 === 0) {
      if ((yield { fase: "melhoria", rodada: r + 1, rodadas, melhorCusto: melhor }) === "parar") {
        interrompido = true;
      }
    }
  }

  // O estado corrente pode estar acima do melhor: devolve sempre a melhor grade.
  if (atual !== melhor) restaurarMelhor();

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
    saida.push(...alocacoesDaFatia(f, blocos, problema));
  }
  return saida;
}
