import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { config, consultar, transacao, type Instrucao } from "../db";
import { DIAS, type Horario, type Periodo, type Sala } from "../tipos";
import { Erro, Vazio, mensagemErro } from "../componentes/ui";

/** "Marina Sousa" → "M. Sousa": a célula é estreita e o sobrenome basta. */
function curto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return nome;
  return `${partes[0][0]}. ${partes[partes.length - 1]}`;
}

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
  turno: string | null;
}

interface Aula {
  periodo: number;
  dia: number;
  hora: number;
  disciplina_id: number;
  professor_id: number;
  sala_id: number | null;
  disciplina: string;
  professor: string;
  sala: string | null;
  fixada: number;
}

export default function GradeManual({ cursoId }: { cursoId: number }) {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodo, setPeriodo] = useState<number | null>(null);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [dias, setDias] = useState(6);
  const [fatias, setFatias] = useState<Fatia[]>([]);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [salasPorDisciplina, setSalasPorDisciplina] = useState<Map<number, number[]>>(
    new Map(),
  );
  const [indisponiveis, setIndisponiveis] = useState<Set<string>>(new Set());
  const [turnosSabado, setTurnosSabado] = useState<string[]>(["manha"]);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const idFatia = (f: { disciplina_id: number; professor_id: number }) =>
    `${f.disciplina_id}:${f.professor_id}`;

  const carregar = useCallback(async () => {
    // A grade mostra só os turnos que o curso ocupa: um curso diurno não
    // precisa das cinco linhas da noite vazias na tela.
    const [curso] = await consultar<{ turnos: string }>(
      "SELECT turnos FROM cursos WHERE id = ?",
      [cursoId],
    );
    const turnos = (curso?.turnos ?? "manha,tarde").split(",").filter(Boolean);
    const todos = await consultar<Horario>("SELECT * FROM horarios ORDER BY indice");
    setHorarios(todos.filter((h) => turnos.includes(h.turno)));
    setDias(Number((await config("dias_letivos")) ?? 6));
    setTurnosSabado(((await config("turnos_sabado")) ?? "manha").split(",").filter(Boolean));
    setSalas(await consultar<Sala>("SELECT * FROM salas ORDER BY nome COLLATE NOCASE"));

    const ps = await consultar<Periodo>(
      "SELECT * FROM periodos WHERE curso_id = ? ORDER BY numero",
      [cursoId],
    );
    setPeriodos(ps);
    setPeriodo((p) => (p != null && ps.some((x) => x.numero === p) ? p : (ps[0]?.numero ?? null)));

    setFatias(
      await consultar<Fatia>(
        `SELECT dp.disciplina_id, dp.professor_id, d.nome AS disciplina,
                COALESCE(NULLIF(d.abreviacao, ''), d.nome) AS disciplina_curta,
                p.nome AS professor, dp.aulas, d.periodo, d.permite_sabado,
                d.exige_sala, d.tipo_sala, d.turno
           FROM disciplina_professores dp
           JOIN disciplinas d ON d.id = dp.disciplina_id
           JOIN professores p ON p.id = dp.professor_id
          WHERE d.curso_id = ?
          ORDER BY d.periodo, d.nome COLLATE NOCASE, p.nome COLLATE NOCASE`,
        [cursoId],
      ),
    );

    // A grade inteira do curso: um professor não pode estar em dois períodos
    // do mesmo curso no mesmo horário, então o outro período importa.
    setAulas(
      await consultar<Aula>(
        `SELECT a.periodo, a.dia, a.hora, a.disciplina_id, a.professor_id, a.sala_id,
                a.fixada, COALESCE(NULLIF(d.abreviacao, ''), d.nome) AS disciplina,
                p.nome AS professor, s.nome AS sala
           FROM alocacoes a
           JOIN disciplinas d ON d.id = a.disciplina_id
           JOIN professores p ON p.id = a.professor_id
           LEFT JOIN salas s ON s.id = a.sala_id
          WHERE a.curso_id = ?`,
        [cursoId],
      ),
    );

    const ds = await consultar<{ disciplina_id: number; sala_id: number }>(
      `SELECT ds.disciplina_id, ds.sala_id FROM disciplina_salas ds
         JOIN disciplinas d ON d.id = ds.disciplina_id WHERE d.curso_id = ?`,
      [cursoId],
    );
    const mapa = new Map<number, number[]>();
    ds.forEach((r) =>
      mapa.set(r.disciplina_id, [...(mapa.get(r.disciplina_id) ?? []), r.sala_id]),
    );
    setSalasPorDisciplina(mapa);

    const ind = await consultar<{ professor_id: number; dia: number; hora: number }>(
      "SELECT professor_id, dia, hora FROM indisponibilidades",
    );
    setIndisponiveis(new Set(ind.map((i) => `${i.professor_id}:${chave(i.dia, i.hora)}`)));
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

  const alocadas = useMemo(() => {
    const m = new Map<string, number>();
    aulas.forEach((a) => {
      const k = idFatia(a);
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return m;
  }, [aulas]);

  const daGrade = useMemo(() => {
    const m = new Map<string, Aula>();
    aulas.filter((a) => a.periodo === periodo).forEach((a) => m.set(chave(a.dia, a.hora), a));
    return m;
  }, [aulas, periodo]);

  const fatiasDoPeriodo = fatias.filter((f) => f.periodo === periodo);
  const fatiaEscolhida = fatias.find((f) => idFatia(f) === escolhida) ?? null;

  /**
   * Por que esta célula não aceita a fatia escolhida. `null` = aceita.
   * As checagens são as restrições duras; turno é preferência e não bloqueia.
   */
  function impedimento(f: Fatia, dia: number, hora: number): string | null {
    if (daGrade.has(chave(dia, hora))) return "Já há aula neste horário";
    if ((alocadas.get(idFatia(f)) ?? 0) >= f.aulas)
      return `${f.aulas} de ${f.aulas} aulas já alocadas`;
    if (dia === 5 && !f.permite_sabado) return "Sábado desmarcado no cadastro";
    if (dia === 5 && !turnosSabado.includes(horarios.find((h) => h.indice === hora)!.turno))
      return "Sábado só tem aula de manhã";
    if (indisponiveis.has(`${f.professor_id}:${chave(dia, hora)}`))
      return `${curto(f.professor)} indisponível`;

    const ocupado = aulas.find(
      (a) => a.professor_id === f.professor_id && a.dia === dia && a.hora === hora,
    );
    if (ocupado) return `${curto(f.professor)} no ${ocupado.periodo}º período`;

    if (f.exige_sala && salaLivre(f, dia, hora) === undefined) {
      // Dizer QUAL sala e por quem está tomada: "nenhuma sala livre" não
      // sugere o que fazer a seguir.
      const candidata = salasCandidatas(f)[0];
      const tomada = aulas.find(
        (a) => a.sala_id === candidata && a.dia === dia && a.hora === hora,
      );
      const nome = salas.find((s) => s.id === candidata)?.nome;
      return tomada && nome
        ? `Sala ${nome} ocupada (${tomada.periodo}º per.)`
        : "Nenhuma sala aceitável livre";
    }

    return null;
  }

  /** As salas que atendem o requisito da disciplina, na ordem de tentativa. */
  function salasCandidatas(f: Fatia): number[] {
    const especificas = salasPorDisciplina.get(f.disciplina_id);
    const lista = f.tipo_sala
      ? salas.filter((s) => s.tipo === f.tipo_sala)
      : especificas && especificas.length > 0
        ? salas.filter((s) => especificas.includes(s.id))
        : salas;
    return lista.map((s) => s.id);
  }

  /** Primeira sala que atende o requisito e está livre. `null` = não usa sala. */
  function salaLivre(f: Fatia, dia: number, hora: number): number | null | undefined {
    if (!f.exige_sala) return null;
    const candidatas = salasCandidatas(f).map(
      (id) => salas.find((s) => s.id === id)!,
    );
    const ocupadas = new Set(
      aulas.filter((a) => a.dia === dia && a.hora === hora).map((a) => a.sala_id),
    );
    return candidatas.find((s) => !ocupadas.has(s.id))?.id;
  }

  async function alocar(dia: number, hora: number) {
    if (!fatiaEscolhida || periodo == null) return;
    const motivo = impedimento(fatiaEscolhida, dia, hora);
    if (motivo) return setErro(motivo);
    setErro("");
    const sala = salaLivre(fatiaEscolhida, dia, hora) ?? null;
    try {
      await transacao([
        {
          sql: `INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id,
                                       professor_id, sala_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [
            cursoId,
            periodo,
            dia,
            hora,
            fatiaEscolhida.disciplina_id,
            fatiaEscolhida.professor_id,
            sala,
          ],
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
    if (!confirm(`Apagar todas as aulas do ${periodo}º período?`)) return;
    const instrucoes: Instrucao[] = [
      {
        sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ?",
        params: [cursoId, periodo],
      },
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
  // Um período cujo turno não tem horário nenhum cadastrado não tem onde
  // acontecer: a grade inteira vira contraturno, o que parece defeito da tela
  // mas é lacuna do cadastro.
  const semHorariosNoTurno =
    turnoDoPeriodo != null && !horarios.some((h) => h.turno === turnoDoPeriodo);
  const turnosExistentes = [...new Set(horarios.map((h) => h.turno))]
    .map((t) => `${t} (${horarios.filter((h) => h.turno === t).length})`)
    .join(", ");

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
        nota:
          h.turno === turnoDoPeriodo
            ? `turno do ${periodo}º período`
            : "fora do turno · tolerado",
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
          <button className="perigo" onClick={limparPeriodo} disabled={daGrade.size === 0}>
            Limpar período
          </button>
        </div>
      </header>

      <Erro>{erro}</Erro>

      {semHorariosNoTurno && (
        <p className="aviso">
          O {periodo}º período é de <strong>{turnoDoPeriodo}</strong>, mas não há
          nenhum horário desse turno cadastrado — por isso a grade toda aparece
          escurecida como contraturno.
          <br />
          Os horários que existem são: <strong>{turnosExistentes || "nenhum"}</strong>.
          Repare que o código de um horário (M1, T2…) é só um rótulo: quem manda
          é o turno gravado nele. Ajuste em <strong>Horários › Regras</strong>, ou
          mude o turno do período.
        </p>
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
                      ? impedimento(fatiaEscolhida, d, l.h.indice)
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
                              {aula.sala ? ` · ${aula.sala}` : ""}
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
