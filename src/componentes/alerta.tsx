import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONS = {
  erro: { icone: CircleAlert, classe: "border-destructive text-destructive", papel: "alert" },
  aviso: { icone: TriangleAlert, classe: "border-warn text-foreground", papel: "status" },
  sucesso: { icone: CircleCheck, classe: "border-acc-line bg-acc-bg text-foreground", papel: "status" },
} as const;

/** Mensagem na página ou no diálogo. O ícone carrega o tom junto com a cor. */
export function Alerta({
  tom,
  children,
  className,
}: {
  tom: keyof typeof TONS;
  children: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  const { icone: Icone, classe, papel } = TONS[tom];
  return (
    <div role={papel} className={cn("mb-3 flex items-start gap-2 rounded-md border bg-panel px-3 py-2 text-base", classe, className)}>
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 whitespace-pre-wrap">{children}</div>
    </div>
  );
}
