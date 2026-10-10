import { useEffect, useState } from "react";
import { consultar, transacao, type Instrucao } from "../db";
import { carregarProblema } from "../solver/carregar";
import { resolver } from "../solver/solver";
import { buracos } from "../solver/custo";
import type { Alocacao, Problema, Resultado } from "../solver/tipos";
import { Erro, Vazio, mensagemErro } from "../componentes/ui";

interface Medidas {
  aulas: number;
  buracosProfessor: number;
  buracosAluno: number;
  foraDoTurno: number;
}

function medir(problema: Problema, alocacoes: Alocacao[]): Medidas {
  const turnoHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const turnoPeriodo = new Map(problema.periodos.map((p) => [p.numero, p.turno]));
  const turnoFatia = new Map(
    problema.fatias.map((f) => [`${f.disciplinaId}:${f.professorId}`, f.turno]),
  );
  return {
    aulas: alocacoes.length,
    buracosProfessor: buracos(problema, alocacoes, (a) => `p${a.professorId}`),
    buracosAluno: buracos(problema, alocacoes, (a) => `t${a.periodo}`),
    foraDoTurno: alocacoes.filter((a) => {
      const esperado =
        turnoFatia.get(`${a.disciplinaId}:${a.professorId}`) ??
        turnoPeriodo.get(a.periodo);
      return turnoHora.get(a.hora) !== esperado;
    }).length,
  };
}

