import { useEffect, useMemo, useState } from "react";
import { consultar, executar, proximoId, transacao, type Instrucao } from "../db";
import type { Disciplina, Periodo, Professor, Sala, TipoDisciplina, Turno } from "../tipos";
import {
  BotaoIcone,
  CabecalhoLista,
  Campo,
  Erro,
  Lapis,
  Lixeira,
  Modal,
  Ordenavel,
  Vazio,
  comparar,
  mensagemErro,
  type Ordem,
} from "../componentes/ui";
import { RequisitoSala, modoDe, type Modo } from "../componentes/RequisitoSala";
import { PropriedadesDisciplina } from "./Tipos";

interface Fatia {
  professor_id: number;
  aulas: number;
}

type Campo = "periodo" | "nome" | "aulas_semanais" | "professores" | "marcas";

/**
 * As marcas viram um texto ordenável para que disciplinas com o mesmo
 * comportamento fiquem juntas — é assim que se acha "todas as sem sala".
 */
function marcasDe(l: Linha): string {
  return [
    !l.exige_sala ? "sem sala" : "",
    l.tipo_sala ? `só ${l.tipo_sala}` : "",
    l.n_salas > 0 ? `${l.n_salas} sala(s)` : "",
    l.blocos_livres ? "livre" : "",
    l.permite_sabado ? "sábado" : "",
    l.turno ?? "",
    l.prioridade !== 2 ? `prio. ${l.prioridade === 1 ? "alta" : "baixa"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

interface Linha extends Disciplina {
  tipo_nome: string | null;
  professores: string | null;
  aulas_distribuidas: number;
  n_salas: number;
  n_aulas: number;
}

/** Estado do formulário: a disciplina mais as duas listas ligadas a ela. */
interface Rascunho extends Disciplina {
  fatias: Fatia[];
  salas: number[];
  /** O modo escolhido na tela; ver `modoDe` sobre por que não é derivado. */
  modoSala: Modo;
}

const novo = (cursoId: number, periodo: number): Rascunho => ({
  id: 0,
  curso_id: cursoId,
  nome: "",
  abreviacao: null,
  tipo_id: null,
  periodo,
  aulas_semanais: 4,
  permite_sabado: 0,
  turno: null,
  optativa: 0,
  ofertada: 1,
  exige_sala: 1,
  tipo_sala: null,
  blocos_livres: 0,
  prioridade: 2,
  observacao: null,
  fatias: [],
  salas: [],
  modoSala: "qualquer",
});

export default function Disciplinas({ cursoId }: { cursoId: number }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [tipos, setTipos] = useState<TipoDisciplina[]>([]);
  const [aulasComPadrao, setChsComPadrao] = useState<Set<number>>(new Set());
  // Conversão currículo → grade, definida na página Curso.
  const [horasPorAula, setHorasPorAula] = useState(15);
  const [filtro, setFiltro] = useState<number | "todos">("todos");
  const [edicao, setEdicao] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [ordem, setOrdem] = useState<Ordem<Campo>>({ campo: "periodo", desc: false });
  const [busca, setBusca] = useState("");

  async function carregar() {
    setLinhas(
      await consultar<Linha>(`
        SELECT d.*, t.nome AS tipo_nome,
               (SELECT GROUP_CONCAT(p.nome || ' (' || dp.aulas || ')', ', ')
                  FROM disciplina_professores dp
                  JOIN professores p ON p.id = dp.professor_id
                 WHERE dp.disciplina_id = d.id) AS professores,
               COALESCE((SELECT SUM(aulas) FROM disciplina_professores dp
                          WHERE dp.disciplina_id = d.id), 0) AS aulas_distribuidas,
               (SELECT COUNT(*) FROM disciplina_salas ds
                 WHERE ds.disciplina_id = d.id) AS n_salas,
               (SELECT COUNT(*) FROM alocacoes a
                 WHERE a.disciplina_id = d.id) AS n_aulas
        FROM disciplinas d
        LEFT JOIN tipos_disciplina t ON t.id = d.tipo_id
        WHERE d.curso_id = ?
        ORDER BY d.periodo, d.nome COLLATE NOCASE`, [cursoId]),
    );
    setPeriodos(
      await consultar<Periodo>(
        "SELECT * FROM periodos WHERE curso_id = ? ORDER BY numero", [cursoId]),
    );
    setProfessores(
      await consultar<Professor>("SELECT * FROM professores ORDER BY nome COLLATE NOCASE"),
    );
    setSalas(await consultar<Sala>("SELECT * FROM salas ORDER BY nome COLLATE NOCASE"));
    setTipos(
      await consultar<TipoDisciplina>(
        "SELECT * FROM tipos_disciplina ORDER BY nome COLLATE NOCASE",
      ),
    );
    const chs = await consultar<{ aulas: number }>("SELECT DISTINCT aulas FROM padroes_blocos");
    setChsComPadrao(new Set(chs.map((c) => c.aulas)));
    const [curso] = await consultar<{ horas_por_aula_semanal: number }>(
      "SELECT horas_por_aula_semanal FROM cursos WHERE id = ?", [cursoId]);
    setHorasPorAula(curso?.horas_por_aula_semanal || 15);
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, [cursoId]);

  async function abrir(l: Linha) {
    const fatias = await consultar<Fatia>(
      "SELECT professor_id, aulas FROM disciplina_professores WHERE disciplina_id = ?",
      [l.id],
    );
    const ds = await consultar<{ sala_id: number }>(
      "SELECT sala_id FROM disciplina_salas WHERE disciplina_id = ?",
      [l.id],
    );
    const escolhidas = ds.map((s) => s.sala_id);
    setEdicao({
      ...l,
      fatias,
      salas: escolhidas,
      modoSala: modoDe({ ...l, salas: escolhidas }),
    });
  }

  async function salvar(d: Rascunho) {
    setErro("");
    const nome = d.nome.trim();
    if (!nome) return setErro("O nome é obrigatório.");
    if (d.fatias.length === 0) {
      return setErro("Atribua a disciplina a pelo menos um professor.");
    }
    const soma = d.fatias.reduce((s, f) => s + f.aulas, 0);
    if (soma !== d.aulas_semanais) {
      return setErro(
        `As fatias dos professores somam ${soma} aula(s), mas a disciplina tem ` +
          `${d.aulas_semanais}. Os dois têm de fechar.`,
      );
    }
    if (d.fatias.some((f) => !f.professor_id)) {
      return setErro("Há uma fatia sem professor escolhido.");
    }

    const campos = [
      cursoId,
      nome,
      d.abreviacao?.trim() || null,
      d.tipo_id,
      d.periodo,
      d.aulas_semanais,
      d.permite_sabado,
      d.turno,
      d.optativa,
      d.exige_sala,
      d.tipo_sala,
      d.blocos_livres,
      d.prioridade,
      d.observacao,
    ];

    try {
      // Uma transação só para as três tabelas. O id é reservado antes de abrir
      // a transação porque `last_insert_rowid()` não serve de referência: ele
      // muda a cada INSERT seguinte dentro da mesma transação.
      const id = d.id || (await proximoId("disciplinas"));
      const mantidos = d.fatias.map((f) => f.professor_id);
      const marcadores = mantidos.map(() => "?").join(",");

      const instrucoes: Instrucao[] = [
        d.id
          ? {
              sql: `UPDATE disciplinas SET curso_id = ?, nome = ?, abreviacao = ?,
                           tipo_id = ?, periodo = ?, aulas_semanais = ?,
                           permite_sabado = ?, turno = ?, optativa = ?,
                           exige_sala = ?, tipo_sala = ?, blocos_livres = ?,
                           prioridade = ?, observacao = ?
                      WHERE id = ?`,
              params: [...campos, id],
            }
          : {
              sql: `INSERT INTO disciplinas (curso_id, nome, abreviacao, tipo_id,
                           periodo, aulas_semanais, permite_sabado, turno,
                           optativa, exige_sala, tipo_sala, blocos_livres,
                           prioridade, observacao, id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              params: [...campos, id],
            },

        // As aulas já alocadas referenciam (disciplina, professor). Tirar um
        // professor que ainda tem aula na grade viola a chave estrangeira — e
        // é isso mesmo que deve acontecer: primeiro se limpa a grade dele.
        {
          sql: `DELETE FROM disciplina_professores
                 WHERE disciplina_id = ? AND professor_id NOT IN (${marcadores})`,
          params: [id, ...mantidos],
        },

        ...d.fatias.map((f) => ({
          sql: `INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas)
                VALUES (?, ?, ?)
                ON CONFLICT(disciplina_id, professor_id) DO UPDATE SET aulas = excluded.aulas`,
          params: [id, f.professor_id, f.aulas],
        })),

        { sql: "DELETE FROM disciplina_salas WHERE disciplina_id = ?", params: [id] },

        // Lista específica e requisito por tipo são alternativas: só uma das
        // duas chega a ter conteúdo, garantido pelo seletor de modo.
        ...(d.exige_sala && !d.tipo_sala
          ? d.salas.map((sala) => ({
              sql: "INSERT INTO disciplina_salas (disciplina_id, sala_id) VALUES (?, ?)",
              params: [id, sala],
            }))
          : []),
      ];

      await transacao(instrucoes);
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A disciplina"));
      await carregar();
    }
  }

  async function remover(l: Linha) {
    if (!confirm(`Remover ${l.nome}? As ${l.n_aulas} aula(s) dela na grade saem junto.`))
      return;
    setErro("");
    try {
      await executar("DELETE FROM disciplinas WHERE id = ?", [l.id]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A disciplina"));
    }
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let recorte = filtro === "todos" ? linhas : linhas.filter((l) => l.periodo === filtro);
    if (termo) recorte = recorte.filter((l) => l.nome.toLowerCase().includes(termo));
    const comMarcas = recorte.map((l) => ({ ...l, marcas: marcasDe(l) }));
    return comparar(comMarcas, ordem, (l) => `${l.periodo}${l.nome}`);
  }, [linhas, filtro, ordem, busca]);

  if (!carregando && periodos.length === 0) {
    return (
      <>
        <header className="cabecalho-pagina">
          <h1>Disciplinas</h1>
        </header>
        <Vazio>
          Cadastre os períodos do curso primeiro — uma disciplina precisa
          pertencer a um.
        </Vazio>
      </>
    );
  }

  return (
    <>
      <CabecalhoLista
        titulo="Disciplinas"
        escopo={`Curso · ${linhas.reduce((s, l) => s + l.aulas_semanais, 0)} aulas por semana`}
        contagem={`${visiveis.length} de ${linhas.length}`}
        filtro={busca}
        aoFiltrar={setBusca}
      >
        <div className="acoes-cabecalho">
          <select
            value={filtro}
            onChange={(e) =>
              setFiltro(e.target.value === "todos" ? "todos" : Number(e.target.value))
            }
          >
            <option value="todos">Todos os períodos</option>
            {periodos.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.numero}º período
              </option>
            ))}
          </select>
          <button
            className="primario"
            disabled={professores.length === 0}
            title={
              professores.length === 0 ? "Cadastre um professor antes" : undefined
            }
            onClick={() =>
              setEdicao(novo(cursoId, filtro === "todos" ? periodos[0].numero : filtro))
            }
          >
            Nova disciplina
          </button>
        </div>
      </CabecalhoLista>

      <Erro>{erro}</Erro>

      {carregando ? null : visiveis.length === 0 ? (
        <Vazio>Nenhuma disciplina neste recorte.</Vazio>
      ) : (
        <table className="lista">
          <thead>
            <tr>
              <Ordenavel campo="periodo" ordem={ordem} aoOrdenar={setOrdem} numerico centro>
                Período
              </Ordenavel>
              <Ordenavel campo="nome" ordem={ordem} aoOrdenar={setOrdem}>
                Disciplina
              </Ordenavel>
              <Ordenavel campo="aulas_semanais" ordem={ordem} aoOrdenar={setOrdem} numerico centro>
                Aulas
              </Ordenavel>
              <Ordenavel campo="professores" ordem={ordem} aoOrdenar={setOrdem}>
                Professores
              </Ordenavel>
              <Ordenavel campo="marcas" ordem={ordem} aoOrdenar={setOrdem}>
                Marcas
              </Ordenavel>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td className="num centro fraco">{l.periodo}º</td>
                <td>
                  <span className="forte">{l.nome}</span>
                  {l.tipo_nome && <span className="fraco"> · {l.tipo_nome}</span>}
                </td>
                <td className="num centro">
                  {l.aulas_semanais}
                  {l.aulas_distribuidas !== l.aulas_semanais && (
                    <span className="aviso-inline" title="fatias não fecham com a CH">
                      !
                    </span>
                  )}
                </td>
                <td>
                  {l.professores ?? <span className="fraco">sem professor</span>}
                </td>
                <td>
                  {!l.exige_sala && <span className="marca-prop">sem sala</span>}
                  {l.n_salas > 0 && (
                    <span className="marca-prop">{l.n_salas} sala(s)</span>
                  )}
                  {l.blocos_livres ? <span className="marca-prop">livre</span> : null}
                  {l.permite_sabado ? <span className="marca-prop">sábado</span> : null}
                  {l.turno && <span className="marca-prop">{l.turno}</span>}
                  {l.prioridade !== 2 && (
                    <span className="marca-prop">
                      prio. {l.prioridade === 1 ? "alta" : "baixa"}
                    </span>
                  )}
                </td>
                <td className="acoes">
                  <BotaoIcone rotulo="Editar" aoClicar={() => abrir(l)}>
                    <Lapis />
                  </BotaoIcone>
                  <BotaoIcone rotulo="Remover" perigo aoClicar={() => remover(l)}>
                    <Lixeira />
                  </BotaoIcone>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edicao && (
        <Editor
          valor={edicao}
          periodos={periodos}
          professores={professores}
          salas={salas}
          tipos={tipos}
          aulasComPadrao={aulasComPadrao}
          horasPorAula={horasPorAula}
          aoMudar={setEdicao}
          aoSalvar={salvar}
          aoFechar={() => setEdicao(null)}
        />
      )}
    </>
  );
}

