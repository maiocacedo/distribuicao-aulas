import { DIAS } from "../../tipos";
import { descrever, type Nomes } from "../../regras/descrever";
import type { Motivo } from "../../regras/tipos";
import type { Aula } from "./usarGrade";

interface Props {
  violacoes: { aula: Aula; motivos: Motivo[] }[];
  codigoDe: (indice: number) => string;
  nomes: Nomes;
}

export function Diagnostico({ violacoes, codigoDe, nomes }: Props) {
  return (
    <details className="aviso diagnostico">
      <summary>{violacoes.length} aula(s) deste curso violam regra dura</summary>
      <ul>
        {violacoes.map(({ aula, motivos }) => (
          <li key={`${aula.periodo}:${aula.dia}:${aula.hora}`}>
            {aula.periodo}º · {DIAS[aula.dia]} {codigoDe(aula.hora)} · <strong>{aula.disciplina}</strong>:{" "}
            {motivos.map((m) => descrever(m, nomes)).join("; ")}
          </li>
        ))}
      </ul>
    </details>
  );
}
