import { avisar } from "@/componentes/toasts";
import { mensagemErro } from "@/lib/erros";
import { historico } from ".";

// O toast de "Desfazer" fala da ação que era o topo do histórico. Qualquer
// mudança de estado — outra ação da grade, um desfazer, o histórico zerado por
// um cadastro ou pela troca de curso — o torna mentiroso, e ele fecha. A ação
// grava e publica ANTES de a tela abrir o toast dela: o novo nunca é fechado
// pela ação que o gerou.
historico.assinar(() => avisar.fecharDesfazer());

/** O mesmo caminho para o toast, o botão e o Ctrl+Z. */
export async function desfazerEAvisar() {
  try {
    const rotulo = await historico.desfazer();
    if (rotulo) avisar.sucesso(`Desfeito: ${rotulo}`);
  } catch (e) {
    avisar.erro(`Não foi possível desfazer. ${mensagemErro(e, "A grade")}`);
  }
}
