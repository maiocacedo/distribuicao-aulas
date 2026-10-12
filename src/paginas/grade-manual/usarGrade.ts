import { useCallback, useMemo, useState } from "react";
import { consultar } from "../../db";
import type { Horario, Periodo } from "../../tipos";
import { carregarContexto } from "../../regras/carregar";
import { AULA_ORFA, descrever, type Nomes } from "../../regras/descrever";
import { violacoesDaAula } from "../../regras/impedimentos";
import { Ocupacao } from "../../regras/ocupacao";
import type { AulaOcupada, Contexto, FatiaRegras, SalaAceita, Turno } from "../../regras/tipos";

export const chave = (dia: number, hora: number) => `${dia}-${hora}`;

/** Uma fatia de disciplina: o par (disciplina, professor) com suas aulas. */
export interface Fatia {
  disciplina_id: number;
  professor_id: number;
  disciplina: string;
  disciplina_curta: string;
  professor: string;
  aulas: number;
  periodo: number;
  permite_sabado: number;
  exige_sala: number;
  tipo_sala: string | null;
  turno: Turno | null;
  ofertada: number;
  blocos_livres: number;
}

/** Aula de qualquer curso, com os nomes que a tela mostra. */
export interface Aula extends AulaOcupada {
  fixada: number;
  disciplina: string;
  professor: string;
  sala: string | null;
  curso: string;
}

export const idFatia = (f: { disciplina_id: number; professor_id: number }) => `${f.disciplina_id}:${f.professor_id}`;
export const idAula = (a: { disciplinaId: number; professorId: number }) => `${a.disciplinaId}:${a.professorId}`;

