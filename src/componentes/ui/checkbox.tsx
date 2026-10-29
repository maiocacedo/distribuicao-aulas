import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * Ajustes sobre o que o shadcn gera, pelas regras do design:
 * - 14 px, contorno de controle (`--input`) e fundo do poço; marcado, fundo
 *   `primary` e o "✓" é o que diz "marcado" além da cor;
 * - desabilitado rebaixa a borda e, marcado, também o fundo (o do fio, com o
 *   "✓" em cinza: continua dizendo "marcado"); nunca `opacity`;
 * - sem anel próprio de foco: vale o anel global do tema (`:focus-visible`).
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-3.5 shrink-0 rounded-[3px] border border-input bg-poco transition-colors hover:border-tx2 disabled:pointer-events-none disabled:border-line disabled:text-tx3 aria-invalid:border-destructive data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground disabled:data-[state=checked]:border-line disabled:data-[state=checked]:bg-line disabled:data-[state=checked]:text-tx2",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-2.5" strokeWidth={3} aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
