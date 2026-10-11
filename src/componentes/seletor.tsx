import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/componentes/ui/select";

export interface Opcao<V> {
  valor: V;
  rotulo: string;
  desabilitada?: boolean;
}

/**
 * O `Select` do shadcn só conhece texto. Aqui o valor é o que a tela usa
 * (número, texto ou nulo) e a posição na lista é o que vai para o Radix.
 *
 * Se `exibir` for `undefined`, o `SelectValue` mostra o texto da opção
 * escolhida (comportamento do Radix quando não recebe filhos): passe `exibir`
 * só quando o gatilho deve mostrar outra coisa.
 *
 * Casos de borda: o valor é localizado pela posição da primeira opção igual
 * (valores repetidos na lista não são suportados) e um valor fora da lista
 * deixa o gatilho vazio.
 */
export function Seletor<V extends string | number | null>({
  valor,
  opcoes,
  aoMudar,
  rotulo,
  exibir,
  desabilitado,
  className,
  ...aria
}: {
  valor: V;
  opcoes: Opcao<V>[];
  aoMudar: (v: V) => void;
  /** Vira `aria-label`; dispensável quando há `<Label htmlFor>`. */
  rotulo?: string;
  /** Texto do gatilho, quando difere do rótulo da opção. */
  exibir?: ReactNode;
  desabilitado?: boolean;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const atual = opcoes.findIndex((o) => o.valor === valor);
  return (
    <Select
      value={atual < 0 ? "" : String(atual)}
      onValueChange={(i) => aoMudar(opcoes[Number(i)].valor)}
      disabled={desabilitado}
    >
      <SelectTrigger aria-label={rotulo} className={className} {...aria}>
        <SelectValue>{exibir}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o, i) => (
          <SelectItem key={i} value={String(i)} disabled={o.desabilitada}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
