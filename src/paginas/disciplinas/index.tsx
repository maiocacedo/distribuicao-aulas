import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { consultar, executar, proximoId, transacao } from "../../db";
import type { Periodo, Professor, Sala, TipoDisciplina } from "../../tipos";
import { modoDe } from "../../componentes/RequisitoSala";
import { Alerta } from "@/componentes/alerta";
import { BarraDeFiltros, type DefinicaoDeFiltro } from "@/componentes/barra-de-filtros";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { useConfirmar } from "@/componentes/confirmacao";
import { useAlterado } from "@/componentes/dialogo-formulario";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { TabelaDados, useTabela } from "@/componentes/tabela-dados";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { mensagemErro } from "@/lib/erros";
import { COLUNAS_OCULTAS, criarColunas } from "./colunas";
import { EditorDisciplina } from "./EditorDisciplina";
import {
  SEM_AULAS,
  montarInstrucoes,
  novo,
  prepararAulas,
  validarRascunho,
  type ErrosDoRascunho,
  type Fatia,
  type Linha,
  type PlanoAceito,
  type Rascunho,
} from "./salvar";

const SEM_ERROS: ErrosDoRascunho = {};

// Dependem só da linha, como o `useTabela` pede. O período vai na frente do
// nome: em qualquer ordenação, quem empata fica na ordem do currículo.
const desempate = (l: Linha) => `${l.periodo}${l.nome}`;
// Quem procura pela sigla da grade ou pelo professor quer as disciplinas dele.
const textoDeBusca = (l: Linha) => `${l.nome} ${l.abreviacao ?? ""} ${l.professores ?? ""}`;

const SIM_OU_NAO = [
  { valor: 1, rotulo: "Sim" },
  { valor: 0, rotulo: "Não" },
];

