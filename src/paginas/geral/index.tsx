import { Tabs } from "radix-ui";
import { Accessibility, Database, GraduationCap, Palette, type LucideIcon } from "lucide-react";
import { Acessibilidade, Aparencia } from "./Aparencia";
import Cursos from "./Cursos";
import Dados from "./Dados";

export type Aba = "cursos" | "aparencia" | "acessibilidade" | "dados";

const ABAS: { id: Aba; rotulo: string; icone: LucideIcon }[] = [
  { id: "cursos", rotulo: "Cursos", icone: GraduationCap },
  { id: "aparencia", rotulo: "Aparência", icone: Palette },
  { id: "acessibilidade", rotulo: "Acessibilidade", icone: Accessibility },
  { id: "dados", rotulo: "Dados", icone: Database },
];

/**
 * Geral: o que não é de um curso nem da grade — os cursos em si, a aparência,
 * a acessibilidade e os dados (exportar e importar). Cada aba tem o próprio
 * título; as abas ficam acima dele, como trilha da seção.
 *
 * A aba aberta vem de fora (`App`): o aviso "nenhum curso" e outras telas
 * mandam direto para "Cursos".
 */
export default function Geral({
  aba,
  aoMudarAba,
  aoMudarCursos,
}: {
  aba: Aba;
  aoMudarAba: (a: Aba) => void;
  aoMudarCursos: () => void;
}) {
  return (
    <Tabs.Root value={aba} onValueChange={(v) => aoMudarAba(v as Aba)}>
      <Tabs.List aria-label="Geral" className="mb-4 flex gap-1 border-b border-line">
        {ABAS.map((a) => (
          <Tabs.Trigger
            key={a.id}
            value={a.id}
            // O ativo é dito pelo traço de 2 px embaixo e pelo peso, além da cor.
            className="-mb-px flex h-8 items-center gap-1.5 rounded-t-md border-b-2 border-transparent px-3 text-sm text-tx2 hover:bg-accent hover:text-foreground data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-primary"
          >
            <a.icone className="size-3.5" aria-hidden />
            {a.rotulo}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="cursos" className="focus-visible:outline-none">
        <Cursos aoMudarLista={aoMudarCursos} />
      </Tabs.Content>
      <Tabs.Content value="aparencia" className="focus-visible:outline-none">
        <Aparencia />
      </Tabs.Content>
      <Tabs.Content value="acessibilidade" className="focus-visible:outline-none">
        <Acessibilidade />
      </Tabs.Content>
      <Tabs.Content value="dados" className="focus-visible:outline-none">
        <Dados />
      </Tabs.Content>
    </Tabs.Root>
  );
}