export default function GradeAutomatica({ cursoId }: { cursoId: number }) {
  const [problema, setProblema] = useState<Problema | null>(null);
  const [atual, setAtual] = useState<Alocacao[]>([]);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [aplicado, setAplicado] = useState(false);

  async function carregar() {
    setProblema(await carregarProblema(cursoId));
    setAtual(
      (
        await consultar<{
          periodo: number;
          dia: number;
          hora: number;
          disciplina_id: number;
          professor_id: number;
          sala_id: number | null;
        }>("SELECT * FROM alocacoes WHERE curso_id = ?", [cursoId])
      ).map((a) => ({
        periodo: a.periodo,
        dia: a.dia,
        hora: a.hora,
        disciplinaId: a.disciplina_id,
        professorId: a.professor_id,
        salaId: a.sala_id,
      })),
    );
    setResultado(null);
    setAplicado(false);
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, [cursoId]);

  function gerar() {
    if (!problema) return;
    setErro("");
    setGerando(true);
    // Um quadro antes de bloquear: sem isto o "gerando…" nunca chega à tela,
    // porque o solver roda no mesmo thread que desenha.
    setTimeout(() => {
      try {
        setResultado(resolver(problema));
      } catch (e) {
        setErro(String(e));
      } finally {
        setGerando(false);
      }
    }, 30);
  }

  async function aplicar() {
    if (!resultado || !problema) return;
    const fixadas = problema.fixadas.length;
    if (
      !confirm(
        `Substituir a grade atual pela gerada?\n\n` +
          `${atual.length} aula(s) hoje → ${resultado.alocacoes.length} aula(s).\n` +
          (fixadas ? `As ${fixadas} aula(s) fixadas são preservadas.` : ""),
      )
    )
      return;
    setErro("");
    try {
      const instrucoes: Instrucao[] = [
        // As fixadas ficam: elas já constam do resultado e apagá-las junto
        // faria o INSERT seguinte recriá-las, perdendo a marca de fixada.
        {
          sql: "DELETE FROM alocacoes WHERE curso_id = ? AND fixada = 0",
          params: [cursoId],
        },
        ...resultado.alocacoes
          .filter(
            (a) =>
              !problema.fixadas.some(
                (f) => f.periodo === a.periodo && f.dia === a.dia && f.hora === a.hora,
              ),
          )
          .map((a) => ({
            sql: `INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id,
                                         professor_id, sala_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [
              cursoId,
              a.periodo,
              a.dia,
              a.hora,
              a.disciplinaId,
              a.professorId,
              a.salaId,
            ],
          })),
      ];
      await transacao(instrucoes);
      await carregar();
      setAplicado(true);
    } catch (e) {
      setErro(mensagemErro(e, "A grade"));
      await carregar();
    }
  }

  // O erro de carga precisa aparecer mesmo sem problema montado (B5).
  if (!problema)
    return (
      <>
        <header className="cabecalho-pagina">
          <h1>Grade automática</h1>
        </header>
        <Erro>{erro}</Erro>
      </>
    );

  const previstas = problema.fatias.reduce((s, f) => s + f.aulas, 0);
  const antes = medir(problema, atual);
  const depois = resultado ? medir(problema, resultado.alocacoes) : null;

  const linha = (rotulo: string, a: number, d: number | undefined, menorEhMelhor = true) => (
    <tr key={rotulo}>
      <td>{rotulo}</td>
      <td className="num">{a}</td>
      <td className="num">
        {d == null ? (
          "—"
        ) : (
          <span className={d === a ? "" : (d < a) === menorEhMelhor ? "melhor" : "pior"}>
            {d}
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <>
      <header className="cabecalho-pagina">
        <div>
          <h1>Grade automática</h1>
          <p className="sub">
            {previstas} aula(s) a distribuir em {problema.periodos.length} período(s).
            {problema.externas.length > 0 &&
              ` ${problema.externas.length} aula(s) de outros cursos respeitadas.`}
          </p>
        </div>
        <div className="acoes-cabecalho">
          <button className="primario" onClick={gerar} disabled={gerando}>
            {gerando ? "Gerando…" : "Gerar grade"}
          </button>
        </div>
      </header>

      <Erro>{erro}</Erro>

      {aplicado && (
        <p className="aviso sucesso">
          Grade aplicada. Abra <strong>Grade › Manual</strong> para ver e ajustar.
        </p>
      )}

      {problema.fatias.length === 0 ? (
        <Vazio>
          Nenhuma disciplina com professor atribuído neste curso — não há o que
          distribuir.
        </Vazio>
      ) : (
        <>
          <section>
            <h2>O que o gerador respeita</h2>
            <p className="explica">
              Restrições duras, que ele nunca viola: um professor num lugar por
              vez, uma sala por vez, indisponibilidades declaradas, sábado só
              para quem pode, requisito de sala, e blocos de aulas seguidas
              dentro dos padrões cadastrados. Aulas fixadas na grade manual
              ficam onde estão — hoje são <strong>{problema.fixadas.length}</strong>.
            </p>
            <p className="explica">
              Preferências, que ele tenta e às vezes não consegue: manter cada
              período no seu turno, evitar janelas na agenda do professor e na
              grade da turma, e respeitar a preferência de distribuição de dias
              de cada professor.
            </p>
          </section>

          {resultado && (
            <section>
              <h2>Resultado</h2>
              {!resultado.completo && (
                <p className="aviso">
                  {resultado.faltantes.length} fatia(s) não couberam. A grade
                  gerada é parcial — o resto continua por alocar à mão.
                </p>
              )}

              <table className="lista compacta comparacao">
                <thead>
                  <tr>
                    <th />
                    <th className="num">Grade atual</th>
                    <th className="num">Gerada</th>
                  </tr>
                </thead>
                <tbody>
                  {linha("Aulas alocadas", antes.aulas, depois?.aulas, false)}
                  {linha(
                    "Buracos na agenda dos professores",
                    antes.buracosProfessor,
                    depois?.buracosProfessor,
                  )}
                  {linha(
                    "Buracos na grade das turmas",
                    antes.buracosAluno,
                    depois?.buracosAluno,
                  )}
                  {linha("Aulas fora do turno", antes.foraDoTurno, depois?.foraDoTurno)}
                </tbody>
              </table>

              <p className="explica">
                Resolvido em {resultado.milissegundos} ms, {resultado.passos} tentativas
                de posicionamento.
              </p>

              {resultado.faltantes.length > 0 && (
                <>
                  <h2>Não couberam</h2>
                  <table className="lista compacta">
                    <tbody>
                      {resultado.faltantes.map((f) => (
                        <tr key={`${f.fatia.disciplinaId}:${f.fatia.professorId}`}>
                          <td className="forte">{f.fatia.nome}</td>
                          <td className="num">{f.fatia.aulas} aula(s)</td>
                          <td className="fraco">{f.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div className="acoes-secao">
                <button className="primario" onClick={aplicar}>
                  Aplicar esta grade
                </button>
                <button onClick={() => setResultado(null)}>Descartar</button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
