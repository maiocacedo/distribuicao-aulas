import type { Ocupacao } from "./ocupacao";
import type { AulaOcupada, Contexto, FatiaRegras, Motivo, SalaAceita } from "./tipos";

const SABADO = 5;

type Checagem = (ctx: Contexto, oc: Ocupacao, f: FatiaRegras, dia: number, hora: number) => Motivo | null;

/**
 * As regras de horário, na ordem em que o motivo aparece na célula: primeiro
 * o que é do cadastro (não adianta trocar de horário), depois o que é da
 * ocupação (outro horário pode servir).
 */
const CHECAGENS: Checagem[] = [
  (ctx, _oc, _f, dia, hora) => (dia < 0 || dia >= ctx.dias || !ctx.turnoDaHora.has(hora) ? { regra: "faixa" } : null),
  (_ctx, _oc, f) => (f.ofertada ? null : { regra: "D16" }),
  (_ctx, oc, f, dia, hora) => {
    const aula = oc.noPeriodo(f.periodo, dia, hora);
    return aula ? { regra: "D1", aula } : null;
  },
  (_ctx, _oc, f, dia) => (dia === SABADO && !f.permiteSabado ? { regra: "D5" } : null),
  (ctx, _oc, _f, dia, hora) =>
    dia === SABADO && !ctx.turnosSabado.includes(ctx.turnoDaHora.get(hora)!)
      ? { regra: "D5-turno", turnosSabado: ctx.turnosSabado }
      : null,
  (ctx, _oc, _f, _dia, hora) => (ctx.turnosDoCurso.includes(ctx.turnoDaHora.get(hora)!) ? null : { regra: "D13" }),
  (ctx, _oc, f, _dia, hora) => (f.turno && ctx.turnoDaHora.get(hora) !== f.turno ? { regra: "D14", turno: f.turno } : null),
  (ctx, _oc, f, dia, hora) =>
    ctx.indisponiveis.has(`${f.professorId}:${dia}:${hora}`) ? { regra: "D4", professorId: f.professorId } : null,
  (_ctx, oc, f, dia, hora) => {
    const aula = oc.doProfessor(f.professorId, dia, hora);
    return aula ? { regra: "D2", aula } : null;
  },
  (ctx, oc, f, dia) => {
    const limite = ctx.maxDias.get(f.professorId);
    if (limite == null) return null;
    const dias = oc.diasDoProfessor(f.professorId);
    // Só um dia NOVO conta: mais aulas num dia em que ele já vem não pesam.
    return !dias.has(dia) && dias.size >= limite ? { regra: "D15", professorId: f.professorId, limite } : null;
  },
];

/** Primeira regra de horário que impede a fatia em (dia, hora). Não olha sala. */
export function impedimentoDeHorario(
  ctx: Contexto,
  oc: Ocupacao,
  f: FatiaRegras,
  dia: number,
  hora: number,
): Motivo | null {
  for (const checar of CHECAGENS) {
    const m = checar(ctx, oc, f, dia, hora);
    if (m) return m;
  }
  return null;
}

/** As salas que atendem o requisito (D6–D8), na ordem de tentativa: ideais primeiro. */
export function salasPossiveis(ctx: Contexto, f: FatiaRegras): SalaAceita[] {
  if (!f.exigeSala) return [];
  if (f.tipoSala) return ctx.salas.filter((s) => s.tipo === f.tipoSala).map((s) => ({ id: s.id, preferencia: 1 }));
  if (f.salas.length > 0) return [...f.salas].sort((a, b) => a.preferencia - b.preferencia);
  return ctx.salas.map((s) => ({ id: s.id, preferencia: 1 }));
}

/**
 * A sala da aula: a `preferida` (a da aula vizinha, para não trocar de sala no
 * meio do bloco) se servir e estiver livre, senão a primeira possível e livre.
 * `null` = a fatia não usa sala; `undefined` = nenhuma serve.
 */
export function escolherSala(
  ctx: Contexto,
  oc: Ocupacao,
  f: FatiaRegras,
  dia: number,
  hora: number,
  preferida: number | null = null,
): number | null | undefined {
  if (!f.exigeSala) return null;
  const possiveis = salasPossiveis(ctx, f);
  const livre = (id: number) => oc.daSala(id, dia, hora) === undefined;
  if (preferida != null && possiveis.some((s) => s.id === preferida) && livre(preferida)) return preferida;
  return possiveis.find((s) => livre(s.id))?.id;
}

/** Por que a fatia não pode ir a (dia, hora), sala incluída. `null` = pode. */
export function impedimento(ctx: Contexto, oc: Ocupacao, f: FatiaRegras, dia: number, hora: number): Motivo | null {
  const m = impedimentoDeHorario(ctx, oc, f, dia, hora);
  if (m) return m;
  if (escolherSala(ctx, oc, f, dia, hora) !== undefined) return null;
  // Dizer QUAL sala e por quem está tomada: "nenhuma sala livre" não sugere o
  // que fazer a seguir.
  const primeira = salasPossiveis(ctx, f)[0];
  const tomada = primeira ? oc.daSala(primeira.id, dia, hora) : undefined;
  return tomada ? { regra: "D3", aula: tomada } : { regra: "D3-sem-sala" };
}

function salaServe(ctx: Contexto, f: FatiaRegras, salaId: number | null): boolean {
  if (!f.exigeSala) return salaId == null;
  return salaId != null && salasPossiveis(ctx, f).some((s) => s.id === salaId);
}

/**
 * Tudo o que uma aula JÁ GRAVADA viola, contra a ocupação sem ela mesma.
 * Serve ao diagnóstico da grade manual e à revalidação ao editar o cadastro.
 */
export function violacoesDaAula(ctx: Contexto, oc: Ocupacao, f: FatiaRegras, aula: AulaOcupada): Motivo[] {
  return oc.sem(aula, () => {
    const saida: Motivo[] = [];
    for (const checar of CHECAGENS) {
      const m = checar(ctx, oc, f, aula.dia, aula.hora);
      if (!m) continue;
      saida.push(m);
      if (m.regra === "faixa") return saida;
    }
    if (!salaServe(ctx, f, aula.salaId)) {
      saida.push({ regra: "sala-invalida", salaId: aula.salaId });
    } else if (aula.salaId != null) {
      const tomada = oc.daSala(aula.salaId, aula.dia, aula.hora);
      if (tomada) saida.push({ regra: "D3", aula: tomada });
    }
    return saida;
  });
}
