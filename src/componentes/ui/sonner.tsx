import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Segue o tema do sistema, como o resto do app. A versão do CLI do shadcn
 * depende de `next-themes`, que aqui não entra: o tema vem de
 * `prefers-color-scheme`, não de uma escolha na interface.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-card !text-foreground !border-line !rounded-lg !text-base",
          description: "!text-tx2",
          actionButton: "!bg-primary !text-primary-foreground",
        },
      }}
      {...props}
    />
  );
}
