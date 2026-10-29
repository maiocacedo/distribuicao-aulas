import { useId, type ReactNode } from "react";
import { Label } from "@/componentes/ui/label";
import { cn } from "@/lib/utils";

export interface AtributosDoCampo {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/** Rótulo, dica e erro de um controle. O filho recebe os atributos que o ligam a eles. */
export function Campo({
  rotulo,
  dica,
  erro,
  className,
  children,
}: {
  rotulo: string;
  dica?: string;
  erro?: string;
  className?: string;
  children: (a: AtributosDoCampo) => ReactNode;
}) {
  const id = useId();
  const descricao = erro ? `${id}-erro` : dica ? `${id}-dica` : undefined;
  // Dica e erro são frases, às vezes de duas linhas: os 16 px de entrelinha são
  // mais folgados que os de um rótulo, para as linhas não se colarem.
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children({ id, "aria-describedby": descricao, "aria-invalid": erro ? true : undefined })}
      {erro ? (
        <span id={`${id}-erro`} className="text-xs leading-4 text-destructive">
          {erro}
        </span>
      ) : dica ? (
        <span id={`${id}-dica`} className="text-xs leading-4 text-tx3">
          {dica}
        </span>
      ) : null}
    </div>
  );
}
