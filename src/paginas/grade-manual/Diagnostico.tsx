import { Alerta } from "@/componentes/alerta";
import { DIAS } from "../../tipos";
import type { Aula } from "./usarGrade";

interface Props {
  /** Os motivos já chegam em texto: a aula órfã não tem regra a descrever. */
  violacoes: { aula: Aula; motivos: string[] }[];
  codigoDe: (indice: number) => string;
}

export function Diagnostico({ violacoes, codigoDe }: Props) {
  return (
    <Alerta tom="aviso">
      <details className="diagnostico">
        <summary>{violacoes.length} aula(s) deste curso violam regra dura</summary>
        <ul>
          {violacoes.map(({ aula, motivos }) => (
            <li key={`${aula.periodo}:${aula.dia}:${aula.hora}`}>
              {aula.periodo}º · {DIAS[aula.dia]} {codigoDe(aula.hora)} · <strong>{aula.disciplina}</strong>:{" "}
              {motivos.join("; ")}
            </li>
          ))}
        </ul>
      </details>
    </Alerta>
  );
}
