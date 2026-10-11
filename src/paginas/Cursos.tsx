import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { consultar, executar, transacao, type Instrucao } from "../db";
import { TURNOS, type Curso } from "../tipos";
import { Alerta } from "@/componentes/alerta";
import { BotaoIcone } from "@/componentes/botao-icone";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { Campo } from "@/componentes/campo";
import { useConfirmar } from "@/componentes/confirmacao";
import { DialogoFormulario, useAlterado } from "@/componentes/dialogo-formulario";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { TabelaDados, useTabela } from "@/componentes/tabela-dados";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { Checkbox } from "@/componentes/ui/checkbox";
import { Input } from "@/componentes/ui/input";
import { Textarea } from "@/componentes/ui/textarea";
import { mensagemErro } from "@/lib/erros";

interface Linha extends Curso {
  n_periodos: number;
  n_disciplinas: number;
  n_aulas: number;
  /** Quantos cursos existem: a linha leva a conta para o "Remover" não depender de `linhas`. */
  n_cursos: number;
}

const vazio = (): Curso => ({
  id: 0,
  nome: "",
  turnos: "manha,tarde",
  horas_por_aula_semanal: 15,
  observacao: null,
});

/** Mensagem de validação por campo do formulário; fica junto do campo, não no alerta. */
type ErrosDeCampo = Partial<Record<"nome" | "turnos" | "horas", string>>;

const SEM_ERROS: ErrosDeCampo = {};

/** Zero vira travessão: numa coluna de contagens, o que salta é quem tem algo. */
const contagem = (n: number) => n || "—";

/** Os turnos do curso como o usuário os lê: "Manhã · Tarde". */
const rotuloDosTurnos = (turnos: string) =>
  turnos
    .split(",")
    .map((t) => TURNOS.find((x) => x.valor === t)?.rotulo ?? t)
    .join(" · ");

