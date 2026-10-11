import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * O mesmo desenho do `Input`, sem altura fixa: quem usa diz as linhas com
 * `rows`. O `field-sizing-content` que o shadcn gera saiu porque faz o campo
 * crescer a cada linha digitada e empurra o rodapé do diálogo.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block w-full min-w-0 rounded-md border border-input bg-poco px-[7px] py-[5px] text-sm transition-colors selection:bg-primary selection:text-primary-foreground placeholder:text-tx3 hover:border-tx2 disabled:pointer-events-none disabled:border-line disabled:text-tx3 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