export default function Disciplinas({ cursoId }: { cursoId: number }) {
  const confirmar = useConfirmar();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [tipos, setTipos] = useState<TipoDisciplina[]>([]);
  const [aulasComPadrao, setAulasComPadrao] = useState<Set<number>>(new Set());
  // Conversão currículo → grade, definida em Gerenciar cursos.
  const [horasPorAula, setHorasPorAula] = useState(15);
  const [turnosDoCurso, setTurnosDoCurso] = useState<string[]>(["manha", "tarde"]);
  const [edicao, setEdicao] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState("");
  const [erroDoFormulario, setErroDoFormulario] = useState("");
  const [errosDeCampo, setErrosDeCampo] = useState<ErrosDoRascunho>(SEM_ERROS);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  // Estado, e não uma lista montada no corpo: o `useTabela` compara por referência.
  const [filtros, setFiltros] = useState<ColumnFiltersState>([]);
  const alterado = useAlterado(edicao);

  const carregar = useCallback(async () => {
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
    const cargas = await consultar<{ aulas: number }>("SELECT DISTINCT aulas FROM padroes_blocos");
    setAulasComPadrao(new Set(cargas.map((c) => c.aulas)));
    const [curso] = await consultar<{ horas_por_aula_semanal: number; turnos: string }>(
      "SELECT horas_por_aula_semanal, turnos FROM cursos WHERE id = ?", [cursoId]);
    setHorasPorAula(curso?.horas_por_aula_semanal || 15);
    setTurnosDoCurso((curso?.turnos ?? "manha,tarde").split(",").filter(Boolean));
    setCarregando(false);
    setErro("");
  }, [cursoId]);

  // A falha de carga aparece na página, venha da abertura da tela ou da recarga
  // depois de gravar: nos dois casos o que está errado é a lista.
  const recarregar = useCallback(() => carregar().catch((e) => setErro(String(e))), [carregar]);

  useEffect(() => {
    // Trocou de curso: até a recarga chegar, as linhas e os períodos à mostra
    // são do curso anterior, e "Nova disciplina" proporia um período dele.
    setCarregando(true);
    void recarregar();
  }, [recarregar]);

  // O rascunho nasce inteiro, com as fatias, as salas e o modo do requisito:
  // completar depois de abrir contaria como alteração (ver `useAlterado`).
  const abrir = useCallback((d: Rascunho) => {
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    setEdicao(d);
  }, []);

  const editar = useCallback(
    async (l: Linha) => {
      let fatias: Fatia[];
      let ds: { sala_id: number; preferencia: number }[];
      try {
        fatias = await consultar<Fatia>(
          "SELECT professor_id, aulas FROM disciplina_professores WHERE disciplina_id = ?",
          [l.id],
        );
        ds = await consultar<{ sala_id: number; preferencia: number }>(
          "SELECT sala_id, preferencia FROM disciplina_salas WHERE disciplina_id = ?",
          [l.id],
        );
      } catch (e) {
        // Não há formulário ainda onde a falha caiba.
        return avisar.erro(mensagemErro(e, "A disciplina"));
      }
      const escolhidas = ds.map((s) => s.sala_id);
      abrir({
        ...l,
        fatias,
        salas: escolhidas,
        aceitaveis: ds.filter((s) => s.preferencia === 2).map((s) => s.sala_id),
        modoSala: modoDe({ ...l, salas: escolhidas }),
      });
    },
    [abrir],
  );

  /** O período do filtro, quando há exatamente um marcado e ele é deste curso; senão o primeiro. */
  function periodoProposto(): number {
    const marcados = (filtros.find((f) => f.id === "periodo")?.value as number[] | undefined) ?? [];
    return marcados.length === 1 && periodos.some((p) => p.numero === marcados[0]) ? marcados[0] : periodos[0].numero;
  }

  async function salvar(d: Rascunho) {
    // Cada tentativa começa limpa: ver o mesmo trecho em `Salas`.
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    const erros = validarRascunho(d);
    if (erros) return setErrosDeCampo(erros);

    setSalvando(true);
    let plano: PlanoAceito = SEM_AULAS;
    try {
      // Tudo o que consulta o banco fica dentro do `try`: uma falha aqui tem de
      // aparecer no formulário, não sumir numa promessa rejeitada.
      const aulas = d.id ? await prepararAulas(d, { cursoId, linhas, professores, salas }) : SEM_AULAS;
      if (aulas.recusa !== undefined) return setErroDoFormulario(aulas.recusa);

      const { apagadas } = aulas;
      if (
        apagadas &&
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

      // Uma transação só para as três tabelas. O id é reservado antes de abrir
      // a transação porque `last_insert_rowid()` não serve de referência: ele
      // muda a cada INSERT seguinte dentro da mesma transação.
      const id = d.id || (await proximoId("disciplinas"));
      await transacao(montarInstrucoes(cursoId, d, id, aulas));
      plano = aulas;
    } catch (e) {
      return setErroDoFormulario(mensagemErro(e, "A disciplina"));
    } finally {
      setSalvando(false);
    }
    // Só chega aqui o que foi gravado; a falha da recarga é da lista (ver `Salas`).
    setEdicao(null);
    // Aula que trocou de sala sem ninguém ter pedido: a tela conta, e conta
    // também quando a mesma gravação apagou outras (a confirmação só avisou do
    // que ia acontecer).
    if (plano.trocadas > 0)
      avisar.sucesso(
        `${plano.trocadas} aula(s) mudaram de sala`,
        plano.fixadas ? `${plano.fixadas} delas estavam fixadas.` : undefined,
      );
    await recarregar();
  }

  const remover = useCallback(
    async (l: Linha) => {
      if (
        !(await confirmar({
          titulo: `Remover ${l.nome}?`,
          descricao: `As ${l.n_aulas} aula(s) dela na grade saem junto.`,
          confirmar: "Remover disciplina",
          perigo: true,
        }))
      )
        return;
      try {
        await executar("DELETE FROM disciplinas WHERE id = ?", [l.id]);
      } catch (e) {
        return avisar.erro(mensagemErro(e, "A disciplina"));
      }
      // Fora do `try`, como em `salvar`: falha da recarga não é falha da remoção.
      await recarregar();
    },
    [confirmar, recarregar],
  );

  // As colunas não podem ser recriadas a cada desenho: ver `useTabela`.
  const colunas = useMemo(
    () => criarColunas({ abrir: (l) => void editar(l), remover: (l) => void remover(l) }),
    [editar, remover],
  );

  const tabela = useTabela({
    dados: linhas,
    colunas,
    ordemInicial: [{ id: "periodo", desc: false }],
    desempate,
    busca,
    textoDeBusca,
    filtros,
    ocultas: COLUNAS_OCULTAS,
  });

  // O `id` é o da coluna filtrada. Período e tipo vêm dos cadastros; filtro
  // sem opção nenhuma (nenhum tipo cadastrado) não é mostrado.
  const definicoes = useMemo<DefinicaoDeFiltro[]>(
    () =>
      [
        { id: "periodo", titulo: "Período", opcoes: periodos.map((p) => ({ valor: p.numero, rotulo: `${p.numero}º` })) },
        { id: "tipo_id", titulo: "Tipo", opcoes: tipos.map((t) => ({ valor: t.id, rotulo: t.nome })) },
        { id: "optativa", titulo: "Optativa", opcoes: SIM_OU_NAO },
        { id: "ofertada", titulo: "Ofertada", opcoes: SIM_OU_NAO },
        {
          id: "turno",
          titulo: "Turno forçado",
          opcoes: [
            { valor: "manha", rotulo: "Manhã" },
            { valor: "tarde", rotulo: "Tarde" },
          ],
        },
      ].filter((d) => d.opcoes.length > 0),
    [periodos, tipos],
  );

  if (!carregando && periodos.length === 0) {
    return (
      <>
        <CabecalhoPagina titulo="Disciplinas" />
        <Alerta tom="erro">{erro}</Alerta>
        <EstadoVazio>Cadastre os períodos do curso primeiro — uma disciplina precisa pertencer a um.</EstadoVazio>
      </>
    );
  }

  const semProfessores = professores.length === 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Disciplinas"
        escopo={`Curso · ${linhas.reduce((s, l) => s + l.aulas_semanais, 0)} aulas por semana`}
        contagem={`${tabela.getRowModel().rows.length} de ${linhas.length}`}
        busca={busca}
        aoBuscar={setBusca}
      >
        {/* Antes da carga não há período a propor nem como saber se há professor. */}
        {!carregando && (
          <>
            {/* O botão desabilitado não recebe foco nem pouso: o motivo fica à
                vista, ao lado, em vez de numa dica que ninguém alcança. */}
            {semProfessores && (
              <span id="motivo-nova-disciplina" className="text-xs whitespace-nowrap text-tx3">
                Cadastre um professor antes
              </span>
            )}
            <Button
              disabled={semProfessores}
              aria-describedby={semProfessores ? "motivo-nova-disciplina" : undefined}
              onClick={() => abrir(novo(cursoId, periodoProposto()))}
            >
              Nova disciplina
            </Button>
          </>
        )}
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      {/* Sem disciplina nenhuma não há o que filtrar. */}
      {!carregando && linhas.length > 0 && <BarraDeFiltros definicoes={definicoes} valor={filtros} aoMudar={setFiltros} />}

      {carregando ? null : (
        <TabelaDados
          tabela={tabela}
          vazio={
            <EstadoVazio>
              {linhas.length === 0 ? (
                "Nenhuma disciplina cadastrada neste curso."
              ) : (
                <>
                  Nenhuma disciplina encontrada.{" "}
                  <Button
                    variant="link"
                    onClick={() => {
                      setFiltros([]);
                      setBusca("");
                    }}
                  >
                    Limpar busca e filtros
                  </Button>
                </>
              )}
            </EstadoVazio>
          }
        />
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
          alterado={alterado}
          salvando={salvando}
          erro={erroDoFormulario}
          erros={errosDeCampo}
          aoMudar={setEdicao}
          aoCorrigir={(...campos) =>
            // Quem mexeu no campo já leu a mensagem dele.
            setErrosDeCampo((erros) => ({ ...erros, ...Object.fromEntries(campos.map((c) => [c, undefined])) }))
          }
          aoSalvar={(d) => void salvar(d)}
          aoFechar={() => setEdicao(null)}
        />
      )}
    </>
  );
}
