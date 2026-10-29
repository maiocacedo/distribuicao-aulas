import { toast } from "sonner";

/** O toast de "Desfazer" aberto agora. Só há um: ver `desfazer`. */
let desfazerAberto: string | number | null = null;

function fecharDesfazer() {
  if (desfazerAberto == null) return;
  toast.dismiss(desfazerAberto);
  desfazerAberto = null;
}

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
  /**
   * O "Desfazer" do toast desfaz sempre o topo do histórico, e só o toast da
   * ação do topo diz a verdade: abrir um fecha o anterior. Quem sabe que o
   * histórico mudou por outro caminho (outra ação, um desfazer, o histórico
   * zerado) chama `fecharDesfazer`.
   */
  desfazer(texto: string, aoDesfazer: () => void) {
    fecharDesfazer();
    desfazerAberto = toast(texto, { duration: 10_000, action: { label: "Desfazer", onClick: aoDesfazer } });
  },
  fecharDesfazer,
};
