import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Ajustes sobre o que o shadcn gera, pelas regras do design:
 * - densidade: 28 px de altura, texto de controle de 12,5 px, fundo do poço e
 *   o contorno de controle (`--lineC`), como o campo das telas antigas;
 * - desabilitado rebaixa texto e borda, nunca `opacity`;
 * - sem anel próprio de foco: vale o anel global do tema (`:focus-visible`);
 * - o pouso escurece o contorno, que é o que diz "aqui se digita".
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-md border border-input bg-poco px-[7px] text-sm transition-colors selection:bg-primary selection:text-primary-foreground placeholder:text-tx3 hover:border-tx2 disabled:pointer-events-none disabled:border-line disabled:text-tx3 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
