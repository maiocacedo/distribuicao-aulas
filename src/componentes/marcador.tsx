import { useId, type ReactNode } from "react";
import { Checkbox } from "@/componentes/ui/checkbox";

/**
 * Caixa de marcar com o rótulo e, embaixo, a frase que diz o que ela faz.
 *
 * O `<label>` envolve tudo para o clique valer na linha inteira, como nas telas
 * antigas. O nome da caixa é só o rótulo: a frase é a descrição dela, e não
 * entra no nome que o leitor de tela anuncia.
 */
export function Marcador({
  rotulo,
  descricao,
  marcado,
  aoMudar,
}: {
  rotulo: string;
  descricao?: ReactNode;
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="flex min-w-0 cursor-pointer items-start gap-2">
      <Checkbox
        className="mt-0.5"
        aria-labelledby={`${id}-rotulo`}
        aria-describedby={descricao ? `${id}-descricao` : undefined}
        checked={marcado}
        onCheckedChange={(v) => aoMudar(v === true)}
      />
      <span className="flex min-w-0 flex-col">
        <span id={`${id}-rotulo`}>{rotulo}</span>
        {descricao && (
          <span id={`${id}-descricao`} className="text-xs text-tx3">
            {descricao}
          </span>
        )}
      </span>
    </label>
  );
}
