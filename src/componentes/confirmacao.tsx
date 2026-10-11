import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/componentes/ui/alert-dialog";

export interface OpcoesDeConfirmacao {
  titulo: string;
  descricao?: string;
  /** Uma linha por item atingido: a lista rola, o diálogo não cresce. */
  itens?: string[];
  /** Rótulo do botão que confirma, com o verbo da ação. */
  confirmar: string;
  /** Ação destrutiva: o botão ganha a cor de negativo. */
  perigo?: boolean;
}

type Confirmar = (o: OpcoesDeConfirmacao) => Promise<boolean>;

const Contexto = createContext<Confirmar | null>(null);

export function useConfirmar(): Confirmar {
  const confirmar = useContext(Contexto);
  if (!confirmar) throw new Error("useConfirmar fora do ProvedorDeConfirmacao");
  return confirmar;
}

/**
 * Um diálogo só para o app inteiro, aberto por promessa: quem chama escreve
 * `if (!(await confirmar({ … }))) return;`, como fazia com o `confirm` nativo.
 */
export function ProvedorDeConfirmacao({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<OpcoesDeConfirmacao | null>(null);
  const resolver = useRef<((aceito: boolean) => void) | null>(null);
  // Quem tinha o foco quando a confirmação foi pedida: o botão "Remover" da
  // linha, um campo do formulário que o Esc quis fechar.
  const origem = useRef<Element | null>(null);

  const confirmar = useCallback<Confirmar>(
    (o) =>
      new Promise((resolve) => {
        // Só o primeiro pedido de uma sequência guarda a origem. Num pedido
        // feito com outro ainda aberto, ou logo depois de outro ser aceito, o
        // foco está no diálogo anterior ou já caiu no `body`.
        origem.current ??= document.activeElement;
        // Um pedido novo por cima de outro ainda aberto recusa o anterior;
        // sem isso a promessa dele ficaria pendente para sempre.
        resolver.current?.(false);
        resolver.current = resolve;
        setPedido(o);
      }),
    [],
  );

  // Aceitar também dispara o fechamento; o segundo chamado acha `resolver` vazio.
  const responder = (aceito: boolean) => {
    resolver.current?.(aceito);
    resolver.current = null;
    setPedido(null);
  };

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      <AlertDialog open={pedido != null} onOpenChange={(aberto) => !aberto && responder(false)}>
        {pedido && (
          // Sem descrição, o Radix avisa no console que falta o alvo do
          // `aria-describedby`; passá-lo vazio desliga o aviso.
          <AlertDialogContent
            {...(pedido.descricao ? {} : { "aria-describedby": undefined })}
            // O `Modal` antigo escuta Esc na janela; sem isto, cancelar a
            // confirmação com Esc fecharia também o formulário por baixo.
            onEscapeKeyDown={(e) => e.stopPropagation()}
            // O Radix só devolve o foco a um `AlertDialogTrigger`, e este
            // diálogo é aberto por promessa: sem isto o foco cairia no `body`,
            // e recusar o descarte de um formulário tiraria o foco dele. Se a
            // origem saiu do documento (a linha removida, o formulário
            // descartado), o foco fica com quem o pegou.
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              // Outra confirmação já foi pedida: a origem vale até a última.
              if (resolver.current) return;
              const elemento = origem.current;
              origem.current = null;
              if (elemento instanceof HTMLElement && elemento.isConnected) elemento.focus();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{pedido.titulo}</AlertDialogTitle>
              {pedido.descricao && <AlertDialogDescription>{pedido.descricao}</AlertDialogDescription>}
            </AlertDialogHeader>
            {pedido.itens && pedido.itens.length > 0 && (
              <ul className="max-h-48 overflow-auto rounded-md bg-poco px-3 py-2 text-sm">
                {pedido.itens.map((item, i) => (
                  <li key={`${i}-${item}`}>{item}</li>
                ))}
              </ul>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant={pedido.perigo ? "destructive" : "default"} onClick={() => responder(true)}>
                {pedido.confirmar}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </Contexto.Provider>
  );
}
