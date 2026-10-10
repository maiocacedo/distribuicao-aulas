import { useEffect, useMemo, useState } from "react";
import { consultar, executar } from "../db";
import type { Professor } from "../tipos";
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

interface Linha extends Professor {
  n_disciplinas: number;
  aulas_total: number;
  n_indisponibilidades: number;
}

type Campo = "nome" | "n_disciplinas" | "aulas_total" | "n_indisponibilidades";

const PREFERENCIAS = [
  { valor: "indiferente", rotulo: "Indiferente" },
  { valor: "consecutivos", rotulo: "Dias seguidos" },
  { valor: "intercalados", rotulo: "Dias alternados" },
] as const;

const vazio = (): Professor => ({
  id: 0,
  nome: "",
  pref_dias: "indiferente",
  pref_dias_peso: 2,
  max_dias_semana: null,
  observacao: null,
});

export default function Professores() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<Professor | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [ordem, setOrdem] = useState<Ordem<Campo>>({ campo: "nome", desc: false });
  const [busca, setBusca] = useState("");

  async function carregar() {
    setLinhas(
      await consultar<Linha>(`
        SELECT p.*,
               (SELECT COUNT(*) FROM disciplina_professores dp
                 WHERE dp.professor_id = p.id) AS n_disciplinas,
               COALESCE((SELECT SUM(aulas) FROM disciplina_professores dp
                 WHERE dp.professor_id = p.id), 0) AS aulas_total,
               (SELECT COUNT(*) FROM indisponibilidades i
                 WHERE i.professor_id = p.id) AS n_indisponibilidades
        FROM professores p
        ORDER BY p.nome COLLATE NOCASE`),
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

  async function salvar(p: Professor) {
    setErro("");
    const nome = p.nome.trim();
    if (!nome) return setErro("O nome é obrigatório.");
    // D15 é regra dura: baixar o máximo abaixo do que a grade já usa deixaria
    // aulas inválidas, e não há como escolher sozinho qual dia sai.
    if (p.id && p.max_dias_semana != null) {
      const [{ n }] = await consultar<{ n: number }>(
        "SELECT COUNT(DISTINCT dia) AS n FROM alocacoes WHERE professor_id = ?",
        [p.id],
      );
      if (n > p.max_dias_semana)
        return setErro(
          `${nome} já dá aula em ${n} dias da semana, somando todos os cursos. ` +
            `Tire aulas dele na grade antes de baixar o máximo para ${p.max_dias_semana}.`,
        );
    }
    try {
      if (p.id) {
        await executar(
          `UPDATE professores SET nome = ?, pref_dias = ?, pref_dias_peso = ?,
                  max_dias_semana = ?, observacao = ? WHERE id = ?`,
          [nome, p.pref_dias, p.pref_dias_peso, p.max_dias_semana, p.observacao, p.id],
        );
      } else {
        await executar(
          `INSERT INTO professores (nome, pref_dias, pref_dias_peso, max_dias_semana, observacao)
           VALUES (?, ?, ?, ?, ?)`,
          [nome, p.pref_dias, p.pref_dias_peso, p.max_dias_semana, p.observacao],
        );
      }
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "O professor"));
    }
  }

  async function remover(l: Linha) {
    if (l.n_disciplinas > 0) {
      setErro(
        `${l.nome} tem ${l.n_disciplinas} disciplina(s) atribuída(s). ` +
          "Tire-o dessas disciplinas antes de removê-lo.",
      );
      return;
    }
    if (!confirm(`Remover ${l.nome}?`)) return;
    setErro("");
    try {
      await executar("DELETE FROM professores WHERE id = ?", [l.id]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "O professor"));
    }
  }

  return (
    <>
      <CabecalhoLista
        titulo="Professores"
        escopo="Instituição · comuns a todos os cursos"
        contagem={`${visiveis.length} de ${linhas.length}`}
        filtro={busca}
        aoFiltrar={setBusca}
      >
        <button className="primario" onClick={() => setEdicao(vazio())}>
          Novo professor
        </button>
      </CabecalhoLista>

      <Erro>{erro}</Erro>

      {carregando ? null : linhas.length === 0 ? (
        <Vazio>Nenhum professor cadastrado ainda.</Vazio>
      ) : (
        <table className="lista">
          <thead>
            <tr>
              <Ordenavel campo="nome" ordem={ordem} aoOrdenar={setOrdem}>
                Nome
              </Ordenavel>
              <Ordenavel campo="n_disciplinas" ordem={ordem} aoOrdenar={setOrdem} numerico>
                Disciplinas
              </Ordenavel>
              <Ordenavel campo="aulas_total" ordem={ordem} aoOrdenar={setOrdem} numerico>
                Aulas
              </Ordenavel>
              <th>Preferência de dias</th>
              <Ordenavel
                campo="n_indisponibilidades"
                ordem={ordem}
                aoOrdenar={setOrdem}
                numerico
              >
                Indisponível
              </Ordenavel>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td className="forte">{l.nome}</td>
                <td className="num">{l.n_disciplinas || "—"}</td>
                <td className="num">{l.aulas_total || "—"}</td>
                <td>
                  {l.pref_dias === "indiferente" ? (
                    <span className="fraco">indiferente</span>
                  ) : (
                    <>
                      {PREFERENCIAS.find((p) => p.valor === l.pref_dias)?.rotulo}
                      <span className="peso" title="peso da preferência">
                        {l.pref_dias_peso}
                      </span>
                    </>
                  )}
                  {l.max_dias_semana ? (
                    <span className="fraco"> · máx. {l.max_dias_semana} dias</span>
                  ) : null}
                </td>
                <td className="num">{l.n_indisponibilidades || "—"}</td>
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
          titulo={edicao.id ? "Editar professor" : "Novo professor"}
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
              rotulo="Preferência de distribuição dos dias"
              dica="Como o professor prefere que os dias de aula dele fiquem espalhados na semana."
            >
              <select
                value={edicao.pref_dias}
                onChange={(e) =>
                  setEdicao({ ...edicao, pref_dias: e.target.value as Professor["pref_dias"] })
                }
              >
                {PREFERENCIAS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </Campo>

            {edicao.pref_dias !== "indiferente" && (
              <Campo
                rotulo={`Peso da preferência: ${edicao.pref_dias_peso}`}
                dica="0 ignora, 3 é o mais forte. Continua sendo preferência, não regra."
              >
                <input
                  type="range"
                  min={0}
                  max={3}
                  value={edicao.pref_dias_peso}
                  onChange={(e) =>
                    setEdicao({ ...edicao, pref_dias_peso: Number(e.target.value) })
                  }
                />
              </Campo>
            )}

            <Campo
              rotulo="Máximo de dias na semana"
              dica="Em quantos dias distintos ele pode aparecer. Deixe vazio para não limitar."
            >
              <input
                type="number"
                min={1}
                max={7}
                value={edicao.max_dias_semana ?? ""}
                onChange={(e) =>
                  setEdicao({
                    ...edicao,
                    max_dias_semana: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Campo>

            <Campo rotulo="Observação">
              <textarea
                rows={2}
                value={edicao.observacao ?? ""}
                onChange={(e) =>
                  setEdicao({ ...edicao, observacao: e.target.value || null })
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
