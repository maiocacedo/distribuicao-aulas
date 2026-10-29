import { Fragment } from "react";
import { DIAS, type Horario } from "../../tipos";
import { Celula } from "./Celula";
import { chave, type Aula, type Fatia } from "./usarGrade";

interface Props {
  horarios: Horario[];
  dias: number;
  periodo: number | null;
  turnoDoPeriodo: string | undefined;
  daGrade: Map<string, Aula>;
  /** A pendência escolhida ou o que está sendo arrastado: é o que pinta as células vazias. */
  fatiaEmMaos: Fatia | null;
  motivoDe: (f: Fatia, dia: number, hora: number) => string | null;
  fatiaDaAula: (a: Aula) => Fatia | undefined;
  salasParaTroca: (a: Aula) => { id: number | null; rotulo: string }[];
  aoAlocar: (dia: number, hora: number) => Promise<boolean>;
  aoRemover: (a: Aula) => Promise<boolean>;
  aoFixar: (a: Aula) => void;
  aoTrocarSala: (a: Aula, salaId: number | null) => void;
}

export function Malha({
  horarios,
  dias,
  periodo,
  turnoDoPeriodo,
  daGrade,
  fatiaEmMaos,
  motivoDe,
  fatiaDaAula,
  salasParaTroca,
  aoAlocar,
  aoRemover,
  aoFixar,
  aoTrocarSala,
}: Props) {
  // As linhas da grade, com as faixas de turno intercaladas. A fronteira entre
  // turnos é estrutura, não cor: uma faixa rotulada interrompe a malha, porque
  // aula nenhuma atravessa turnos.
  const linhas: (
    | { tipo: "faixa"; turno: string; nota: string }
    | { tipo: "horario"; h: Horario }
  )[] = [];
  horarios.forEach((h, i) => {
    if (i === 0 || horarios[i - 1].turno !== h.turno) {
      // A faixa diz o que aquele turno significa PARA ESTE período, não só
      // qual é o turno: é a diferença entre rótulo e informação.
      linhas.push({
        tipo: "faixa",
        turno: h.turno,
        nota: h.turno === turnoDoPeriodo ? `turno do ${periodo}º período` : "contraturno",
      });
    }
    linhas.push({ tipo: "horario", h });
  });

  const colunas = `56px repeat(${dias}, minmax(0, 1fr))`;

  return (
    <section className="painel-grade">
      <div className="malha" style={{ gridTemplateColumns: colunas }}>
        <div className="canto" />
        {Array.from({ length: dias }, (_, d) => (
          <div key={d} className="dia">
            {DIAS[d]}
          </div>
        ))}

        {linhas.map((l, i) =>
          l.tipo === "faixa" ? (
            <div key={`f${i}`} className="faixa-turno">
              <span>{l.turno}</span>
              <em>{l.nota}</em>
            </div>
          ) : (
            <Fragment key={`h${l.h.indice}`}>
              <div className="hora">
                <strong>{l.h.codigo}</strong>
                <em>{l.h.rotulo}</em>
              </div>
              {Array.from({ length: dias }, (_, d) => {
                const aula = daGrade.get(chave(d, l.h.indice));
                const fatia = aula ? fatiaDaAula(aula) : undefined;
                const motivo = fatiaEmMaos && !aula ? motivoDe(fatiaEmMaos, d, l.h.indice) : null;
                return (
                  <Celula
                    key={d}
                    dia={d}
                    hora={l.h.indice}
                    codigo={l.h.codigo}
                    aula={aula}
                    fatia={fatia}
                    motivo={motivo}
                    fatiaEmMaos={fatiaEmMaos}
                    foraDoTurno={l.h.turno !== turnoDoPeriodo}
                    exigeSala={!!fatia?.exige_sala}
                    salas={aula ? salasParaTroca(aula).map((s) => ({ valor: s.id, rotulo: s.rotulo })) : []}
                    aoAlocar={() => aoAlocar(d, l.h.indice)}
                    aoRemover={() => (aula ? aoRemover(aula) : Promise.resolve(false))}
                    aoFixar={() => aula && aoFixar(aula)}
                    aoTrocarSala={(salaId) => aula && aoTrocarSala(aula, salaId)}
                  />
                );
              })}
            </Fragment>
          ),
        )}
      </div>

      <div className="legenda">
        <span>
          <i className="sw apta" /> Apta à seleção
        </span>
        <span>
          <i className="sw impedida" /> Impedida — motivo na célula
        </span>
        <span>
          <i className="sw travada" /> Travada — o gerador não move
        </span>
        <span>
          <i className="sw fora" /> Fora do turno do período
        </span>
        <span className="dica">Arraste uma pendência para um horário, ou clique nela e depois no horário.</span>
      </div>
    </section>
  );
}
