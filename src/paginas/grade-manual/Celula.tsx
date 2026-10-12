import { DIAS } from "../../tipos";
import { curto } from "../../regras/descrever";
import { chave, type Aula, type Fatia } from "./usarGrade";

interface Props {
  dia: number;
  hora: number;
  codigo: string;
  aula: Aula | undefined;
  motivo: string | null;
  fatiaEscolhida: Fatia | null;
  foraDoTurno: boolean;
  trocando: string | null;
  setTrocando: (celula: string | null) => void;
  salasParaTroca: (a: Aula) => { id: number | null; rotulo: string }[];
  trocarSala: (a: Aula, salaId: number | null) => void;
  remover: (dia: number, hora: number) => void;
  alocar: (dia: number, hora: number) => void;
  alternarFixada: (dia: number, hora: number) => void;
}

export function Celula({
  dia: d,
  hora,
  codigo,
  aula,
  motivo,
  fatiaEscolhida,
  foraDoTurno,
  trocando,
  setTrocando,
  salasParaTroca,
  trocarSala,
  remover,
  alocar,
  alternarFixada,
}: Props) {
  const classe = aula
    ? aula.fixada
      ? "ocupada travada"
      : "ocupada"
    : fatiaEscolhida
      ? motivo
        ? "impedida"
        : "apta"
      : foraDoTurno
        ? "fora"
        : "neutra";
  return (
    <div
      aria-label={`${DIAS[d]}, ${codigo}`}
      className={`celula ${classe} ${foraDoTurno ? "contraturno" : ""}`}
      onClick={() =>
        aula ? remover(d, hora) : alocar(d, hora)
      }
      onContextMenu={(ev) => {
        ev.preventDefault();
        if (aula) alternarFixada(d, hora);
      }}
    >
      {aula ? (
        <>
          <span className="nome">{aula.disciplina}</span>
          <span className="meta">
            {curto(aula.professor)}
            {aula.sala ? " · " : ""}
            {aula.sala &&
              (trocando === chave(d, hora) ? (
                <select
                  aria-label="Sala"
                  autoFocus
                  value={aula.salaId ?? ""}
                  onClick={(ev) => ev.stopPropagation()}
                  onChange={(ev) => trocarSala(aula, ev.target.value === "" ? null : Number(ev.target.value))}
                  onBlur={() => setTrocando(null)}
                >
                  {salasParaTroca(aula).map((s) => (
                    <option key={s.id ?? "sem"} value={s.id ?? ""}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  className="trocar-sala"
                  aria-label={`Trocar sala de ${aula.disciplina}`}
                  title="Trocar a sala"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setTrocando(chave(d, hora));
                  }}
                >
                  {aula.sala}
                </button>
              ))}
          </span>
          {aula.fixada ? <Cadeado /> : null}
          {foraDoTurno ? <span className="ponto" /> : null}
        </>
      ) : motivo ? (
        <span className="motivo">{motivo}</span>
      ) : fatiaEscolhida ? (
        <span className="alocar">Alocar</span>
      ) : null}
    </div>
  );
}

/** Cadeado da aula travada: estado, não alerta — por isso sem cor própria. */
function Cadeado() {
  return (
    <svg className="cadeado" width="9" height="11" viewBox="0 0 9 11" aria-label="fixada">
      <rect x="0.5" y="4.5" width="8" height="6" rx="1" fill="none" stroke="currentColor" />
      <path d="M2.5 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" />
    </svg>
  );
}
