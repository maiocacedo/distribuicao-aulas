import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef, ColumnFiltersState } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { consultar, executar, transacao, type Instrucao } from "../db";
import { Ocupacao } from "../regras/ocupacao";
import { reatribuirSalas } from "../regras/reatribuir";
import type { AulaOcupada, FatiaRegras } from "../regras/tipos";
import { DIAS, TIPOS_SALA, type Sala } from "../tipos";
import { Alerta } from "@/componentes/alerta";
import { BarraDeFiltros, type DefinicaoDeFiltro } from "@/componentes/barra-de-filtros";
import { BotaoIcone } from "@/componentes/botao-icone";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { Campo } from "@/componentes/campo";
import { useConfirmar } from "@/componentes/confirmacao";
import { DialogoFormulario, useAlterado } from "@/componentes/dialogo-formulario";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { Seletor, type Opcao } from "@/componentes/seletor";
import { TabelaDados, pertence, useTabela } from "@/componentes/tabela-dados";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { mensagemErro } from "@/lib/erros";

interface Linha extends Sala {
  n_disciplinas: number;
  n_aulas: number;
}

const vazio = (): Sala => ({ id: 0, nome: "", tipo: "Sala de Aula", capacidade: 40 });

/** Id que nenhum curso tem: a sala é da instituição, e esta tela não monta a grade de curso nenhum. */
const NENHUM_CURSO = 0;

/** Mensagem de validação por campo do formulário; fica junto do campo, não no alerta. */
type ErrosDeCampo = Partial<Record<"nome" | "tipo" | "capacidade", string>>;

const SEM_ERROS: ErrosDeCampo = {};

/** O `id` é o da coluna filtrada, que usa `pertence` como `filterFn`. */
const DEFINICOES_DE_FILTRO: DefinicaoDeFiltro[] = [
  { id: "tipo", titulo: "Tipo", opcoes: TIPOS_SALA.map((t) => ({ valor: t, rotulo: t })) },
];

/** Zero vira travessão: numa coluna de contagens, o que salta é quem tem algo. */
const contagem = (n: number) => n || "—";

/** O que a mudança de tipo faz com as aulas da sala: o que gravar e o que contar ao usuário. */
interface PlanoDeAulas {
  instrucoes: Instrucao[];
  /** Aulas que passam para outra sala. */
  trocadas: number;
  /** Dessas, as que estavam fixadas. */
  fixadas: number;
}

const SEM_MUDANCA: PlanoDeAulas = { instrucoes: [], trocadas: 0, fixadas: 0 };

