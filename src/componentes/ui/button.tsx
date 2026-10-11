import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * Ajustes sobre o que o shadcn gera, pelas regras do design:
 * - densidade: 28 px de altura (h-7), texto de controle de 12,5 px;
 * - desabilitado rebaixa texto e borda e troca o fundo pelo do poço; nunca
 *   `opacity`, que embaça também o rótulo que explica o porquê;
 * - sem anel próprio de foco: vale o anel global do tema (`:focus-visible` em
 *   tema.css), o mesmo desenho em todo controle.
 * A borda transparente existe para o `disabled:border-line` ter onde pintar em
 * toda variante, sem mudar a altura entre habilitado e desabilitado.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:border-line disabled:bg-poco disabled:text-tx3 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // O texto usa `primary-foreground` (branco no claro, azul-noite no
        // escuro): o `--neg` do escuro é um salmão claro, onde `text-white`
        // daria 2,4:1.
        destructive:
          "bg-destructive text-primary-foreground hover:bg-destructive/90",
        outline: "border-input bg-panel hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-3 has-[>svg]:px-2.5",
        sm: "h-6 gap-1.5 px-2 has-[>svg]:px-1.5",
        icon: "size-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
