import type { Fatia, PadraoDeBloco, Problema } from "./tipos";

/**
 * Todas as partições de `n` em partes decrescentes. Usado só por fatias com
 * `blocosLivres`, que ignoram a tabela de padrões — uma disciplina de projeto
 * pode fazer 3+1+1+1, que nenhum padrão cadastrado descreve.
 */
export function particoes(n: number): number[][] {
  const saida: number[][] = [];
  const passo = (resto: number, maximo: number, atual: number[]) => {
    if (resto === 0) {
      saida.push([...atual]);
      return;
    }
    for (let p = Math.min(resto, maximo); p >= 1; p--) {
      atual.push(p);
      passo(resto - p, p, atual);
      atual.pop();
    }
  };
  passo(n, n, []);
  return saida;
}

/**
 * Os padrões de bloco que uma fatia pode usar, do mais barato ao mais caro.
 *
 * Fatia com blocos livres aceita qualquer partição, a custo zero. As demais
 * ficam restritas ao que a tabela `padroes_blocos` autoriza — um número de
 * aulas sem nenhum padrão cadastrado simplesmente não tem como ser alocado, e
 * é melhor descobrir isso aqui do que depois de uma busca inútil.
 */
export function padroesDe(f: Fatia, problema: Problema): PadraoDeBloco[] {
  if (f.blocosLivres) {
    return particoes(f.aulas)
      .map((partes) => ({ partes, custo: 0 }))
      // Menos blocos primeiro: aulas seguidas costumam ser preferíveis, e
      // ainda por cima podam a busca mais cedo.
      .sort((a, b) => a.partes.length - b.partes.length);
  }
  return [...(problema.padroes[f.aulas] ?? [])].sort((a, b) => a.custo - b.custo);
}

/**
 * Dois horários são vizinhos se os índices são consecutivos E o turno é o
 * mesmo. É o que impede um bloco de atravessar o intervalo entre turnos: 11:10
 * e 13:00 podem ser índices 4 e 6, mas não formam aula seguida.
 */
export function blocoCabeNoDia(
  problema: Problema,
  horaInicio: number,
  tamanho: number,
): boolean {
  const hs = problema.horarios;
  if (horaInicio + tamanho > hs.length) return false;
  for (let i = 1; i < tamanho; i++) {
    const anterior = hs[horaInicio + i - 1];
    const atual = hs[horaInicio + i];
    if (atual.indice !== anterior.indice + 1) return false;
    if (atual.turno !== anterior.turno) return false;
  }
  return true;
}