export default function Salas() {
  const confirmar = useConfirmar();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<Sala | null>(null);
  const [erro, setErro] = useState("");
  const [erroDoFormulario, setErroDoFormulario] = useState("");
  const [errosDeCampo, setErrosDeCampo] = useState<ErrosDeCampo>(SEM_ERROS);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  // Estado, e não uma lista montada no corpo: o `useTabela` compara por referência.
  const [filtros, setFiltros] = useState<ColumnFiltersState>([]);
  const alterado = useAlterado(edicao);

  const carregar = useCallback(async () => {
    setLinhas(
      await consultar<Linha>(`
        SELECT s.*,
               (SELECT COUNT(*) FROM disciplina_salas ds WHERE ds.sala_id = s.id)
                 AS n_disciplinas,
               (SELECT COUNT(*) FROM alocacoes a WHERE a.sala_id = s.id) AS n_aulas
        FROM salas s
        ORDER BY s.nome COLLATE NOCASE`),
    );
    setCarregando(false);
    setErro("");
  }, []);

  // A falha de carga aparece na página, venha da abertura da tela ou da recarga
  // depois de gravar: nos dois casos o que está errado é a lista.
  const recarregar = useCallback(() => carregar().catch((e) => setErro(String(e))), [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const abrir = useCallback((s: Sala) => {
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    setEdicao(s);
  }, []);

  /**
   * O que mudar o tipo da sala faz com as aulas que estão nela: a aula cuja
   * disciplina exige um tipo que a sala deixa de ter (D7) vai para outra sala
   * válida e livre no mesmo horário; a que não achar sala é apagada, com
   * confirmação. Vale para todos os cursos — a sala é da instituição.
   * `null` = o usuário cancelou e nada deve ser gravado.
   */
  async function prepararAulas(salaId: number, tipo: string): Promise<PlanoDeAulas | null> {
    if (linhas.find((l) => l.id === salaId)?.tipo === tipo) return SEM_MUDANCA;
    const atingidas = await consultar<{
      curso_id: number;
      periodo: number;
      dia: number;
      hora: number;
      disciplina_id: number;
      professor_id: number;
      fixada: number;
      tipo_sala: string;
      permite_sabado: number;
      turno: FatiaRegras["turno"];
      ofertada: number;
      disciplina: string;
      curso: string;
      codigo: string;
    }>(
      `SELECT a.curso_id, a.periodo, a.dia, a.hora, a.disciplina_id, a.professor_id, a.fixada,
              d.tipo_sala, d.permite_sabado, d.turno, d.ofertada,
              d.nome AS disciplina, c.nome AS curso, h.codigo
         FROM alocacoes a
         JOIN disciplinas d ON d.id = a.disciplina_id
         JOIN cursos c ON c.id = a.curso_id
         JOIN horarios h ON h.indice = a.hora
        WHERE a.sala_id = ? AND d.exige_sala = 1 AND d.tipo_sala IS NOT NULL AND d.tipo_sala <> ?
        ORDER BY c.nome COLLATE NOCASE, a.curso_id, a.periodo, a.dia, a.hora`,
      [salaId, tipo],
    );
    if (atingidas.length === 0) return SEM_MUDANCA;

    // A sala entra já com o tipo novo: é contra ele que as outras são comparadas.
    const salas = (await consultar<{ id: number; tipo: string }>("SELECT id, tipo FROM salas ORDER BY id")).map(
      (x) => (x.id === salaId ? { ...x, tipo } : x),
    );
    const todas = (
      await consultar<{
        curso_id: number;
        periodo: number;
        dia: number;
        hora: number;
        disciplina_id: number;
        professor_id: number;
        sala_id: number | null;
      }>("SELECT curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id FROM alocacoes")
    ).map(
      (a): AulaOcupada => ({
        cursoId: a.curso_id,
        periodo: a.periodo,
        dia: a.dia,
        hora: a.hora,
        disciplinaId: a.disciplina_id,
        professorId: a.professor_id,
        salaId: a.sala_id,
      }),
    );
    // Nenhum curso está em montagem: a escolha de sala só consulta professor e
    // sala, que a ocupação guarda para todos os cursos.
    const oc = new Ocupacao(NENHUM_CURSO, todas);
    const { trocas, semSala } = reatribuirSalas(
      { salas },
      oc,
      atingidas.map((a) => ({
        a,
        aula: {
          cursoId: a.curso_id,
          periodo: a.periodo,
          dia: a.dia,
          hora: a.hora,
          disciplinaId: a.disciplina_id,
          professorId: a.professor_id,
          salaId,
        },
        fatia: {
          disciplinaId: a.disciplina_id,
          professorId: a.professor_id,
          periodo: a.periodo,
          permiteSabado: !!a.permite_sabado,
          turno: a.turno,
          exigeSala: true,
          tipoSala: a.tipo_sala,
          salas: [],
          ofertada: !!a.ofertada,
        },
      })),
    );

    if (semSala.length > 0) {
      const fixadas = semSala.filter((x) => x.a.fixada).length;
      const MAXIMO = 10;
      const quais = semSala
        .slice(0, MAXIMO)
        .map((x) => `${x.a.curso}, ${x.a.periodo}º período, ${DIAS[x.a.dia]} ${x.a.codigo} — ${x.a.disciplina}`);
      if (semSala.length > MAXIMO) quais.push(`… e mais ${semSala.length - MAXIMO}`);
      if (
        !(await confirmar({
          titulo: "Apagar aulas sem sala?",
          descricao:
            `${semSala.length} aula(s) serão apagadas, porque não há outra sala do tipo exigido livre no horário` +
            (fixadas ? ` (${fixadas} fixada(s))` : "") +
            "." +
            (trocas.length ? ` Outras ${trocas.length} aula(s) trocam de sala.` : ""),
          itens: quais,
          confirmar: `Salvar e apagar ${semSala.length} aula(s)`,
          perigo: true,
        }))
      )
        return null;
    }

    const chave = (a: (typeof atingidas)[number]) => [a.curso_id, a.periodo, a.dia, a.hora];
    return {
      instrucoes: [
        ...semSala.map((x) => ({
          sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
          params: chave(x.a),
        })),
        ...trocas.map((t) => ({
          sql: "UPDATE alocacoes SET sala_id = ? WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
          params: [t.sala, ...chave(t.item.a)],
        })),
      ],
      trocadas: trocas.length,
      fixadas: trocas.filter((t) => t.item.a.fixada).length,
    };
  }

  async function salvar(s: Sala) {
    // Cada tentativa começa limpa. O erro de campo também sai aqui, e não só ao
    // mudar o campo: um controle que não limpa o próprio erro ao mudar deixaria
    // a mensagem velha (e o `aria-invalid`) sobreviver a uma nova tentativa.
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    const nome = s.nome.trim();
    const tipo = s.tipo.trim();
    // Validação de campo: a mensagem vai para o campo e o diálogo leva o foco até o primeiro.
    const erros: ErrosDeCampo = {};
    if (!nome) erros.nome = "O nome é obrigatório.";
    if (!tipo) erros.tipo = "O tipo é obrigatório.";
    // `min` e `step` do campo numérico barravam negativo e decimal no navegador.
    if (!Number.isInteger(s.capacidade) || s.capacidade < 0) erros.capacidade = "Capacidade inválida.";
    if (Object.keys(erros).length > 0) return setErrosDeCampo(erros);
    setSalvando(true);
    let plano = SEM_MUDANCA;
    try {
      if (s.id) {
        // Tudo o que consulta o banco fica dentro do `try`, e as aulas mudam
        // na mesma transação da sala: ou vale tudo, ou nada.
        const preparado = await prepararAulas(s.id, tipo);
        if (!preparado) return;
        plano = preparado;
        await transacao([
          {
            sql: "UPDATE salas SET nome = ?, tipo = ?, capacidade = ? WHERE id = ?",
            params: [nome, tipo, s.capacidade, s.id],
          },
          ...plano.instrucoes,
        ]);
      } else {
        await executar("INSERT INTO salas (nome, tipo, capacidade) VALUES (?, ?, ?)", [nome, tipo, s.capacidade]);
      }
    } catch (e) {
      return setErroDoFormulario(mensagemErro(e, "A sala"));
    } finally {
      setSalvando(false);
    }
    // Só chega aqui o que foi gravado. A recarga fica fora do `try`: se ela
    // falhar, a sala está salva e o formulário já fechou; a falha é da lista e
    // aparece na página, não num diálogo que não existe mais.
    setEdicao(null);
    // Aula que trocou de sala sem ninguém ter pedido: a tela conta, e conta
    // também quando a mesma gravação apagou outras (o diálogo só avisou do que
    // ia acontecer; o aviso diz o que aconteceu, com as fixadas).
    if (plano.trocadas > 0)
      avisar.sucesso(
        `${plano.trocadas} aula(s) mudaram de sala`,
        plano.fixadas ? `${plano.fixadas} delas estavam fixadas.` : undefined,
      );
    await recarregar();
  }

  const remover = useCallback(
    async (l: Linha) => {
      if (l.n_aulas > 0 || l.n_disciplinas > 0) {
        avisar.erro(
          `${l.nome} está em uso: ${l.n_aulas} aula(s) na grade e ` +
            `${l.n_disciplinas} disciplina(s) que a exigem.`,
        );
        return;
      }
      if (!(await confirmar({ titulo: `Remover a sala ${l.nome}?`, confirmar: "Remover sala", perigo: true }))) return;
      try {
        await executar("DELETE FROM salas WHERE id = ?", [l.id]);
      } catch (e) {
        return avisar.erro(mensagemErro(e, "A sala"));
      }
      // Fora do `try`, como em `salvar`: falha da recarga não é falha da remoção.
      await recarregar();
    },
    [confirmar, recarregar],
  );

  // As colunas não podem ser recriadas a cada desenho: ver `useTabela`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colunas = useMemo<ColumnDef<Linha, any>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => <span className="font-semibold">{row.original.nome}</span>,
      },
      { accessorKey: "tipo", header: "Tipo", filterFn: pertence },
      {
        accessorKey: "capacidade",
        header: "Capacidade",
        meta: { numerico: true },
        sortDescFirst: true,
      },
      {
        accessorKey: "n_disciplinas",
        header: "Exigida por",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.n_disciplinas),
      },
      {
        accessorKey: "n_aulas",
        header: "Aulas",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.n_aulas),
      },
      {
        id: "acoes",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => (
          <>
            <BotaoIcone rotulo="Editar" icone={Pencil} aoClicar={() => abrir(row.original)} />
            <BotaoIcone rotulo="Remover" icone={Trash2} perigo aoClicar={() => void remover(row.original)} />
          </>
        ),
      },
    ],
    [abrir, remover],
  );

  const tabela = useTabela({
    dados: linhas,
    colunas,
    ordemInicial: [{ id: "nome", desc: false }],
    desempate: (l) => l.nome,
    busca,
    // O tipo também é buscado: quem digita "laboratório" quer as salas desse tipo.
    textoDeBusca: (l) => `${l.nome} ${l.tipo}`,
    filtros,
  });

  // Um valor antigo fora da lista continua visível, para editar a sala não
  // trocar o tipo dela sem querer.
  const tipos: Opcao<string>[] = edicao
    ? [...new Set<string>([...TIPOS_SALA, edicao.tipo])].filter(Boolean).map((t) => ({ valor: t, rotulo: t }))
    : [];

  return (
    <>
      <CabecalhoPagina
        titulo="Salas"
        escopo="Instituição · comuns a todos os cursos"
        contagem={`${tabela.getRowModel().rows.length} de ${linhas.length}`}
        busca={busca}
        aoBuscar={setBusca}
      >
        <Button onClick={() => abrir(vazio())}>Nova sala</Button>
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      {/* Sem sala nenhuma não há o que filtrar. */}
      {linhas.length > 0 && (
        <BarraDeFiltros definicoes={DEFINICOES_DE_FILTRO} valor={filtros} aoMudar={setFiltros} />
      )}

      {carregando ? null : (
        <TabelaDados
          tabela={tabela}
          vazio={
            <EstadoVazio>
              {linhas.length === 0 ? (
                "Nenhuma sala cadastrada. Disciplinas que não ocupam sala não precisam de nenhuma aqui."
              ) : (
                <>
                  Nenhuma sala encontrada.{" "}
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
        <DialogoFormulario
          titulo={edicao.id ? "Editar sala" : "Nova sala"}
          alterado={alterado}
          salvando={salvando}
          erro={erroDoFormulario}
          aoFechar={() => setEdicao(null)}
          aoSalvar={() => void salvar(edicao)}
        >
          <Campo rotulo="Nome" erro={errosDeCampo.nome}>
            {(a) => (
              <Input
                {...a}
                autoFocus
                value={edicao.nome}
                onChange={(e) => {
                  setEdicao({ ...edicao, nome: e.target.value });
                  // Quem voltou a digitar no campo já leu a mensagem dele.
                  setErrosDeCampo((erros) => ({ ...erros, nome: undefined }));
                }}
              />
            )}
          </Campo>

          <Campo
            rotulo="Tipo"
            dica="É por aqui que uma disciplina exige laboratório sem exigir uma sala específica."
            erro={errosDeCampo.tipo}
          >
            {(a) => (
              <Seletor
                {...a}
                className="w-full"
                valor={edicao.tipo}
                opcoes={tipos}
                aoMudar={(tipo) => {
                  setEdicao({ ...edicao, tipo });
                  setErrosDeCampo((erros) => ({ ...erros, tipo: undefined }));
                }}
              />
            )}
          </Campo>

          <Campo rotulo="Capacidade" erro={errosDeCampo.capacidade}>
            {(a) => (
              <Input
                {...a}
                type="number"
                min={0}
                value={edicao.capacidade}
                onChange={(e) => {
                  setEdicao({ ...edicao, capacidade: Number(e.target.value) });
                  setErrosDeCampo((erros) => ({ ...erros, capacidade: undefined }));
                }}
              />
            )}
          </Campo>
        </DialogoFormulario>
      )}
    </>
  );
}
