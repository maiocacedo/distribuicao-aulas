import { useRef, type ReactNode } from "react";
import { Alerta } from "@/componentes/alerta";
import { useConfirmar } from "@/componentes/confirmacao";
import { Button } from "@/componentes/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/componentes/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * `true` quando o rascunho mudou desde que o formulário abriu. O ponto de
 * partida é o primeiro valor não nulo; voltar a nulo (fechar) o esquece.
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

  async function fechar() {
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
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        {/* 16 px entre os campos e 20 px até o rodapé, como no modal antigo. */}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
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
