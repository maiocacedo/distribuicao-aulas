import { useEffect, useMemo, useState } from "react";
import { consultar, executar, proximoId, transacao, type Instrucao } from "../db";
import { carregarContexto } from "../regras/carregar";
import { descrever } from "../regras/descrever";
import { escolherSala, violacoesDaAula } from "../regras/impedimentos";
import { Ocupacao } from "../regras/ocupacao";
import type { AulaOcupada, FatiaRegras, Motivo } from "../regras/tipos";
import { DIAS, TURNOS, type Disciplina, type Periodo, type Professor, type Sala, type TipoDisciplina, type Turno } from "../tipos";
import {
  BotaoIcone,
  CabecalhoLista,
  Campo,
  Erro,
  Lapis,
  Lixeira,
  Modal,
  Ordenavel,
  Vazio,
  comparar,
  mensagemErro,
  type Ordem,
} from "../componentes/ui";
import { RequisitoSala, modoDe, type Modo } from "../componentes/RequisitoSala";
import { PropriedadesDisciplina } from "./Tipos";

interface Fatia {
  professor_id: number;
  aulas: number;
}

/**
 * As regras que uma edição de disciplina pode passar a violar nas aulas que
 * ela já tem. Choques de horário não entram: não mudam com o cadastro, e um
 * choque antigo apareceria aqui como se fosse culpa da edição.
 */
const MUDAM_COM_O_CADASTRO = new Set<Motivo["regra"]>(["D5", "D14", "D16", "sala-invalida"]);

type Campo = "periodo" | "nome" | "aulas_semanais" | "professores" | "marcas";

/**
 * As marcas viram um texto ordenável para que disciplinas com o mesmo
 * comportamento fiquem juntas — é assim que se acha "todas as sem sala".
 */
