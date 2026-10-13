import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Instrucao } from "../../db";
import { DIAS } from "../../tipos";
import { Alerta } from "@/componentes/alerta";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { useConfirmar } from "@/componentes/confirmacao";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";
import { historico } from "../../grade";
import { arrastoEmCurso, marcarArrasto } from "../../grade/arrastoEmCurso";
import { BotaoDesfazer } from "../../grade/BotaoDesfazer";
import { desfazerEAvisar } from "../../grade/desfazer";
import { useHistorico } from "../../grade/useHistorico";
import { curto, descrever } from "../../regras/descrever";
import { escolherSala, impedimento, salasPossiveis } from "../../regras/impedimentos";
import type { Ocupacao } from "../../regras/ocupacao";
import * as acoes from "./acoes";
import { mesmaCarga, type Alvo, type Carga } from "./arrasto";
import { Diagnostico } from "./Diagnostico";
import { Malha } from "./Malha";
import { Pendencias } from "./Pendencias";
import { chave, idAula, idFatia, usarGrade, type Aula, type Fatia } from "./usarGrade";

/** O dnd-kit descreve, em inglês, um arrasto por teclado. Aqui ele é só de ponteiro. */
const SEM_INSTRUCOES = { draggable: "" };

/**
 * Pendura o cartão no ponteiro, abaixo e à direita dele. Deixado onde a origem
 * estava, ele taparia o destino — é na célula sob o ponteiro que está escrito
 * se ela aceita a aula e por que não — e, como a pendência é mais larga que o
 * cartão, quem a pega pela direita o veria andar a um palmo do ponteiro.
 */
const pendurarNoPonteiro: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !(activatorEvent instanceof PointerEvent)) return transform;
  return {
    ...transform,
    x: transform.x + activatorEvent.clientX - draggingNodeRect.left + 12,
    y: transform.y + activatorEvent.clientY - draggingNodeRect.top + 12,
  };
};
const NO_PONTEIRO = [pendurarNoPonteiro];

/**
 * O que faz o sensor de ponteiro do dnd-kit largar a carga, fora o Esc. A
 * página ouve os mesmos eventos na janela, onde eles chegam depois de o sensor
 * os tratar: o dnd-kit só avisa que o arrasto acabou se já tiver desenhado o
 * começo dele, e quem pega e solta num escorregão de clique solta antes disso.
 */
const FINS_DO_SENSOR = ["pointerup", "pointercancel", "resize", "visibilitychange"] as const;

/**
 * Depois do Esc que cancela o arrasto, o botão do mouse continua apertado, e
 * soltá-lo sobre a origem seria um clique nela: a pendência que se desistiu de
 * arrastar acabaria escolhida. O dnd-kit só engole o clique do arrasto que
 * termina ao soltar; o do cancelado é engolido aqui, até o botão subir.
 */
function engolirOCliqueDeSoltar() {
  const engolir = (e: MouseEvent) => e.stopPropagation();
  const parar = () => {
    // O clique, se houver, vem logo depois de o botão subir, na mesma leva.
    setTimeout(() => document.removeEventListener("click", engolir, { capture: true }));
    window.removeEventListener("pointerup", parar, { capture: true });
    window.removeEventListener("pointercancel", parar, { capture: true });
  };
  document.addEventListener("click", engolir, { capture: true });
  window.addEventListener("pointerup", parar, { capture: true });
  window.addEventListener("pointercancel", parar, { capture: true });
}

