import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { consultar, executar } from "../db";
import type { Professor } from "../tipos";
import { Alerta } from "@/componentes/alerta";
import { BotaoIcone } from "@/componentes/botao-icone";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { Campo } from "@/componentes/campo";
import { useConfirmar } from "@/componentes/confirmacao";
import { DialogoFormulario, useAlterado } from "@/componentes/dialogo-formulario";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { Seletor, type Opcao } from "@/componentes/seletor";
import { TabelaDados, useTabela } from "@/componentes/tabela-dados";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { Textarea } from "@/componentes/ui/textarea";
import { mensagemErro } from "@/lib/erros";

interface Linha extends Professor {
  n_disciplinas: number;
  aulas_total: number;
  n_indisponibilidades: number;
}

const PREFERENCIAS: Opcao<Professor["pref_dias"]>[] = [
  { valor: "indiferente", rotulo: "Indiferente" },
  { valor: "consecutivos", rotulo: "Dias seguidos" },
  { valor: "intercalados", rotulo: "Dias alternados" },
];

const vazio = (): Professor => ({
  id: 0,
  nome: "",
  pref_dias: "indiferente",
  pref_dias_peso: 2,
  max_dias_semana: null,
  observacao: null,
});

/** Mensagem de validação por campo do formulário; fica junto do campo, não no alerta. */
type ErrosDeCampo = Partial<Record<"nome", string>>;

const SEM_ERROS: ErrosDeCampo = {};

/** Zero vira travessão: numa coluna de contagens, o que salta é quem tem algo. */
const contagem = (n: number) => n || "—";

