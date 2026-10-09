import { consultar } from "../db";
import { carregarContexto, type Leitor } from "../regras/carregar";
import type { AulaOcupada, SalaAceita } from "../regras/tipos";
import type { Alocacao, Fatia, PadraoDeBloco, Problema, Turno } from "./tipos";

export type { Leitor } from "../regras/carregar";

/**
 * Monta o problema a partir do banco. A leitura é injetável para que os testes
 * e o benchmark (`scripts/bench_solver.ts`) montem o problema pelo MESMO SQL
 * que o app usa — sem uma segunda implementação para manter em sincronia.
 */
export async function carregarProblema(cursoId: number, ler: Leitor = consultar): Promise<Problema> {
  const ctx = await carregarContexto(cursoId, ler);

  const periodos = (
    await ler<{ numero: number; turno: Turno; max_disciplinas_contraturno: number }>(
      "SELECT numero, turno, max_disciplinas_contraturno FROM periodos WHERE curso_id = ? ORDER BY numero",
      [cursoId],
    )
  ).map((p) => ({ numero: p.numero, turno: p.turno, maxContraturno: p.max_disciplinas_contraturno }));

  const salasEspecificas = new Map<number, SalaAceita[]>();
  for (const r of await ler<{ disciplina_id: number; sala_id: number; preferencia: number }>(
    `SELECT ds.disciplina_id, ds.sala_id, ds.preferencia FROM disciplina_salas ds
       JOIN disciplinas d ON d.id = ds.disciplina_id WHERE d.curso_id = ?`,
    [cursoId],
  )) {
    const sala: SalaAceita = { id: r.sala_id, preferencia: r.preferencia === 2 ? 2 : 1 };
    salasEspecificas.set(r.disciplina_id, [...(salasEspecificas.get(r.disciplina_id) ?? []), sala]);
  }

  // Disciplina não ofertada (D16) nem entra: não tem aula a distribuir.
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
        WHERE d.curso_id = ? AND d.ofertada = 1`,
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
    ofertada: true,
  }));

  const padroes: Record<number, PadraoDeBloco[]> = {};
  for (const r of await ler<{ aulas: number; padrao: string; custo: number }>(
    "SELECT aulas, padrao, custo FROM padroes_blocos",
  )) {
    (padroes[r.aulas] ??= []).push({ partes: r.padrao.split("+").map(Number), custo: r.custo });
  }

  const professores = (
    await ler<{
      id: number;
      pref_dias: "consecutivos" | "intercalados" | "indiferente";
      pref_dias_peso: number;
      max_dias_semana: number | null;
    }>("SELECT id, pref_dias, pref_dias_peso, max_dias_semana FROM professores")
  ).map((p) => ({ id: p.id, prefDias: p.pref_dias, peso: p.pref_dias_peso, maxDias: p.max_dias_semana }));

  type Linha = {
    curso_id: number;
    periodo: number;
    dia: number;
    hora: number;
    disciplina_id: number;
    professor_id: number;
    sala_id: number | null;
  };
  const aula = (a: Linha): AulaOcupada => ({
    cursoId: a.curso_id,
    periodo: a.periodo,
    dia: a.dia,
    hora: a.hora,
    disciplinaId: a.disciplina_id,
    professorId: a.professor_id,
    salaId: a.sala_id,
  });
  const colunas = "curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id";

  const externas = (await ler<Linha>(`SELECT ${colunas} FROM alocacoes WHERE curso_id <> ?`, [cursoId])).map(aula);
  const fixadas: Alocacao[] = (
    await ler<Linha>(`SELECT ${colunas} FROM alocacoes WHERE curso_id = ? AND fixada = 1`, [cursoId])
  ).map((a) => ({
    periodo: a.periodo,
    dia: a.dia,
    hora: a.hora,
    disciplinaId: a.disciplina_id,
    professorId: a.professor_id,
    salaId: a.sala_id,
  }));

  return {
    cursoId,
    dias: ctx.dias,
    horarios: ctx.horarios,
    periodos,
    fatias,
    padroes,
    salas: ctx.salas,
    professores,
    indisponiveis: [...ctx.indisponiveis],
    turnosSabado: ctx.turnosSabado,
    turnosDoCurso: ctx.turnosDoCurso,
    externas,
    fixadas,
  };
}