function Editor({
  valor,
  periodos,
  professores,
  salas,
  tipos,
  aulasComPadrao,
  horasPorAula,
  aoMudar,
  aoSalvar,
  aoFechar,
}: {
  valor: Rascunho;
  periodos: Periodo[];
  professores: Professor[];
  salas: Sala[];
  tipos: TipoDisciplina[];
  aulasComPadrao: Set<number>;
  horasPorAula: number;
  aoMudar: (v: Rascunho) => void;
  aoSalvar: (v: Rascunho) => void;
  aoFechar: () => void;
}) {
  const soma = valor.fatias.reduce((s, f) => s + f.aulas, 0);
  const fecha = soma === valor.aulas_semanais;
  const turnoPeriodo = periodos.find((p) => p.numero === valor.periodo)?.turno;
  const semPadrao = !valor.blocos_livres && !aulasComPadrao.has(valor.aulas_semanais);

  const aplicarTipo = (id: number | null) => {
    const t = tipos.find((x) => x.id === id);
    if (!t) return aoMudar({ ...valor, tipo_id: null });
    // O molde traz o requisito de sala junto, então o modo tem de acompanhar.
    aoMudar({
      ...valor,
      tipo_id: t.id,
      exige_sala: t.exige_sala,
      tipo_sala: t.tipo_sala,
      salas: [],
      modoSala: modoDe({ exige_sala: t.exige_sala, tipo_sala: t.tipo_sala, salas: [] }),
      blocos_livres: t.blocos_livres,
      prioridade: t.prioridade,
      permite_sabado: t.permite_sabado,
      optativa: t.optativa,
    });
  };

  const disponiveis = professores.filter(
    (p) => !valor.fatias.some((f) => f.professor_id === p.id),
  );

  return (
    <Modal
      titulo={valor.id ? "Editar disciplina" : "Nova disciplina"}
      aoFechar={aoFechar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(valor);
        }}
      >
        <div className="linha-campos">
          <Campo rotulo="Nome">
            <input
              autoFocus
              value={valor.nome}
              onChange={(e) => aoMudar({ ...valor, nome: e.target.value })}
            />
          </Campo>
          <Campo
            rotulo="Abreviação"
            dica="Como aparece na célula da grade. Vazio usa o nome completo."
          >
            <input
              className="curto-medio"
              placeholder={valor.nome.slice(0, 18)}
              value={valor.abreviacao ?? ""}
              onChange={(e) =>
                aoMudar({ ...valor, abreviacao: e.target.value || null })
              }
            />
          </Campo>
        </div>

        <div className="linha-campos">
          <Campo rotulo="Período">
            <select
              value={valor.periodo}
              onChange={(e) => aoMudar({ ...valor, periodo: Number(e.target.value) })}
            >
              {periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.numero}º ({p.turno})
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Aulas por semana">
            <input
              type="number"
              min={1}
              max={40}
              value={valor.aulas_semanais}
              onChange={(e) =>
                aoMudar({ ...valor, aulas_semanais: Number(e.target.value) })
              }
            />
          </Campo>
          <Campo
            rotulo="Carga do currículo"
            dica={`${horasPorAula}h equivalem a 1 aula por semana`}
          >
            <input
              type="number"
              min={0}
              step={horasPorAula}
              value={valor.aulas_semanais * horasPorAula}
              onChange={(e) =>
                aoMudar({
                  ...valor,
                  aulas_semanais: Math.max(
                    1,
                    Math.round(Number(e.target.value) / horasPorAula),
                  ),
                })
              }
            />
          </Campo>
        </div>

        {semPadrao && (
          <p className="aviso">
            Não há padrões de bloco cadastrados para {valor.aulas_semanais} aula(s). O gerador
            não saberá como dividir essa carga — cadastre os padrões na página
            Curso, ou marque a disciplina como "blocos livres".
          </p>
        )}

        {tipos.length > 0 && (
          <Campo
            rotulo="Tipo"
            dica="Preenche as propriedades abaixo de uma vez. Depois você pode ajustar cada uma."
          >
            <select
              value={valor.tipo_id ?? ""}
              onChange={(e) =>
                aplicarTipo(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Sem tipo</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <fieldset>
          <legend>
            Professores
            <span className={fecha ? "contador ok" : "contador falta"}>
              {soma} de {valor.aulas_semanais} aulas
            </span>
          </legend>
          <p className="explica">
            A carga pode ser repartida entre vários professores. Cada fatia é
            planejada em blocos próprios, como se fosse uma disciplina.
          </p>
          {valor.fatias.map((f, i) => (
            <div key={i} className="linha-fatia">
              <select
                value={f.professor_id}
                onChange={(e) => {
                  const fatias = [...valor.fatias];
                  fatias[i] = { ...f, professor_id: Number(e.target.value) };
                  aoMudar({ ...valor, fatias });
                }}
              >
                <option value={0}>escolha…</option>
                {professores.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={
                      p.id !== f.professor_id &&
                      valor.fatias.some((o) => o.professor_id === p.id)
                    }
                  >
                    {p.nome}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="curto"
                min={1}
                value={f.aulas}
                onChange={(e) => {
                  const fatias = [...valor.fatias];
                  fatias[i] = { ...f, aulas: Number(e.target.value) };
                  aoMudar({ ...valor, fatias });
                }}
              />
              <button
                type="button"
                className="perigo"
                onClick={() =>
                  aoMudar({
                    ...valor,
                    fatias: valor.fatias.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          {disponiveis.length > 0 && (
            <button
              type="button"
              onClick={() =>
                aoMudar({
                  ...valor,
                  fatias: [
                    ...valor.fatias,
                    {
                      professor_id: disponiveis[0].id,
                      aulas: Math.max(1, valor.aulas_semanais - soma),
                    },
                  ],
                })
              }
            >
              Adicionar professor
            </button>
          )}
        </fieldset>

        <PropriedadesDisciplina
          valor={valor}
          aoMudar={(v) => aoMudar({ ...valor, ...v })}
        />

        <Campo
          rotulo="Turno"
          dica={`Por padrão segue o período (${turnoPeriodo ?? "—"}). Forçar outro turno é o que joga a disciplina no contraturno.`}
        >
          <select
            value={valor.turno ?? ""}
            onChange={(e) =>
              aoMudar({ ...valor, turno: (e.target.value || null) as Turno | null })
            }
          >
            <option value="">Segue o período</option>
            <option value="manha">Manhã</option>
            <option value="tarde">Tarde</option>
            <option value="noite">Noite</option>
          </select>
        </Campo>

        <RequisitoSala
          valor={valor}
          modo={valor.modoSala}
          salas={salas}
          permitirEspecificas
          aoMudar={(v, m) =>
            aoMudar({ ...valor, ...v, salas: v.salas ?? [], modoSala: m })
          }
        />

        <Campo rotulo="Observação">
          <textarea
            rows={2}
            value={valor.observacao ?? ""}
            onChange={(e) =>
              aoMudar({ ...valor, observacao: e.target.value || null })
            }
          />
        </Campo>

        <div className="rodape-modal">
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="primario" disabled={!fecha}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