export default function Cursos({ aoMudarLista }: { aoMudarLista: () => void }) {
  const confirmar = useConfirmar();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<Curso | null>(null);
  const [erro, setErro] = useState("");
  const [erroDoFormulario, setErroDoFormulario] = useState("");
  const [errosDeCampo, setErrosDeCampo] = useState<ErrosDeCampo>(SEM_ERROS);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const alterado = useAlterado(edicao);
  const idDosTurnos = useId();

  const carregar = useCallback(async () => {
    setLinhas(
      await consultar<Linha>(`
        SELECT c.*,
               (SELECT COUNT(*) FROM periodos p WHERE p.curso_id = c.id) AS n_periodos,
               (SELECT COUNT(*) FROM disciplinas d WHERE d.curso_id = c.id) AS n_disciplinas,
               (SELECT COUNT(*) FROM alocacoes a WHERE a.curso_id = c.id) AS n_aulas,
               (SELECT COUNT(*) FROM cursos) AS n_cursos
        FROM cursos c ORDER BY c.nome COLLATE NOCASE`),
    );
    setCarregando(false);
    setErro("");
    // O seletor de curso da barra lateral acompanha a lista: criar, renomear ou
    // remover um curso muda o que ele mostra.
    aoMudarLista();
  }, [aoMudarLista]);

  // A falha de carga aparece na página, venha da abertura da tela ou da recarga
  // depois de gravar: nos dois casos o que está errado é a lista.
  const recarregar = useCallback(() => carregar().catch((e) => setErro(String(e))), [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const abrir = useCallback((c: Curso) => {
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    setEdicao(c);
  }, []);

  async function salvar(c: Curso) {
    // Cada tentativa começa limpa: ver o mesmo trecho em `Salas`.
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    const nome = c.nome.trim();
    const erros: ErrosDeCampo = {};
    if (!nome) erros.nome = "O nome é obrigatório.";
    if (!c.turnos) erros.turnos = "Escolha ao menos um turno.";
    // O que o `min` e o `step` do campo barravam no navegador, agora com mensagem no campo.
    if (!(c.horas_por_aula_semanal >= 1)) erros.horas = "A conversão tem de ser ao menos 1h.";
    else if (!Number.isInteger(c.horas_por_aula_semanal)) erros.horas = "A conversão tem de ser um número inteiro de horas.";
    if (Object.keys(erros).length > 0) return setErrosDeCampo(erros);
    setSalvando(true);
    try {
      if (c.id) {
        const original = linhas.find((l) => l.id === c.id);
        const novos = c.turnos.split(",");
        const retirados = (original?.turnos ?? "").split(",").filter((t) => t && !novos.includes(t));
        const instrucoes: Instrucao[] = [];
        if (retirados.length > 0) {
          const marc = retirados.map(() => "?").join(",");
          const rotulos = retirados.map((t) => TURNOS.find((x) => x.valor === t)?.rotulo.toLowerCase() ?? t).join(" e ");
          const periodos = await consultar<{ numero: number }>(
            `SELECT numero FROM periodos WHERE curso_id = ? AND turno IN (${marc}) ORDER BY numero`,
            [c.id, ...retirados],
          );
          if (periodos.length > 0)
            return setErroDoFormulario(
              `O turno da ${rotulos} ainda é o do(s) período(s) ${periodos.map((p) => `${p.numero}º`).join(", ")}. ` +
                "Mude o turno deles em Períodos antes.",
            );
          const forcadas = await consultar<{ nome: string }>(
            `SELECT nome FROM disciplinas WHERE curso_id = ? AND turno IN (${marc}) ORDER BY nome`,
            [c.id, ...retirados],
          );
          if (forcadas.length > 0)
            return setErroDoFormulario(
              `As disciplinas ${forcadas.map((d) => d.nome).join(", ")} têm o turno da ${rotulos} forçado. ` +
                "Mude o turno delas em Disciplinas antes.",
            );
          const [{ n }] = await consultar<{ n: number }>(
            `SELECT COUNT(*) AS n FROM alocacoes a JOIN horarios h ON h.indice = a.hora
              WHERE a.curso_id = ? AND h.turno IN (${marc})`,
            [c.id, ...retirados],
          );
          // Sem isto as aulas sumiriam da tela e continuariam no banco (D13).
          if (n > 0) {
            if (
              !(await confirmar({
                titulo: "Tirar o turno do curso?",
                descricao: `${n} ${n === 1 ? "aula" : "aulas"} no turno da ${rotulos} serão apagadas.`,
                confirmar: "Salvar e apagar",
                perigo: true,
              }))
            )
              return;
            instrucoes.push({
              sql: `DELETE FROM alocacoes WHERE curso_id = ?
                      AND hora IN (SELECT indice FROM horarios WHERE turno IN (${marc}))`,
              params: [c.id, ...retirados],
            });
          }
        }
        instrucoes.push({
          sql: "UPDATE cursos SET nome = ?, turnos = ?, horas_por_aula_semanal = ?, observacao = ? WHERE id = ?",
          params: [nome, c.turnos, c.horas_por_aula_semanal, c.observacao, c.id],
        });
        await transacao(instrucoes);
      } else {
        await executar(
          "INSERT INTO cursos (nome, turnos, horas_por_aula_semanal, observacao)"
            + " VALUES (?, ?, ?, ?)",
          [nome, c.turnos, c.horas_por_aula_semanal, c.observacao],
        );
      }
    } catch (e) {
      return setErroDoFormulario(mensagemErro(e, "O curso"));
    } finally {
      setSalvando(false);
    }
    // Só chega aqui o que foi gravado; a falha da recarga é da lista (ver `Salas`).
    setEdicao(null);
    await recarregar();
  }

  const remover = useCallback(
    async (l: Linha) => {
      if (l.n_cursos === 1) {
        avisar.erro("Este é o único curso; o sistema precisa de pelo menos um.");
        return;
      }
      if (
        !(await confirmar({
          titulo: `Remover ${l.nome}?`,
          descricao:
            `Saem junto ${l.n_periodos} período(s), ` +
            `${l.n_disciplinas} disciplina(s) e ${l.n_aulas} aula(s) da grade. ` +
            "Professores e salas não são afetados: pertencem à instituição.",
          confirmar: "Remover curso",
          perigo: true,
        }))
      )
        return;
      try {
        await executar("DELETE FROM cursos WHERE id = ?", [l.id]);
      } catch (e) {
        return avisar.erro(mensagemErro(e, "O curso"));
      }
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
      // Ordena pelo texto que a célula mostra, não pela lista gravada.
      { id: "turnos", header: "Turnos", accessorFn: (l) => rotuloDosTurnos(l.turnos) },
      {
        accessorKey: "n_periodos",
        header: "Períodos",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.n_periodos),
      },
      {
        accessorKey: "n_disciplinas",
        header: "Disciplinas",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.n_disciplinas),
      },
      {
        accessorKey: "n_aulas",
        header: "Aulas na grade",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.n_aulas),
      },
      {
        accessorKey: "horas_por_aula_semanal",
        header: "Conversão",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => <span className="text-tx3">{row.original.horas_por_aula_semanal}h / aula</span>,
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
  });

  const marcados = edicao ? edicao.turnos.split(",").filter(Boolean) : [];

  // Os turnos ficam na ordem de `TURNOS`, não na ordem em que foram marcados.
  function alternar(valor: string, marcar: boolean) {
    if (!edicao) return;
    const novos = TURNOS.filter((x) => (x.valor === valor ? marcar : marcados.includes(x.valor))).map((x) => x.valor);
    setEdicao({ ...edicao, turnos: novos.join(",") });
    setErrosDeCampo((erros) => ({ ...erros, turnos: undefined }));
  }

  const dicaDosTurnos = "Define quais horários aparecem na grade e que turnos os períodos podem ter.";

  return (
    <>
      <CabecalhoPagina
        titulo="Cursos"
        escopo="Cada curso tem os próprios períodos, disciplinas e grade"
        contagem={`${linhas.length} curso(s)`}
      >
        <Button onClick={() => abrir(vazio())}>Novo curso</Button>
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      <p className="mb-3 max-w-[68ch] text-xs leading-normal text-tx2">
        Professores, salas, horários do dia, padrões de bloco e tipos de disciplina são da <strong>instituição</strong> e
        valem para todos os cursos — cadastrados uma vez só. As indisponibilidades também: um professor declara os
        horários dele uma vez, e todo curso as respeita.
      </p>

      {carregando ? null : <TabelaDados tabela={tabela} vazio={<EstadoVazio>Nenhum curso cadastrado.</EstadoVazio>} />}

      {edicao && (
        <DialogoFormulario
          titulo={edicao.id ? "Editar curso" : "Novo curso"}
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

          {/* As caixas de turno são um grupo: o leitor de tela anuncia "Turnos…"
              antes de cada uma. Não cabe num `Campo`, que liga um rótulo a um
              controle só; a dica e o erro ficam ligados ao grupo. */}
          <fieldset
            className="flex min-w-0 flex-col gap-1"
            aria-describedby={errosDeCampo.turnos ? `${idDosTurnos}-erro` : `${idDosTurnos}-dica`}
          >
            <legend className="mb-1 text-xs font-semibold text-tx2">Turnos que o curso ocupa</legend>
            <div className="mb-3 flex gap-4">
              {TURNOS.map((t) => (
                <label key={t.valor} className="flex cursor-pointer items-center gap-2 text-base">
                  <Checkbox
                    checked={marcados.includes(t.valor)}
                    aria-invalid={errosDeCampo.turnos ? true : undefined}
                    onCheckedChange={(v) => alternar(t.valor, v === true)}
                  />
                  {t.rotulo}
                </label>
              ))}
            </div>
            {errosDeCampo.turnos ? (
              <span id={`${idDosTurnos}-erro`} className="text-xs leading-4 text-destructive">
                {errosDeCampo.turnos}
              </span>
            ) : (
              <span id={`${idDosTurnos}-dica`} className="text-xs leading-4 text-tx3">
                {dicaDosTurnos}
              </span>
            )}
          </fieldset>

          <Campo
            rotulo="Horas de currículo por aula semanal"
            dica={`Com ${edicao.horas_por_aula_semanal}h, uma disciplina de ${
              edicao.horas_por_aula_semanal * 4
            }h no currículo são 4 aulas por semana. Só apoia o cadastro; a grade conta aulas.`}
            erro={errosDeCampo.horas}
          >
            {(a) => (
              <Input
                {...a}
                type="number"
                min={1}
                value={edicao.horas_por_aula_semanal}
                onChange={(e) => {
                  setEdicao({ ...edicao, horas_por_aula_semanal: Number(e.target.value) });
                  setErrosDeCampo((erros) => ({ ...erros, horas: undefined }));
                }}
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
