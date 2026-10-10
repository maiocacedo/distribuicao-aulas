import { escolherSala } from "./impedimentos";
import type { Ocupacao } from "./ocupacao";
import type { AulaOcupada, Contexto, FatiaRegras } from "./tipos";

/** Uma aula cuja sala deixou de servir, com as regras da fatia como ficam valendo. */
export interface AulaAReatribuir {
  aula: AulaOcupada;
  fatia: FatiaRegras;
}

export interface Reatribuicao<T> {
  /** As que mudam de sala. `sala` nula = a fatia deixou de ocupar sala. */
  trocas: { item: T; sala: number | null }[];
  /** As que não têm sala válida e livre no horário: só resta apagá-las. */
  semSala: T[];
}

/**
 * Dá outra sala, no mesmo horário, a cada aula cuja sala deixou de servir —
 * porque o requisito da disciplina mudou ou porque a sala mudou de tipo. A
 * regra é uma só para os dois cadastros, senão eles acabam discordando.
 *
 * Quem chama decide QUAIS aulas precisam de sala nova; aqui só se escolhe a
 * sala. As aulas são tratadas na ordem dada (dia e hora crescentes, para o
 * bloco ir junto) e a ocupação acompanha: a que troca passa a ocupar a sala
 * nova, e a que fica sem sala sai da ocupação, como sairá da grade.
 */
export function reatribuirSalas<T extends AulaAReatribuir>(
  ctx: Pick<Contexto, "salas">,
  oc: Ocupacao,
  itens: T[],
): Reatribuicao<T> {
  const trocas: Reatribuicao<T>["trocas"] = [];
  const semSala: T[] = [];
  for (const item of itens) {
    const { aula, fatia } = item;
    // A sala da aula vizinha da mesma fatia no mesmo dia, para o bloco não
    // trocar de sala no meio. Vale a sala que a vizinha FICA tendo: se ela
    // acabou de ser trocada, é a nova.
    const vizinha = (hora: number) => {
      const v = oc.doProfessor(aula.professorId, aula.dia, hora);
      return v && v.disciplinaId === aula.disciplinaId ? v.salaId : null;
    };
    const preferida = vizinha(aula.hora - 1) ?? vizinha(aula.hora + 1);
    // Fora da ocupação antes de escolher: a própria aula não disputa sala consigo.
    oc.retirar(aula);
    const nova = escolherSala(ctx, oc, fatia, aula.dia, aula.hora, preferida);
    if (nova === undefined) {
      semSala.push(item);
      continue;
    }
    trocas.push({ item, sala: nova });
    oc.colocar({ ...aula, salaId: nova });
  }
  return { trocas, semSala };
}
