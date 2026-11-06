import svg from "@/recursos/utfpr.svg?raw";
import { cn } from "@/lib/utils";

/**
 * O logo da UTFPR (Wikimedia Commons, CC BY 4.0; crédito na janela "Sobre").
 * Entra no HTML, não como `<img>`: as letras pretas do original foram trocadas
 * por `currentColor` e seguem a cor do texto, no claro, no escuro e no alto
 * contraste. O amarelo da marca fica.
 */
export function LogoUtfpr({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="UTFPR — Universidade Tecnológica Federal do Paraná"
      className={cn("block text-foreground [&>svg]:h-auto [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
