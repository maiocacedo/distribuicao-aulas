import { blocoCabeNoDia, padroesDe } from "./blocos";
import { custoTotal } from "./custo";
import {
  PESOS_PADRAO,
  type Alocacao,
  type Fatia,
  type Pesos,
  type Problema,
  type Resultado,
} from "./tipos";

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

/** Estado mutável da busca. Chaves em texto: legível, e rápido o bastante. */
class Estado {
  grade = new Set<string>(); // periodo:dia:hora
  prof = new Set<string>(); // professor:dia:hora
  sala = new Set<string>(); // sala:dia:hora
  colocados = new Map<string, Bloco[]>(); // fatia -> blocos

  constructor(fixadas: Alocacao[]) {
    for (const a of fixadas) {
      this.grade.add(`${a.periodo}:${a.dia}:${a.hora}`);
      this.prof.add(`${a.professorId}:${a.dia}:${a.hora}`);
      if (a.salaId != null) this.sala.add(`${a.salaId}:${a.dia}:${a.hora}`);
    }
  }
}

const idDe = (f: Fatia) => `${f.disciplinaId}:${f.professorId}`;

export function resolver(problema: Problema, opcoes: Opcoes = {}): Resultado {
  const pesos = opcoes.pesos ?? PESOS_PADRAO;
  const maxPassos = opcoes.maxPassos ?? 300_000;
  const rodadas = opcoes.rodadasDeMelhoria ?? 4000;
  const comeco = Date.now();

  const indisponiveis = new Set(problema.indisponiveis);
  const turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const turnoDoPeriodo = new Map(problema.periodos.map((p) => [p.numero, p.turno]));

  /** Salas que atendem o requisito da fatia, na ordem em que serão tentadas. */
  function salasDe(f: Fatia): (number | null)[] {
    if (!f.exigeSala) return [null];
    if (f.tipoSala) return problema.salas.filter((s) => s.tipo === f.tipoSala).map((s) => s.id);
    if (f.salas.length > 0) return f.salas;
    return problema.salas.map((s) => s.id);
  }

  const salasPorFatia = new Map(problema.fatias.map((f) => [idDe(f), salasDe(f)]));

  function livre(e: Estado, f: Fatia, dia: number, h0: number, tam: number): number | null | undefined {
    for (let i = 0; i < tam; i++) {
      const h = problema.horarios[h0 + i].indice;
      if (e.grade.has(`${f.periodo}:${dia}:${h}`)) return undefined;
      if (e.prof.has(`${f.professorId}:${dia}:${h}`)) return undefined;
      if (indisponiveis.has(`${f.professorId}:${dia}:${h}`)) return undefined;
    }
    const candidatas = salasPorFatia.get(idDe(f))!;
    if (!f.exigeSala) return null;
    for (const s of candidatas) {
      let cabe = true;
      for (let i = 0; i < tam && cabe; i++) {
        if (e.sala.has(`${s}:${dia}:${problema.horarios[h0 + i].indice}`)) cabe = false;
      }
      if (cabe) return s as number;
    }
    return undefined;
  }

  /** Quantos horários vagos existem entre a primeira e a última aula do dia. */
  function buracosDoDia(e: Estado, prefixo: string, dia: number, extras: number[]): number {
    const horas: number[] = [...extras];
    for (const h of problema.horarios) {
      if (e.grade.has(`${prefixo}:${dia}:${h.indice}`) || e.prof.has(`${prefixo}:${dia}:${h.indice}`)) {
        horas.push(h.indice);
      }
    }
    if (horas.length === 0) return 0;
    horas.sort((a, b) => a - b);
    return horas[horas.length - 1] - horas[0] + 1 - horas.length;
  }

  /** Custo local aproximado: serve só para ordenar candidatos, não para decidir. */
  function pontuar(e: Estado, f: Fatia, dia: number, h0: number, tam: number): number {
    const horas = Array.from({ length: tam }, (_, i) => problema.horarios[h0 + i].indice);
    const esperado = f.turno ?? turnoDoPeriodo.get(f.periodo);
    let p = 0;
    for (const h of horas) if (turnoDaHora.get(h) !== esperado) p += pesos.contraturno;
    p += buracosDoDia(e, `${f.professorId}`, dia, horas) * pesos.buracoProfessor;
    p += buracosDoDia(e, `${f.periodo}`, dia, horas) * pesos.buracoAluno;
    return f.prioridade === 3 ? p * 0.3 : p;
  }

  function ocupar(e: Estado, f: Fatia, b: Bloco, ligar: boolean) {
    for (let i = 0; i < b.tamanho; i++) {
      const h = problema.horarios[b.horaInicio + i].indice;
      const g = `${f.periodo}:${b.dia}:${h}`;
      const pr = `${f.professorId}:${b.dia}:${h}`;
      if (ligar) {
        e.grade.add(g);
        e.prof.add(pr);
        if (b.salaId != null) e.sala.add(`${b.salaId}:${b.dia}:${h}`);
      } else {
        e.grade.delete(g);
        e.prof.delete(pr);
        if (b.salaId != null) e.sala.delete(`${b.salaId}:${b.dia}:${h}`);
      }
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

    const candidatos: { b: Bloco; nota: number }[] = [];
    for (let dia = 0; dia < problema.dias; dia++) {
      if (usados.has(dia) || proibidos?.has(dia)) continue;
      if (dia === 5 && !f.permiteSabado) continue;
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
          nota: pontuar(e, f, dia, h0, tam),
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

  const estado = new Estado(problema.fixadas);
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

  for (let r = 0; r < rodadas && colocadas.length > 0; r++) {
    const f = colocadas[Math.floor(sorteio() * colocadas.length)];
    const anterior = estado.colocados.get(idDe(f))!;
    retirarFatia(estado, f);
    const antesDosPassos = passos;
    if (!colocarFatia(estado, f)) {
      // Não recolocou: devolve exatamente onde estava.
      for (const b of anterior) ocupar(estado, f, b, true);
      estado.colocados.set(idDe(f), anterior);
      continue;
    }
    const agora = custoTotal(problema, materializar(estado, problema, fatiasEfetivas), pesos);
    if (agora <= melhor) {
      melhor = agora;
    } else {
      retirarFatia(estado, f);
      for (const b of anterior) ocupar(estado, f, b, true);
      estado.colocados.set(idDe(f), anterior);
    }
    passos = antesDosPassos; // a melhoria não consome o orçamento da busca
  }

  return {
    completo: faltantes.length === 0,
    alocacoes: materializar(estado, problema, fatiasEfetivas),
    faltantes,
    custo: melhor,
    passos,
    milissegundos: Date.now() - comeco,
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
