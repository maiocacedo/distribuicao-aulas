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
  fatiaEscolhida: Fatia | null;
  motivoDe: (f: Fatia, dia: number, hora: number) => string | null;
  trocando: string | null;
  setTrocando: (celula: string | null) => void;
  salasParaTroca: (a: Aula) => { id: number | null; rotulo: string }[];
  trocarSala: (a: Aula, salaId: number | null) => void;
  remover: (dia: number, hora: number) => void;
  alocar: (dia: number, hora: number) => void;
  alternarFixada: (dia: number, hora: number) => void;
}

export function Malha({
  horarios,
  dias,
  periodo,
  turnoDoPeriodo,
  daGrade,
  fatiaEscolhida,
  motivoDe,
  trocando,
  setTrocando,
  salasParaTroca,
  trocarSala,
  remover,
  alocar,
  alternarFixada,
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
                const motivo = fatiaEscolhida
                  ? motivoDe(fatiaEscolhida, d, l.h.indice)
                  : null;
                const foraDoTurno = l.h.turno !== turnoDoPeriodo;
                return (
                  <Celula
                    key={d}
                    dia={d}
                    hora={l.h.indice}
                    codigo={l.h.codigo}
                    aula={aula}
                    motivo={motivo}
                    fatiaEscolhida={fatiaEscolhida}
                    foraDoTurno={foraDoTurno}
                    trocando={trocando}
                    setTrocando={setTrocando}
                    salasParaTroca={salasParaTroca}
                    trocarSala={trocarSala}
                    remover={remover}
                    alocar={alocar}
                    alternarFixada={alternarFixada}
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
      </div>
    </section>
  );
}
