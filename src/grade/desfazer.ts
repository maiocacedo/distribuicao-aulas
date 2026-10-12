import { avisar } from "@/componentes/toasts";
import { mensagemErro } from "@/lib/erros";
import { historico } from ".";

/** O mesmo caminho para o toast, o botão e o Ctrl+Z. */
export async function desfazerEAvisar() {
  try {
    const rotulo = await historico.desfazer();
    if (rotulo) avisar.sucesso(`Desfeito: ${rotulo}`);
  } catch (e) {
    avisar.erro(`Não foi possível desfazer. ${mensagemErro(e, "A grade")}`);
  }
}
