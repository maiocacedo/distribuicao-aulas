import { toast } from "sonner";

/**
 * Sucesso some sozinho; erro fica até ser fechado, porque é texto que a pessoa
 * precisa ler; "desfazer" dura o dobro do sucesso.
 */
export const avisar = {
  sucesso(texto: string, descricao?: string) {
    toast.success(texto, { description: descricao, duration: 5_000 });
  },
  erro(texto: string) {
    toast.error(texto, { duration: Infinity, closeButton: true });
  },
  /** Recusa esperada (soltar em célula impedida): informa e some. */
  aviso(texto: string) {
    toast(texto, { duration: 5_000 });
  },
  desfazer(texto: string, aoDesfazer: () => void) {
    toast(texto, { duration: 10_000, action: { label: "Desfazer", onClick: aoDesfazer } });
  },
};
