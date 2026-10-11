import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type RowData,
  type SortingState,
  type Table as Tabela,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/componentes/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Coluna numérica: alinha à direita e começa ordenando do maior para o menor. */
    numerico?: boolean;
    /** Coluna curta, que fica melhor centrada que encostada na borda. */
    centro?: boolean;
  }
}

/** Sem acento e em minúsculas, para a busca achar "algebra" em "Álgebra". */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Número com número; o resto como texto em pt-BR. */
export function compararValores(x: unknown, y: unknown): number {
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x ?? "").localeCompare(String(y ?? ""), "pt-BR");
}

/** `filterFn` de filtro facetado: a linha passa se o valor dela é um dos marcados. */
export function pertence<T>(linha: Row<T>, coluna: string, valores: unknown[]): boolean {
  return valores.length === 0 || valores.includes(linha.getValue(coluna));
}

// Uma lista nova a cada desenho faria o TanStack refiltrar tudo sem nada ter mudado.
const SEM_FILTROS: ColumnFiltersState = [];

export function useTabela<T>({
  dados,
  colunas,
  ordemInicial,
  desempate,
  busca = "",
  textoDeBusca,
  filtros = SEM_FILTROS,
}: {
  dados: T[];
  /**
   * Definidas fora do componente ou com `useMemo`: o TanStack desenha cada
   * célula como um componente, e uma coluna recriada a cada desenho remonta as
   * células (o botão que tinha o foco deixa de existir).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colunas: ColumnDef<T, any>[];
  ordemInicial: SortingState;
  /** Texto que desempata linhas iguais na coluna ordenada, sempre crescente. */
  desempate: (l: T) => string;
  busca?: string;
  /** Tudo em que a busca procura, numa linha só de texto. */
  textoDeBusca?: (l: T) => string;
  filtros?: ColumnFiltersState;
}): Tabela<T> {
  const [ordem, setOrdem] = useState<SortingState>(ordemInicial);

  // A ordenação do TanStack é estável: com os dados já em ordem de desempate,
  // linhas iguais na coluna ordenada ficam nessa ordem, crescente ou não.
  const ordenados = useMemo(
    () => [...dados].sort((a, b) => desempate(a).localeCompare(desempate(b), "pt-BR")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados],
  );

  return useReactTable({
    data: ordenados,
    columns: colunas,
    // Espaço nas pontas não é busca: quem só bateu na barra continua vendo tudo.
    state: { sorting: ordem, globalFilter: busca.trim(), columnFilters: filtros },
    onSortingChange: setOrdem,
    enableSortingRemoval: false,
    defaultColumn: {
      sortingFn: (a, b, id) => compararValores(a.getValue(id), b.getValue(id)),
    },
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (linha, _coluna, valor: string) =>
      !textoDeBusca || normalizar(textoDeBusca(linha.original)).includes(normalizar(valor)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
}

// Número em fonte de largura fixa, como nas listas antigas: os dígitos de uma
// coluna caem um embaixo do outro.
const FONTE_DE_NUMERO = "font-[family-name:Consolas,'Cascadia_Mono',monospace]";

/**
 * A lista de uma tela: painel com cabeçalho ordenável e uma linha por registro.
 *
 * A coluna de `id: "acoes"` é a das ações da linha. Ela ocupa só o que os
 * botões pedem e fica escondida até o mouse pousar na linha ou o teclado chegar
 * a um dos botões; a célula devolve só os `BotaoIcone`, sem embrulho.
 */
export function TabelaDados<T>({ tabela, vazio }: { tabela: Tabela<T>; vazio: ReactNode }) {
  const linhas = tabela.getRowModel().rows;
  if (linhas.length === 0) return <>{vazio}</>;

  return (
    // O fio do painel é sombra interna, não borda: a tabela ocupa a largura
    // toda e o realce da linha vai de uma ponta à outra.
    <div className="overflow-hidden rounded-lg bg-panel shadow-[inset_0_0_0_1px_var(--line)]">
      <Table>
        <TableHeader>
          {tabela.getHeaderGroups().map((grupo) => (
            <TableRow key={grupo.id}>
              {grupo.headers.map((h) => {
                const meta = h.column.columnDef.meta;
                const sentido = h.column.getIsSorted();
                return (
                  <TableHead
                    key={h.id}
                    aria-sort={sentido === "asc" ? "ascending" : sentido === "desc" ? "descending" : undefined}
                    className={cn(
                      meta?.numerico && ["w-[1%] pl-5 text-right", FONTE_DE_NUMERO],
                      meta?.centro && "pl-2.5 text-center",
                      h.column.id === "acoes" && "w-[1%]",
                    )}
                  >
                    {h.column.getCanSort() ? (
                      <button
                        className={cn(
                          // O botão não herda a caixa alta do cabeçalho: repete.
                          // `align-top` tira o botão da linha de base: alinhado
                          // por ela, a linha do cabeçalho ganhava 1 px de altura.
                          "inline-flex cursor-pointer items-center gap-1 align-top uppercase hover:text-foreground",
                          // Na coluna numérica a seta vai à esquerda: o texto do
                          // cabeçalho termina na mesma vertical dos números.
                          meta?.numerico && "flex-row-reverse",
                          meta?.centro && "w-full flex-row justify-center",
                          sentido && "text-foreground",
                        )}
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {/* Contrapeso da seta: sem ele o par texto e seta é
                            centrado como grupo e o texto sai do eixo dos valores. */}
                        {meta?.centro && <span className="w-2 flex-none" />}
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {/* A seta tem lugar reservado mesmo sem ordenar por esta
                            coluna: o cabeçalho não muda de largura ao clicar. */}
                        <span className="flex w-2 flex-none justify-center">
                          {sentido === "asc" && <ChevronUp className="size-2.5 flex-none" strokeWidth={2.5} aria-hidden />}
                          {sentido === "desc" && <ChevronDown className="size-2.5 flex-none" strokeWidth={2.5} aria-hidden />}
                        </span>
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {linhas.map((linha) => (
            // `group` deixa as ações da linha aparecerem no pouso do mouse.
            <TableRow key={linha.id} className="group">
              {linha.getVisibleCells().map((c) => {
                const meta = c.column.columnDef.meta;
                const conteudo = flexRender(c.column.columnDef.cell, c.getContext());
                return (
                  <TableCell
                    key={c.id}
                    className={cn(
                      meta?.numerico && ["w-[1%] pl-5 text-right text-[12px] whitespace-nowrap tabular-nums", FONTE_DE_NUMERO],
                      meta?.centro && "pl-2.5 text-center",
                      c.column.id === "acoes" && "w-[1%] whitespace-nowrap",
                    )}
                  >
                    {c.column.id === "acoes" ? (
                      // `opacity`, não `visibility`: os botões somem sem sair do
                      // fluxo (a coluna guarda o lugar) e continuam alcançáveis
                      // pelo teclado. Não é estado de desabilitado. O passo de
                      // 29 px por botão é o das listas antigas.
                      <div className="flex justify-end gap-[5px] pl-[5px] opacity-0 transition-opacity duration-90 group-hover:opacity-100 has-[:focus-visible]:opacity-100">
                        {conteudo}
                      </div>
                    ) : (
                      conteudo
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
