import { consultar, type Instrucao } from "../../db";
import { carregarContexto } from "../../regras/carregar";
import { descrever } from "../../regras/descrever";
import { violacoesDaAula } from "../../regras/impedimentos";
import { Ocupacao } from "../../regras/ocupacao";
import { reatribuirSalas } from "../../regras/reatribuir";
import type { AulaOcupada, FatiaRegras, Motivo } from "../../regras/tipos";
import { DIAS, type Disciplina, type Professor, type Sala } from "../../tipos";
import type { Modo } from "../../componentes/RequisitoSala";

export interface Fatia {
  professor_id: number;
  aulas: number;
}

/**
 * As regras que uma edição de disciplina pode passar a violar nas aulas que
 * ela já tem. Choques de horário não entram: não mudam com o cadastro, e um
 * choque antigo apareceria aqui como se fosse culpa da edição.
 */
const MUDAM_COM_O_CADASTRO = new Set<Motivo["regra"]>(["D5", "D14", "D16", "sala-invalida"]);

export interface Linha extends Disciplina {
  tipo_nome: string | null;
  professores: string | null;
  aulas_distribuidas: number;
  n_salas: number;
  n_aulas: number;
}

/** Estado do formulário: a disciplina mais as duas listas ligadas a ela. */
export interface Rascunho extends Disciplina {
  fatias: Fatia[];
  salas: number[];
  aceitaveis: number[];
  /** O modo escolhido na tela; ver `modoDe` sobre por que não é derivado. */
  modoSala: Modo;
}

export const novo = (cursoId: number, periodo: number): Rascunho => ({
  id: 0,
  curso_id: cursoId,
  nome: "",
  abreviacao: null,
  tipo_id: null,
  periodo,
  aulas_semanais: 4,
  permite_sabado: 0,
  turno: null,
  optativa: 0,
  ofertada: 1,
  exige_sala: 1,
  tipo_sala: null,
  blocos_livres: 0,
  prioridade: 2,
  observacao: null,
  fatias: [],
  salas: [],
  aceitaveis: [],
  modoSala: "qualquer",
});

/** O que a tela cadastrou e `prepararAulas` precisa para consultar as regras. */
export interface EntradaDasAulas {
  cursoId: number;
  linhas: Linha[];
  professores: Professor[];
  salas: Sala[];
}

/** Aulas que a edição apagaria, já descritas para o diálogo de confirmação. */
export interface AulasAApagar {
  /** Até 10 linhas "dia código — motivo"; a última resume as que não couberam. */
  itens: string[];
  total: number;
  fixadas: number;
  /** Aulas que, além das apagadas, trocam de sala. */
  trocadas: number;
}

/**
 * Resultado de `prepararAulas`. `recusa` é a mensagem para o erro da tela
 * (salvar não segue); senão, `apagadas` não-nulo pede confirmação antes de
 * seguir, e `antes`/`depois` são as instruções a pôr na transação.
 */
export type PlanoDasAulas =
  | { recusa: string }
  | { recusa?: undefined; antes: Instrucao[]; depois: Instrucao[]; apagadas: AulasAApagar | null };

/**
 * O que a edição faz com as aulas que a disciplina já tem: o período leva as
 * aulas junto (B3); a aula cuja sala deixou de servir troca de sala; a que
 * deixou de valer por outro motivo é apagada, com confirmação. Tudo vai na
 * mesma transação do cadastro: `antes` roda antes dele, ainda com o período
 * antigo na chave das aulas, e `depois` por último, levando-as ao novo.
 * Quem chama pergunta e avisa: o plano devolve a recusa ou o que confirmar.
 */
