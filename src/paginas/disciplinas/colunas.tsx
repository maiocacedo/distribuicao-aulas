import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2, TriangleAlert } from "lucide-react";
import { BotaoIcone } from "@/componentes/botao-icone";
import { pertence } from "@/componentes/tabela-dados";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/componentes/ui/tooltip";
import type { Linha } from "./salvar";

/** O que a disciplina tem de diferente do comum, em palavras curtas. */
function marcas(l: Linha): { texto: string; foraDaCelula?: boolean }[] {
  return [
    { texto: !l.ofertada ? "não ofertada" : "" },
    { texto: !l.exige_sala ? "sem sala" : "" },
    // A lista nunca desenhou esta marca: ela só entra no texto de ordenação.
    { texto: l.tipo_sala ? `só ${l.tipo_sala}` : "", foraDaCelula: true },
    { texto: l.n_salas > 0 ? `${l.n_salas} sala(s)` : "" },
    { texto: l.blocos_livres ? "livre" : "" },
    { texto: l.permite_sabado ? "sábado" : "" },
    { texto: l.turno ?? "" },
    { texto: l.prioridade !== 2 ? `prio. ${l.prioridade === 1 ? "alta" : "baixa"}` : "" },
  ].filter((m) => m.texto);
}

/**
 * As marcas viram um texto ordenável para que disciplinas com o mesmo
 * comportamento fiquem juntas — é assim que se acha "todas as sem sala".
 */
export function marcasDe(l: Linha): string {
  return marcas(l)
    .map((m) => m.texto)
    .join(" · ");
}

/**
 * Colunas que existem só para os filtros da barra: a lista não as desenha
 * (`ocultas` do `useTabela`). Constante de módulo, pela referência estável.
 */
export const COLUNAS_OCULTAS = ["tipo_id", "optativa", "ofertada", "turno"];

const FATIAS_NAO_FECHAM = "fatias não fecham com a CH";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Colunas = ColumnDef<Linha, any>[];

/**
 * As colunas da lista. `abrir` e `remover` têm de ter referência estável
 * (`useCallback`), e o resultado fica num `useMemo`: ver `useTabela`.
 */
export function criarColunas({
  abrir,
  remover,
}: {
  abrir: (l: Linha) => void;
  remover: (l: Linha) => void;
}): Colunas {
  return [
    {
      accessorKey: "periodo",
      header: "Período",
      meta: { numerico: true, centro: true },
      // Numérica, mas é ordem de leitura: começa do 1º, não do último.
      sortDescFirst: false,
      filterFn: pertence,
      cell: ({ row }) => <span className="text-tx3">{row.original.periodo}º</span>,
    },
    {
      accessorKey: "nome",
      header: "Disciplina",
      cell: ({ row }) => (
        <>
          <span className="font-semibold">{row.original.nome}</span>
          {row.original.tipo_nome && <span className="text-tx3"> · {row.original.tipo_nome}</span>}
        </>
      ),
    },
    {
      accessorKey: "aulas_semanais",
      header: "Aulas",
      meta: { numerico: true, centro: true },
      sortDescFirst: true,
      cell: ({ row }) => (
        <>
          {row.original.aulas_semanais}
          {row.original.aulas_distribuidas !== row.original.aulas_semanais && (
            // O ícone e o nome dizem o que há; a cor só acompanha. Alcançável
            // pelo teclado, senão a dica só existiria para quem usa o mouse.
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label={FATIAS_NAO_FECHAM}
                  tabIndex={0}
                  className="ml-1 inline-flex rounded-sm align-[-2px] text-warn"
                >
                  <TriangleAlert className="size-3" aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent>{FATIAS_NAO_FECHAM}</TooltipContent>
            </Tooltip>
          )}
        </>
      ),
    },
    {
      accessorKey: "professores",
      header: "Professores",
      cell: ({ row }) => row.original.professores ?? <span className="text-tx3">sem professor</span>,
    },
    {
      id: "marcas",
      header: "Marcas",
      accessorFn: marcasDe,
      cell: ({ row }) =>
        marcas(row.original)
          .filter((m) => !m.foraDaCelula)
          .map((m) => (
            <span
              key={m.texto}
              className="mr-1 inline-block rounded-[3px] bg-poco px-1.5 py-px text-[10.5px] whitespace-nowrap text-tx2"
            >
              {m.texto}
            </span>
          )),
    },
    { accessorKey: "tipo_id", filterFn: pertence, enableSorting: false },
    { accessorKey: "optativa", filterFn: pertence, enableSorting: false },
    { accessorKey: "ofertada", filterFn: pertence, enableSorting: false },
    { accessorKey: "turno", filterFn: pertence, enableSorting: false },
    {
      id: "acoes",
      enableSorting: false,
      header: () => <span className="sr-only">Ações</span>,
      cell: ({ row }) => (
        <>
          <BotaoIcone rotulo="Editar" icone={Pencil} aoClicar={() => abrir(row.original)} />
          <BotaoIcone rotulo="Remover" icone={Trash2} perigo aoClicar={() => remover(row.original)} />
        </>
      ),
    },
  ];
}
