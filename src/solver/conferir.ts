import type { Alocacao, Fatia, Problema, SalaDisponivel } from "./tipos";

/**
 * Auditor das regras duras, independente do solver: recebe uma grade pronta e
 * reconta tudo a partir dela. É o juiz dos testes e do benchmark — um solver
 * não pode ser conferido pelo próprio código que decide onde pôr as aulas.
 */

export type TipoViolacao =
  | "periodo"
  | "professor"
  | "sala"
  | "indisponivel"
  | "sabado"
  | "requisito-sala"
  | "contagem"
  | "padrao"
  | "bloco-turno";

export interface Violacao {
  tipo: TipoViolacao;
  mensagem: string;
}

const SABADO = 5;
const chaveFatia = (x: { disciplinaId: number; professorId: number }) => `${x.disciplinaId}:${x.professorId}`;

function agrupar<T>(xs: T[], chave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = chave(x);
    const lista = m.get(k);
    if (lista) lista.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function requisitoDeSala(f: Fatia, salaId: number | null, salas: Map<number, SalaDisponivel>): string | null {
  if (!f.exigeSala) return salaId == null ? null : "recebeu sala sem precisar";
  if (salaId == null) return "ficou sem sala";
  if (f.tipoSala) return salas.get(salaId)?.tipo === f.tipoSala ? null : `sala fora do tipo ${f.tipoSala}`;
  if (f.salas.length > 0 && !f.salas.includes(salaId)) return "sala fora da lista aceita";
  return null;
}

export function conferir(problema: Problema, alocacoes: Alocacao[]): Violacao[] {
  const saida: Violacao[] = [];
  const add = (tipo: TipoViolacao, mensagem: string) => saida.push({ tipo, mensagem });

  const turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const salas = new Map(problema.salas.map((s) => [s.id, s]));
  const indisponiveis = new Set(problema.indisponiveis);
  const fatias = new Map(problema.fatias.map((f) => [chaveFatia(f), f]));
  const comFixada = new Set(problema.fixadas.map(chaveFatia));

  const duplicadas = (xs: Alocacao[], chave: (a: Alocacao) => string, tipo: TipoViolacao, texto: string) => {
    for (const [k, v] of agrupar(xs, chave)) if (v.length > 1) add(tipo, `${texto} (${k})`);
  };
  duplicadas(alocacoes, (a) => `${a.periodo}:${a.dia}:${a.hora}`, "periodo", "duas aulas no mesmo horário do período");
  duplicadas(alocacoes, (a) => `${a.professorId}:${a.dia}:${a.hora}`, "professor", "professor em dois lugares");
  duplicadas(
    alocacoes.filter((a) => a.salaId != null),
    (a) => `${a.salaId}:${a.dia}:${a.hora}`,
    "sala",
    "sala em dois lugares",
  );

  for (const a of alocacoes) {
    if (indisponiveis.has(`${a.professorId}:${a.dia}:${a.hora}`))
      add("indisponivel", `professor ${a.professorId} indisponível em ${a.dia}:${a.hora}`);
    const f = fatias.get(chaveFatia(a));
    if (!f) continue;
    if (a.dia === SABADO && !f.permiteSabado) add("sabado", `${f.nome} no sábado sem permissão`);
    const turno = turnoDaHora.get(a.hora);
    if (a.dia === SABADO && turno && !problema.turnosSabado.includes(turno))
      add("sabado", `${f.nome} num turno que o sábado não tem`);
    const problemaSala = requisitoDeSala(f, a.salaId, salas);
    if (problemaSala) add("requisito-sala", `${f.nome}: ${problemaSala}`);
  }

  for (const [k, aulas] of agrupar(alocacoes, chaveFatia)) {
    const f = fatias.get(k);
    if (!f) continue;
    if (aulas.length !== f.aulas) {
      add("contagem", `${f.nome}: ${aulas.length} de ${f.aulas} aulas`);
      continue;
    }
    const blocos: number[] = [];
    for (const doDia of agrupar(aulas, (a) => String(a.dia)).values()) {
      const horas = doDia.map((a) => a.hora).sort((x, y) => x - y);
      const doDiaBlocos: number[] = [];
      let tamanho = 1;
      for (let i = 1; i <= horas.length; i++) {
        if (i < horas.length && horas[i] === horas[i - 1] + 1) {
          if (turnoDaHora.get(horas[i]) !== turnoDaHora.get(horas[i - 1]))
            add("bloco-turno", `${f.nome}: bloco atravessa troca de turno`);
          tamanho++;
        } else {
          doDiaBlocos.push(tamanho);
          tamanho = 1;
        }
      }
      if (doDiaBlocos.length > 1) add("padrao", `${f.nome}: dois blocos no mesmo dia`);
      blocos.push(...doDiaBlocos);
    }
    if (f.blocosLivres || comFixada.has(k)) continue;
    const usado = [...blocos].sort((x, y) => y - x).join("+");
    const permitidos = (problema.padroes[f.aulas] ?? []).map((p) => [...p.partes].sort((x, y) => y - x).join("+"));
    if (!permitidos.includes(usado)) add("padrao", `${f.nome}: padrão ${usado} não cadastrado`);
  }

  return saida;
}
