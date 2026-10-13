import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/componentes/ui/input";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de toda tela. O escopo ao lado do título responde "isto vale só
 * para o curso selecionado ou para a instituição inteira?".
 *
 * São dois desenhos. O de lista (com busca ou
 * contagem) é uma linha só, centrada, a 12 px do conteúdo. O de página (com
 * subtítulo ou só o título) alinha tudo pelo topo e fica a 16 px.
 */
export function CabecalhoPagina({
  titulo,
  escopo,
  sub,
  contagem,
  busca,
  aoBuscar,
  children,
}: {
  titulo: string;
  escopo?: string;
  sub?: string;
  contagem?: string;
  busca?: string;
  aoBuscar?: (v: string) => void;
  children?: ReactNode;
}) {
  const deLista = aoBuscar != null || contagem != null;
  return (
    <header className={cn("flex gap-3", deLista ? "mb-3 items-center" : "mb-4 items-start")}>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{titulo}</h1>
          {escopo && <span className="text-xs text-tx3">{escopo}</span>}
        </div>
        {sub && <p className="mt-[3px] text-xs text-tx3">{sub}</p>}
      </div>
      <span className="flex-1" />
      {aoBuscar && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-tx3" aria-hidden />
          {/* 30 px, 2 a mais que os outros controles: a busca está sozinha na
              linha, e é ela que dá a altura do cabeçalho de lista. */}
          <Input
            aria-label="Buscar"
            placeholder="Buscar…"
            className="h-[30px] w-60 pr-2.5 pl-[30px]"
            value={busca ?? ""}
            onChange={(e) => aoBuscar(e.target.value)}
          />
        </div>
      )}
      {contagem && <span className="self-center text-xs whitespace-nowrap text-tx3 tabular-nums">{contagem}</span>}
      {children}
    </header>
  );
}
