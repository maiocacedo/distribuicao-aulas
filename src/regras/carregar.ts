import { criarContexto, type Contexto, type HorarioRegra, type Turno } from "./tipos";

/** Como ler do banco. No app é a pool do plugin SQL; nos testes e no benchmark, `node:sqlite`. */
export type Leitor = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

const lista = (texto: string | undefined, padrao: string) =>
  (texto ?? padrao).split(",").filter(Boolean) as Turno[];

/**
 * O contexto das regras, montado por um SQL só para o solver e para a grade
 * manual — senão cada um volta a ter a sua cópia e elas divergem.
 */
export async function carregarContexto(cursoId: number, ler: Leitor): Promise<Contexto> {
  const config = async (chave: string) =>
    (await ler<{ valor: string }>("SELECT valor FROM configuracao WHERE chave = ?", [chave]))[0]?.valor;

  const [curso] = await ler<{ turnos: string }>("SELECT turnos FROM cursos WHERE id = ?", [cursoId]);
  const horarios = await ler<HorarioRegra>("SELECT indice, turno FROM horarios ORDER BY indice");
  const indisponiveis = await ler<{ professor_id: number; dia: number; hora: number }>(
    "SELECT professor_id, dia, hora FROM indisponibilidades",
  );
  const limites = await ler<{ id: number; max_dias_semana: number }>(
    "SELECT id, max_dias_semana FROM professores WHERE max_dias_semana IS NOT NULL",
  );

  return criarContexto({
    cursoId,
    dias: Number((await config("dias_letivos")) ?? 6),
    horarios,
    turnosDoCurso: lista(curso?.turnos, "manha,tarde"),
    turnosSabado: lista(await config("turnos_sabado"), "manha"),
    indisponiveis: new Set(indisponiveis.map((i) => `${i.professor_id}:${i.dia}:${i.hora}`)),
    maxDias: new Map(limites.map((p) => [p.id, p.max_dias_semana])),
    salas: await ler<{ id: number; tipo: string }>("SELECT id, tipo FROM salas ORDER BY id"),
  });
}