export default function GradeManual({ cursoId }: { cursoId: number }) {
  const confirmar = useConfirmar();
  const {
    carregando,
    periodos,
    periodo,
    setPeriodo,
    horarios,
    horariosTodos,
    fatias,
    aulas,
    ctx,
    padroes,
    carregar,
    oc,
    alocadas,
    daGrade,
    regrasDe,
    nomes,
    fatiaDaAula,
    violacoes,
  } = usarGrade(cursoId);
  const { versao } = useHistorico();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  // Falha de carga: a tela não tem como seguir. Falha de gravação é toast.
  const [erro, setErro] = useState("");

  // O erro só sai quando uma carga deste curso chegou ao fim: a que nem
  // começou (o curso já é outro) não sabe se ele continua verdadeiro.
  const recarregar = useCallback(
    () =>
      carregar().then(
        (carregou) => {
          if (carregou) setErro("");
        },
        (e) => setErro(String(e)),
      ),
    [carregar],
  );

  // Carrega ao abrir, ao trocar de curso (`carregar` muda com ele) e depois de
  // cada desfazer (`versao`), venha ele do botão, do toast ou do Ctrl+Z.
  useEffect(() => {
    void recarregar();
  }, [recarregar, versao]);

  // A pendência escolhida é do curso em que foi escolhida, e o que está em
  // mãos também: solto depois da troca, seria gravado no curso que saiu da tela.
  useEffect(() => {
    setEscolhida(null);
    cancelarArrasto();
  }, [cursoId]);

  // Esc solta a pendência escolhida: sair de um modo é sempre a mesma tecla.
  // Quando o Esc já fechou outra coisa (a lista de salas, a confirmação), o
  // Radix marca o evento como tratado: aquele Esc foi dela, e a pendência fica.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") setEscolhida(null);
    };
    // O Esc que cancela um arrasto também é só dele. O dnd-kit cancela ao ouvir
    // a tecla no documento, mas não marca o evento: quem marca é este ouvinte,
    // na captura da janela, que roda antes — depois de o dnd-kit cancelar, já
    // não daria para saber que havia um arrasto.
    const escDoArrasto = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !arrastoEmCurso()) return;
      e.preventDefault();
      engolirOCliqueDeSoltar();
    };
    window.addEventListener("keydown", esc);
    window.addEventListener("keydown", escDoArrasto, { capture: true });
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("keydown", escDoArrasto, { capture: true });
    };
  }, []);

  // O arrasto só começa depois de 6 px: antes disso é clique.
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [arrasto, setArrasto] = useState<Carga | null>(null);
  /**
   * O arrasto como a página o conhece: o que foi pego, e o que desliga os
   * ouvintes do fim dele. Numa `ref`, além do estado que pinta a tela, porque
   * quem pergunta ao soltar pode ser o `aoSoltar` de um desenho que já passou
   * (o do curso de que se saiu com a carga em mãos), e esse não vê estado novo.
   */
  const pego = useRef<{ carga: Carga; fim: AbortController } | null>(null);
  // Sair da tela no meio de um arrasto não pode deixar o teclado travado, nem
  // a carga pronta para ser gravada por uma página que não existe mais.
  useEffect(() => cancelarArrasto, []);

  const fatiasDoPeriodo = fatias.filter((f) => f.periodo === periodo && f.ofertada);
  const fatiaEscolhida = fatias.find((f) => idFatia(f) === escolhida) ?? null;

  // O que pinta as células é a fatia em mãos: a arrastada, senão a escolhida.
  const fatiaEmMaos = arrasto?.fatia ?? fatiaEscolhida;
  const arrastandoAula = arrasto?.tipo === "aula";
  // Ao mover, a aula não disputa lugar consigo mesma (o professor dela, a sala
  // dela, o dia que ela já ocupa).
  const ocupacaoEmMaos = useMemo(
    () => (arrasto?.tipo === "aula" ? acoes.semAOrigem(cursoId, aulas, arrasto.aula) : oc),
    [arrasto, aulas, cursoId, oc],
  );

  const dias = ctx?.dias ?? 6;
  const codigoDe = (indice: number) => horariosTodos.find((h) => h.indice === indice)?.codigo ?? String(indice);

  /**
   * Por que esta célula não aceita a fatia. `null` = aceita. `movendo` é a aula
   * que muda de lugar: ela já está entre as alocadas, e a disciplina fechada
   * continua fechada depois; a `ocupacao`, nesse caso, vem sem ela.
   */
  function motivoDe(f: Fatia, dia: number, hora: number, ocupacao: Ocupacao, movendo: boolean): string | null {
    if (!movendo && (alocadas.get(idFatia(f)) ?? 0) >= f.aulas) return `${f.aulas} de ${f.aulas} aulas já alocadas`;
    if (!ctx) return null;
    const m = impedimento(ctx, ocupacao, regrasDe(f), dia, hora);
    return m ? descrever(m, nomes) : null;
  }

  /**
   * O caminho único de toda escrita da tela: pelo histórico (é o que a torna
   * desfazível), com recarga depois, dê certo ou não — se falhou, o que está na
   * tela pode não ser mais o que o banco guarda.
   *
   * `feito` é o aviso das ações que pedem um: ganha o botão "Desfazer" só se a
   * ação entrou no histórico. A que cruza com uma escrita de cadastro fica
   * gravada sem entrar nele, e um "Desfazer" ali não teria o que desfazer.
   */
  async function gravar(rotulo: string, instrucoes: Instrucao[], feito?: string): Promise<boolean> {
    try {
      await historico.executarNaGrade(cursoId, rotulo, instrucoes);
    } catch (e) {
      avisar.erro(mensagemErro(e, "A aula"));
      await recarregar();
      return false;
    }
    // O histórico já publicou (o toast de desfazer anterior fechou) antes de
    // este abrir: o novo não é fechado pela ação que o gerou.
    if (feito) {
      if (historico.estado().podeDesfazer) avisar.desfazer(feito, () => void desfazerEAvisar());
      else avisar.sucesso(feito);
    }
    await recarregar();
    return true;
  }

  /**
   * Células com uma ação em voo, da ordem até a tela mostrar o resultado (a
   * recarga só resolve depois disso). A segunda ação na mesma célula antes
   * disso falharia ("Alocar" de novo dá `UNIQUE`) ou entraria duas vezes no
   * histórico (o segundo "antes" já não tem a aula, e desfazer não a traria de
   * volta). Células diferentes seguem livres.
   */
  const emVoo = useRef(new Set<string>());

  /** A célula como a tabela a conhece: o mesmo horário de outro período é outra. */
  const celulaDe = (periodo: number, dia: number, hora: number) => `${cursoId}:${periodo}:${chave(dia, hora)}`;
  const celulaDaAula = (a: Aula) => celulaDe(a.periodo, a.dia, a.hora);

  /**
   * Roda a ação, se nenhuma das células dela tem outra em voo. Mover mexe em
   * duas (de onde a aula sai e aonde chega). Devolve se gravou.
   */
  async function nasCelulas(celulas: string[], acao: () => Promise<boolean>): Promise<boolean> {
    if (celulas.some((c) => emVoo.current.has(c))) return false;
    celulas.forEach((c) => emVoo.current.add(c));
    try {
      return await acao();
    } finally {
      celulas.forEach((c) => emVoo.current.delete(c));
    }
  }

  /** A fatia é a escolhida (clique no horário) ou a arrastada (solta nele). */
  function alocarEm(f: Fatia, dia: number, hora: number): Promise<boolean> {
    if (periodo == null) return Promise.resolve(false);
    return nasCelulas([celulaDe(periodo, dia, hora)], () => alocar(f, dia, hora));
  }

  /**
   * A sala da aula vizinha da mesma fatia, para o bloco não trocar de sala.
   * `menos` é a aula que está saindo do lugar: ela não é vizinha de si mesma.
   */
  function salaVizinha(f: Fatia, dia: number, hora: number, menos?: Aula): number | null {
    const vizinha = [hora - 1, hora + 1]
      .map((h) => daGrade.get(chave(dia, h)))
      .find((a) => a && a !== menos && idAula(a) === idFatia(f));
    return vizinha?.salaId ?? null;
  }

  async function alocar(f: Fatia, dia: number, hora: number): Promise<boolean> {
    if (periodo == null || !ctx) return false;
    // Célula impedida não aloca; o motivo já está escrito nela.
    if (motivoDe(f, dia, hora, oc, false)) return false;
    const sala = escolherSala(ctx, oc, regrasDe(f), dia, hora, salaVizinha(f, dia, hora)) ?? null;
    return gravar(`Alocar ${f.disciplina_curta}`, [acoes.alocar(cursoId, periodo, dia, hora, f, sala)]);
  }

  /**
   * Leva a aula a outro horário do mesmo período. Trava as duas células: de
   * onde ela sai e aonde chega. A sala vai junto se continua livre lá.
   */
  function moverAula(aula: Aula, f: Fatia, dia: number, hora: number, ocupacao: Ocupacao): Promise<boolean> {
    if (!ctx) return Promise.resolve(false);
    const sala = acoes.salaAoMover(ctx, ocupacao, regrasDe(f), aula, dia, hora, salaVizinha(f, dia, hora, aula));
    return nasCelulas([celulaDaAula(aula), celulaDe(aula.periodo, dia, hora)], () =>
      gravar(`Mover ${aula.disciplina}`, [acoes.mover(aula, dia, hora, sala)]),
    );
  }

  /**
   * Salas que servem à aula e estão livres naquele horário (a dela inclusive).
   * A situação atual entra sempre, mesmo fora do requisito (a sala saiu dele,
   * ou a aula ficou sem sala numa disciplina que exige): sem ela o seletor
   * mostraria outra opção como se fosse a atual.
   */
  function salasParaTroca(a: Aula): { id: number | null; rotulo: string }[] {
    const f = fatiaDaAula(a);
    if (!f || !ctx) return [];
    const regras = regrasDe(f);
    // Com tipo de sala, `salasPossiveis` ignora a lista específica.
    const comLista = !regras.tipoSala && regras.salas.length > 0;
    const possiveis = salasPossiveis(ctx, regras);
    const opcoes: { id: number | null; rotulo: string }[] = possiveis
      .filter((s) => s.id === a.salaId || !oc.daSala(s.id, a.dia, a.hora))
      .map((s) => ({
        id: s.id,
        rotulo: nomes.sala(s.id) + (comLista ? (s.preferencia === 1 ? " (ideal)" : " (aceitável)") : ""),
      }));
    if (a.salaId != null && !possiveis.some((s) => s.id === a.salaId))
      opcoes.unshift({ id: a.salaId, rotulo: `${nomes.sala(a.salaId)} (atual, fora do requisito)` });
    if (!regras.exigeSala) opcoes.push({ id: null, rotulo: "Sem sala" });
    else if (a.salaId == null) opcoes.unshift({ id: null, rotulo: "Sem sala (atual, fora do requisito)" });
    return opcoes;
  }

  function trocarSalaDe(a: Aula, salaId: number | null): Promise<boolean> {
    if (salaId === a.salaId) return Promise.resolve(false);
    return nasCelulas([celulaDaAula(a)], () => gravar(`Trocar a sala de ${a.disciplina}`, [acoes.trocarSala(a, salaId)]));
  }

  /** Fixar protege a aula do gerador, do "Limpar período" e de remover. */
  function alternarFixada(a: Aula): Promise<boolean> {
    return nasCelulas([celulaDaAula(a)], () =>
      gravar(`${a.fixada ? "Soltar" : "Fixar"} ${a.disciplina}`, [acoes.fixar(a, !a.fixada)]),
    );
  }

  /**
   * O botão da aula fixada já está desabilitado; a guarda é para quem chama de
   * outro caminho (arrastar a aula para fora da malha).
   */
  function removerAula(a: Aula): Promise<boolean> {
    if (a.fixada) {
      avisar.aviso("Solte o cadeado para remover");
      return Promise.resolve(false);
    }
    return nasCelulas([celulaDaAula(a)], () =>
      gravar(
        `Remover ${a.disciplina}`,
        [acoes.remover(a)],
        `${a.disciplina} removida de ${DIAS[a.dia]} ${codigoDe(a.hora)}`,
      ),
    );
  }

  function aoComecar(e: DragStartEvent) {
    const carga = e.active.data.current as Carga;
    const fim = new AbortController();
    pego.current = { carga, fim };
    marcarArrasto(true);
    setArrasto(carga);
    // O arrasto da página termina por conta própria, sem depender de o dnd-kit
    // avisar (ver `FINS_DO_SENSOR`). Na fase de subida da janela, e não na
    // captura: é depois do documento, onde o sensor ouve — o `aoSoltar` de um
    // arrasto normal já rodou, com a carga e o destino, quando isto encerra.
    const ate = { signal: fim.signal };
    const esc = (tecla: KeyboardEvent) => {
      if (tecla.code === "Escape") encerrarArrasto();
    };
    for (const evento of FINS_DO_SENSOR) window.addEventListener(evento, encerrarArrasto, ate);
    window.addEventListener("keydown", esc, ate);
    // Disto o sensor não sabe: a janela perde o foco com o botão apertado, o
    // botão sobe lá fora, e na volta o primeiro clique soltaria a carga onde
    // o ponteiro estivesse.
    window.addEventListener("blur", cancelarArrasto, ate);
  }

  /**
   * O fim do arrasto para a página, por qualquer caminho; chamar de novo não
   * faz nada. Só mexe em `ref` e em `set`: serve chamado de qualquer desenho.
   */
  function encerrarArrasto() {
    pego.current?.fim.abort();
    pego.current = null;
    marcarArrasto(false);
    setArrasto(null);
  }

  /**
   * A página desiste do arrasto que o ponteiro ainda segura. O sensor do
   * dnd-kit só larga a carga ao ouvir o fim do ponteiro, e não há outro jeito
   * de pedir: `pointercancel` no documento é o aviso que ele entende.
   */
  function cancelarArrasto() {
    if (!pego.current) return;
    document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    encerrarArrasto();
  }

  async function aoSoltar(e: DragEndEvent) {
    // A carga como a origem a conhece agora: é a que tem a sala e o cadeado de
    // hoje. A origem que deixou de existir (a aula saiu de lá por outro
    // caminho) não tem carga — o dnd-kit entrega `undefined` ou um objeto vazio.
    const carga = e.active.data.current as Carga | undefined;
    const alvo = e.over?.data.current as Alvo | undefined;
    const pega = pego.current?.carga;
    encerrarArrasto();
    if (!carga?.tipo || !alvo || periodo == null || !ctx) return;
    // Sem o que foi pego, a página já tinha encerrado este arrasto por outro
    // caminho; e a carga que não é mais a mesma é outra aula no lugar da que o
    // cartão mostra. Nos dois casos soltar não faz nada, nem avisa.
    if (!pega || !mesmaCarga(pega, carga)) return;
    // O que está em mãos é do período em que foi pego.
    if (carga.fatia.periodo !== periodo) return;

    if (alvo.tipo === "pendencias") {
      if (carga.tipo === "aula") await removerAula(carga.aula);
      return;
    }

    const movendo = carga.tipo === "aula";
    if (movendo && carga.aula.dia === alvo.dia && carga.aula.hora === alvo.hora) return;
    const ocupacao = movendo ? acoes.semAOrigem(cursoId, aulas, carga.aula) : oc;
    // Soltar numa célula impedida não grava; o motivo, que estava escrito nela
    // enquanto a aula passava por cima, vai no aviso.
    const motivo = motivoDe(carga.fatia, alvo.dia, alvo.hora, ocupacao, movendo);
    if (motivo) return avisar.aviso(motivo);

    if (movendo) await moverAula(carga.aula, carga.fatia, alvo.dia, alvo.hora, ocupacao);
    else await alocarEm(carga.fatia, alvo.dia, alvo.hora);
  }

  // O arrasto é só de ponteiro, mas quem usa leitor de tela com mouse ouve o
  // que o dnd-kit anuncia — por padrão em inglês, com os ids internos.
  const anuncios: Announcements = {
    onDragStart: ({ active }) => {
      const carga = active.data.current as Carga | undefined;
      if (!carga?.tipo) return undefined;
      return `Arrastando ${carga.tipo === "aula" ? carga.aula.disciplina : carga.fatia.disciplina_curta}`;
    },
    // Sem o que dizer, o anúncio é vazio, e não `undefined`: esse o dnd-kit
    // ignora, e o destino anterior continuaria escrito na região viva.
    onDragOver: ({ active, over }) => {
      const carga = active.data.current as Carga | undefined;
      const alvo = over?.data.current as Alvo | undefined;
      if (!alvo) return "";
      // O painel só recebe aula: para a pendência ele não é destino.
      if (alvo.tipo === "pendencias") return carga?.tipo === "aula" ? "Sobre as pendências" : "";
      return `Sobre ${DIAS[alvo.dia]}, ${codigoDe(alvo.hora)}`;
    },
    // O que aconteceu ao soltar aparece na grade e, quando há o que dizer, num aviso.
    onDragEnd: () => "",
    onDragCancel: () => "Arrasto cancelado",
  };

  async function limparPeriodo() {
    if (periodo == null) return;
    const doPeriodo = [...daGrade.values()];
    const fixadas = doPeriodo.filter((a) => a.fixada).length;
    // Fixar protege a aula do gerador; limpar à mão também não a leva (B8).
    if (
      !(await confirmar({
        titulo: `Apagar as aulas do ${periodo}º período?`,
        descricao: fixadas ? `As ${fixadas} aula(s) fixadas ficam.` : undefined,
        confirmar: "Limpar período",
        perigo: true,
      }))
    )
      return;
    await gravar(
      `Limpar o ${periodo}º período`,
      [acoes.limpar(cursoId, periodo)],
      `${doPeriodo.length - fixadas} aula(s) apagadas do ${periodo}º período`,
    );
  }

  // Enquanto carrega, o que há é de outro curso (ou nada): trocar de curso não
  // remonta a página, e as aulas do curso anterior não podem ficar à mostra,
  // nem clicáveis, sob o nome do novo.
  if (carregando || periodos.length === 0) {
    return (
      <>
        <CabecalhoPagina titulo="Grade horária" />
        <Alerta tom="erro">{erro}</Alerta>
        {carregando ? null : <EstadoVazio>Cadastre os períodos do curso primeiro.</EstadoVazio>}
      </>
    );
  }

  const turnoDoPeriodo = periodos.find((p) => p.numero === periodo)?.turno;
  const faltando = fatiasDoPeriodo.reduce(
    (s, f) => s + Math.max(0, f.aulas - (alocadas.get(idFatia(f)) ?? 0)),
    0,
  );
  const fechadas = fatiasDoPeriodo.filter(
    (f) => (alocadas.get(idFatia(f)) ?? 0) >= f.aulas,
  ).length;
  // Por que "Limpar período" não tem o que fazer. Vazio = tem.
  const nadaALimpar =
    daGrade.size === 0
      ? "Não há aulas neste período."
      : [...daGrade.values()].every((a) => a.fixada)
        ? "As aulas deste período estão fixadas."
        : "";

  return (
    <>
      <CabecalhoPagina
        titulo="Grade horária"
        sub={
          faltando === 0
            ? "Todas as aulas deste período estão alocadas."
            : `${faltando} aula(s) deste período ainda por alocar.`
        }
      >
        {/* O botão desabilitado não recebe foco nem pouso: o motivo fica à
            vista, ao lado, em vez de numa dica que ninguém alcança. Vem antes
            dos botões, à esquerda: quando aparece, eles não se mexem. */}
        {nadaALimpar && (
          <span id="motivo-limpar-periodo" className="inline-flex h-7 items-center text-xs text-tx3">
            {nadaALimpar}
          </span>
        )}
        <BotaoDesfazer />
        <Button
          variant="outline"
          className="text-destructive"
          disabled={!!nadaALimpar}
          aria-describedby={nadaALimpar ? "motivo-limpar-periodo" : undefined}
          onClick={() => void limparPeriodo()}
        >
          Limpar período
        </Button>
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      {violacoes.length > 0 && <Diagnostico violacoes={violacoes} codigoDe={codigoDe} />}

      <div className="abas-periodo">
        {periodos.map((p) => (
          <button
            key={p.numero}
            type="button"
            aria-pressed={p.numero === periodo}
            onClick={() => {
              setPeriodo(p.numero);
              setEscolhida(null);
            }}
          >
            {p.numero}º
          </button>
        ))}
        <span className="ocupacao">
          {daGrade.size} de {horarios.length * dias} posições ocupadas
        </span>
      </div>

      {/* O destino é o que está sob o ponteiro (`pointerWithin`), não o que o
          cartão toca: a pendência é mais larga que uma célula e encostaria nas
          vizinhas. */}
      <DndContext
        sensors={sensores}
        collisionDetection={pointerWithin}
        accessibility={{ announcements: anuncios, screenReaderInstructions: SEM_INSTRUCOES }}
        onDragStart={aoComecar}
        onDragEnd={(e) => void aoSoltar(e)}
        onDragCancel={encerrarArrasto}
      >
        {/* Os dois painéis têm a mesma altura: a nota do rodapé das pendências
            fica ancorada embaixo, e não flutuando no meio da tela. */}
        <div className={cn("grid grid-cols-[264px_1fr] items-stretch gap-[14px]", arrasto && "em-arrasto")}>
          <Pendencias
            fatiasDoPeriodo={fatiasDoPeriodo}
            fechadas={fechadas}
            alocadas={alocadas}
            escolhida={escolhida}
            setEscolhida={setEscolhida}
            fatiaEscolhida={fatiaEscolhida}
            arrastandoAula={arrastandoAula}
            ctx={ctx}
            daGrade={daGrade}
            padroes={padroes}
          />

          <Malha
            horarios={horarios}
            dias={dias}
            periodo={periodo}
            turnoDoPeriodo={turnoDoPeriodo}
            daGrade={daGrade}
            fatiaEmMaos={fatiaEmMaos}
            motivoDe={(f, dia, hora) => motivoDe(f, dia, hora, ocupacaoEmMaos, arrastandoAula)}
            fatiaDaAula={fatiaDaAula}
            salasParaTroca={salasParaTroca}
            aoAlocar={(dia, hora) => (fatiaEscolhida ? alocarEm(fatiaEscolhida, dia, hora) : Promise.resolve(false))}
            aoRemover={removerAula}
            aoFixar={(a) => void alternarFixada(a)}
            aoTrocarSala={(a, salaId) => void trocarSalaDe(a, salaId)}
          />
        </div>

        {/* O cartão que segue o ponteiro. Solto, ele some: o resultado aparece
            na grade, e a animação de volta à origem contaria o contrário. */}
        <DragOverlay dropAnimation={null} modifiers={NO_PONTEIRO}>
          {arrasto && (
            <div className="celula ocupada arrastando">
              <span className="nome">
                {arrasto.tipo === "aula" ? arrasto.aula.disciplina : arrasto.fatia.disciplina_curta}
              </span>
              <span className="meta">{curto(arrasto.fatia.professor)}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  );
}
