/**
 * Se há um arrasto em curso numa tela de grade.
 *
 * Enquanto a mão segura uma aula, o teclado não age por baixo dela: o Ctrl+Z
 * não desfaz e o Esc é do arrasto (só o cancela). Quem pergunta são ouvintes de
 * `window`, que não estão na árvore de quem arrasta — por isso mora aqui, e não
 * no estado da página.
 */
let emCurso = false;

export const arrastoEmCurso = () => emCurso;

export function marcarArrasto(valor: boolean) {
  emCurso = valor;
}