function marcasDe(l: Linha): string {
  return [
    !l.ofertada ? "não ofertada" : "",
    !l.exige_sala ? "sem sala" : "",
    l.tipo_sala ? `só ${l.tipo_sala}` : "",
    l.n_salas > 0 ? `${l.n_salas} sala(s)` : "",
    l.blocos_livres ? "livre" : "",
    l.permite_sabado ? "sábado" : "",
    l.turno ?? "",
    l.prioridade !== 2 ? `prio. ${l.prioridade === 1 ? "alta" : "baixa"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

interface Linha extends Disciplina {
  tipo_nome: string | null;
  professores: string | null;
  aulas_distribuidas: number;
  n_salas: number;
  n_aulas: number;
}

/** Estado do formulário: a disciplina mais as duas listas ligadas a ela. */
interface Rascunho extends Disciplina {
  fatias: Fatia[];
  salas: number[];
  aceitaveis: number[];
  /** O modo escolhido na tela; ver `modoDe` sobre por que não é derivado. */
  modoSala: Modo;
}

const novo = (cursoId: number, periodo: number): Rascunho => ({
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

export default function Disciplinas({ cursoId }: { cursoId: number }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [tipos, setTipos] = useState<TipoDisciplina[]>([]);
  const [aulasComPadrao, setChsComPadrao] = useState<Set<number>>(new Set());
  // Conversão currículo → grade, definida em Gerenciar cursos.
  const [horasPorAula, setHorasPorAula] = useState(15);
  const [turnosDoCurso, setTurnosDoCurso] = useState<string[]>(["manha", "tarde"]);
  const [filtro, setFiltro] = useState<number | "todos">("todos");
  const [edicao, setEdicao] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [ordem, setOrdem] = useState<Ordem<Campo>>({ campo: "periodo", desc: false });
  const [busca, setBusca] = useState("");

  async function carregar() {
    setLinhas(
      await consultar<Linha>(`
        SELECT d.*, t.nome AS tipo_nome,
               (SELECT GROUP_CONCAT(p.nome || ' (' || dp.aulas || ')', ', ')
                  FROM disciplina_professores dp
                  JOIN professores p ON p.id = dp.professor_id
                 WHERE dp.disciplina_id = d.id) AS professores,
               COALESCE((SELECT SUM(aulas) FROM disciplina_professores dp
                          WHERE dp.disciplina_id = d.id), 0) AS aulas_distribuidas,
               (SELECT COUNT(*) FROM disciplina_salas ds
                 WHERE ds.disciplina_id = d.id) AS n_salas,
               (SELECT COUNT(*) FROM alocacoes a
                 WHERE a.disciplina_id = d.id) AS n_aulas
        FROM disciplinas d
        LEFT JOIN tipos_disciplina t ON t.id = d.tipo_id
        WHERE d.curso_id = ?
        ORDER BY d.periodo, d.nome COLLATE NOCASE`, [cursoId]),
    );
    setPeriodos(
      await consultar<Periodo>(
        "SELECT * FROM periodos WHERE curso_id = ? ORDER BY numero", [cursoId]),
    );
    setProfessores(
      await consultar<Professor>("SELECT * FROM professores ORDER BY nome COLLATE NOCASE"),
    );
    setSalas(await consultar<Sala>("SELECT * FROM salas ORDER BY nome COLLATE NOCASE"));
    setTipos(
      await consultar<TipoDisciplina>(
        "SELECT * FROM tipos_disciplina ORDER BY nome COLLATE NOCASE",
      ),
    );
    const chs = await consultar<{ aulas: number }>("SELECT DISTINCT aulas FROM padroes_blocos");
    setChsComPadrao(new Set(chs.map((c) => c.aulas)));
    const [curso] = await consultar<{ horas_por_aula_semanal: number; turnos: string }>(
      "SELECT horas_por_aula_semanal, turnos FROM cursos WHERE id = ?", [cursoId]);
    setHorasPorAula(curso?.horas_por_aula_semanal || 15);
    setTurnosDoCurso((curso?.turnos ?? "manha,tarde").split(",").filter(Boolean));
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, [cursoId]);

  async function abrir(l: Linha) {
    const fatias = await consultar<Fatia>(
      "SELECT professor_id, aulas FROM disciplina_professores WHERE disciplina_id = ?",
      [l.id],
    );
    const ds = await consultar<{ sala_id: number; preferencia: number }>(
      "SELECT sala_id, preferencia FROM disciplina_salas WHERE disciplina_id = ?",
      [l.id],
    );
    const escolhidas = ds.map((s) => s.sala_id);
    setEdicao({
      ...l,
      fatias,
      salas: escolhidas,
      aceitaveis: ds.filter((s) => s.preferencia === 2).map((s) => s.sala_id),
      modoSala: modoDe({ ...l, salas: escolhidas }),
    });
  }

  /**
   * O que a edição faz com as aulas que a disciplina já tem: o período leva as
   * aulas junto (B3); a aula cuja sala deixou de servir troca de sala; a que
   * deixou de valer por outro motivo é apagada, com confirmação. Tudo vai na
   * mesma transação do cadastro: `antes` roda antes dele, ainda com o período
   * antigo na chave das aulas, e `depois` por último, levando-as ao novo.
   * `null` = salvar não segue (recusado, com o erro na tela, ou cancelado).
   */
  async function prepararAulas(
    d: Rascunho,
  ): Promise<{ antes: Instrucao[]; depois: Instrucao[] } | null> {
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
    if (dela.length === 0) return { antes, depois };

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

    // A sala que cada aula da disciplina fica tendo, para a vizinha da mesma
    // pessoa no mesmo dia preferir a mesma e o bloco não trocar de sala.
    const salaDe = new Map(dela.map((a) => [`${a.professor_id}:${a.dia}:${a.hora}`, a.sala_id]));
    const apagar: { a: (typeof dela)[number]; razao: string }[] = [];
    const trocar: { a: (typeof dela)[number]; sala: number | null }[] = [];
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
      const f = regras(a.professor_id);
      const motivos = violacoesDaAula(ctx, oc, f, aula).filter((m) => MUDAM_COM_O_CADASTRO.has(m.regra));
      if (motivos.length === 0) continue;

      // Sala que deixou de servir não condena a aula: o horário continua bom,
      // basta outra sala (ou nenhuma, se a disciplina deixou de ocupar sala).
      if (motivos.every((m) => m.regra === "sala-invalida")) {
        const vizinha = (h: number) => salaDe.get(`${a.professor_id}:${a.dia}:${h}`) ?? null;
        const nova = oc.sem(aula, () =>
          escolherSala(ctx, oc, f, a.dia, a.hora, vizinha(a.hora - 1) ?? vizinha(a.hora + 1)),
        );
        if (nova !== undefined) {
          trocar.push({ a, sala: nova });
          salaDe.set(`${a.professor_id}:${a.dia}:${a.hora}`, nova);
          oc.retirar(aula);
          oc.colocar({ ...aula, salaId: nova });
          continue;
        }
        apagar.push({ a, razao: "sem sala válida livre" });
      } else {
        apagar.push({ a, razao: [...new Set(motivos.map((m) => descrever(m, nomes)))].join("; ") });
      }
      salaDe.delete(`${a.professor_id}:${a.dia}:${a.hora}`);
      oc.retirar(aula);
    }

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
        setErro(
          `O ${d.periodo}º período já tem aula em ` +
            choques.map((c) => `${DIAS[c.dia]} ${c.codigo}`).join(", ") +
            ". Libere esses horários na grade antes de mudar o período.",
        );
        return null;
      }
    }

    if (apagar.length > 0) {
      const fixadas = apagar.filter((x) => x.a.fixada).length;
      const MAXIMO = 10;
      const quais = apagar
        .slice(0, MAXIMO)
        .map((x) => `- ${DIAS[x.a.dia]} ${codigos.get(x.a.hora) ?? x.a.hora} — ${x.razao}`);
      if (apagar.length > MAXIMO) quais.push(`… e mais ${apagar.length - MAXIMO}`);
      if (
        !confirm(
          `${apagar.length} aula(s) desta disciplina serão apagadas, porque deixam de valer com a mudança` +
            (fixadas ? ` (${fixadas} fixada(s))` : "") +
            `:\n\n${quais.join("\n")}` +
            (trocar.length ? `\n\nOutras ${trocar.length} aula(s) trocam de sala.` : "") +
            "\n\nContinuar?",
        )
      )
        return null;
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
    return { antes, depois };
  }

  async function salvar(d: Rascunho) {
    setErro("");
    const nome = d.nome.trim();
    if (!nome) return setErro("O nome é obrigatório.");
    if (d.fatias.length === 0) {
      return setErro("Atribua a disciplina a pelo menos um professor.");
    }
    const soma = d.fatias.reduce((s, f) => s + f.aulas, 0);
    if (soma !== d.aulas_semanais) {
      return setErro(
        `As fatias dos professores somam ${soma} aula(s), mas a disciplina tem ` +
          `${d.aulas_semanais}. Os dois têm de fechar.`,
      );
    }
    if (d.fatias.some((f) => !f.professor_id)) {
      return setErro("Há uma fatia sem professor escolhido.");
    }

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

    try {
      // Tudo o que consulta o banco fica dentro do `try`: uma falha aqui tem de
      // aparecer na tela, não sumir numa promessa rejeitada.
      const aulas = d.id ? await prepararAulas(d) : { antes: [], depois: [] };
      if (!aulas) return;

      // Uma transação só para as três tabelas. O id é reservado antes de abrir
      // a transação porque `last_insert_rowid()` não serve de referência: ele
      // muda a cada INSERT seguinte dentro da mesma transação.
      const id = d.id || (await proximoId("disciplinas"));
      const mantidos = d.fatias.map((f) => f.professor_id);
      const marcadores = mantidos.map(() => "?").join(",");

      const instrucoes: Instrucao[] = [
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

      await transacao(instrucoes);
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A disciplina"));
      await carregar();
    }
  }

  async function remover(l: Linha) {
    if (!confirm(`Remover ${l.nome}? As ${l.n_aulas} aula(s) dela na grade saem junto.`))
      return;
    setErro("");
    try {
      await executar("DELETE FROM disciplinas WHERE id = ?", [l.id]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A disciplina"));
    }
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let recorte = filtro === "todos" ? linhas : linhas.filter((l) => l.periodo === filtro);
    if (termo) recorte = recorte.filter((l) => l.nome.toLowerCase().includes(termo));
    const comMarcas = recorte.map((l) => ({ ...l, marcas: marcasDe(l) }));
    return comparar(comMarcas, ordem, (l) => `${l.periodo}${l.nome}`);
  }, [linhas, filtro, ordem, busca]);

  if (!carregando && periodos.length === 0) {
    return (
      <>
        <header className="cabecalho-pagina">
          <h1>Disciplinas</h1>
        </header>
        <Vazio>
          Cadastre os períodos do curso primeiro — uma disciplina precisa
          pertencer a um.
        </Vazio>
      </>
    );
  }

  return (
    <>
      <CabecalhoLista
        titulo="Disciplinas"
        escopo={`Curso · ${linhas.reduce((s, l) => s + l.aulas_semanais, 0)} aulas por semana`}
        contagem={`${visiveis.length} de ${linhas.length}`}
        filtro={busca}
        aoFiltrar={setBusca}
      >
        <div className="acoes-cabecalho">
          <select
            value={filtro}
            onChange={(e) =>
              setFiltro(e.target.value === "todos" ? "todos" : Number(e.target.value))
            }
          >
            <option value="todos">Todos os períodos</option>
            {periodos.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.numero}º período
              </option>
            ))}
          </select>
          <button
            className="primario"
            disabled={professores.length === 0}
            title={
              professores.length === 0 ? "Cadastre um professor antes" : undefined
            }
            onClick={() =>
              setEdicao(novo(cursoId, filtro === "todos" ? periodos[0].numero : filtro))
            }
          >
            Nova disciplina
          </button>
        </div>
      </CabecalhoLista>

      <Erro>{erro}</Erro>

      {carregando ? null : visiveis.length === 0 ? (
        <Vazio>Nenhuma disciplina neste recorte.</Vazio>
      ) : (
        <table className="lista">
          <thead>
            <tr>
              <Ordenavel campo="periodo" ordem={ordem} aoOrdenar={setOrdem} numerico centro>
                Período
              </Ordenavel>
              <Ordenavel campo="nome" ordem={ordem} aoOrdenar={setOrdem}>
                Disciplina
              </Ordenavel>
              <Ordenavel campo="aulas_semanais" ordem={ordem} aoOrdenar={setOrdem} numerico centro>
                Aulas
              </Ordenavel>
              <Ordenavel campo="professores" ordem={ordem} aoOrdenar={setOrdem}>
                Professores
              </Ordenavel>
              <Ordenavel campo="marcas" ordem={ordem} aoOrdenar={setOrdem}>
                Marcas
              </Ordenavel>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td className="num centro fraco">{l.periodo}º</td>
                <td>
                  <span className="forte">{l.nome}</span>
                  {l.tipo_nome && <span className="fraco"> · {l.tipo_nome}</span>}
                </td>
                <td className="num centro">
                  {l.aulas_semanais}
                  {l.aulas_distribuidas !== l.aulas_semanais && (
                    <span className="aviso-inline" title="fatias não fecham com a CH">
                      !
                    </span>
                  )}
                </td>
                <td>
                  {l.professores ?? <span className="fraco">sem professor</span>}
                </td>
                <td>
                  {!l.ofertada && <span className="marca-prop">não ofertada</span>}
                  {!l.exige_sala && <span className="marca-prop">sem sala</span>}
                  {l.n_salas > 0 && (
                    <span className="marca-prop">{l.n_salas} sala(s)</span>
                  )}
                  {l.blocos_livres ? <span className="marca-prop">livre</span> : null}
                  {l.permite_sabado ? <span className="marca-prop">sábado</span> : null}
                  {l.turno && <span className="marca-prop">{l.turno}</span>}
                  {l.prioridade !== 2 && (
                    <span className="marca-prop">
                      prio. {l.prioridade === 1 ? "alta" : "baixa"}
                    </span>
                  )}
                </td>
                <td className="acoes">
                  <BotaoIcone rotulo="Editar" aoClicar={() => abrir(l)}>
                    <Lapis />
                  </BotaoIcone>
                  <BotaoIcone rotulo="Remover" perigo aoClicar={() => remover(l)}>
                    <Lixeira />
                  </BotaoIcone>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edicao && (
        <Editor
          valor={edicao}
          periodos={periodos}
          professores={professores}
          salas={salas}
          tipos={tipos}
          aulasComPadrao={aulasComPadrao}
          horasPorAula={horasPorAula}
          turnosDoCurso={turnosDoCurso}
          aoMudar={setEdicao}
          aoSalvar={salvar}
          aoFechar={() => setEdicao(null)}
        />
      )}
    </>
  );
}

function Editor({
  valor,
  periodos,
  professores,
  salas,
  tipos,
  aulasComPadrao,
  horasPorAula,
  turnosDoCurso,
  aoMudar,
  aoSalvar,
  aoFechar,
}: {
  valor: Rascunho;
  periodos: Periodo[];
  professores: Professor[];
  salas: Sala[];
  tipos: TipoDisciplina[];
  aulasComPadrao: Set<number>;
  horasPorAula: number;
  turnosDoCurso: string[];
  aoMudar: (v: Rascunho) => void;
  aoSalvar: (v: Rascunho) => void;
  aoFechar: () => void;
}) {
  const soma = valor.fatias.reduce((s, f) => s + f.aulas, 0);
  const fecha = soma === valor.aulas_semanais;
  const turnoPeriodo = periodos.find((p) => p.numero === valor.periodo)?.turno;
  // O gerador planeja cada professor separadamente: o padrão que importa é o
  // da fatia, não o do total da disciplina (B9).
  const cargas = valor.fatias.length ? valor.fatias.map((f) => f.aulas) : [valor.aulas_semanais];
  const semPadrao = valor.blocos_livres ? [] : [...new Set(cargas)].filter((n) => !aulasComPadrao.has(n));

  const aplicarTipo = (id: number | null) => {
    const t = tipos.find((x) => x.id === id);
    if (!t) return aoMudar({ ...valor, tipo_id: null });
    // O molde traz o requisito de sala junto, então o modo tem de acompanhar.
    aoMudar({
      ...valor,
      tipo_id: t.id,
      exige_sala: t.exige_sala,
      tipo_sala: t.tipo_sala,
      salas: [],
      aceitaveis: [],
      modoSala: modoDe({ exige_sala: t.exige_sala, tipo_sala: t.tipo_sala, salas: [] }),
      blocos_livres: t.blocos_livres,
      prioridade: t.prioridade,
      permite_sabado: t.permite_sabado,
      optativa: t.optativa,
    });
  };

  const disponiveis = professores.filter(
    (p) => !valor.fatias.some((f) => f.professor_id === p.id),
  );

  return (
    <Modal
      titulo={valor.id ? "Editar disciplina" : "Nova disciplina"}
      aoFechar={aoFechar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(valor);
        }}
      >
        <div className="linha-campos">
          <Campo rotulo="Nome">
            <input
              autoFocus
              value={valor.nome}
              onChange={(e) => aoMudar({ ...valor, nome: e.target.value })}
            />
          </Campo>
          <Campo
            rotulo="Abreviação"
            dica="Como aparece na célula da grade. Vazio usa o nome completo."
          >
            <input
              className="curto-medio"
              placeholder={valor.nome.slice(0, 18)}
              value={valor.abreviacao ?? ""}
              onChange={(e) =>
                aoMudar({ ...valor, abreviacao: e.target.value || null })
              }
            />
          </Campo>
        </div>

        <div className="linha-campos">
          <Campo rotulo="Período">
            <select
              value={valor.periodo}
              onChange={(e) => aoMudar({ ...valor, periodo: Number(e.target.value) })}
            >
              {periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.numero}º ({p.turno})
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Aulas por semana">
            <input
              type="number"
              min={1}
              max={40}
              value={valor.aulas_semanais}
              onChange={(e) =>
                aoMudar({ ...valor, aulas_semanais: Number(e.target.value) })
              }
            />
          </Campo>
          <Campo
            rotulo="Carga do currículo"
            dica={`${horasPorAula}h equivalem a 1 aula por semana`}
          >
            <input
              type="number"
              min={0}
              step={horasPorAula}
              value={valor.aulas_semanais * horasPorAula}
              onChange={(e) =>
                aoMudar({
                  ...valor,
                  aulas_semanais: Math.max(
                    1,
                    Math.round(Number(e.target.value) / horasPorAula),
                  ),
                })
              }
            />
          </Campo>
        </div>

        {semPadrao.length > 0 && (
          <p className="aviso">
            Não há padrões de bloco cadastrados para fatia(s) de {semPadrao.join(", ")} aula(s). O
            gerador planeja cada professor separadamente e não saberá dividir essa carga —
            cadastre os padrões na página Regras, ou marque a disciplina como "blocos livres".
          </p>
        )}

        {tipos.length > 0 && (
          <Campo
            rotulo="Tipo"
            dica="Preenche as propriedades abaixo de uma vez. Depois você pode ajustar cada uma."
          >
            <select
              value={valor.tipo_id ?? ""}
              onChange={(e) =>
                aplicarTipo(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Sem tipo</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <fieldset>
          <legend>
            Professores
            <span className={fecha ? "contador ok" : "contador falta"}>
              {soma} de {valor.aulas_semanais} aulas
            </span>
          </legend>
          <p className="explica">
            A carga pode ser repartida entre vários professores. Cada fatia é
            planejada em blocos próprios, como se fosse uma disciplina.
          </p>
          {valor.fatias.map((f, i) => (
            <div key={i} className="linha-fatia">
              <select
                value={f.professor_id}
                onChange={(e) => {
                  const fatias = [...valor.fatias];
                  fatias[i] = { ...f, professor_id: Number(e.target.value) };
                  aoMudar({ ...valor, fatias });
                }}
              >
                <option value={0}>escolha…</option>
                {professores.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={
                      p.id !== f.professor_id &&
                      valor.fatias.some((o) => o.professor_id === p.id)
                    }
                  >
                    {p.nome}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="curto"
                min={1}
                value={f.aulas}
                onChange={(e) => {
                  const fatias = [...valor.fatias];
                  fatias[i] = { ...f, aulas: Number(e.target.value) };
                  aoMudar({ ...valor, fatias });
                }}
              />
              <button
                type="button"
                className="perigo"
                onClick={() =>
                  aoMudar({
                    ...valor,
                    fatias: valor.fatias.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          {disponiveis.length > 0 && (
            <button
              type="button"
              onClick={() =>
                aoMudar({
                  ...valor,
                  fatias: [
                    ...valor.fatias,
                    {
                      professor_id: disponiveis[0].id,
                      aulas: Math.max(1, valor.aulas_semanais - soma),
                    },
                  ],
                })
              }
            >
              Adicionar professor
            </button>
          )}
        </fieldset>

        <div className="marcadores">
          <label>
            <input
              type="checkbox"
              checked={!!valor.ofertada}
              onChange={() => aoMudar({ ...valor, ofertada: valor.ofertada ? 0 : 1 })}
            />
            <span>
              Ofertada neste semestre
              <em>desmarcada, sai da grade, das pendências e do gerador, mas continua cadastrada</em>
            </span>
          </label>
        </div>

        <PropriedadesDisciplina
          valor={valor}
          aoMudar={(v) => aoMudar({ ...valor, ...v })}
        />

        <Campo
          rotulo="Turno"
          dica={`Por padrão segue o período (${turnoPeriodo ?? "—"}). Forçar um turno é regra: o gerador e a grade manual não põem a disciplina fora dele.`}
        >
          <select
            value={valor.turno ?? ""}
            onChange={(e) =>
              aoMudar({ ...valor, turno: (e.target.value || null) as Turno | null })
            }
          >
            <option value="">Segue o período</option>
            {TURNOS.filter((t) => turnosDoCurso.includes(t.valor) || t.valor === valor.turno).map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <RequisitoSala
          valor={valor}
          modo={valor.modoSala}
          salas={salas}
          permitirEspecificas
          aoMudar={(v, m) =>
            aoMudar({ ...valor, ...v, salas: v.salas ?? [], aceitaveis: v.aceitaveis ?? [], modoSala: m })
          }
        />

        <Campo rotulo="Observação">
          <textarea
            rows={2}
            value={valor.observacao ?? ""}
            onChange={(e) =>
              aoMudar({ ...valor, observacao: e.target.value || null })
            }
          />
        </Campo>

        <div className="rodape-modal">
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="primario" disabled={!fecha}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
