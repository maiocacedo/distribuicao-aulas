import type { LucideIcon } from "lucide-react";
import { Button } from "@/componentes/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/componentes/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Ação como ícone. O rótulo vive na dica para quem passa o mouse e no
 * `aria-label` para quem não usa o mouse.
 */
export function BotaoIcone({
  rotulo,
  icone: Icone,
  aoClicar,
  perigo,
  desabilitado,
  className,
}: {
  rotulo: string;
  icone: LucideIcon;
  aoClicar: () => void;
  perigo?: boolean;
  desabilitado?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={rotulo}
          disabled={desabilitado}
          onClick={aoClicar}
          className={cn("size-6 text-tx2", perigo && "hover:text-destructive", className)}
        >
          <Icone className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  );
}