export default function Professores() {
  const confirmar = useConfirmar();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<Professor | null>(null);
  const [erro, setErro] = useState("");
  const [erroDoFormulario, setErroDoFormulario] = useState("");
  const [errosDeCampo, setErrosDeCampo] = useState<ErrosDeCampo>(SEM_ERROS);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const alterado = useAlterado(edicao);

  const carregar = useCallback(async () => {
    setLinhas(
      await consultar<Linha>(`
        SELECT p.*,
               (SELECT COUNT(*) FROM disciplina_professores dp
                 WHERE dp.professor_id = p.id) AS n_disciplinas,
               COALESCE((SELECT SUM(aulas) FROM disciplina_professores dp
                 WHERE dp.professor_id = p.id), 0) AS aulas_total,
               (SELECT COUNT(*) FROM indisponibilidades i
                 WHERE i.professor_id = p.id) AS n_indisponibilidades
        FROM professores p
        ORDER BY p.nome COLLATE NOCASE`),
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

  const abrir = useCallback((p: Professor) => {
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    setEdicao(p);
  }, []);

  async function salvar(p: Professor) {
    setErroDoFormulario("");
    const nome = p.nome.trim();
    // Validação de campo: a mensagem vai para o campo e o diálogo leva o foco até ele.
    if (!nome) return setErrosDeCampo({ nome: "O nome é obrigatório." });
    setSalvando(true);
    try {
      // D15 é regra dura: baixar o máximo abaixo do que a grade já usa deixaria
      // aulas inválidas, e não há como escolher sozinho qual dia sai. A consulta
      // fica dentro do `try`: se ela falhar, o erro tem de aparecer na tela.
      if (p.id && p.max_dias_semana != null) {
        const [{ n }] = await consultar<{ n: number }>(
          "SELECT COUNT(DISTINCT dia) AS n FROM alocacoes WHERE professor_id = ?",
          [p.id],
        );
        if (n > p.max_dias_semana)
          return setErroDoFormulario(
            `${nome} já dá aula em ${n} dias da semana, somando todos os cursos. ` +
              `Tire aulas dele na grade antes de baixar o máximo para ${p.max_dias_semana}.`,
          );
      }
      if (p.id) {
        await executar(
          `UPDATE professores SET nome = ?, pref_dias = ?, pref_dias_peso = ?,
                  max_dias_semana = ?, observacao = ? WHERE id = ?`,
          [nome, p.pref_dias, p.pref_dias_peso, p.max_dias_semana, p.observacao, p.id],
        );
      } else {
        await executar(
          `INSERT INTO professores (nome, pref_dias, pref_dias_peso, max_dias_semana, observacao)
           VALUES (?, ?, ?, ?, ?)`,
          [nome, p.pref_dias, p.pref_dias_peso, p.max_dias_semana, p.observacao],
        );
      }
    } catch (e) {
      return setErroDoFormulario(mensagemErro(e, "O professor"));
    } finally {
      setSalvando(false);
    }
    // Só chega aqui o que foi gravado. A recarga fica fora do `try`: se ela
    // falhar, o professor está salvo e o formulário já fechou; a falha é da
    // lista e aparece na página, não num diálogo que não existe mais.
    setEdicao(null);
    await recarregar();
  }

  const remover = useCallback(
    async (l: Linha) => {
      if (l.n_disciplinas > 0) {
        avisar.erro(
          `${l.nome} tem ${l.n_disciplinas} disciplina(s) atribuída(s). ` +
            "Tire-o dessas disciplinas antes de removê-lo.",
        );
        return;
      }
      if (!(await confirmar({ titulo: `Remover ${l.nome}?`, confirmar: "Remover professor", perigo: true }))) return;
      try {
        await executar("DELETE FROM professores WHERE id = ?", [l.id]);
      } catch (e) {
        return avisar.erro(mensagemErro(e, "O professor"));
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
      {
        accessorKey: "n_disciplinas",
        header: "Disciplinas",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.n_disciplinas),
      },
      {
        accessorKey: "aulas_total",
        header: "Aulas",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.aulas_total),
      },
      {
        id: "preferencia",
        header: "Preferência de dias",
        enableSorting: false,
        cell: ({ row: { original: l } }) => (
          <>
            {l.pref_dias === "indiferente" ? (
              <span className="text-tx3">indiferente</span>
            ) : (
              <>
                {PREFERENCIAS.find((p) => p.valor === l.pref_dias)?.rotulo}
                <span
                  className="ml-1.5 inline-block rounded-[3px] bg-poco px-[5px] text-[10px] text-tx2 tabular-nums"
                  title="peso da preferência"
                >
                  {l.pref_dias_peso}
                </span>
              </>
            )}
            {l.max_dias_semana ? <span className="text-tx3"> · máx. {l.max_dias_semana} dias</span> : null}
          </>
        ),
      },
      {
        accessorKey: "n_indisponibilidades",
        header: "Indisponível",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.n_indisponibilidades),
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
    textoDeBusca: (l) => l.nome,
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Professores"
        escopo="Instituição · comuns a todos os cursos"
        contagem={`${tabela.getRowModel().rows.length} de ${linhas.length}`}
        busca={busca}
        aoBuscar={setBusca}
      >
        <Button onClick={() => abrir(vazio())}>Novo professor</Button>
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      {carregando ? null : (
        <TabelaDados
          tabela={tabela}
          vazio={
            <EstadoVazio>
              {linhas.length === 0
                ? "Nenhum professor cadastrado ainda."
                : "Nenhum professor com esse nome."}
            </EstadoVazio>
          }
        />
      )}

      {edicao && (
        <DialogoFormulario
          titulo={edicao.id ? "Editar professor" : "Novo professor"}
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
            rotulo="Preferência de distribuição dos dias"
            dica="Como o professor prefere que os dias de aula dele fiquem espalhados na semana."
          >
            {(a) => (
              <Seletor
                {...a}
                className="w-full"
                valor={edicao.pref_dias}
                opcoes={PREFERENCIAS}
                aoMudar={(pref_dias) => setEdicao({ ...edicao, pref_dias })}
              />
            )}
          </Campo>

          {edicao.pref_dias !== "indiferente" && (
            <Campo
              rotulo={`Peso da preferência: ${edicao.pref_dias_peso}`}
              dica="0 ignora, 3 é o mais forte. Continua sendo preferência, não regra."
            >
              {(a) => (
                <input
                  {...a}
                  type="range"
                  className="w-full accent-primary"
                  min={0}
                  max={3}
                  value={edicao.pref_dias_peso}
                  onChange={(e) => setEdicao({ ...edicao, pref_dias_peso: Number(e.target.value) })}
                />
              )}
            </Campo>
          )}

          <Campo
            rotulo="Máximo de dias na semana"
            dica="Em quantos dias distintos ele pode aparecer. Deixe vazio para não limitar."
          >
            {(a) => (
              <Input
                {...a}
                type="number"
                min={1}
                max={7}
                value={edicao.max_dias_semana ?? ""}
                onChange={(e) =>
                  setEdicao({ ...edicao, max_dias_semana: e.target.value ? Number(e.target.value) : null })
                }
              />
            )}
          </Campo>

          <Campo rotulo="Observação">
            {(a) => (
              <Textarea
                {...a}
                rows={2}
                value={edicao.observacao ?? ""}
                onChange={(e) => setEdicao({ ...edicao, observacao: e.target.value || null })}
              />
            )}
          </Campo>
        </DialogoFormulario>
      )}
    </>
  );
}
