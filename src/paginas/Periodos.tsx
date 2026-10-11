import { useEffect, useState } from "react";
import { consultar, executar } from "../db";
import { TURNOS, type Periodo } from "../tipos";
import { Erro, Vazio, mensagemErro } from "../componentes/legado";

interface Linha extends Periodo {
  n_disciplinas: number;
  n_aulas: number;
}

/** Os períodos do curso selecionado. */
export default function Periodos({ cursoId }: { cursoId: number }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);
  // Só os turnos que o curso ocupa: oferecer um turno de fora é
  // convidar a um estado que a grade não sabe mostrar.
  const [turnosDoCurso, setTurnosDoCurso] = useState<string[]>([]);

  async function carregar() {
    const [curso] = await consultar<{ turnos: string }>(
      "SELECT turnos FROM cursos WHERE id = ?",
      [cursoId],
    );
    setTurnosDoCurso((curso?.turnos ?? "manha,tarde").split(",").filter(Boolean));
    setLinhas(
      await consultar<Linha>(
        `SELECT p.*,
                (SELECT COUNT(*) FROM disciplinas d
                  WHERE d.curso_id = p.curso_id AND d.periodo = p.numero) AS n_disciplinas,
                (SELECT COUNT(*) FROM alocacoes a
                  WHERE a.curso_id = p.curso_id AND a.periodo = p.numero) AS n_aulas
           FROM periodos p WHERE p.curso_id = ? ORDER BY p.numero`,
        [cursoId],
      ),
    );
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, [cursoId]);

  async function tentar(acao: () => Promise<unknown>, contexto: string) {
    setErro("");
    try {
      await acao();
      await carregar();
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1500);
    } catch (e) {
      setErro(mensagemErro(e, contexto));
    }
  }

  const proximo = linhas.length ? Math.max(...linhas.map((p) => p.numero)) + 1 : 1;
  const ultimo = linhas[linhas.length - 1];

  return (
    <>
      <header className="cabecalho-pagina">
        <div>
          <h1>Períodos</h1>
        </div>
        {salvo && <span className="salvo">salvo</span>}
      </header>

      <Erro>{erro}</Erro>

      <section>
        {linhas.length === 0 ? (
          <Vazio>Nenhum período ainda. Acrescente o primeiro.</Vazio>
        ) : (
          <table className="lista compacta uniforme">
            <thead>
              <tr>
                <th className="num">Período</th>
                <th>Turno</th>
                <th className="num">Máx. de obrigatórias no contraturno</th>
                <th className="num">Disciplinas</th>
                <th className="num">Aulas na grade</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.numero}>
                  <td className="num forte">{p.numero}º</td>
                  <td>
                    <select
                      className="embutido"
                      value={p.turno}
                      onChange={(e) =>
                        tentar(
                          () =>
                            executar(
                              "UPDATE periodos SET turno = ?"
                                + " WHERE curso_id = ? AND numero = ?",
                              [e.target.value, cursoId, p.numero],
                            ),
                          "O período",
                        )
                      }
                    >
                      {TURNOS.filter(
                        (t) => turnosDoCurso.includes(t.valor) || t.valor === p.turno,
                      ).map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      className="embutido curto"
                      type="number"
                      min={0}
                      defaultValue={p.max_disciplinas_contraturno}
                      onBlur={(e) =>
                        Number(e.target.value) !== p.max_disciplinas_contraturno &&
                        tentar(
                          () =>
                            executar(
                              "UPDATE periodos SET max_disciplinas_contraturno = ?"
                                + " WHERE curso_id = ? AND numero = ?",
                              [Number(e.target.value), cursoId, p.numero],
                            ),
                          "O período",
                        )
                      }
                    />
                  </td>
                  <td className="num">{p.n_disciplinas || "—"}</td>
                  <td className="num">{p.n_aulas || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <dl className="legenda-colunas">
          <dt>Turno</dt>
          <dd>
            Onde o período acontece por padrão. Este curso ocupa{" "}
            <strong>
              {turnosDoCurso
                .map((t) => TURNOS.find((x) => x.valor === t)?.rotulo ?? t)
                .join(" e ")}
            </strong>
            ; para liberar outro turno, mude em <strong>Gerenciar cursos</strong>.
          </dd>
          <dt>Máx. de obrigatórias no contraturno</dt>
          <dd>Quantas disciplinas obrigatórias podem escapar do turno do período. Optativas não contam: o gerador as põe no contraturno quando convém, mantendo ao menos uma no turno.</dd>
          <dt>Disciplinas</dt>
          <dd>Quantas disciplinas estão cadastradas neste período.</dd>
          <dt>Aulas na grade</dt>
          <dd>Quantas aulas do período já foram alocadas na grade horária.</dd>
        </dl>

        <div className="acoes-secao">
          <button
            onClick={() =>
              tentar(
                () =>
                  executar(
                    "INSERT INTO periodos (curso_id, numero, turno) VALUES (?, ?, ?)",
                    [cursoId, proximo, ultimo?.turno ?? turnosDoCurso[0] ?? "manha"],
                  ),
                "O período",
              )
            }
          >
            Adicionar {proximo}º período
          </button>
          {ultimo && (
            <button
              className="perigo"
              disabled={ultimo.n_disciplinas > 0}
              title={
                ultimo.n_disciplinas > 0
                  ? "O último período ainda tem disciplinas"
                  : undefined
              }
              onClick={() =>
                tentar(
                  () =>
                    executar("DELETE FROM periodos WHERE curso_id = ? AND numero = ?", [
                      cursoId,
                      ultimo.numero,
                    ]),
                  "O período",
                )
              }
            >
              Remover o último
            </button>
          )}
        </div>
      </section>
    </>
  );
}
