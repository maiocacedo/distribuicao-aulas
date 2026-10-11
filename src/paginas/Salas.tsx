import { useEffect, useMemo, useState } from "react";
import { consultar, executar, transacao, type Instrucao } from "../db";
import { Ocupacao } from "../regras/ocupacao";
import { reatribuirSalas } from "../regras/reatribuir";
import type { AulaOcupada, FatiaRegras } from "../regras/tipos";
import { DIAS, TIPOS_SALA, type Sala } from "../tipos";
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
} from "../componentes/legado";

interface Linha extends Sala {
  n_disciplinas: number;
  n_aulas: number;
}

type Campo = "nome" | "tipo" | "capacidade" | "n_disciplinas" | "n_aulas";

const vazio = (): Sala => ({ id: 0, nome: "", tipo: "Sala de Aula", capacidade: 40 });

/** Id que nenhum curso tem: a sala é da instituição, e esta tela não monta a grade de curso nenhum. */
const NENHUM_CURSO = 0;

export default function Salas() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<Sala | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [ordem, setOrdem] = useState<Ordem<Campo>>({ campo: "nome", desc: false });
  const [busca, setBusca] = useState("");

  async function carregar() {
    setLinhas(
      await consultar<Linha>(`
        SELECT s.*,
               (SELECT COUNT(*) FROM disciplina_salas ds WHERE ds.sala_id = s.id)
                 AS n_disciplinas,
               (SELECT COUNT(*) FROM alocacoes a WHERE a.sala_id = s.id) AS n_aulas
        FROM salas s
        ORDER BY s.nome COLLATE NOCASE`),
    );
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, []);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const recorte = termo
      ? linhas.filter((l) => l.nome.toLowerCase().includes(termo))
      : linhas;
    return comparar(recorte, ordem, (l) => l.nome);
  }, [linhas, ordem, busca]);

  /**
   * O que mudar o tipo da sala faz com as aulas que estão nela: a aula cuja
   * disciplina exige um tipo que a sala deixa de ter (D7) vai para outra sala
   * válida e livre no mesmo horário; a que não achar sala é apagada, com
   * confirmação. Vale para todos os cursos — a sala é da instituição.
   * `null` = o usuário cancelou e nada deve ser gravado.
   */
  async function prepararAulas(salaId: number, tipo: string): Promise<Instrucao[] | null> {
    if (linhas.find((l) => l.id === salaId)?.tipo === tipo) return [];
    const atingidas = await consultar<{
      curso_id: number;
      periodo: number;
      dia: number;
      hora: number;
      disciplina_id: number;
      professor_id: number;
      fixada: number;
      tipo_sala: string;
      permite_sabado: number;
      turno: FatiaRegras["turno"];
      ofertada: number;
      disciplina: string;
      curso: string;
      codigo: string;
    }>(
      `SELECT a.curso_id, a.periodo, a.dia, a.hora, a.disciplina_id, a.professor_id, a.fixada,
              d.tipo_sala, d.permite_sabado, d.turno, d.ofertada,
              d.nome AS disciplina, c.nome AS curso, h.codigo
         FROM alocacoes a
         JOIN disciplinas d ON d.id = a.disciplina_id
         JOIN cursos c ON c.id = a.curso_id
         JOIN horarios h ON h.indice = a.hora
        WHERE a.sala_id = ? AND d.exige_sala = 1 AND d.tipo_sala IS NOT NULL AND d.tipo_sala <> ?
        ORDER BY c.nome COLLATE NOCASE, a.curso_id, a.periodo, a.dia, a.hora`,
      [salaId, tipo],
    );
    if (atingidas.length === 0) return [];

    // A sala entra já com o tipo novo: é contra ele que as outras são comparadas.
    const salas = (await consultar<{ id: number; tipo: string }>("SELECT id, tipo FROM salas ORDER BY id")).map(
      (x) => (x.id === salaId ? { ...x, tipo } : x),
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
        periodo: a.periodo,
        dia: a.dia,
        hora: a.hora,
        disciplinaId: a.disciplina_id,
        professorId: a.professor_id,
        salaId: a.sala_id,
      }),
    );
    // Nenhum curso está em montagem: a escolha de sala só consulta professor e
    // sala, que a ocupação guarda para todos os cursos.
    const oc = new Ocupacao(NENHUM_CURSO, todas);
    const { trocas, semSala } = reatribuirSalas(
      { salas },
      oc,
      atingidas.map((a) => ({
        a,
        aula: {
          cursoId: a.curso_id,
          periodo: a.periodo,
          dia: a.dia,
          hora: a.hora,
          disciplinaId: a.disciplina_id,
          professorId: a.professor_id,
          salaId,
        },
        fatia: {
          disciplinaId: a.disciplina_id,
          professorId: a.professor_id,
          periodo: a.periodo,
          permiteSabado: !!a.permite_sabado,
          turno: a.turno,
          exigeSala: true,
          tipoSala: a.tipo_sala,
          salas: [],
          ofertada: !!a.ofertada,
        },
      })),
    );

    if (semSala.length > 0) {
      const fixadas = semSala.filter((x) => x.a.fixada).length;
      const MAXIMO = 10;
      const quais = semSala
        .slice(0, MAXIMO)
        .map((x) => `- ${x.a.curso}, ${x.a.periodo}º período, ${DIAS[x.a.dia]} ${x.a.codigo} — ${x.a.disciplina}`);
      if (semSala.length > MAXIMO) quais.push(`… e mais ${semSala.length - MAXIMO}`);
      if (
        !confirm(
          `${semSala.length} aula(s) serão apagadas, porque não há outra sala do tipo exigido livre no horário` +
            (fixadas ? ` (${fixadas} fixada(s))` : "") +
            `:\n\n${quais.join("\n")}` +
            (trocas.length ? `\n\nOutras ${trocas.length} aula(s) trocam de sala.` : "") +
            "\n\nContinuar?",
        )
      )
        return null;
    }

    const chave = (a: (typeof atingidas)[number]) => [a.curso_id, a.periodo, a.dia, a.hora];
    return [
      ...semSala.map((x) => ({
        sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
        params: chave(x.a),
      })),
      ...trocas.map((t) => ({
        sql: "UPDATE alocacoes SET sala_id = ? WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
        params: [t.sala, ...chave(t.item.a)],
      })),
    ];
  }

  async function salvar(s: Sala) {
    setErro("");
    const nome = s.nome.trim();
    const tipo = s.tipo.trim();
    if (!nome) return setErro("O nome é obrigatório.");
    if (!tipo) return setErro("O tipo é obrigatório.");
    if (!Number.isFinite(s.capacidade) || s.capacidade < 0) {
      return setErro("Capacidade inválida.");
    }
    try {
      if (s.id) {
        // Tudo o que consulta o banco fica dentro do `try`, e as aulas mudam
        // na mesma transação da sala: ou vale tudo, ou nada.
        const aulas = await prepararAulas(s.id, tipo);
        if (!aulas) return;
        await transacao([
          {
            sql: "UPDATE salas SET nome = ?, tipo = ?, capacidade = ? WHERE id = ?",
            params: [nome, tipo, s.capacidade, s.id],
          },
          ...aulas,
        ]);
      } else {
        await executar(
          "INSERT INTO salas (nome, tipo, capacidade) VALUES (?, ?, ?)",
          [nome, tipo, s.capacidade],
        );
      }
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A sala"));
    }
  }

  async function remover(l: Linha) {
    if (l.n_aulas > 0 || l.n_disciplinas > 0) {
      setErro(
        `${l.nome} está em uso: ${l.n_aulas} aula(s) na grade e ` +
          `${l.n_disciplinas} disciplina(s) que a exigem.`,
      );
      return;
    }
    if (!confirm(`Remover a sala ${l.nome}?`)) return;
    setErro("");
    try {
      await executar("DELETE FROM salas WHERE id = ?", [l.id]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A sala"));
    }
  }

  return (
    <>
      <CabecalhoLista
        titulo="Salas"
        escopo="Instituição · comuns a todos os cursos"
        contagem={`${visiveis.length} de ${linhas.length}`}
        filtro={busca}
        aoFiltrar={setBusca}
      >
        <button className="primario" onClick={() => setEdicao(vazio())}>
          Nova sala
        </button>
      </CabecalhoLista>

      <Erro>{erro}</Erro>

      {carregando ? null : linhas.length === 0 ? (
        <Vazio>
          Nenhuma sala cadastrada. Disciplinas que não ocupam sala não precisam
          de nenhuma aqui.
        </Vazio>
      ) : (
        <table className="lista">
          <thead>
            <tr>
              <Ordenavel campo="nome" ordem={ordem} aoOrdenar={setOrdem}>
                Nome
              </Ordenavel>
              <Ordenavel campo="tipo" ordem={ordem} aoOrdenar={setOrdem}>
                Tipo
              </Ordenavel>
              <Ordenavel campo="capacidade" ordem={ordem} aoOrdenar={setOrdem} numerico>
                Capacidade
              </Ordenavel>
              <Ordenavel campo="n_disciplinas" ordem={ordem} aoOrdenar={setOrdem} numerico>
                Exigida por
              </Ordenavel>
              <Ordenavel campo="n_aulas" ordem={ordem} aoOrdenar={setOrdem} numerico>
                Aulas
              </Ordenavel>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td className="forte">{l.nome}</td>
                <td>{l.tipo}</td>
                <td className="num">{l.capacidade}</td>
                <td className="num">{l.n_disciplinas || "—"}</td>
                <td className="num">{l.n_aulas || "—"}</td>
                <td className="acoes">
                  <BotaoIcone rotulo="Editar" aoClicar={() => setEdicao(l)}>
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
        <Modal
          titulo={edicao.id ? "Editar sala" : "Nova sala"}
          aoFechar={() => setEdicao(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              salvar(edicao);
            }}
          >
            <Campo rotulo="Nome">
              <input
                autoFocus
                value={edicao.nome}
                onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
              />
            </Campo>

            <Campo
              rotulo="Tipo"
              dica="É por aqui que uma disciplina exige laboratório sem exigir uma sala específica."
            >
              <select
                value={edicao.tipo}
                onChange={(e) => setEdicao({ ...edicao, tipo: e.target.value })}
              >
                {/* Um valor antigo fora da lista continua visível, para
                    editar a sala não trocar o tipo dela sem querer. */}
                {[...new Set<string>([...TIPOS_SALA, edicao.tipo])]
                  .filter(Boolean)
                  .map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
              </select>
            </Campo>

            <Campo rotulo="Capacidade">
              <input
                type="number"
                min={0}
                value={edicao.capacidade}
                onChange={(e) =>
                  setEdicao({ ...edicao, capacidade: Number(e.target.value) })
                }
              />
            </Campo>

            <div className="rodape-modal">
              <button type="button" onClick={() => setEdicao(null)}>
                Cancelar
              </button>
              <button type="submit" className="primario">
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
