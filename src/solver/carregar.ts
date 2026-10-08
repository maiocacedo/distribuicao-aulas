import { consultar } from "../db";
import type { Alocacao, Fatia, PadraoDeBloco, Problema, Turno } from "./tipos";

/** Como ler do banco. No app é a pool do plugin SQL; nos testes e no benchmark, `node:sqlite`. */
export type Leitor = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

/**
 * Monta o problema a partir do banco. A leitura é injetável para que os testes
 * e o benchmark (`scripts/bench_solver.ts`) montem o problema pelo MESMO SQL
 * que o app usa — sem uma segunda implementação para manter em sincronia.
 */
export async function carregarProblema(cursoId: number, ler: Leitor = consultar): Promise<Problema> {
  const config = async (chave: string) =>
    (await ler<{ valor: string }>("SELECT valor FROM configuracao WHERE chave = ?", [chave]))[0]?.valor;

  const dias = Number((await config("dias_letivos")) ?? 6);
  const turnosSabado = ((await config("turnos_sabado")) ?? "manha").split(",").filter(Boolean) as Turno[];

  const horarios = await ler<{ indice: number; turno: Turno }>(
    "SELECT indice, turno FROM horarios ORDER BY indice",
  );

  const periodos = (
    await ler<{ numero: number; turno: Turno; max_disciplinas_contraturno: number }>(
      "SELECT * FROM periodos WHERE curso_id = ? ORDER BY numero",
      [cursoId],
    )
  ).map((p) => ({
    numero: p.numero,
    turno: p.turno,
    maxContraturno: p.max_disciplinas_contraturno,
  }));

  const salasEspecificas = new Map<number, number[]>();
  for (const r of await ler<{ disciplina_id: number; sala_id: number }>(
    `SELECT ds.disciplina_id, ds.sala_id FROM disciplina_salas ds
       JOIN disciplinas d ON d.id = ds.disciplina_id WHERE d.curso_id = ?`,
    [cursoId],
  )) {
    salasEspecificas.set(r.disciplina_id, [...(salasEspecificas.get(r.disciplina_id) ?? []), r.sala_id]);
  }

  const fatias: Fatia[] = (
    await ler<{
      disciplina_id: number;
      professor_id: number;
      aulas: number;
      nome: string;
      periodo: number;
      permite_sabado: number;
      turno: Turno | null;
      optativa: number;
      exige_sala: number;
      tipo_sala: string | null;
      prioridade: number;
      blocos_livres: number;
    }>(
      `SELECT dp.disciplina_id, dp.professor_id, dp.aulas, d.nome, d.periodo,
              d.permite_sabado, d.turno, d.optativa, d.exige_sala, d.tipo_sala,
              d.prioridade, d.blocos_livres
         FROM disciplina_professores dp
         JOIN disciplinas d ON d.id = dp.disciplina_id
        WHERE d.curso_id = ?`,
      [cursoId],
    )
  ).map((r) => ({
    disciplinaId: r.disciplina_id,
    professorId: r.professor_id,
    nome: r.nome,
    periodo: r.periodo,
    aulas: r.aulas,
    permiteSabado: !!r.permite_sabado,
    turno: r.turno,
    optativa: !!r.optativa,
    exigeSala: !!r.exige_sala,
    tipoSala: r.tipo_sala,
    salas: salasEspecificas.get(r.disciplina_id) ?? [],
    prioridade: r.prioridade,
    blocosLivres: !!r.blocos_livres,
  }));

  const padroes: Record<number, PadraoDeBloco[]> = {};
  for (const r of await ler<{ aulas: number; padrao: string; custo: number }>(
    "SELECT aulas, padrao, custo FROM padroes_blocos",
  )) {
    (padroes[r.aulas] ??= []).push({ partes: r.padrao.split("+").map(Number), custo: r.custo });
  }

  const salas = await ler<{ id: number; tipo: string }>("SELECT id, tipo FROM salas");

  const professores = (
    await ler<{
      id: number;
      pref_dias: "consecutivos" | "intercalados" | "indiferente";
      pref_dias_peso: number;
      max_dias_semana: number | null;
    }>("SELECT id, pref_dias, pref_dias_peso, max_dias_semana FROM professores")
  ).map((p) => ({ id: p.id, prefDias: p.pref_dias, peso: p.pref_dias_peso, maxDias: p.max_dias_semana }));

  const indisponiveis = (
    await ler<{ professor_id: number; dia: number; hora: number }>(
      "SELECT professor_id, dia, hora FROM indisponibilidades",
    )
  ).map((i) => `${i.professor_id}:${i.dia}:${i.hora}`);

  const fixadas: Alocacao[] = (
    await ler<{
      periodo: number;
      dia: number;
      hora: number;
      disciplina_id: number;
      professor_id: number;
      sala_id: number | null;
    }>("SELECT * FROM alocacoes WHERE curso_id = ? AND fixada = 1", [cursoId])
  ).map((a) => ({
    periodo: a.periodo,
    dia: a.dia,
    hora: a.hora,
    disciplinaId: a.disciplina_id,
    professorId: a.professor_id,
    salaId: a.sala_id,
  }));

  return { dias, horarios, periodos, fatias, padroes, salas, professores, indisponiveis, turnosSabado, fixadas };
}
