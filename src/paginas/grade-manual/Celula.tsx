import { Lock, LockOpen, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
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
  const raiz = useRef<HTMLElement | null>(null);
  const devolverFoco = useRef(false);
  const emCurso = useRef(0);
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
        ref={(el) => {
          raiz.current = el;
        }}
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
        ) : fatiaEscolhida ? (
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
      ref={(el) => {
        raiz.current = el;
      }}
      role="group"
      // Focável só por código: o foco que a ação devolve (ver `agindo`).
      tabIndex={-1}
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
