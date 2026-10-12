import { Undo2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/componentes/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/componentes/ui/tooltip";
import { desfazerEAvisar } from "./desfazer";
import { useHistorico } from "./useHistorico";

/** Num campo de texto, Ctrl+Z é do campo. */
const emCampo = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName));

/**
 * O botão de desfazer das telas de grade, com o Ctrl+Z.
 *
 * Sem o que desfazer ele é `aria-disabled`, não `disabled`: continua alcançável
 * pelo teclado e a dica diz "Nada para desfazer" também para quem não usa o
 * mouse (um botão `disabled` não recebe foco nem pouso). Só o clique e o Enter
 * deixam de agir.
 */
export function BotaoDesfazer() {
  const { podeDesfazer, rotulo } = useHistorico();

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z" || emCampo(e.target)) return;
      e.preventDefault();
      // Tecla presa repete o evento: sem isto, segurar Ctrl+Z desfaria a pilha inteira.
      if (e.repeat) return;
      void desfazerEAvisar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger
        asChild
        // A dica abre com o foco do teclado, não com o que fica no botão depois
        // de um clique: senão ela continuaria aberta, sem o mouse por perto.
        onFocus={(e) => {
          if (!e.currentTarget.matches(":focus-visible")) e.preventDefault();
        }}
      >
        <Button
          type="button"
          variant="outline"
          aria-disabled={!podeDesfazer || undefined}
          onClick={podeDesfazer ? () => void desfazerEAvisar() : undefined}
          // O desenho do `disabled` do `Button`: texto e borda rebaixados, fundo
          // do poço, sem `opacity`. O pouso não muda nada.
          className={podeDesfazer ? undefined : "cursor-default border-line bg-poco text-tx3 hover:bg-poco hover:text-tx3"}
        >
          <Undo2 className="size-3.5" aria-hidden />
          Desfazer
        </Button>
      </TooltipTrigger>
      <TooltipContent>{rotulo ? `Desfazer: ${rotulo} (Ctrl+Z)` : "Nada para desfazer"}</TooltipContent>
    </Tooltip>
  );
}
