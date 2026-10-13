import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Lock, LockOpen, X } from "lucide-react";
import { useCallback, useId, useLayoutEffect, useRef } from "react";
import { BotaoIcone } from "@/componentes/botao-icone";
import { Seletor, type Opcao } from "@/componentes/seletor";
import { DIAS } from "../../tipos";
import { curto } from "../../regras/descrever";
import type { Alvo, Carga } from "./arrasto";
import type { Aula, Fatia } from "./usarGrade";

interface Props {
  dia: number;
  /** O índice do horário; `codigo` é o nome dele ("M1"). */
  hora: number;
  codigo: string;
  aula: Aula | undefined;
  /** A fatia da aula. Sem ela (aula órfã) não há regra a perguntar, e a aula não se arrasta. */
  fatia: Fatia | undefined;
  motivo: string | null;
  /** A pendência escolhida ou o que está sendo arrastado: é o que pinta a célula vazia. */
  fatiaEmMaos: Fatia | null;
  foraDoTurno: boolean;
  /** A disciplina da aula exige sala (falso para a aula sem fatia). */
  exigeSala: boolean;
  /** As salas que a aula pode trocar pela dela. Vazia = nada a escolher. */
  salas: Opcao<number | null>[];
  /** Devolvem se gravaram: só então o foco muda de elemento (ver `agindo`). */
  aoAlocar: () => Promise<boolean>;
  aoRemover: () => Promise<boolean>;
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
  hora,
  codigo,
  aula,
  fatia,
  motivo,
  fatiaEmMaos,
  foraDoTurno,
  exigeSala,
  salas,
  aoAlocar,
  aoRemover,
  aoFixar,
  aoTrocarSala,
}: Props) {
  const idDoTexto = useId();
  const raiz = useRef<HTMLElement | null>(null);
  const devolverFoco = useRef(false);
  const emCurso = useRef(0);
  const rotulo = `${DIAS[dia]}, ${codigo}`;

  // Só a célula vazia recebe o que se arrasta: não há troca entre duas aulas.
  const { setNodeRef: ligarAlvo, isOver } = useDroppable({
    id: `celula:${dia}-${hora}`,
    data: { tipo: "celula", dia, hora } satisfies Alvo,
    disabled: !!aula,
  });
  // A aula fixada não sai do lugar, e a órfã não tem fatia que diga aonde pode
  // ir. Só `listeners`, sem os `attributes` do dnd-kit: eles dariam ao grupo
  // papel de botão, parada de Tab e o anúncio de um arrasto por teclado que
  // não existe.
  const arrastavel = !!aula && !aula.fixada && !!fatia;
  const { setNodeRef: ligarOrigem, listeners, isDragging } = useDraggable({
    id: `aula:${dia}-${hora}`,
    data: aula && fatia ? ({ tipo: "aula", aula, fatia } satisfies Carga) : undefined,
    disabled: !arrastavel,
  });
  // Estáveis: uma função nova a cada desenho faria o React desligar e religar
  // o elemento, e o dnd-kit voltaria a medi-lo.
  const ligarVazia = useCallback(
    (el: HTMLElement | null) => {
      raiz.current = el;
      ligarAlvo(el);
    },
    [ligarAlvo],
  );
  const ligarOcupada = useCallback(
    (el: HTMLElement | null) => {
      raiz.current = el;
      ligarOrigem(el);
    },
    [ligarOrigem],
  );

  const classe = aula
    ? aula.fixada
      ? "ocupada travada"
      : "ocupada"
    : fatiaEmMaos
      ? motivo
        ? "impedida"
        : "apta"
      : foraDoTurno
        ? "fora"
        : "neutra";
  const classes = [
    "celula",
    classe,
    arrastavel && "arrastavel",
    // De onde a aula saiu, enquanto está em mãos; e a vazia sob o ponteiro.
    isDragging && "origem",
    isOver && "sobre",
  ]
    .filter(Boolean)
    .join(" ");

  /**
   * Alocar troca o botão da célula vazia pelo grupo da ocupada, e remover faz
   * o contrário: o elemento focado some e o foco cairia no `body`. Se ele
   * estava na célula quando a ação foi pedida, vai para o elemento novo; quem
   * agiu pelo mouse em outro lugar não tem o foco roubado.
   */
  async function agindo(acao: () => Promise<boolean>) {
    if (raiz.current?.contains(document.activeElement)) devolverFoco.current = true;
    emCurso.current++;
    const gravou = await acao();
    emCurso.current--;
    // Não gravou (falha, recusa, ou um clique repetido que a tela ignorou): o
    // elemento não vai mudar, e o pedido não pode ficar para uma troca futura.
    // Com outra chamada ainda em curso, o pedido é dela.
    if (!gravou && emCurso.current === 0) devolverFoco.current = false;
  }

  const ocupada = !!aula;
  useLayoutEffect(() => {
    if (!devolverFoco.current) return;
    devolverFoco.current = false;
    // Só se o foco caiu no `body`: se já está em outro lugar, o usuário seguiu.
    if (!document.activeElement || document.activeElement === document.body) raiz.current?.focus();
  }, [ocupada]);

  if (!aula) {
    // O nome do botão é o horário (o contrato dos testes e o que um leitor de
    // tela precisa para saber onde está); o que a célula diz — o motivo do
    // impedimento, ou "Alocar" — entra como descrição.
    const impedida = motivo != null;
    return (
      <button
        ref={ligarVazia}
        type="button"
        aria-label={rotulo}
        aria-describedby={idDoTexto}
        // Impedida não aceita a pendência e diz por quê: `aria-disabled`, que
        // mantém a célula alcançável, em vez de um clique que não faz nada.
        aria-disabled={impedida || undefined}
        className={classes}
        onClick={impedida ? undefined : () => void agindo(aoAlocar)}
        // O clique direito que erra a aula não abre o menu do navegador.
        onContextMenu={(e) => e.preventDefault()}
      >
        {motivo ? (
          <span id={idDoTexto} className="motivo">
            {motivo}
          </span>
        ) : fatiaEmMaos ? (
          <span id={idDoTexto} className="alocar">
            Alocar
          </span>
        ) : (
          // Sem pendência escolhida o clique não faz nada: a descrição conta
          // isso a quem usa leitor de tela, sem mudar o desenho.
          <span id={idDoTexto} className="sr-only">
            Escolha uma pendência para alocar
          </span>
        )}
      </button>
    );
  }

  // A aula sem sala numa disciplina que exige sala mostra "sem sala": é por
  // ali que se corrige.
  const mostraSala = aula.salaId != null || exigeSala;
  return (
    <div
      ref={ligarOcupada}
      {...listeners}
      role="group"
      // Focável só por código: o foco que a ação devolve (ver `agindo`).
      tabIndex={-1}
      aria-label={rotulo}
      // O nome do grupo é o horário; a descrição é a disciplina. Quem chega
      // pelo Tab a "Remover aula" ou a "Fixar" ouve de qual aula eles são.
      aria-describedby={idDoTexto}
      className={classes}
      onContextMenu={(e) => {
        // A lista de salas é desenhada fora da célula, mas os eventos dela sobem
        // pela árvore do React até aqui: o botão direito sobre a lista não fixa.
        if (!e.currentTarget.contains(e.target as Node)) return;
        e.preventDefault();
        aoFixar();
      }}
    >
      <span id={idDoTexto} className="nome">
        {aula.disciplina}
      </span>
      <span className="meta">
        {curto(aula.professor)}
        {mostraSala && " · "}
        {mostraSala &&
          (salas.length > 0 ? (
            // O gesto que começa na sala é do seletor (ele abre ao apertar), e
            // não o começo de um arrasto da aula.
            <span onPointerDown={(e) => e.stopPropagation()}>
              <Seletor
                rotulo={`Trocar sala de ${aula.disciplina}`}
                className={SALA_NA_LINHA}
                valor={aula.salaId}
                opcoes={salas}
                exibir={aula.sala ?? "sem sala"}
                aoMudar={aoTrocarSala}
              />
            </span>
          ) : (
            // Aula sem fatia: não há requisito de sala a consultar, nada a escolher.
            aula.sala
          ))}
      </span>
      {/* O cadeado fica por último, no canto: na aula fixada ele é o estado e
          está sempre à vista, e o "Remover" aparece ao lado sem tirá-lo do lugar.
          Apertar um botão é clicá-lo, não pegar a aula. */}
      <span className="controles" onPointerDown={(e) => e.stopPropagation()}>
        <BotaoIcone
          rotulo="Remover aula"
          icone={X}
          perigo
          desabilitado={!!aula.fixada}
          motivo="Solte o cadeado para remover"
          aoClicar={() => void agindo(aoRemover)}
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
      {foraDoTurno && (
        <span className="ponto">
          <span className="sr-only">fora do turno</span>
        </span>
      )}
    </div>
  );
}
