import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Ajustes sobre o que o shadcn gera, pelas regras do design:
 * - uma só aparência, a do chip de filtro: fundo e fio do acento e texto
 *   normal. As variantes de cor cheia do shadcn saem: o chip diz o que está
 *   ativo pelo texto e pela forma (tem "×"), e a cor só reforça;
 * - 20 px de altura, texto de 11 px, `rounded-md` como os controles;
 * - peso normal: a fonte do sistema não tem o 500 do `font-medium` e o
 *   navegador o desenha como semi-negrito;
 * - o preenchimento de 7 px conta a borda de 1 px (8 px no total).
 */
function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-acc-line bg-acc-bg px-[7px] text-xs font-normal whitespace-nowrap text-foreground [&>svg]:pointer-events-none [&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export { Badge }
