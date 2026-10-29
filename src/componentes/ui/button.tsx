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
 * toda variante, sem mudar a altura entre habilitado e desabilitado. Ela conta
 * na largura: o preenchimento é de 11 px para a soma com ela dar 12 px de
 * cada lado.
 * Peso: os botões cheios (primário e destrutivo) são semi-negrito e os demais,
 * normais. O `font-medium` que o shadcn põe em todos
 * não serve: a fonte do sistema não tem o peso 500 e o navegador o desenha
 * como semi-negrito, o que deixava "Cancelar" com o peso de "Salvar".
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-normal whitespace-nowrap transition-colors disabled:pointer-events-none disabled:border-line disabled:bg-poco disabled:text-tx3 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
        // O texto usa `primary-foreground` (branco no claro, azul-noite no
        // escuro): o `--neg` do escuro é um salmão claro, onde `text-white`
        // daria 2,4:1.
        destructive:
          "bg-destructive font-semibold text-primary-foreground hover:bg-destructive/90",
        outline: "border-input bg-panel hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-[11px] has-[>svg]:px-[9px]",
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
