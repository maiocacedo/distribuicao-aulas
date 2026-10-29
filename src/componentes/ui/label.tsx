import * as React from "react"
import { cn } from "@/lib/utils"
import { Label as LabelPrimitive } from "radix-ui"

/*
 * Rótulo de campo: 11 px, secundário e em semi-negrito. Com o controle
 * desabilitado o texto é rebaixado; nunca `opacity`.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-xs font-semibold text-tx2 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-tx3 peer-disabled:text-tx3",
        className
      )}
      {...props}
    />
  )
}

export { Label }
