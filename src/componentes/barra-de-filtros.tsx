import { useRef } from "react";
import type { ColumnFiltersState } from "@tanstack/react-table";
import { ListFilter, X } from "lucide-react";
import { Badge } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import { Checkbox } from "@/componentes/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/componentes/ui/popover";
import { cn } from "@/lib/utils";

type Valor = string | number | boolean;

export interface DefinicaoDeFiltro {
  /** O `id` da coluna filtrada; a coluna usa `filterFn: pertence`. */
  id: string;
  titulo: string;
  opcoes: { valor: Valor; rotulo: string }[];
}

/**
 * Um botão por coluna filtrável e, ao lado, um chip por valor marcado: o que
 * está filtrando a lista fica à vista, sem abrir menu nenhum.
 *
 * O valor de cada filtro é o array dos valores marcados (o que `pertence`
 * espera). `valor` é o estado da tela, com referência estável: ver `useTabela`.
 */
export function BarraDeFiltros({
  definicoes,
  valor,
  aoMudar,
}: {
  definicoes: DefinicaoDeFiltro[];
  valor: ColumnFiltersState;
  aoMudar: (v: ColumnFiltersState) => void;
}) {
  // Os botões de filtro, por `id`: o chip e o "Limpar filtros" somem ao serem
  // acionados, e o foco deles não pode cair no `body`.
  const botoes = useRef(new Map<string, HTMLButtonElement>());
  const marcados = (id: string) => (valor.find((f) => f.id === id)?.value as Valor[] | undefined) ?? [];

  function definir(id: string, valores: Valor[]) {
    const resto = valor.filter((f) => f.id !== id);
    aoMudar(valores.length ? [...resto, { id, value: valores }] : resto);
  }

  function remover(id: string, valores: Valor[]) {
    definir(id, valores);
    botoes.current.get(id)?.focus();
  }

  function limpar() {
    aoMudar([]);
    botoes.current.get(definicoes[0]?.id ?? "")?.focus();
  }

  const chips = definicoes.flatMap((d) =>
    marcados(d.id).map((v) => ({ d, v, rotulo: d.opcoes.find((o) => o.valor === v)?.rotulo ?? String(v) })),
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {definicoes.map((d) => {
        const n = marcados(d.id).length;
        return (
          <Popover key={d.id}>
            <PopoverTrigger asChild>
              {/* O cabeçalho da coluna também é um botão com o título dela: este diz o que faz.
                  Com filtro ativo, o botão ganha o fundo do acento e a contagem: o estado
                  não fica só na cor. */}
              <Button
                variant="outline"
                size="sm"
                aria-label={`Filtrar por ${d.titulo}`}
                ref={(el) => {
                  if (el) botoes.current.set(d.id, el);
                  else botoes.current.delete(d.id);
                }}
                className={cn(n > 0 && "border-acc-line bg-acc-bg")}
              >
                <ListFilter className="size-3" aria-hidden />
                {d.titulo}
                {n > 0 && (
                  <span
                    aria-hidden
                    className="rounded-[3px] bg-poco px-[5px] text-[10px] text-tx2 tabular-nums"
                  >
                    {n}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-56 flex-col gap-0.5 p-1">
              {d.opcoes.map((o) => {
                const marcado = marcados(d.id).includes(o.valor);
                return (
                  <label
                    key={String(o.valor)}
                    className="flex h-6 cursor-pointer items-center gap-2 rounded-sm px-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={marcado}
                      onCheckedChange={(v) =>
                        definir(
                          d.id,
                          v === true ? [...marcados(d.id), o.valor] : marcados(d.id).filter((x) => x !== o.valor),
                        )
                      }
                    />
                    {o.rotulo}
                  </label>
                );
              })}
            </PopoverContent>
          </Popover>
        );
      })}

      {chips.map(({ d, v, rotulo }) => (
        <Badge key={`${d.id}:${String(v)}`} className="pr-0.5">
          {d.titulo}: {rotulo}
          <button
            type="button"
            aria-label={`Remover filtro ${d.titulo}: ${rotulo}`}
            className="cursor-pointer rounded-sm p-0.5 hover:bg-accent"
            onClick={() =>
              remover(
                d.id,
                marcados(d.id).filter((x) => x !== v),
              )
            }
          >
            <X className="size-3" aria-hidden />
          </button>
        </Badge>
      ))}

      {chips.length > 0 && (
        <Button variant="ghost" size="sm" onClick={limpar}>
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
