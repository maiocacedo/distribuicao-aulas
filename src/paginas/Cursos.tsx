import { useEffect, useState } from "react";
import { consultar, executar } from "../db";
import { TURNOS, type Curso } from "../tipos";
import {
  BotaoIcone,
  CabecalhoLista,
  Campo,
  Erro,
  Lapis,
  Lixeira,
  Modal,
  Vazio,
  mensagemErro,
} from "../componentes/ui";

interface Linha extends Curso {
  n_periodos: number;
  n_disciplinas: number;
  n_aulas: number;
}

const vazio = (): Curso => ({
  id: 0,
  nome: "",
  turnos: "manha,tarde",
  horas_por_aula_semanal: 15,
  observacao: null,
});

export default function Cursos({ aoMudarLista }: { aoMudarLista: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<Curso | null>(null);
  const [erro, setErro] = useState("");

  async function carregar() {
    setLinhas(
      await consultar<Linha>(`
        SELECT c.*,
               (SELECT COUNT(*) FROM periodos p WHERE p.curso_id = c.id) AS n_periodos,
               (SELECT COUNT(*) FROM disciplinas d WHERE d.curso_id = c.id) AS n_disciplinas,
               (SELECT COUNT(*) FROM alocacoes a WHERE a.curso_id = c.id) AS n_aulas
        FROM cursos c ORDER BY c.nome COLLATE NOCASE`),
    );
    aoMudarLista();
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, []);

  async function salvar(c: Curso) {
    setErro("");
    const nome = c.nome.trim();
    if (!nome) return setErro("O nome é obrigatório.");
    if (c.horas_por_aula_semanal < 1) return setErro("A conversão tem de ser ao menos 1h.");
    if (!c.turnos) return setErro("Escolha ao menos um turno.");
    try {
      if (c.id) {
        await executar(
          "UPDATE cursos SET nome = ?, turnos = ?, horas_por_aula_semanal = ?,"
            + " observacao = ? WHERE id = ?",
          [nome, c.turnos, c.horas_por_aula_semanal, c.observacao, c.id],
        );
      } else {
        await executar(
          "INSERT INTO cursos (nome, turnos, horas_por_aula_semanal, observacao)"
            + " VALUES (?, ?, ?, ?)",
          [nome, c.turnos, c.horas_por_aula_semanal, c.observacao],
        );
      }
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "O curso"));
    }
  }

  async function remover(l: Linha) {
    if (linhas.length === 1) {
      setErro("Este é o único curso; o sistema precisa de pelo menos um.");
      return;
    }
    if (
      !confirm(
        `Remover ${l.nome}?\n\nSaem junto ${l.n_periodos} período(s), ` +
          `${l.n_disciplinas} disciplina(s) e ${l.n_aulas} aula(s) da grade.\n\n` +
          "Professores e salas não são afetados: pertencem à instituição.",
      )
    )
      return;
    setErro("");
    try {
      await executar("DELETE FROM cursos WHERE id = ?", [l.id]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "O curso"));
    }
  }

  return (
    <>
      <CabecalhoLista
        titulo="Cursos"
        escopo="Cada curso tem os próprios períodos, disciplinas e grade"
        contagem={`${linhas.length} curso(s)`}
      >
        <button className="primario" onClick={() => setEdicao(vazio())}>
          Novo curso
        </button>
      </CabecalhoLista>

      <Erro>{erro}</Erro>

      <p className="explica">
        Professores, salas, horários do dia, padrões de bloco e tipos de
        disciplina são da <strong>instituição</strong> e valem para todos os
        cursos — cadastrados uma vez só. As indisponibilidades também: um
        professor declara os horários dele uma vez, e todo curso as respeita.
      </p>

      {linhas.length === 0 ? (
        <Vazio>Nenhum curso cadastrado.</Vazio>
      ) : (
        <table className="lista">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Turnos</th>
              <th className="num">Períodos</th>
              <th className="num">Disciplinas</th>
              <th className="num">Aulas na grade</th>
              <th className="num">Conversão</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="forte">{l.nome}</td>
                <td>
                  {l.turnos
                    .split(",")
                    .map((t) => TURNOS.find((x) => x.valor === t)?.rotulo ?? t)
                    .join(" · ")}
                </td>
                <td className="num">{l.n_periodos || "—"}</td>
                <td className="num">{l.n_disciplinas || "—"}</td>
                <td className="num">{l.n_aulas || "—"}</td>
                <td className="num fraco">{l.horas_por_aula_semanal}h / aula</td>
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
          titulo={edicao.id ? "Editar curso" : "Novo curso"}
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
              rotulo="Turnos que o curso ocupa"
              dica="Define quais horários aparecem na grade e que turnos os períodos podem ter."
            >
              <div className="marcadores em-linha">
                {TURNOS.map((t) => {
                  const marcados = edicao.turnos.split(",").filter(Boolean);
                  const tem = marcados.includes(t.valor);
                  return (
                    <label key={t.valor}>
                      <input
                        type="checkbox"
                        checked={tem}
                        onChange={() => {
                          const novos = TURNOS.filter((x) =>
                            x.valor === t.valor ? !tem : marcados.includes(x.valor),
                          ).map((x) => x.valor);
                          setEdicao({ ...edicao, turnos: novos.join(",") });
                        }}
                      />
                      <span>{t.rotulo}</span>
                    </label>
                  );
                })}
              </div>
            </Campo>

            <Campo
              rotulo="Horas de currículo por aula semanal"
              dica={`Com ${edicao.horas_por_aula_semanal}h, uma disciplina de ${
                edicao.horas_por_aula_semanal * 4
              }h no currículo são 4 aulas por semana. Só apoia o cadastro; a grade conta aulas.`}
            >
              <input
                type="number"
                min={1}
                value={edicao.horas_por_aula_semanal}
                onChange={(e) =>
                  setEdicao({
                    ...edicao,
                    horas_por_aula_semanal: Number(e.target.value),
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
