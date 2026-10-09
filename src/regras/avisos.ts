import type { Turno } from "./tipos";

/**
 * O que a grade manual avisa numa pendência: o que faria o gerador recusar a
 * fatia como está. Não bloqueia — montando à mão, a fatia passa por estados
 * incompletos —, só aponta. `padroes` são os padrões cadastrados para o total
 * da fatia, na forma canônica decrescente ("3+1").
 */
export function avisosDaFatia(
  aulas: { dia: number; hora: number }[],
  total: number,
  blocosLivres: boolean,
  padroes: string[] | undefined,
  turnoDaHora: Map<number, Turno>,
): string[] {
  const avisos: string[] = [];
  if (!blocosLivres && !padroes?.length) avisos.push(`sem padrão de bloco para ${total} aula(s)`);

  const blocos: number[] = [];
  let doisNoDia = false;
  for (const dia of new Set(aulas.map((x) => x.dia))) {
    const horas = aulas.filter((x) => x.dia === dia).map((x) => x.hora).sort((x, y) => x - y);
    let doDia = 0;
    let tamanho = 1;
    for (let i = 1; i <= horas.length; i++) {
      const emenda =
        i < horas.length && horas[i] === horas[i - 1] + 1 && turnoDaHora.get(horas[i]) === turnoDaHora.get(horas[i - 1]);
      if (emenda) tamanho++;
      else {
        blocos.push(tamanho);
        doDia++;
        tamanho = 1;
      }
    }
    if (doDia > 1) doisNoDia = true;
  }
  if (doisNoDia) avisos.push("dois blocos no mesmo dia");

  if (!blocosLivres && padroes?.length && aulas.length === total) {
    const usado = blocos.sort((x, y) => y - x).join("+");
    if (!padroes.includes(usado)) avisos.push(`padrão ${usado} não cadastrado`);
  }
  return avisos;
}
