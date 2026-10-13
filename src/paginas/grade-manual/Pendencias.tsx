import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { avisosDaFatia } from "../../regras/avisos";
import type { Contexto } from "../../regras/tipos";
import type { Alvo, Carga } from "./arrasto";
import { idAula, idFatia, type Aula, type Fatia } from "./usarGrade";

interface Props {
  fatiasDoPeriodo: Fatia[];
  fechadas: number;
  alocadas: Map<string, number>;
  escolhida: string | null;
  setEscolhida: (id: string | null) => void;
  fatiaEscolhida: Fatia | null;
  /** Há uma aula da malha em mãos: soltá-la aqui a remove. */
  arrastandoAula: boolean;
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
  arrastandoAula,
  ctx,
  daGrade,
  padroes,
}: Props) {
  // O painel inteiro é o destino de "tirar da grade": é para lá que a aula
  // volta a ser pendência.
  const { setNodeRef, isOver } = useDroppable({ id: "pendencias", data: { tipo: "pendencias" } satisfies Alvo });

  return (
    <section
      ref={setNodeRef}
      aria-label="Pendências"
      className={cn("pendencias", isOver && arrastandoAula && "soltar-aqui")}
    >
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
          {fatiasDoPeriodo.map((f) => (
            <li key={idFatia(f)}>
              <Pendencia
                fatia={f}
                feitas={alocadas.get(idFatia(f)) ?? 0}
                escolhida={escolhida === idFatia(f)}
                aoEscolher={() => setEscolhida(escolhida === idFatia(f) ? null : idFatia(f))}
                avisos={
                  ctx
                    ? avisosDaFatia(
                        [...daGrade.values()].filter((a) => idAula(a) === idFatia(f)),
                        f.aulas,
                        !!f.blocos_livres,
                        padroes.get(f.aulas),
                        ctx.turnoDaHora,
                      )
                    : []
                }
              />
            </li>
          ))}
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

function Pendencia({
  fatia,
  feitas,
  escolhida,
  aoEscolher,
  avisos,
}: {
  fatia: Fatia;
  feitas: number;
  escolhida: boolean;
  aoEscolher: () => void;
  avisos: string[];
}) {
  const completa = feitas >= fatia.aulas;
  // Só `listeners`: os `attributes` do dnd-kit anunciam um arrasto por teclado
  // que aqui não existe (pelo teclado, a pendência se escolhe e o horário se
  // clica). A fechada não tem mais aula a levar.
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `fatia:${idFatia(fatia)}`,
    data: { tipo: "fatia", fatia } satisfies Carga,
    disabled: completa,
  });

  return (
    // A escolhida é o `aria-pressed`: o desenho (fundo e contorno) sai dele no
    // `grade.css`, sem uma classe que possa divergir.
    <button
      ref={setNodeRef}
      {...listeners}
      type="button"
      aria-pressed={escolhida}
      // Em mãos, a pendência leva a marca de origem, como a aula da malha.
      className={cn("fatia", completa && "completa", isDragging && "origem")}
      onClick={aoEscolher}
    >
      <span className="linha1">
        <span className="nome">{fatia.disciplina_curta}</span>
        <span className="prog">
          {feitas}/{fatia.aulas}
        </span>
      </span>
      <span className="prof">{fatia.professor}</span>
      {avisos.map((aviso) => (
        <span key={aviso} className="aviso-fatia">
          {aviso}
        </span>
      ))}
      <span className="trilha">
        <span className="barra" style={{ width: `${Math.min(100, (feitas / fatia.aulas) * 100)}%` }} />
      </span>
    </button>
  );
}
