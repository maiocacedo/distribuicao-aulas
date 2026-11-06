import type { ReactNode } from "react";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { Secao } from "@/componentes/secao";
import { Button } from "@/componentes/ui/button";
import { Checkbox } from "@/componentes/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  mudarPreferencias,
  PADRAO,
  restaurarPadrao,
  TAMANHOS,
  usePreferencias,
  type Acento,
  type Preferencias,
  type Tema,
} from "@/preferencias";

/**
 * Um grupo de opções exclusivas como cartões. Por baixo é um `<input
 * type="radio">` nativo: setas trocam a opção, o leitor de tela lê "1 de 3",
 * e o marcado é dito pelo círculo cheio e pela borda, além da cor.
 */
function Escolhas<V extends string | number>({
  legenda,
  nome,
  valor,
  opcoes,
  aoMudar,
}: {
  legenda: string;
  nome: string;
  valor: V;
  opcoes: { valor: V; rotulo: string; amostra?: ReactNode }[];
  aoMudar: (v: V) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{legenda}</legend>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => {
          const marcada = o.valor === valor;
          return (
            <label
              key={String(o.valor)}
              className={cn(
                "flex min-w-[112px] cursor-pointer items-center gap-2 rounded-md bg-card px-3 py-2 text-sm shadow-[inset_0_0_0_1px_var(--lineC)] hover:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
                marcada && "bg-acc-bg font-semibold shadow-[inset_0_0_0_2px_var(--acc)] hover:bg-acc-bg",
              )}
            >
              <input
                type="radio"
                name={nome}
                className="size-3.5 accent-[var(--acc)] focus-visible:outline-none"
                checked={marcada}
                onChange={() => aoMudar(o.valor)}
              />
              {o.amostra}
              {o.rotulo}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Miniatura de um tema: o fundo, um painel e o acento, com as cores fixas do design. */
function AmostraDeTema({ fundo, painel, acento }: { fundo: string; painel: string; acento: string }) {
  return (
    <span
      aria-hidden
      className="relative inline-block h-5 w-8 overflow-hidden rounded-[3px] shadow-[inset_0_0_0_1px_var(--lineS)]"
      style={{ background: fundo }}
    >
      <span className="absolute top-1 bottom-1 left-1 w-2.5 rounded-[2px]" style={{ background: painel }} />
      <span className="absolute right-1 bottom-1 h-1.5 w-2.5 rounded-[2px]" style={{ background: acento }} />
    </span>
  );
}

const TEMAS: { valor: Tema; rotulo: string; amostra: ReactNode }[] = [
  {
    valor: "sistema",
    rotulo: "Do sistema",
    amostra: <AmostraDeTema fundo="linear-gradient(135deg, #f2f2f4 50%, #121316 50%)" painel="#fbfbfc" acento="#3d5ab9" />,
  },
  { valor: "claro", rotulo: "Claro", amostra: <AmostraDeTema fundo="#f2f2f4" painel="#ffffff" acento="#3d5ab9" /> },
  { valor: "escuro", rotulo: "Escuro", amostra: <AmostraDeTema fundo="#121316" painel="#25282f" acento="#93a9f0" /> },
];

/** As cores das amostras são as do tema claro: a amostra é um nome, não uma prévia exata. */
const ACENTOS: { valor: Acento; rotulo: string; cor: string }[] = [
  { valor: "azul", rotulo: "Azul", cor: "#3d5ab9" },
  { valor: "verde", rotulo: "Verde", cor: "#1d7354" },
  { valor: "violeta", rotulo: "Violeta", cor: "#6a43b5" },
  { valor: "grafite", rotulo: "Grafite", cor: "#3d4452" },
];

const Amostra = ({ cor }: { cor: string }) => (
  <span aria-hidden className="inline-block size-3.5 rounded-full" style={{ background: cor }} />
);

export function Aparencia() {
  const p = usePreferencias();
  return (
    <>
      <CabecalhoPagina titulo="Aparência" sub="Tema e cor de destaque. Valem para este aparelho e ficam guardados nele." />
      <Secao titulo="Tema">
        <Escolhas
          legenda="Claro ou escuro"
          nome="tema"
          valor={p.tema}
          opcoes={TEMAS}
          aoMudar={(tema) => mudarPreferencias({ tema })}
        />
        <p className="mt-2 text-xs text-tx2">"Do sistema" acompanha o modo claro ou escuro do sistema operacional.</p>
      </Secao>
      <Secao titulo="Cor de destaque">
        <Escolhas
          legenda="Cor de seleção, de ação e do foco"
          nome="acento"
          valor={p.acento}
          opcoes={ACENTOS.map((a) => ({ ...a, amostra: <Amostra cor={a.cor} /> }))}
          aoMudar={(acento) => mudarPreferencias({ acento })}
        />
        <p className="mt-2 max-w-[72ch] text-xs text-tx2">
          A cor de destaque marca o que está selecionado, o que pode ser feito e onde está o foco. Vermelho e âmbar não
          estão entre as opções porque já querem dizer "impedido" e "tolerado" na grade.
        </p>
      </Secao>
    </>
  );
}

function Opcao({
  id,
  rotulo,
  dica,
  marcada,
  aoMudar,
}: {
  id: keyof Preferencias;
  rotulo: string;
  dica: string;
  marcada: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Checkbox
        id={`pref-${id}`}
        className="mt-[2px]"
        checked={marcada}
        aria-describedby={`pref-${id}-dica`}
        onCheckedChange={(v) => aoMudar(v === true)}
      />
      <div>
        <label htmlFor={`pref-${id}`} className="cursor-pointer text-sm font-semibold">
          {rotulo}
        </label>
        <p id={`pref-${id}-dica`} className="mt-0.5 max-w-[68ch] text-xs text-tx2">
          {dica}
        </p>
      </div>
    </div>
  );
}

const rotuloDoTamanho = (t: number) => `${String(t).replace(".", ",")}%`;

const ATALHOS: [string, string][] = [
  ["Tab / Shift+Tab", "Passa de um controle para o próximo (ou o anterior)."],
  ["Enter / Espaço", "Aciona o botão ou marca a opção em foco."],
  ["Setas", "Trocam a opção dentro de um grupo e andam pelas listas."],
  ["Esc", "Fecha a janela aberta, cancela o arrasto ou solta a pendência escolhida."],
  ["Ctrl+Z", "Desfaz a última ação na grade."],
  ["Ctrl + / Ctrl −", "Zoom do navegador, somado ao tamanho do texto daqui."],
];

export function Acessibilidade() {
  const p = usePreferencias();
  const tudoPadrao = (Object.keys(PADRAO) as (keyof Preferencias)[])
    .filter((k) => k !== "tema" && k !== "acento")
    .every((k) => p[k] === PADRAO[k]);
  return (
    <>
      <CabecalhoPagina
        titulo="Acessibilidade"
        sub="Ajustes de leitura e de uso. Valem para este aparelho e ficam guardados nele."
      >
        <Button
          variant="outline"
          disabled={tudoPadrao}
          onClick={() =>
            mudarPreferencias({
              tamanho: PADRAO.tamanho,
              altoContraste: PADRAO.altoContraste,
              reduzirMovimento: PADRAO.reduzirMovimento,
              focoReforcado: PADRAO.focoReforcado,
            })
          }
        >
          Restaurar o padrão
        </Button>
      </CabecalhoPagina>
      <Secao titulo="Leitura">
        <Escolhas
          legenda="Tamanho do texto e dos controles"
          nome="tamanho"
          valor={p.tamanho}
          opcoes={TAMANHOS.map((t) => ({
            valor: t,
            rotulo: rotuloDoTamanho(t),
            amostra: (
              <span aria-hidden className="font-semibold" style={{ fontSize: `${(13 * t) / 100}px` }}>
                Aa
              </span>
            ),
          }))}
          aoMudar={(tamanho) => mudarPreferencias({ tamanho })}
        />
        <p className="mt-2 max-w-[72ch] text-xs text-tx2">
          Aumenta a tela inteira na mesma proporção, para nada se sobrepor. Em telas pequenas, as grades ganham barra de
          rolagem.
        </p>
        <div className="mt-3">
          <Opcao
            id="altoContraste"
            rotulo="Alto contraste"
            dica="Texto, rótulos e contornos mais escuros no tema claro (mais claros no escuro), e fundo puro."
            marcada={p.altoContraste}
            aoMudar={(altoContraste) => mudarPreferencias({ altoContraste })}
          />
        </div>
      </Secao>
      <Secao titulo="Movimento e foco">
        <Opcao
          id="reduzirMovimento"
          rotulo="Reduzir animações"
          dica="Janelas, listas e avisos aparecem sem transição. Se o sistema operacional já pede menos movimento, isso vale mesmo sem marcar."
          marcada={p.reduzirMovimento}
          aoMudar={(reduzirMovimento) => mudarPreferencias({ reduzirMovimento })}
        />
        <Opcao
          id="focoReforcado"
          rotulo="Foco reforçado"
          dica="O contorno do controle em foco, ao usar o teclado, fica mais grosso e com um halo em volta."
          marcada={p.focoReforcado}
          aoMudar={(focoReforcado) => mudarPreferencias({ focoReforcado })}
        />
      </Secao>
      <Secao titulo="Teclado">
        <p className="mb-2 max-w-[72ch] text-xs text-tx2">
          Tudo pode ser feito sem mouse. Na grade manual, escolha a pendência e depois a célula, em vez de arrastar.
        </p>
        <dl className="grid max-w-[72ch] grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
          {ATALHOS.map(([tecla, efeito]) => (
            <div key={tecla} className="contents">
              <dt>
                <kbd className="rounded-[3px] bg-poco px-1.5 py-px font-mono text-[11.5px] shadow-[inset_0_0_0_1px_var(--lineC)]">
                  {tecla}
                </kbd>
              </dt>
              <dd className="text-tx2">{efeito}</dd>
            </div>
          ))}
        </dl>
      </Secao>
      <p className="text-xs text-tx3">
        Para voltar tudo, incluindo tema e cor:{" "}
        <button type="button" className="text-primary underline underline-offset-2" onClick={restaurarPadrao}>
          restaurar todas as preferências
        </button>
        .
      </p>
    </>
  );
}