/** O que a grade manual lê do banco, e o que se deriva disso. */
export function usarGrade(cursoId: number) {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodo, setPeriodo] = useState<number | null>(null);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [horariosTodos, setHorariosTodos] = useState<Horario[]>([]);
  const [fatias, setFatias] = useState<Fatia[]>([]);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [salasPorDisciplina, setSalasPorDisciplina] = useState<Map<number, SalaAceita[]>>(new Map());
  const [nomesSala, setNomesSala] = useState<Map<number, string>>(new Map());
  const [nomesProfessor, setNomesProfessor] = useState<Map<number, string>>(new Map());
  const [nomesCurso, setNomesCurso] = useState<Map<number, string>>(new Map());
  const [padroes, setPadroes] = useState<Map<number, string[]>>(new Map());
  // De que curso é o que está carregado. Só muda no fim de uma carga inteira:
  // os estados acima chegam um a um, e no meio do caminho a tela teria o
  // contexto de um curso com as aulas do outro.
  const [cursoCarregado, setCursoCarregado] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    const contexto = await carregarContexto(cursoId, consultar);
    setCtx(contexto);
    // A grade mostra só os turnos que o curso ocupa (D13).
    const todos = await consultar<Horario>("SELECT * FROM horarios ORDER BY indice");
    setHorariosTodos(todos);
    setHorarios(todos.filter((h) => contexto.turnosDoCurso.includes(h.turno)));

    const ps = await consultar<Periodo>("SELECT * FROM periodos WHERE curso_id = ? ORDER BY numero", [cursoId]);
    setPeriodos(ps);
    setPeriodo((p) => (p != null && ps.some((x) => x.numero === p) ? p : (ps[0]?.numero ?? null)));

    setFatias(
      await consultar<Fatia>(
        `SELECT dp.disciplina_id, dp.professor_id, d.nome AS disciplina,
                COALESCE(NULLIF(d.abreviacao, ''), d.nome) AS disciplina_curta,
                p.nome AS professor, dp.aulas, d.periodo, d.permite_sabado,
                d.exige_sala, d.tipo_sala, d.turno, d.ofertada, d.blocos_livres
           FROM disciplina_professores dp
           JOIN disciplinas d ON d.id = dp.disciplina_id
           JOIN professores p ON p.id = dp.professor_id
          WHERE d.curso_id = ?
          ORDER BY d.periodo, d.nome COLLATE NOCASE, p.nome COLLATE NOCASE`,
        [cursoId],
      ),
    );

    // A grade de TODOS os cursos: professor e sala são da instituição, e um
    // choque com outro curso é tão proibido quanto dentro deste (D2, D3).
    const linhas = await consultar<{
      curso_id: number;
      periodo: number;
      dia: number;
      hora: number;
      disciplina_id: number;
      professor_id: number;
      sala_id: number | null;
      fixada: number;
      disciplina: string;
      professor: string;
      sala: string | null;
      curso: string;
    }>(
      `SELECT a.curso_id, a.periodo, a.dia, a.hora, a.disciplina_id, a.professor_id, a.sala_id,
              a.fixada, COALESCE(NULLIF(d.abreviacao, ''), d.nome) AS disciplina,
              p.nome AS professor, s.nome AS sala, c.nome AS curso
         FROM alocacoes a
         JOIN disciplinas d ON d.id = a.disciplina_id
         JOIN professores p ON p.id = a.professor_id
         JOIN cursos c ON c.id = a.curso_id
         LEFT JOIN salas s ON s.id = a.sala_id`,
    );
    setAulas(
      linhas.map((a) => ({
        cursoId: a.curso_id,
        periodo: a.periodo,
        dia: a.dia,
        hora: a.hora,
        disciplinaId: a.disciplina_id,
        professorId: a.professor_id,
        salaId: a.sala_id,
        fixada: a.fixada,
        disciplina: a.disciplina,
        professor: a.professor,
        sala: a.sala,
        curso: a.curso,
      })),
    );

    const ds = await consultar<{ disciplina_id: number; sala_id: number; preferencia: number }>(
      `SELECT ds.disciplina_id, ds.sala_id, ds.preferencia FROM disciplina_salas ds
         JOIN disciplinas d ON d.id = ds.disciplina_id WHERE d.curso_id = ?`,
      [cursoId],
    );
    const mapa = new Map<number, SalaAceita[]>();
    ds.forEach((r) =>
      mapa.set(r.disciplina_id, [
        ...(mapa.get(r.disciplina_id) ?? []),
        { id: r.sala_id, preferencia: r.preferencia === 2 ? 2 : 1 },
      ]),
    );
    setSalasPorDisciplina(mapa);

    const nomes = async (sql: string) =>
      new Map((await consultar<{ id: number; nome: string }>(sql)).map((r) => [r.id, r.nome]));
    setNomesSala(await nomes("SELECT id, nome FROM salas"));
    setNomesProfessor(await nomes("SELECT id, nome FROM professores"));
    setNomesCurso(await nomes("SELECT id, nome FROM cursos"));

    const pads = new Map<number, string[]>();
    for (const r of await consultar<{ aulas: number; padrao: string }>("SELECT aulas, padrao FROM padroes_blocos"))
      pads.set(r.aulas, [...(pads.get(r.aulas) ?? []), r.padrao]);
    setPadroes(pads);
    setCursoCarregado(cursoId);
  }, [cursoId]);

  const doCurso = useMemo(() => aulas.filter((a) => a.cursoId === cursoId), [aulas, cursoId]);
  const oc = useMemo(() => new Ocupacao(cursoId, aulas), [aulas, cursoId]);

  const alocadas = useMemo(() => {
    const m = new Map<string, number>();
    doCurso.forEach((a) => m.set(idAula(a), (m.get(idAula(a)) ?? 0) + 1));
    return m;
  }, [doCurso]);

  const daGrade = useMemo(() => {
    const m = new Map<string, Aula>();
    doCurso.filter((a) => a.periodo === periodo).forEach((a) => m.set(chave(a.dia, a.hora), a));
    return m;
  }, [doCurso, periodo]);

  const regrasDe = useCallback(
    (f: Fatia): FatiaRegras => ({
      disciplinaId: f.disciplina_id,
      professorId: f.professor_id,
      periodo: f.periodo,
      permiteSabado: !!f.permite_sabado,
      turno: f.turno,
      exigeSala: !!f.exige_sala,
      tipoSala: f.tipo_sala,
      salas: salasPorDisciplina.get(f.disciplina_id) ?? [],
      ofertada: !!f.ofertada,
    }),
    [salasPorDisciplina],
  );

  const nomes = useMemo<Nomes>(
    () => ({
      cursoAtual: cursoId,
      professor: (id) => nomesProfessor.get(id) ?? `#${id}`,
      curso: (id) => nomesCurso.get(id) ?? `#${id}`,
      sala: (id) => nomesSala.get(id) ?? `#${id}`,
    }),
    [cursoId, nomesProfessor, nomesCurso, nomesSala],
  );

  const fatiaDaAula = useCallback(
    (a: Aula) => fatias.find((f) => f.disciplina_id === a.disciplinaId && f.professor_id === a.professorId),
    [fatias],
  );

  /**
   * Aulas deste curso que já violam regra dura — dado antigo ou cadastro que
   * mudou —, com os motivos já em texto. A aula sem fatia (o professor deixou
   * de lecionar a disciplina) também entra: não há regra a perguntar, mas ela
   * não devia estar na grade.
   */
  const violacoes = useMemo(() => {
    if (!ctx) return [];
    return doCurso.flatMap((a): { aula: Aula; motivos: string[] }[] => {
      const f = fatiaDaAula(a);
      if (!f) return [{ aula: a, motivos: [AULA_ORFA] }];
      const motivos = violacoesDaAula(ctx, oc, regrasDe(f), a).map((m) => descrever(m, nomes));
      return motivos.length ? [{ aula: a, motivos }] : [];
    });
  }, [ctx, doCurso, oc, regrasDe, fatiaDaAula, nomes]);

  return {
    /** Ainda não há carga inteira deste curso (a primeira, ou logo depois de trocar de curso). */
    carregando: cursoCarregado !== cursoId,
    periodos,
    periodo,
    setPeriodo,
    horarios,
    horariosTodos,
    fatias,
    aulas,
    ctx,
    padroes,
    carregar,
    doCurso,
    oc,
    alocadas,
    daGrade,
    regrasDe,
    nomes,
    fatiaDaAula,
    violacoes,
  };
}