export async function prepararAulas(d: Rascunho, entrada: EntradaDasAulas): Promise<PlanoDasAulas> {
  const { cursoId, linhas, professores, salas } = entrada;
  const antes: Instrucao[] = [];
  const depois: Instrucao[] = [];
  const original = linhas.find((l) => l.id === d.id);
  const mudouPeriodo = !!original && original.periodo !== d.periodo;
  const dela = (
    await consultar<{
      curso_id: number;
      periodo: number;
      dia: number;
      hora: number;
      professor_id: number;
      sala_id: number | null;
      fixada: number;
    }>(
      `SELECT curso_id, periodo, dia, hora, professor_id, sala_id, fixada FROM alocacoes
        WHERE disciplina_id = ? ORDER BY dia, hora`,
      [d.id],
    )
  ).filter((a) => d.fatias.some((f) => f.professor_id === a.professor_id));
  if (dela.length === 0) return { antes, depois, apagadas: null };

  const ctx = await carregarContexto(cursoId, consultar);
  const codigos = new Map(
    (await consultar<{ indice: number; codigo: string }>("SELECT indice, codigo FROM horarios")).map(
      (h) => [h.indice, h.codigo],
    ),
  );
  const todas = (
    await consultar<{
      curso_id: number;
      periodo: number;
      dia: number;
      hora: number;
      disciplina_id: number;
      professor_id: number;
      sala_id: number | null;
    }>("SELECT curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id FROM alocacoes")
  ).map(
    (a): AulaOcupada => ({
      cursoId: a.curso_id,
      periodo: a.disciplina_id === d.id ? d.periodo : a.periodo,
      dia: a.dia,
      hora: a.hora,
      disciplinaId: a.disciplina_id,
      professorId: a.professor_id,
      salaId: a.sala_id,
    }),
  );
  const oc = new Ocupacao(cursoId, todas);
  const regras = (professorId: number): FatiaRegras => ({
    disciplinaId: d.id,
    professorId,
    periodo: d.periodo,
    permiteSabado: !!d.permite_sabado,
    turno: d.turno,
    exigeSala: !!d.exige_sala,
    tipoSala: d.tipo_sala,
    salas:
      d.exige_sala && !d.tipo_sala
        ? d.salas.map((id) => ({ id, preferencia: d.aceitaveis.includes(id) ? 2 : 1 }))
        : [],
    ofertada: !!d.ofertada,
  });
  const nomes = {
    cursoAtual: cursoId,
    professor: (id: number) => professores.find((p) => p.id === id)?.nome ?? `#${id}`,
    curso: (id: number) => `#${id}`,
    sala: (id: number) => salas.find((s) => s.id === id)?.nome ?? `#${id}`,
  };

  // Primeiro saem as aulas que deixam de valer pelo horário; só depois as de
  // sala inválida procuram sala, para o bloco não seguir a sala de uma
  // vizinha que vai ser apagada. A ordem não muda quem viola o quê: são
  // regras do cadastro, não da ocupação (ver MUDAM_COM_O_CADASTRO).
  type Aula = (typeof dela)[number];
  const razoes = new Map<Aula, string>();
  const semServir: { a: Aula; aula: AulaOcupada; fatia: FatiaRegras }[] = [];
  for (const a of dela) {
    const aula: AulaOcupada = {
      cursoId: a.curso_id,
      periodo: d.periodo,
      dia: a.dia,
      hora: a.hora,
      disciplinaId: d.id,
      professorId: a.professor_id,
      salaId: a.sala_id,
    };
    const fatia = regras(a.professor_id);
    const motivos = violacoesDaAula(ctx, oc, fatia, aula).filter((m) => MUDAM_COM_O_CADASTRO.has(m.regra));
    if (motivos.length === 0) continue;

    // Sala que deixou de servir não condena a aula: o horário continua bom,
    // basta outra sala (ou nenhuma, se a disciplina deixou de ocupar sala).
    if (motivos.every((m) => m.regra === "sala-invalida")) {
      semServir.push({ a, aula, fatia });
      continue;
    }
    razoes.set(a, [...new Set(motivos.map((m) => descrever(m, nomes)))].join("; "));
    oc.retirar(aula);
  }
  const { trocas, semSala } = reatribuirSalas(ctx, oc, semServir);
  for (const x of semSala) razoes.set(x.a, "sem sala válida livre");
  // Na ordem das aulas (dia, hora), que é a ordem em que o diálogo as lista.
  const apagar = dela.filter((a) => razoes.has(a)).map((a) => ({ a, razao: razoes.get(a)! }));
  const trocar = trocas.map((t) => ({ a: t.item.a, sala: t.sala }));

  // O choque de período só conta para as aulas que ficam: a que vai ser
  // apagada não ocupa o horário no período novo.
  if (mudouPeriodo) {
    const choques = (
      await consultar<{ dia: number; hora: number; codigo: string }>(
        `SELECT a.dia, a.hora, h.codigo FROM alocacoes a JOIN horarios h ON h.indice = a.hora
          WHERE a.curso_id = ? AND a.periodo = ? AND a.disciplina_id <> ?
            AND EXISTS (SELECT 1 FROM alocacoes b
                         WHERE b.disciplina_id = ? AND b.dia = a.dia AND b.hora = a.hora)
          ORDER BY a.dia, a.hora`,
        [cursoId, d.periodo, d.id, d.id],
      )
    ).filter((c) => !apagar.some((x) => x.a.dia === c.dia && x.a.hora === c.hora));
    if (choques.length > 0) {
      return {
        recusa:
          `O ${d.periodo}º período já tem aula em ` +
          choques.map((c) => `${DIAS[c.dia]} ${c.codigo}`).join(", ") +
          ". Libere esses horários na grade antes de mudar o período.",
      };
    }
  }

  let apagadas: AulasAApagar | null = null;
  if (apagar.length > 0) {
    const fixadas = apagar.filter((x) => x.a.fixada).length;
    const MAXIMO = 10;
    const quais = apagar
      .slice(0, MAXIMO)
      .map((x) => `${DIAS[x.a.dia]} ${codigos.get(x.a.hora) ?? x.a.hora} — ${x.razao}`);
    if (apagar.length > MAXIMO) quais.push(`… e mais ${apagar.length - MAXIMO}`);
    apagadas = { itens: quais, total: apagar.length, fixadas, trocadas: trocar.length };
  }

  // Pela chave com o período antigo: o UPDATE de período vem depois.
  antes.push(
    ...apagar.map((x) => ({
      sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
      params: [x.a.curso_id, x.a.periodo, x.a.dia, x.a.hora],
    })),
    ...trocar.map((x) => ({
      sql: "UPDATE alocacoes SET sala_id = ? WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
      params: [x.sala, x.a.curso_id, x.a.periodo, x.a.dia, x.a.hora],
    })),
  );
  if (mudouPeriodo) {
    depois.push({
      sql: "UPDATE alocacoes SET periodo = ? WHERE disciplina_id = ?",
      params: [d.periodo, d.id],
    });
  }
  return { antes, depois, apagadas };
}

