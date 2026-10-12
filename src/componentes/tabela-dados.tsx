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
    /**
     * Coluna numérica: alinha à direita, em fonte de largura fixa. A marca é só
     * desenho. Começar a ordenar do maior para o menor é outra opção, que quem
     * define a coluna põe ao lado: `sortDescFirst: true`.
     */
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

/**
 * Cópia dos dados em ordem crescente do texto de desempate, em pt-BR. Não altera
 * o array recebido. O `sort` do JavaScript é estável: itens com o mesmo texto
 * mantêm a ordem em que vieram.
 */
export function ordenarPorDesempate<T>(dados: T[], desempate: (l: T) => string): T[] {
  return [...dados].sort((a, b) => desempate(a).localeCompare(desempate(b), "pt-BR"));
}

/** `filterFn` de filtro facetado: a linha passa se o valor dela é um dos marcados. */
export function pertence<T>(linha: Row<T>, coluna: string, valores: unknown[]): boolean {
  return valores.length === 0 || valores.includes(linha.getValue(coluna));
}

// O TanStack compara os filtros por referência: uma lista nova a cada desenho
// o faria refiltrar e reordenar a tabela inteira em todo desenho, sem nada ter
// mudado. O mesmo vale para o que a tela passa (ver `useTabela`).
const SEM_FILTROS: ColumnFiltersState = [];
const SEM_OCULTAS: string[] = [];

/**
 * Ordenação, busca e filtros de uma lista.
 *
 * `dados`, `colunas` e `filtros` têm de ter referência estável: estado,
 * `useMemo` ou constante de módulo, nunca uma lista montada no corpo do
 * componente. O TanStack guarda o modelo filtrado e o ordenado e só os refaz
 * quando a referência muda; com referência nova a cada desenho, filtra e
 * ordena a lista inteira a cada desenho.
 */
export function useTabela<T>({
  dados,
  colunas,
  ordemInicial,
  desempate,
  busca = "",
  textoDeBusca,
  filtros = SEM_FILTROS,
  ocultas = SEM_OCULTAS,
}: {
  /**
   * Referência estável: o estado da tela, não uma lista filtrada ou mapeada no
   * corpo do componente (se precisar derivar, `useMemo`).
   *
   * Registro com `id` é identificado por ele, e o `id` tem de ser único na
   * lista; sem `id`, a linha é a posição.
   */
  dados: T[];
  /**
   * Referência estável: fora do componente ou com `useMemo`. O TanStack
   * desenha cada célula como um componente, e uma coluna recriada a cada
   * desenho remonta as células (o botão que tinha o foco deixa de existir).
   *
   * Ao menos uma coluna precisa de `accessorKey` ou `accessorFn`: numa tabela
   * só de colunas de desenho (`id` e `cell`), o TanStack não aplica a busca.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colunas: ColumnDef<T, any>[];
  ordemInicial: SortingState;
  /**
   * Texto que desempata linhas iguais na coluna ordenada, sempre crescente.
   * Depende só da linha: o resultado é guardado enquanto `dados` não muda, e
   * um estado da tela usado aqui ficaria com o valor antigo.
   */
  desempate: (l: T) => string;
  busca?: string;
  /**
   * Tudo em que a busca procura, numa linha só de texto. Depende só da linha,
   * pelo mesmo motivo do `desempate`: a busca só é refeita quando mudam os
   * dados, o texto buscado ou os filtros.
   */
  textoDeBusca?: (l: T) => string;
  /** Referência estável: estado ou `useMemo`, nunca uma lista montada na chamada. */
  filtros?: ColumnFiltersState;
  /**
   * `id` das colunas que existem só para filtrar: não são desenhadas, mas o
   * filtro delas vale (o TanStack filtra por coluna, visível ou não).
   * Referência estável: constante de módulo.
   */
  ocultas?: string[];
}): Tabela<T> {
  const [ordem, setOrdem] = useState<SortingState>(ordemInicial);
  const visibilidade = useMemo(() => Object.fromEntries(ocultas.map((id) => [id, false])), [ocultas]);

  // A ordenação do TanStack é estável: com os dados já em ordem de desempate,
  // linhas iguais na coluna ordenada ficam nessa ordem, crescente ou não.
  const ordenados = useMemo(
    () => ordenarPorDesempate(dados, desempate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados],
  );

  return useReactTable({
    data: ordenados,
    columns: colunas,
    // Espaço nas pontas não é busca: quem só bateu na barra continua vendo tudo.
    state: { sorting: ordem, globalFilter: busca.trim(), columnFilters: filtros, columnVisibility: visibilidade },
    onSortingChange: setOrdem,
    enableSortingRemoval: false,
    // Um critério por vez, como nas listas antigas (sem Shift + clique).
    enableMultiSort: false,
    // Sem isto o TanStack escolhe o primeiro sentido pelo valor da primeira
    // linha: uma coluna de texto que começasse com um nulo abriria do fim para
    // o começo. O `sortDescFirst: true` da coluna numérica continua valendo.
    sortDescFirst: false,
    // Não há paginação. Ligado (o padrão), todo recálculo do modelo filtrado
    // ou ordenado agenda um `setState` para voltar à primeira página; com
    // `dados` ou `filtros` de referência instável isso vira recálculo, novo
    // desenho, recálculo, sem fim e sem erro na tela.
    autoResetPageIndex: false,
    defaultColumn: {
      sortingFn: (a, b, id) => compararValores(a.getValue(id), b.getValue(id)),
    },
    // A linha é o registro, não a posição dele na lista. Pela posição, depois
    // de remover ou renomear, o React reaproveitaria a linha de um registro
    // para desenhar outro, e o foco devolvido ao botão "Remover" de quem saiu
    // ficaria no "Remover" de quem subiu para o lugar.
    getRowId: (linha, indice) => String((linha as { id?: unknown }).id ?? indice),
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (linha, _coluna, valor: string) =>
      !textoDeBusca || normalizar(textoDeBusca(linha.original)).includes(normalizar(valor)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
}

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
                      // Fonte de largura fixa (`--font-mono` do tema), como nas
                      // listas antigas: os dígitos caem um embaixo do outro.
                      meta?.numerico && "w-[1%] pl-5 text-right font-mono",
                      meta?.centro && "pl-2.5 text-center",
                      h.column.id === "acoes" && "w-[1%]",
                    )}
                  >
                    {h.column.getCanSort() ? (
                      <button
                        // Sem isto, dentro de um `<form>` o clique o enviaria.
                        type="button"
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
                      meta?.numerico && "w-[1%] pl-5 text-right font-mono text-[12px] whitespace-nowrap tabular-nums",
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
