import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { config, consultar, transacao, type Instrucao } from "../db";
import { DIAS, type Horario, type Professor } from "../tipos";
import { Erro, Vazio, mensagemErro } from "../componentes/ui";

const chave = (dia: number, hora: number) => `${dia}-${hora}`;

interface Ocupada {
  dia: number;
  hora: number;
  periodo: number;
  disciplina: string;
}

export default function Indisponibilidades() {
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [dias, setDias] = useState(6);
  const [atual, setAtual] = useState<number | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupadas, setOcupadas] = useState<Map<string, Ocupada>>(new Map());
  const [contagens, setContagens] = useState<Record<number, number>>({});
  const [erro, setErro] = useState("");

  // O que está gravado no banco. O arrastar mexe só em `marcados`; ao soltar,
  // a diferença entre os dois vira INSERT/DELETE.
  const salvos = useRef<Set<string>>(new Set());
  const arrastando = useRef<null | "marcar" | "desmarcar">(null);

  async function carregarBase() {
    setProfessores(
      await consultar<Professor>("SELECT * FROM professores ORDER BY nome COLLATE NOCASE"),
    );
    setHorarios(await consultar<Horario>("SELECT * FROM horarios ORDER BY indice"));
    setDias(Number((await config("dias_letivos")) ?? 6));
    await recontar();
  }

  async function recontar() {
    const linhas = await consultar<{ professor_id: number; n: number }>(
      "SELECT professor_id, COUNT(*) AS n FROM indisponibilidades GROUP BY professor_id",
    );
    setContagens(Object.fromEntries(linhas.map((l) => [l.professor_id, l.n])));
  }

  const carregarProfessor = useCallback(async (id: number) => {
    const linhas = await consultar<{ dia: number; hora: number }>(
      "SELECT dia, hora FROM indisponibilidades WHERE professor_id = ?",
      [id],
    );
    const conjunto = new Set(linhas.map((l) => chave(l.dia, l.hora)));
    salvos.current = new Set(conjunto);
    setMarcados(conjunto);

    const aulas = await consultar<Ocupada>(
      `SELECT a.dia, a.hora, a.periodo, d.nome AS disciplina
         FROM alocacoes a JOIN disciplinas d ON d.id = a.disciplina_id
        WHERE a.professor_id = ?`,
      [id],
    );
    setOcupadas(new Map(aulas.map((a) => [chave(a.dia, a.hora), a])));
  }, []);

  useEffect(() => {
    carregarBase().catch((e) => setErro(String(e)));
  }, []);

  useEffect(() => {
    if (atual != null) carregarProfessor(atual).catch((e) => setErro(String(e)));
  }, [atual, carregarProfessor]);

  /** Grava a diferença entre o que está na tela e o que está no banco. */
  async function persistir(conjunto: Set<string>) {
    if (atual == null) return;
    const inserir = [...conjunto].filter((k) => !salvos.current.has(k));
    const remover = [...salvos.current].filter((k) => !conjunto.has(k));
    if (inserir.length === 0 && remover.length === 0) return;

    setErro("");
    // Um arrasto vira uma transação só: ou a faixa inteira entra, ou nenhuma.
    const instrucoes: Instrucao[] = [
      ...inserir.map((k) => {
        const [dia, hora] = k.split("-").map(Number);
        return {
          sql:
            "INSERT OR IGNORE INTO indisponibilidades (professor_id, dia, hora)" +
            " VALUES (?, ?, ?)",
          params: [atual, dia, hora],
        };
      }),
      ...remover.map((k) => {
        const [dia, hora] = k.split("-").map(Number);
        return {
          sql:
            "DELETE FROM indisponibilidades" +
            " WHERE professor_id = ? AND dia = ? AND hora = ?",
          params: [atual, dia, hora],
        };
      }),
    ];
    try {
      await transacao(instrucoes);
      salvos.current = new Set(conjunto);
      await recontar();
    } catch (e) {
      setErro(mensagemErro(e, "A indisponibilidade"));
      await carregarProfessor(atual);
    }
  }

  function pintar(dia: number, hora: number, modo: "marcar" | "desmarcar") {
    if (ocupadas.has(chave(dia, hora))) return;
    setMarcados((antes) => {
      const k = chave(dia, hora);
      if (modo === "marcar" ? antes.has(k) : !antes.has(k)) return antes;
      const novo = new Set(antes);
      if (modo === "marcar") novo.add(k);
      else novo.delete(k);
      return novo;
    });
  }

  // Soltar o botão em qualquer lugar encerra o arrasto e grava.
  useEffect(() => {
    const soltar = () => {
      if (!arrastando.current) return;
      arrastando.current = null;
      setMarcados((atualSet) => {
        persistir(atualSet);
        return atualSet;
      });
    };
    window.addEventListener("mouseup", soltar);
    return () => window.removeEventListener("mouseup", soltar);
  });

  function alternarBloco(filtro: (dia: number, hora: number) => boolean) {
    const alvos: string[] = [];
    for (let d = 0; d < dias; d++)
      for (const h of horarios)
        if (filtro(d, h.indice) && !ocupadas.has(chave(d, h.indice)))
          alvos.push(chave(d, h.indice));
    const todosMarcados = alvos.every((k) => marcados.has(k));
    const novo = new Set(marcados);
    alvos.forEach((k) => (todosMarcados ? novo.delete(k) : novo.add(k)));
    setMarcados(novo);
    persistir(novo);
  }

  if (professores.length === 0) {
    return (
      <>
        <header className="cabecalho-pagina">
          <h1>Indisponibilidades</h1>
        </header>
        <Vazio>Cadastre os professores primeiro.</Vazio>
      </>
    );
  }

  const professor = professores.find((p) => p.id === atual);

  return (
    <>
      <header className="cabecalho-pagina">
        <div>
          <h1>Indisponibilidades</h1>
          <p className="sub">Horários em que o professor não pode dar aula.</p>
        </div>
      </header>

      <Erro>{erro}</Erro>

      <div className="painel-duplo">
        <ul className="lista-lateral">
          {professores.map((p) => (
            <li key={p.id}>
              <button
                className={p.id === atual ? "ativo" : ""}
                onClick={() => setAtual(p.id)}
              >
                <span>{p.nome}</span>
                {contagens[p.id] ? <em>{contagens[p.id]}</em> : null}
              </button>
            </li>
          ))}
        </ul>

        <div>
          {professor == null ? (
            <Vazio>Escolha um professor para marcar os horários dele.</Vazio>
          ) : (
            <section>
              <h2>{professor.nome}</h2>
              <table className="grade-horarios" onDragStart={(e) => e.preventDefault()}>
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: dias }, (_, d) => (
                      <th key={d}>
                        <button
                          className="cabecalho-clicavel"
                          onClick={() => alternarBloco((dia) => dia === d)}
                        >
                          {DIAS[d].slice(0, 3)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {horarios.map((h, i) => (
                    <Fragment key={h.indice}>
                      {/* A troca de turno ganha um respiro: é onde um bloco de
                          aulas seguidas obrigatoriamente se parte. */}
                      {i > 0 && horarios[i - 1].turno !== h.turno && (
                        <tr className="espacador">
                          <td colSpan={dias + 1} />
                        </tr>
                      )}
                    <tr>
                      <th>
                        <button
                          className="cabecalho-clicavel horario"
                          onClick={() => alternarBloco((_d, hora) => hora === h.indice)}
                        >
                          <strong>{h.codigo}</strong>
                          <em>{h.rotulo}</em>
                        </button>
                      </th>
                      {Array.from({ length: dias }, (_, d) => {
                        const k = chave(d, h.indice);
                        const aula = ocupadas.get(k);
                        const marcado = marcados.has(k);
                        return (
                          <td
                            key={d}
                            aria-label={`${DIAS[d]}, ${h.codigo}`}
                            className={
                              aula ? "ocupada" : marcado ? "indisponivel" : "livre"
                            }
                            title={
                              aula
                                ? `${aula.disciplina} — ${aula.periodo}º período`
                                : undefined
                            }
                            onMouseDown={(e) => {
                              if (e.button !== 0 || aula) return;
                              e.preventDefault();
                              arrastando.current = marcado ? "desmarcar" : "marcar";
                              pintar(d, h.indice, arrastando.current);
                            }}
                            onMouseEnter={() => {
                              if (arrastando.current) pintar(d, h.indice, arrastando.current);
                            }}
                          >
                            {aula ? "•" : marcado ? "×" : ""}
                          </td>
                        );
                      })}
                    </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>

              <dl className="legenda-colunas">
                <dt>
                  <span className="simbolo indisponivel">×</span>
                </dt>
                <dd>Horário em que este professor não pode dar aula.</dd>
                <dt>
                  <span className="simbolo ocupada">•</span>
                </dt>
                <dd>Aula já alocada na grade; não pode ser marcada como indisponível.</dd>
              </dl>

              <div className="acoes-secao">
                <span className="fraco">
                  {marcados.size} horário{marcados.size === 1 ? "" : "s"} indisponível
                  {marcados.size === 1 ? "" : "eis"}
                  {ocupadas.size > 0 && ` · ${ocupadas.size} com aula alocada`}
                </span>
                <button
                  disabled={marcados.size === 0}
                  onClick={() => {
                    setMarcados(new Set());
                    persistir(new Set());
                  }}
                >
                  Limpar tudo
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