/** A recusa do formulário antes de qualquer consulta; `null` = pode seguir. */
export function validarRascunho(d: Rascunho): string | null {
  const nome = d.nome.trim();
  if (!nome) return "O nome é obrigatório.";
  if (d.fatias.length === 0) {
    return "Atribua a disciplina a pelo menos um professor.";
  }
  const soma = d.fatias.reduce((s, f) => s + f.aulas, 0);
  if (soma !== d.aulas_semanais) {
    return (
      `As fatias dos professores somam ${soma} aula(s), mas a disciplina tem ` +
      `${d.aulas_semanais}. Os dois têm de fechar.`
    );
  }
  if (d.fatias.some((f) => !f.professor_id)) {
    return "Há uma fatia sem professor escolhido.";
  }
  return null;
}

/**
 * As instruções da transação que grava a disciplina, suas fatias e salas.
 * `id` já vem reservado por `proximoId` quando a disciplina é nova (e `d.id`
 * é 0); `aulas` é o que `prepararAulas` mandou rodar antes e depois.
 */
export function montarInstrucoes(
  cursoId: number,
  d: Rascunho,
  id: number,
  aulas: { antes: Instrucao[]; depois: Instrucao[] },
): Instrucao[] {
  const nome = d.nome.trim();
  const campos = [
    cursoId,
    nome,
    d.abreviacao?.trim() || null,
    d.tipo_id,
    d.periodo,
    d.aulas_semanais,
    d.permite_sabado,
    d.turno,
    d.optativa,
    d.ofertada,
    d.exige_sala,
    d.tipo_sala,
    d.blocos_livres,
    d.prioridade,
    d.observacao,
  ];
  const mantidos = d.fatias.map((f) => f.professor_id);
  const marcadores = mantidos.map(() => "?").join(",");

  return [
    ...aulas.antes,
    d.id
      ? {
          sql: `UPDATE disciplinas SET curso_id = ?, nome = ?, abreviacao = ?,
                           tipo_id = ?, periodo = ?, aulas_semanais = ?,
                           permite_sabado = ?, turno = ?, optativa = ?, ofertada = ?,
                           exige_sala = ?, tipo_sala = ?, blocos_livres = ?,
                           prioridade = ?, observacao = ?
                      WHERE id = ?`,
          params: [...campos, id],
        }
      : {
          sql: `INSERT INTO disciplinas (curso_id, nome, abreviacao, tipo_id,
                           periodo, aulas_semanais, permite_sabado, turno,
                           optativa, ofertada, exige_sala, tipo_sala, blocos_livres,
                           prioridade, observacao, id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [...campos, id],
        },

    // As aulas já alocadas referenciam (disciplina, professor). Tirar um
    // professor que ainda tem aula na grade viola a chave estrangeira — e
    // é isso mesmo que deve acontecer: primeiro se limpa a grade dele.
    {
      sql: `DELETE FROM disciplina_professores
                 WHERE disciplina_id = ? AND professor_id NOT IN (${marcadores})`,
      params: [id, ...mantidos],
    },

    ...d.fatias.map((f) => ({
      sql: `INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas)
                VALUES (?, ?, ?)
                ON CONFLICT(disciplina_id, professor_id) DO UPDATE SET aulas = excluded.aulas`,
      params: [id, f.professor_id, f.aulas],
    })),

    { sql: "DELETE FROM disciplina_salas WHERE disciplina_id = ?", params: [id] },

    // Lista específica e requisito por tipo são alternativas: só uma das
    // duas chega a ter conteúdo, garantido pelo seletor de modo.
    ...(d.exige_sala && !d.tipo_sala
      ? d.salas.map((sala) => ({
          sql: "INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (?, ?, ?)",
          params: [id, sala, d.aceitaveis.includes(sala) ? 2 : 1],
        }))
      : []),

    // Por último: as aulas mudam de período depois que a disciplina já está nele.
    ...aulas.depois,
  ];
}
