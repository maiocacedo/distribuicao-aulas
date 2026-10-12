import type { LucideIcon } from "lucide-react";
import { Button } from "@/componentes/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/componentes/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * O desenho do `disabled` do `Button` para quem usa `aria-disabled` (o botão
 * continua alcançável): texto e borda rebaixados, fundo do poço, sem `opacity`.
 * O pouso não muda nada.
 */
export const ESTILO_DESABILITADO = "cursor-default border-line bg-poco text-tx3 hover:bg-poco hover:text-tx3";

/**
 * Ação como ícone. O rótulo vive na dica para quem passa o mouse e no
 * `aria-label` para quem não usa o mouse.
 *
 * Desabilitado é `aria-disabled`, não o atributo `disabled`: um botão
 * `disabled` não recebe foco nem pouso, a dica não abre, e a regra do design
 * é que o desabilitado explique por quê. Assim ele continua alcançável, a
 * dica mostra o `motivo` e só o clique deixa de agir.
 */
export function BotaoIcone({
  rotulo,
  icone: Icone,
  aoClicar,
  perigo,
  desabilitado,
  motivo,
  className,
}: {
  /** Nome da ação. É sempre o nome acessível do botão, habilitado ou não. */
  rotulo: string;
  icone: LucideIcon;
  aoClicar: () => void;
  perigo?: boolean;
  desabilitado?: boolean;
  /** Por que está desabilitado. Aparece na dica, no lugar do rótulo. */
  motivo?: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        asChild
        // A dica abre com o foco do teclado, não com o foco que um diálogo
        // devolve ao fechar: depois de um clique ela ficaria aberta sobre a
        // linha, sem o mouse por perto, até o foco sair dali.
        onFocus={(e) => {
          if (!e.currentTarget.matches(":focus-visible")) e.preventDefault();
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={rotulo}
          aria-disabled={desabilitado || undefined}
          onClick={desabilitado ? undefined : aoClicar}
          className={cn(
            "size-6",
            desabilitado
              ? ESTILO_DESABILITADO
              : perigo
                ? // Sempre da cor de negativo, como na interface antiga: a ação
                  // destrutiva se distingue sem depender do pouso. O `hover` repete a
                  // cor porque o `ghost` do `Button` a trocaria.
                  "text-destructive hover:text-destructive"
                : "text-tx2",
            className,
          )}
        >
          <Icone className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{(desabilitado && motivo) || rotulo}</TooltipContent>
    </Tooltip>
  );
}
