import { useEffect, useMemo, useState } from "react";
import { consultar, executar, proximoId, transacao } from "../../db";
import type { Periodo, Professor, Sala, TipoDisciplina } from "../../tipos";
import {
  BotaoIcone,
  CabecalhoLista,
  Erro,
  Lapis,
  Lixeira,
  Ordenavel,
  Vazio,
  comparar,
  mensagemErro,
  type Ordem,
} from "../../componentes/legado";
import { useConfirmar } from "../../componentes/confirmacao";
import { modoDe } from "../../componentes/RequisitoSala";
import { marcasDe } from "./colunas";
import { EditorDisciplina } from "./EditorDisciplina";
import { novo, prepararAulas, montarInstrucoes, validarRascunho, type Fatia, type Linha, type Rascunho } from "./salvar";

type Campo = "periodo" | "nome" | "aulas_semanais" | "professores" | "marcas";

export default function Disciplinas({ cursoId }: { cursoId: number }) {
  const confirmar = useConfirmar();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [tipos, setTipos] = useState<TipoDisciplina[]>([]);
  const [aulasComPadrao, setChsComPadrao] = useState<Set<number>>(new Set());
  // Conversão currículo → grade, definida em Gerenciar cursos.
  const [horasPorAula, setHorasPorAula] = useState(15);
  const [turnosDoCurso, setTurnosDoCurso] = useState<string[]>(["manha", "tarde"]);
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
    const [curso] = await consultar<{ horas_por_aula_semanal: number; turnos: string }>(
      "SELECT horas_por_aula_semanal, turnos FROM cursos WHERE id = ?", [cursoId]);
    setHorasPorAula(curso?.horas_por_aula_semanal || 15);
    setTurnosDoCurso((curso?.turnos ?? "manha,tarde").split(",").filter(Boolean));
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
    const ds = await consultar<{ sala_id: number; preferencia: number }>(
      "SELECT sala_id, preferencia FROM disciplina_salas WHERE disciplina_id = ?",
      [l.id],
    );
    const escolhidas = ds.map((s) => s.sala_id);
    setEdicao({
      ...l,
      fatias,
      salas: escolhidas,
      aceitaveis: ds.filter((s) => s.preferencia === 2).map((s) => s.sala_id),
      modoSala: modoDe({ ...l, salas: escolhidas }),
    });
  }

  async function salvar(d: Rascunho) {
    setErro("");
    const recusa = validarRascunho(d);
    if (recusa) return setErro(recusa);

    try {
      // Tudo o que consulta o banco fica dentro do `try`: uma falha aqui tem de
      // aparecer na tela, não sumir numa promessa rejeitada.
      const aulas = d.id
        ? await prepararAulas(d, { cursoId, linhas, professores, salas })
        : { antes: [], depois: [], apagadas: null };
      if (aulas.recusa !== undefined) return setErro(aulas.recusa);

      const { apagadas } = aulas;
      if (apagadas) {
        if (
          !(await confirmar({
            titulo: "Apagar aulas desta disciplina?",
            descricao:
              `${apagadas.total} aula(s) desta disciplina serão apagadas, porque deixam de valer com a mudança` +
              (apagadas.fixadas ? ` (${apagadas.fixadas} fixada(s))` : "") +
              "." +
              (apagadas.trocadas ? ` Outras ${apagadas.trocadas} aula(s) trocam de sala.` : ""),
            itens: apagadas.itens,
            confirmar: `Salvar e apagar ${apagadas.total} aula(s)`,
            perigo: true,
          }))
        )
          return;
      }

      // Uma transação só para as três tabelas. O id é reservado antes de abrir
      // a transação porque `last_insert_rowid()` não serve de referência: ele
      // muda a cada INSERT seguinte dentro da mesma transação.
      const id = d.id || (await proximoId("disciplinas"));

      await transacao(montarInstrucoes(cursoId, d, id, aulas));
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A disciplina"));
      await carregar();
    }
  }

  async function remover(l: Linha) {
    if (
      !(await confirmar({
        titulo: `Remover ${l.nome}?`,
        descricao: `As ${l.n_aulas} aula(s) dela na grade saem junto.`,
        confirmar: "Remover disciplina",
        perigo: true,
      }))
    )
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
                  {!l.ofertada && <span className="marca-prop">não ofertada</span>}
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
        <EditorDisciplina
          valor={edicao}
          periodos={periodos}
          professores={professores}
          salas={salas}
          tipos={tipos}
          aulasComPadrao={aulasComPadrao}
          horasPorAula={horasPorAula}
          turnosDoCurso={turnosDoCurso}
          aoMudar={setEdicao}
          aoSalvar={salvar}
          aoFechar={() => setEdicao(null)}
        />
      )}
    </>
  );
}
