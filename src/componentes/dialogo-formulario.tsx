import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alerta } from "@/componentes/alerta";
import { useConfirmar } from "@/componentes/confirmacao";
import { Button } from "@/componentes/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/componentes/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * `true` quando o rascunho mudou desde que o formulário abriu. O ponto de
 * partida é o primeiro valor não nulo.
 *
 * Três coisas a saber antes de usar:
 * - o ponto de partida só é esquecido quando o valor volta a `null`. Trocar um
 *   registro por outro sem passar por `null` compara o segundo com o primeiro;
 * - a comparação é pelo JSON do rascunho. O que o JSON não escreve não conta
 *   como alteração: `Set` e `Map` viram `{}`, `undefined` some. Rascunho com
 *   conjunto guarda uma lista;
 * - toda mudança depois de abrir conta, venha de quem vier. Um `setEdicao` que
 *   a tela faz sozinha (completar um campo depois de uma consulta, normalizar
 *   um valor) marca o formulário como alterado e o Esc passa a pedir
 *   confirmação: monte o rascunho inteiro antes de abrir.
 */
export function useAlterado<T>(valor: T | null): boolean {
  const inicial = useRef<string | null>(null);
  if (valor == null) inicial.current = null;
  else if (inicial.current == null) inicial.current = JSON.stringify(valor);
  return valor != null && JSON.stringify(valor) !== inicial.current;
}

/**
 * Diálogo de edição. Não fecha no clique fora: um clique errado perdia o que
 * foi digitado. Esc e Cancelar fecham, e pedem confirmação se houver alteração.
 *
 * `erro` é o alerta do formulário: recusa de regra ou falha ao gravar. Erro de
 * validação de um campo vai na prop `erro` do `Campo`; depois de uma tentativa
 * de salvar, o foco vai para o primeiro campo marcado.
 *
 * Ao fechar, o foco volta para onde estava quando o diálogo abriu (o botão
 * "Editar" da linha, o "Novo…" do cabeçalho).
 */
export function DialogoFormulario({
  titulo,
  alterado,
  salvando,
  erro,
  rotuloSalvar = "Salvar",
  largo,
  aoFechar,
  aoSalvar,
  children,
}: {
  titulo: string;
  alterado: boolean;
  salvando?: boolean;
  erro?: ReactNode;
  rotuloSalvar?: string;
  largo?: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
  children: ReactNode;
}) {
  const confirmar = useConfirmar();
  const formulario = useRef<HTMLFormElement>(null);

  // Quem tinha o foco quando o diálogo abriu. Lido no primeiro desenho, antes
  // de o diálogo existir no documento: num efeito já seria tarde, o `autoFocus`
  // de um campo teria levado o foco para dentro.
  const [origem] = useState(() => document.activeElement);

  // Cada tentativa de salvar leva o foco ao primeiro campo com erro. Espera o
  // fim da gravação porque o erro de um campo pode vir dela, e não só da
  // validação feita antes.
  const [tentativas, setTentativas] = useState(0);
  useEffect(() => {
    if (tentativas === 0 || salvando) return;
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tentativas, salvando]);

  async function fechar() {
    // Com a gravação em curso não há o que cancelar: fechar agora abriria
    // "Descartar?" sobre algo que está sendo salvo.
    if (salvando) return;
    if (
      alterado &&
      !(await confirmar({
        titulo: "Descartar as alterações?",
        descricao: "O que foi alterado neste formulário ainda não foi salvo.",
        confirmar: "Descartar",
        perigo: true,
      }))
    )
      return;
    aoFechar();
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && void fechar()}>
      <DialogContent
        className={cn(largo && "max-w-[720px]")}
        onInteractOutside={(e) => e.preventDefault()}
        // O Radix só devolve o foco a um `DialogTrigger`, e este diálogo é
        // aberto por estado: sem isto o foco cairia no `body` e quem usa o
        // teclado voltaria ao topo da página a cada edição. Se a origem saiu do
        // documento (a linha foi removida), o foco fica onde o navegador o pôs.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (origem instanceof HTMLElement && origem.isConnected) origem.focus();
        }}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        {/* 16 px entre os campos e 20 px até o rodapé, como no modal antigo. */}
        <form
          ref={formulario}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // Enter num campo envia de novo com a gravação anterior em curso.
            if (salvando) return;
            setTentativas((n) => n + 1);
            aoSalvar();
          }}
        >
          <Alerta tom="erro" className="mb-0">
            {erro}
          </Alerta>
          {children}
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={() => void fechar()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : rotuloSalvar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
