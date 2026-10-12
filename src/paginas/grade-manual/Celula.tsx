import { Lock, LockOpen, X } from "lucide-react";
import { useId } from "react";
import { BotaoIcone } from "@/componentes/botao-icone";
import { Seletor, type Opcao } from "@/componentes/seletor";
import { DIAS } from "../../tipos";
import { curto } from "../../regras/descrever";
import type { Aula, Fatia } from "./usarGrade";

interface Props {
  dia: number;
  codigo: string;
  aula: Aula | undefined;
  motivo: string | null;
  fatiaEscolhida: Fatia | null;
  foraDoTurno: boolean;
  /** A disciplina da aula exige sala (falso para a aula sem fatia). */
  exigeSala: boolean;
  /** As salas que a aula pode trocar pela dela. Vazia = nada a escolher. */
  salas: Opcao<number | null>[];
  aoAlocar: () => void;
  aoRemover: () => void;
  aoFixar: () => void;
  aoTrocarSala: (salaId: number | null) => void;
}

/**
 * Os botões da aula cabem no canto da célula: 20 px, com o ícone de 12 px. O
 * anel de foco vai para dentro porque a célula corta o que passa da borda dela.
 */
const BOTAO_DA_AULA = "size-5 -outline-offset-2 [&_svg]:size-3";

/**
 * O gatilho do `Seletor` nasce com o desenho do `Input`. Aqui ele é texto na
 * linha do professor: sem caixa, sem seta, na altura da linha. Vai em
 * utilitários porque é com eles que o gatilho se desenha, e o `grade.css` perde
 * para eles; lá fica só o sublinhado pontilhado, que diz que dá para trocar.
 */
const SALA_NA_LINHA =
  "trocar-sala inline-flex h-auto gap-0 rounded-none border-0 bg-transparent px-0 text-[10px] [&>svg]:hidden";

export function Celula({
  dia,
  codigo,
  aula,
  motivo,
  fatiaEscolhida,
  foraDoTurno,
  exigeSala,
  salas,
  aoAlocar,
  aoRemover,
  aoFixar,
  aoTrocarSala,
}: Props) {
  const idDoTexto = useId();
  const rotulo = `${DIAS[dia]}, ${codigo}`;
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
  const classes = `celula ${classe} ${foraDoTurno ? "contraturno" : ""}`;

  if (!aula) {
    // O nome do botão é o horário (o contrato dos testes e o que um leitor de
    // tela precisa para saber onde está); o que a célula diz — o motivo do
    // impedimento, ou "Alocar" — entra como descrição.
    const impedida = motivo != null;
    return (
      <button
        type="button"
        aria-label={rotulo}
        aria-describedby={motivo || fatiaEscolhida ? idDoTexto : undefined}
        // Impedida não aceita a pendência e diz por quê: `aria-disabled`, que
        // mantém a célula alcançável, em vez de um clique que não faz nada.
        aria-disabled={impedida || undefined}
        className={classes}
        onClick={impedida ? undefined : aoAlocar}
      >
        {motivo ? (
          <span id={idDoTexto} className="motivo">
            {motivo}
          </span>
        ) : fatiaEscolhida ? (
          <span id={idDoTexto} className="alocar">
            Alocar
          </span>
        ) : null}
      </button>
    );
  }

  // A aula sem sala numa disciplina que exige sala mostra "sem sala": é por
  // ali que se corrige.
  const mostraSala = aula.salaId != null || exigeSala;
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={classes}
      onContextMenu={(e) => {
        // A lista de salas é desenhada fora da célula, mas os eventos dela sobem
        // pela árvore do React até aqui: o botão direito sobre a lista não fixa.
        if (!e.currentTarget.contains(e.target as Node)) return;
        e.preventDefault();
        aoFixar();
      }}
    >
      <span className="nome">{aula.disciplina}</span>
      <span className="meta">
        {curto(aula.professor)}
        {mostraSala && " · "}
        {mostraSala &&
          (salas.length > 0 ? (
            <Seletor
              rotulo={`Trocar sala de ${aula.disciplina}`}
              className={SALA_NA_LINHA}
              valor={aula.salaId}
              opcoes={salas}
              exibir={aula.sala ?? "sem sala"}
              aoMudar={aoTrocarSala}
            />
          ) : (
            // Aula sem fatia: não há requisito de sala a consultar, nada a escolher.
            aula.sala
          ))}
      </span>
      {/* O cadeado fica por último, no canto: na aula fixada ele é o estado e
          está sempre à vista, e o "Remover" aparece ao lado sem tirá-lo do lugar. */}
      <span className="controles">
        <BotaoIcone
          rotulo="Remover aula"
          icone={X}
          perigo
          desabilitado={!!aula.fixada}
          motivo="Solte o cadeado para remover"
          aoClicar={aoRemover}
          className={BOTAO_DA_AULA}
        />
        <BotaoIcone
          rotulo={aula.fixada ? "Soltar" : "Fixar"}
          icone={aula.fixada ? Lock : LockOpen}
          aoClicar={aoFixar}
          // Fixada e em repouso, o cadeado é estado, não alerta: sem cor própria.
          className={aula.fixada ? `${BOTAO_DA_AULA} text-tx3` : BOTAO_DA_AULA}
        />
      </span>
      {foraDoTurno && <span className="ponto" />}
    </div>
  );
}
