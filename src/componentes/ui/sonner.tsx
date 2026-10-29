import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Segue o tema do sistema, como o resto do app. A versão do CLI do shadcn
 * depende de `next-themes`, que aqui não entra: o tema vem de
 * `prefers-color-scheme`, não de uma escolha na interface.
 *
 * O botão de fechar (só o toast de erro tem) nasce com as cores do próprio
 * sonner: no tema escuro era um disco preto sobre o cartão. Recebe as do
 * cartão, e os rótulos lidos por leitor de tela saem em português.
 *
 * `pointer-events-auto` no toast: com um diálogo aberto o Radix põe
 * `pointer-events: none` no `body`, e o aviso que ficou de antes (o de erro só
 * sai ao ser fechado) não receberia o clique que o fecha.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-right"
      containerAriaLabel="Avisos"
      toastOptions={{
        closeButtonAriaLabel: "Fechar aviso",
        classNames: {
          toast: "!pointer-events-auto !bg-card !text-foreground !border-line !rounded-lg !text-base",
          description: "!text-tx2",
          actionButton: "!bg-primary !text-primary-foreground",
          closeButton: "!bg-card !text-foreground !border-line hover:!bg-poco",
        },
      }}
      {...props}
    />
  );
}
