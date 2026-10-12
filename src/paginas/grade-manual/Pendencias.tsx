import { avisosDaFatia } from "../../regras/avisos";
import type { Contexto } from "../../regras/tipos";
import { idAula, idFatia, type Aula, type Fatia } from "./usarGrade";

interface Props {
  fatiasDoPeriodo: Fatia[];
  fechadas: number;
  alocadas: Map<string, number>;
  escolhida: string | null;
  setEscolhida: (id: string | null) => void;
  fatiaEscolhida: Fatia | null;
  ctx: Contexto | null;
  daGrade: Map<string, Aula>;
  padroes: Map<number, string[]>;
}

export function Pendencias({
  fatiasDoPeriodo,
  fechadas,
  alocadas,
  escolhida,
  setEscolhida,
  fatiaEscolhida,
  ctx,
  daGrade,
  padroes,
}: Props) {
  return (
    <section aria-label="Pendências" className="pendencias">
      <div className="titulo-painel">
        <strong>Pendências</strong>
        <span>
          {fechadas} de {fatiasDoPeriodo.length} fechadas
        </span>
      </div>
      {fatiasDoPeriodo.length === 0 ? (
        <p className="nota-painel">Nenhuma disciplina neste período.</p>
      ) : (
        <ul>
          {fatiasDoPeriodo.map((f) => {
            const feitas = alocadas.get(idFatia(f)) ?? 0;
            const completa = feitas >= f.aulas;
            return (
              <li key={idFatia(f)}>
                {/* A escolhida é o `aria-pressed`: o desenho (fundo e contorno)
                    sai dele no `grade.css`, sem uma classe que possa divergir. */}
                <button
                  type="button"
                  aria-pressed={escolhida === idFatia(f)}
                  className={`fatia ${completa ? "completa" : ""}`}
                  onClick={() => setEscolhida(escolhida === idFatia(f) ? null : idFatia(f))}
                >
                  <span className="linha1">
                    <span className="nome">{f.disciplina_curta}</span>
                    <span className="prog">
                      {feitas}/{f.aulas}
                    </span>
                  </span>
                  <span className="prof">{f.professor}</span>
                  {ctx &&
                    avisosDaFatia(
                      [...daGrade.values()].filter((a) => idAula(a) === idFatia(f)),
                      f.aulas,
                      !!f.blocos_livres,
                      padroes.get(f.aulas),
                      ctx.turnoDaHora,
                    ).map((aviso) => (
                      <span key={aviso} className="aviso-fatia">
                        {aviso}
                      </span>
                    ))}
                  <span className="trilha">
                    <span
                      className="barra"
                      style={{ width: `${Math.min(100, (feitas / f.aulas) * 100)}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="nota-painel rodape">
        {fatiaEscolhida
          ? `Clique num horário apto para alocar ${fatiaEscolhida.disciplina_curta}. Esc cancela a seleção.`
          : "Selecione uma pendência e clique num horário livre."}
      </p>
    </section>
  );
}
