import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { consultar, transacao, type Instrucao } from "../db";
import { DIAS, type Horario, type Periodo } from "../tipos";
import { Erro, Vazio, mensagemErro } from "../componentes/ui";
import { avisosDaFatia } from "../regras/avisos";
import { carregarContexto } from "../regras/carregar";
import { curto, descrever, type Nomes } from "../regras/descrever";
import { escolherSala, impedimento, salasPossiveis, violacoesDaAula } from "../regras/impedimentos";
import { Ocupacao } from "../regras/ocupacao";
import type { AulaOcupada, Contexto, FatiaRegras, SalaAceita, Turno } from "../regras/tipos";

const chave = (dia: number, hora: number) => `${dia}-${hora}`;

/** Uma fatia de disciplina: o par (disciplina, professor) com suas aulas. */
interface Fatia {
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
interface Aula extends AulaOcupada {
  fixada: number;
  disciplina: string;
  professor: string;
  sala: string | null;
  curso: string;
}

export default function GradeManual({ cursoId }: { cursoId: number }) {
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
  const [trocando, setTrocando] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [erro, setErro] = useState("");

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
  }, [cursoId]);

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, [carregar]);

  // Esc solta a pendência escolhida: sair de um modo é sempre a mesma tecla.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setEscolhida(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const idFatia = (f: { disciplina_id: number; professor_id: number }) => `${f.disciplina_id}:${f.professor_id}`;
  const idAula = (a: Aula) => `${a.disciplinaId}:${a.professorId}`;
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

  const nomes: Nomes = {
    cursoAtual: cursoId,
    professor: (id) => nomesProfessor.get(id) ?? `#${id}`,
    curso: (id) => nomesCurso.get(id) ?? `#${id}`,
    sala: (id) => nomesSala.get(id) ?? `#${id}`,
  };

  const fatiaDaAula = (a: Aula) =>
    fatias.find((f) => f.disciplina_id === a.disciplinaId && f.professor_id === a.professorId);
  const fatiasDoPeriodo = fatias.filter((f) => f.periodo === periodo && f.ofertada);
  const fatiaEscolhida = fatias.find((f) => idFatia(f) === escolhida) ?? null;

  /** Aulas deste curso que já violam regra dura — dado antigo ou cadastro que mudou. */
  const violacoes = useMemo(() => {
    if (!ctx) return [];
    return doCurso.flatMap((a) => {
      const f = fatiaDaAula(a);
      if (!f) return [];
      const motivos = violacoesDaAula(ctx, oc, regrasDe(f), a);
      return motivos.length ? [{ aula: a, motivos }] : [];
    });
    // fatiaDaAula depende de `fatias`
  }, [ctx, doCurso, oc, regrasDe, fatias]);

  const dias = ctx?.dias ?? 6;
  const codigoDe = (indice: number) => horariosTodos.find((h) => h.indice === indice)?.codigo ?? String(indice);

  /** Por que esta célula não aceita a fatia escolhida. `null` = aceita. */
  function motivoDe(f: Fatia, dia: number, hora: number): string | null {
    if ((alocadas.get(idFatia(f)) ?? 0) >= f.aulas) return `${f.aulas} de ${f.aulas} aulas já alocadas`;
    if (!ctx) return null;
    const m = impedimento(ctx, oc, regrasDe(f), dia, hora);
    return m ? descrever(m, nomes) : null;
  }

  async function alocar(dia: number, hora: number) {
    if (!fatiaEscolhida || periodo == null || !ctx) return;
    const motivo = motivoDe(fatiaEscolhida, dia, hora);
    if (motivo) return setErro(motivo);
    setErro("");
    // A sala da aula vizinha da mesma fatia, para o bloco não trocar de sala.
    const vizinha = [hora - 1, hora + 1]
      .map((h) => daGrade.get(chave(dia, h)))
      .find((a) => a && idAula(a) === idFatia(fatiaEscolhida));
    const sala = escolherSala(ctx, oc, regrasDe(fatiaEscolhida), dia, hora, vizinha?.salaId ?? null) ?? null;
    try {
      await transacao([
        {
          sql: `INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [cursoId, periodo, dia, hora, fatiaEscolhida.disciplina_id, fatiaEscolhida.professor_id, sala],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
      await carregar();
    }
  }

  /**
   * Salas que servem à aula e estão livres naquele horário (a dela inclusive).
   * A sala atual entra sempre: se o cadastro mudou e ela saiu do requisito, o
   * seletor sem ela mostraria outra como se fosse a atual.
   */
  function salasParaTroca(a: Aula): { id: number | null; rotulo: string }[] {
    const f = fatiaDaAula(a);
    if (!f || !ctx) return [];
    const regras = regrasDe(f);
    // Com tipo de sala, `salasPossiveis` ignora a lista específica.
    const comLista = !regras.tipoSala && regras.salas.length > 0;
    const possiveis = salasPossiveis(ctx, regras);
    const opcoes: { id: number | null; rotulo: string }[] = possiveis
      .filter((s) => s.id === a.salaId || !oc.daSala(s.id, a.dia, a.hora))
      .map((s) => ({
        id: s.id,
        rotulo: nomes.sala(s.id) + (comLista ? (s.preferencia === 1 ? " (ideal)" : " (aceitável)") : ""),
      }));
    if (a.salaId != null && !possiveis.some((s) => s.id === a.salaId))
      opcoes.unshift({ id: a.salaId, rotulo: `${nomes.sala(a.salaId)} (atual, fora do requisito)` });
    if (!regras.exigeSala) opcoes.push({ id: null, rotulo: "Sem sala" });
    return opcoes;
  }

  async function trocarSala(a: Aula, salaId: number | null) {
    setTrocando(null);
    if (salaId === a.salaId) return;
    setErro("");
    try {
      await transacao([
        {
          sql: "UPDATE alocacoes SET sala_id = ? WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
          params: [salaId, cursoId, a.periodo, a.dia, a.hora],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
      await carregar();
    }
  }

  /**
   * Fixar protege a aula do gerador — e também do clique que remove, senão
   * bastaria um clique errado para perder o que se quis preservar.
   */
  async function alternarFixada(dia: number, hora: number) {
    const aula = daGrade.get(chave(dia, hora));
    if (!aula || periodo == null) return;
    setErro("");
    try {
      await transacao([
        {
          sql: `UPDATE alocacoes SET fixada = ?
                 WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?`,
          params: [aula.fixada ? 0 : 1, cursoId, periodo, dia, hora],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
    }
  }

  async function remover(dia: number, hora: number) {
    if (periodo == null) return;
    const aula = daGrade.get(chave(dia, hora));
    if (aula?.fixada) {
      setErro("Esta aula está fixada. Clique com o botão direito para soltá-la.");
      return;
    }
    setErro("");
    try {
      await transacao([
        {
          sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
          params: [cursoId, periodo, dia, hora],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
    }
  }

  async function limparPeriodo() {
    if (periodo == null) return;
    const fixadas = [...daGrade.values()].filter((a) => a.fixada).length;
    // Fixar protege a aula do gerador; limpar à mão também não a leva (B8).
    if (
      !confirm(
        `Apagar as aulas do ${periodo}º período?` +
          (fixadas ? `\n\nAs ${fixadas} aula(s) fixadas ficam.` : ""),
      )
    )
      return;
    const instrucoes: Instrucao[] = [
      { sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND fixada = 0", params: [cursoId, periodo] },
    ];
    try {
      await transacao(instrucoes);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A grade"));
    }
  }

  if (periodos.length === 0) {
    return (
      <>
        <header className="cabecalho-pagina">
          <h1>Grade horária</h1>
        </header>
        <Vazio>Cadastre os períodos do curso primeiro.</Vazio>
      </>
    );
  }

  const turnoDoPeriodo = periodos.find((p) => p.numero === periodo)?.turno;
  const faltando = fatiasDoPeriodo.reduce(
    (s, f) => s + Math.max(0, f.aulas - (alocadas.get(idFatia(f)) ?? 0)),
    0,
  );
  const fechadas = fatiasDoPeriodo.filter(
    (f) => (alocadas.get(idFatia(f)) ?? 0) >= f.aulas,
  ).length;

  // As linhas da grade, com as faixas de turno intercaladas. A fronteira entre
  // turnos é estrutura, não cor: uma faixa rotulada interrompe a malha, porque
  // aula nenhuma atravessa turnos.
  const linhas: (
    | { tipo: "faixa"; turno: string; nota: string }
    | { tipo: "horario"; h: Horario }
  )[] = [];
  horarios.forEach((h, i) => {
    if (i === 0 || horarios[i - 1].turno !== h.turno) {
      // A faixa diz o que aquele turno significa PARA ESTE período, não só
      // qual é o turno: é a diferença entre rótulo e informação.
      linhas.push({
        tipo: "faixa",
        turno: h.turno,
        nota: h.turno === turnoDoPeriodo ? `turno do ${periodo}º período` : "contraturno",
      });
    }
    linhas.push({ tipo: "horario", h });
  });

  const colunas = `56px repeat(${dias}, minmax(0, 1fr))`;

  return (
    <>
      <header className="cabecalho-pagina">
        <div>
          <h1>Grade horária</h1>
          <p className="sub">
            {faltando === 0
              ? "Todas as aulas deste período estão alocadas."
              : `${faltando} aula(s) deste período ainda por alocar.`}
          </p>
        </div>
        <div className="acoes-cabecalho">
          <button className="perigo" onClick={limparPeriodo} disabled={[...daGrade.values()].every((a) => a.fixada)}>
            Limpar período
          </button>
        </div>
      </header>

      <Erro>{erro}</Erro>

      {violacoes.length > 0 && (
        <details className="aviso diagnostico">
          <summary>{violacoes.length} aula(s) deste curso violam regra dura</summary>
          <ul>
            {violacoes.map(({ aula, motivos }) => (
              <li key={`${aula.periodo}:${aula.dia}:${aula.hora}`}>
                {aula.periodo}º · {DIAS[aula.dia]} {codigoDe(aula.hora)} · <strong>{aula.disciplina}</strong>:{" "}
                {motivos.map((m) => descrever(m, nomes)).join("; ")}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="abas-periodo">
        {periodos.map((p) => (
          <button
            key={p.numero}
            className={p.numero === periodo ? "ativo" : ""}
            onClick={() => {
              setPeriodo(p.numero);
              setEscolhida(null);
            }}
          >
            {p.numero}º
          </button>
        ))}
        <span className="ocupacao">
          {daGrade.size} de {horarios.length * dias} posições ocupadas
        </span>
      </div>

      <div className="painel-duplo largo">
        <div className="pendencias">
          <div className="titulo-painel">
            <strong>Pendências</strong>
            <span>
              {fechadas} de {fatiasDoPeriodo.length} fechadas
            </span>
          </div>
          {fatiasDoPeriodo.length === 0 ? (
            <p className="nota-painel">Nenhuma disciplina neste período.</p>
          ) : (
            <ul>
              {fatiasDoPeriodo.map((f) => {
                const feitas = alocadas.get(idFatia(f)) ?? 0;
                const completa = feitas >= f.aulas;
                return (
                  <li key={idFatia(f)}>
                    <button
                      aria-pressed={escolhida === idFatia(f)}
                      className={`fatia ${escolhida === idFatia(f) ? "ativo" : ""} ${
                        completa ? "completa" : ""
                      }`}
                      onClick={() =>
                        setEscolhida(escolhida === idFatia(f) ? null : idFatia(f))
                      }
                    >
                      <span className="linha1">
                        <span className="nome">{f.disciplina_curta}</span>
                        <span className="prog">
                          {feitas}/{f.aulas}
                        </span>
                      </span>
                      <span className="prof">{f.professor}</span>
                      {ctx &&
                        avisosDaFatia(
                          [...daGrade.values()].filter((a) => idAula(a) === idFatia(f)),
                          f.aulas,
                          !!f.blocos_livres,
                          padroes.get(f.aulas),
                          ctx.turnoDaHora,
                        ).map((aviso) => (
                          <span key={aviso} className="aviso-fatia">
                            {aviso}
                          </span>
                        ))}
                      <span className="trilha">
                        <span
                          className="barra"
                          style={{ width: `${Math.min(100, (feitas / f.aulas) * 100)}%` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="nota-painel rodape">
            {fatiaEscolhida
              ? `Clique num horário apto para alocar ${fatiaEscolhida.disciplina_curta}. Esc cancela a seleção.`
              : "Selecione uma pendência e clique num horário livre."}
          </p>
        </div>

        <section className="painel-grade">
          <div className="malha" style={{ gridTemplateColumns: colunas }}>
            <div className="canto" />
            {Array.from({ length: dias }, (_, d) => (
              <div key={d} className="dia">
                {DIAS[d]}
              </div>
            ))}

            {linhas.map((l, i) =>
              l.tipo === "faixa" ? (
                <div key={`f${i}`} className="faixa-turno">
                  <span>{l.turno}</span>
                  <em>{l.nota}</em>
                </div>
              ) : (
                <Fragment key={`h${l.h.indice}`}>
                  <div className="hora">
                    <strong>{l.h.codigo}</strong>
                    <em>{l.h.rotulo}</em>
                  </div>
                  {Array.from({ length: dias }, (_, d) => {
                    const aula = daGrade.get(chave(d, l.h.indice));
                    const motivo = fatiaEscolhida
                      ? motivoDe(fatiaEscolhida, d, l.h.indice)
                      : null;
                    const foraDoTurno = l.h.turno !== turnoDoPeriodo;
                    const classe = aula
                      ? aula.fixada
                        ? "ocupada travada"
                        : "ocupada"
                      : fatiaEscolhida
                        ? motivo
                          ? "impedida"
                          : "apta"
                        : foraDoTurno
                          ? "fora"
                          : "neutra";
                    return (
                      <div
                        key={d}
                        aria-label={`${DIAS[d]}, ${l.h.codigo}`}
                        className={`celula ${classe} ${foraDoTurno ? "contraturno" : ""}`}
                        onClick={() =>
                          aula ? remover(d, l.h.indice) : alocar(d, l.h.indice)
                        }
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          if (aula) alternarFixada(d, l.h.indice);
                        }}
                      >
                        {aula ? (
                          <>
                            <span className="nome">{aula.disciplina}</span>
                            <span className="meta">
                              {curto(aula.professor)}
                              {aula.sala ? " · " : ""}
                              {aula.sala &&
                                (trocando === chave(d, l.h.indice) ? (
                                  <select
                                    aria-label="Sala"
                                    autoFocus
                                    value={aula.salaId ?? ""}
                                    onClick={(ev) => ev.stopPropagation()}
                                    onChange={(ev) => trocarSala(aula, ev.target.value === "" ? null : Number(ev.target.value))}
                                    onBlur={() => setTrocando(null)}
                                  >
                                    {salasParaTroca(aula).map((s) => (
                                      <option key={s.id ?? "sem"} value={s.id ?? ""}>
                                        {s.rotulo}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <button
                                    type="button"
                                    className="trocar-sala"
                                    aria-label={`Trocar sala de ${aula.disciplina}`}
                                    title="Trocar a sala"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setTrocando(chave(d, l.h.indice));
                                    }}
                                  >
                                    {aula.sala}
                                  </button>
                                ))}
                            </span>
                            {aula.fixada ? <Cadeado /> : null}
                            {foraDoTurno ? <span className="ponto" /> : null}
                          </>
                        ) : motivo ? (
                          <span className="motivo">{motivo}</span>
                        ) : fatiaEscolhida ? (
                          <span className="alocar">Alocar</span>
                        ) : null}
                      </div>
                    );
                  })}
                </Fragment>
              ),
            )}
          </div>

          <div className="legenda">
            <span>
              <i className="sw apta" /> Apta à seleção
            </span>
            <span>
              <i className="sw impedida" /> Impedida — motivo na célula
            </span>
            <span>
              <i className="sw travada" /> Travada — o gerador não move
            </span>
            <span>
              <i className="sw fora" /> Fora do turno do período
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

/** Cadeado da aula travada: estado, não alerta — por isso sem cor própria. */
function Cadeado() {
  return (
    <svg className="cadeado" width="9" height="11" viewBox="0 0 9 11" aria-label="fixada">
      <rect x="0.5" y="4.5" width="8" height="6" rx="1" fill="none" stroke="currentColor" />
      <path d="M2.5 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" />
    </svg>
  );
}
