import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { config, consultar, transacao, type Instrucao } from "../db";
import { DIAS, type Horario, type Professor } from "../tipos";
import { Alerta } from "@/componentes/alerta";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { Secao } from "@/componentes/secao";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";

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
  // Falha de carga: a tela não tem como seguir. Falha de gravação é toast.
  // Dois erros porque são de cargas diferentes e cada um sai quando a sua
  // carga dá certo: a lista e as contagens (`erro`), e a malha do professor
  // escolhido (`erroDoProfessor`). Escolher outro professor não apaga o primeiro.
  const [erro, setErro] = useState("");
  const [erroDoProfessor, setErroDoProfessor] = useState("");
  const [carregando, setCarregando] = useState(true);

  // O que está gravado no banco. O arrastar mexe só em `marcados`; ao soltar,
  // a diferença entre os dois vira INSERT/DELETE.
  const salvos = useRef<Set<string>>(new Set());
  const marcadosRef = useRef<Set<string>>(new Set());
  const arrastando = useRef<null | "marcar" | "desmarcar">(null);

  /** O conjunto da tela mora no estado (para desenhar) e no ref (para gravar ao soltar). */
  function definirMarcados(s: Set<string>) {
    marcadosRef.current = s;
    setMarcados(s);
  }

  async function carregarBase() {
    setProfessores(
      await consultar<Professor>("SELECT * FROM professores ORDER BY nome COLLATE NOCASE"),
    );
    setHorarios(await consultar<Horario>("SELECT * FROM horarios ORDER BY indice"));
    setDias(Number((await config("dias_letivos")) ?? 6));
    await recontar();
    setCarregando(false);
  }

  async function recontar() {
    const linhas = await consultar<{ professor_id: number; n: number }>(
      "SELECT professor_id, COUNT(*) AS n FROM indisponibilidades GROUP BY professor_id",
    );
    setContagens(Object.fromEntries(linhas.map((l) => [l.professor_id, l.n])));
    setErro("");
  }

  const carregarProfessor = useCallback(async (id: number) => {
    const linhas = await consultar<{ dia: number; hora: number }>(
      "SELECT dia, hora FROM indisponibilidades WHERE professor_id = ?",
      [id],
    );
    const conjunto = new Set(linhas.map((l) => chave(l.dia, l.hora)));
    salvos.current = new Set(conjunto);
    definirMarcados(conjunto);

    const aulas = await consultar<Ocupada>(
      `SELECT a.dia, a.hora, a.periodo, d.nome AS disciplina
         FROM alocacoes a JOIN disciplinas d ON d.id = a.disciplina_id
        WHERE a.professor_id = ?`,
      [id],
    );
    setOcupadas(new Map(aulas.map((a) => [chave(a.dia, a.hora), a])));
    setErroDoProfessor("");
  }, []);

  useEffect(() => {
    carregarBase().catch((e) => setErro(String(e)));
  }, []);

  useEffect(() => {
    if (atual != null) carregarProfessor(atual).catch((e) => setErroDoProfessor(String(e)));
  }, [atual, carregarProfessor]);

  /** Grava a diferença entre o que está na tela e o que está no banco. */
  async function persistir(conjunto: Set<string>) {
    if (atual == null) return;
    const inserir = [...conjunto].filter((k) => !salvos.current.has(k));
    const remover = [...salvos.current].filter((k) => !conjunto.has(k));
    if (inserir.length === 0 && remover.length === 0) return;

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
    } catch (e) {
      // Sem formulário onde a recusa caiba: aviso, e a malha volta ao que o banco guarda.
      avisar.erro(mensagemErro(e, "A indisponibilidade"));
      await carregarProfessor(atual).catch((falha) => setErroDoProfessor(String(falha)));
      return;
    }
    salvos.current = new Set(conjunto);
    // Fora do `try`: o que já foi gravado não é falha de gravação.
    await recontar().catch((falha) => setErro(String(falha)));
  }

  function pintar(dia: number, hora: number, modo: "marcar" | "desmarcar") {
    if (ocupadas.has(chave(dia, hora))) return;
    const k = chave(dia, hora);
    const antes = marcadosRef.current;
    if (modo === "marcar" ? antes.has(k) : !antes.has(k)) return;
    const novo = new Set(antes);
    if (modo === "marcar") novo.add(k);
    else novo.delete(k);
    definirMarcados(novo);
  }

  /** O fim do arrasto: grava, numa transação só, o que ele pintou. */
  function soltar() {
    if (!arrastando.current) return;
    arrastando.current = null;
    // Gravar fora do updater do estado: no StrictMode o React chama o
    // updater duas vezes, e cada chamada abria uma transação (B10).
    void persistir(marcadosRef.current);
  }

  // Soltar o botão em qualquer lugar encerra o arrasto e grava.
  useEffect(() => {
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
    definirMarcados(novo);
    void persistir(novo);
  }

  if (professores.length === 0) {
    return (
      <>
        <CabecalhoPagina titulo="Indisponibilidades" />
        <Alerta tom="erro">{erro}</Alerta>
        {carregando ? null : <EstadoVazio>Cadastre os professores primeiro.</EstadoVazio>}
      </>
    );
  }

  const professor = professores.find((p) => p.id === atual);
  const n = marcados.size;

  return (
    <>
      <CabecalhoPagina titulo="Indisponibilidades" sub="Horários em que o professor não pode dar aula." />

      <Alerta tom="erro">{erro}</Alerta>
      <Alerta tom="erro">{erroDoProfessor}</Alerta>

      <div className="grid grid-cols-[200px_1fr] items-start gap-[14px]">
        <ul className="rounded-lg bg-panel p-1.5 shadow-[inset_0_0_0_1px_var(--line)]">
          {professores.map((p) => (
            <li key={p.id}>
              {/* O ativo tem fundo, cor E peso: o estado não depende só de cor. */}
              <button
                aria-pressed={p.id === atual}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-[12px]",
                  p.id === atual ? "bg-acc-bg font-semibold text-primary" : "hover:bg-hover",
                )}
                onClick={() => setAtual(p.id)}
              >
                <span>{p.nome}</span>
                {contagens[p.id] ? <span className="text-[10px] text-tx3 tabular-nums">{contagens[p.id]}</span> : null}
              </button>
            </li>
          ))}
        </ul>

        <div>
          {professor == null ? (
            <EstadoVazio>Escolha um professor para marcar os horários dele.</EstadoVazio>
          ) : (
            <Secao titulo={professor.nome}>
              <table className="grade-horarios" onDragStart={(e) => e.preventDefault()}>
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: dias }, (_, d) => (
                      <th key={d}>
                        <button className="cabecalho-clicavel" onClick={() => alternarBloco((dia) => dia === d)}>
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
                              className={aula ? "ocupada" : marcado ? "indisponivel" : "livre"}
                              title={aula ? `${aula.disciplina} — ${aula.periodo}º período` : undefined}
                              onMouseDown={(e) => {
                                if (e.button !== 0 || aula) return;
                                e.preventDefault();
                                arrastando.current = marcado ? "desmarcar" : "marcar";
                                pintar(d, h.indice, arrastando.current);
                              }}
                              onMouseEnter={(e) => {
                                if (!arrastando.current) return;
                                // O botão subiu fora da janela e o `mouseup` não
                                // chegou: o arrasto acabou lá. Sem isto o ponteiro,
                                // de volta, seguiria pintando sem botão apertado.
                                if ((e.buttons & 1) === 0) return soltar();
                                pintar(d, h.indice, arrastando.current);
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

              <dl className="mt-3.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 border-t border-line pt-3 text-xs">
                <dt className="font-semibold whitespace-nowrap text-tx2">
                  <span className="simbolo-celula indisponivel">×</span>
                </dt>
                <dd className="text-tx3">Horário em que este professor não pode dar aula.</dd>
                <dt className="font-semibold whitespace-nowrap text-tx2">
                  <span className="simbolo-celula ocupada">•</span>
                </dt>
                <dd className="text-tx3">Aula já alocada na grade; não pode ser marcada como indisponível.</dd>
              </dl>

              <div className="mt-3 flex items-center gap-2">
                <span className="text-tx3">
                  {n} {n === 1 ? "horário indisponível" : "horários indisponíveis"}
                  {ocupadas.size > 0 && ` · ${ocupadas.size} com aula alocada`}
                </span>
                <Button
                  variant="outline"
                  disabled={n === 0}
                  onClick={() => {
                    definirMarcados(new Set());
                    void persistir(new Set());
                  }}
                >
                  Limpar tudo
                </Button>
              </div>
            </Secao>
          )}
        </div>
      </div>
    </>
  );
}
