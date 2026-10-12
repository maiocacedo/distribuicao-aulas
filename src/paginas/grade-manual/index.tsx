import { useCallback, useEffect, useState } from "react";
import type { Instrucao } from "../../db";
import { DIAS } from "../../tipos";
import { Alerta } from "@/componentes/alerta";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { useConfirmar } from "@/componentes/confirmacao";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { mensagemErro } from "@/lib/erros";
import { historico } from "../../grade";
import { BotaoDesfazer } from "../../grade/BotaoDesfazer";
import { desfazerEAvisar } from "../../grade/desfazer";
import { useHistorico } from "../../grade/useHistorico";
import { descrever } from "../../regras/descrever";
import { escolherSala, impedimento, salasPossiveis } from "../../regras/impedimentos";
import * as acoes from "./acoes";
import { Diagnostico } from "./Diagnostico";
import { Malha } from "./Malha";
import { Pendencias } from "./Pendencias";
import { chave, idAula, idFatia, usarGrade, type Aula, type Fatia } from "./usarGrade";

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

  const recarregar = useCallback(
    () =>
      carregar().then(
        () => setErro(""),
        (e) => setErro(String(e)),
      ),
    [carregar],
  );

  // Carrega ao abrir, ao trocar de curso (`carregar` muda com ele) e depois de
  // cada desfazer (`versao`), venha ele do botão, do toast ou do Ctrl+Z.
  useEffect(() => {
    void recarregar();
  }, [recarregar, versao]);

  // A pendência escolhida é do curso em que foi escolhida.
  useEffect(() => setEscolhida(null), [cursoId]);

  // Esc solta a pendência escolhida: sair de um modo é sempre a mesma tecla.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setEscolhida(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const fatiasDoPeriodo = fatias.filter((f) => f.periodo === periodo && f.ofertada);
  const fatiaEscolhida = fatias.find((f) => idFatia(f) === escolhida) ?? null;

  const dias = ctx?.dias ?? 6;
  const codigoDe = (indice: number) => horariosTodos.find((h) => h.indice === indice)?.codigo ?? String(indice);

  /** Por que esta célula não aceita a fatia escolhida. `null` = aceita. */
  function motivoDe(f: Fatia, dia: number, hora: number): string | null {
    if ((alocadas.get(idFatia(f)) ?? 0) >= f.aulas) return `${f.aulas} de ${f.aulas} aulas já alocadas`;
    if (!ctx) return null;
    const m = impedimento(ctx, oc, regrasDe(f), dia, hora);
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
  async function gravar(rotulo: string, instrucoes: Instrucao[], feito?: string) {
    try {
      await historico.executarNaGrade(cursoId, rotulo, instrucoes);
    } catch (e) {
      avisar.erro(mensagemErro(e, "A aula"));
      await recarregar();
      return;
    }
    if (feito) {
      if (historico.estado().podeDesfazer) avisar.desfazer(feito, () => void desfazerEAvisar());
      else avisar.sucesso(feito);
    }
    await recarregar();
  }

  async function alocarEm(dia: number, hora: number) {
    if (!fatiaEscolhida || periodo == null || !ctx) return;
    // Célula impedida não aloca; o motivo já está escrito nela.
    if (motivoDe(fatiaEscolhida, dia, hora)) return;
    // A sala da aula vizinha da mesma fatia, para o bloco não trocar de sala.
    const vizinha = [hora - 1, hora + 1]
      .map((h) => daGrade.get(chave(dia, h)))
      .find((a) => a && idAula(a) === idFatia(fatiaEscolhida));
    const sala = escolherSala(ctx, oc, regrasDe(fatiaEscolhida), dia, hora, vizinha?.salaId ?? null) ?? null;
    await gravar(`Alocar ${fatiaEscolhida.disciplina_curta}`, [
      acoes.alocar(cursoId, periodo, dia, hora, fatiaEscolhida, sala),
    ]);
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

  async function trocarSalaDe(a: Aula, salaId: number | null) {
    if (salaId === a.salaId) return;
    await gravar(`Trocar a sala de ${a.disciplina}`, [acoes.trocarSala(a, salaId)]);
  }

  /** Fixar protege a aula do gerador, do "Limpar período" e do botão de remover. */
  async function alternarFixada(a: Aula) {
    await gravar(`${a.fixada ? "Soltar" : "Fixar"} ${a.disciplina}`, [acoes.fixar(a, !a.fixada)]);
  }

  /** Só o botão da aula chama, e na aula fixada ele está desabilitado. */
  async function removerAula(a: Aula) {
    await gravar(
      `Remover ${a.disciplina}`,
      [acoes.remover(a)],
      `${a.disciplina} removida de ${DIAS[a.dia]} ${codigoDe(a.hora)}`,
    );
  }

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
        <BotaoDesfazer />
        {/* O botão desabilitado não recebe foco nem pouso: o motivo fica à
            vista, ao lado, em vez de numa dica que ninguém alcança. */}
        {nadaALimpar && (
          <span id="motivo-limpar-periodo" className="self-center text-xs text-tx3">
            {nadaALimpar}
          </span>
        )}
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

      {/* Os dois painéis têm a mesma altura: a nota do rodapé das pendências
          fica ancorada embaixo, e não flutuando no meio da tela. */}
      <div className="grid grid-cols-[264px_1fr] items-stretch gap-[14px]">
        <Pendencias
          fatiasDoPeriodo={fatiasDoPeriodo}
          fechadas={fechadas}
          alocadas={alocadas}
          escolhida={escolhida}
          setEscolhida={setEscolhida}
          fatiaEscolhida={fatiaEscolhida}
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
          fatiaEscolhida={fatiaEscolhida}
          motivoDe={motivoDe}
          exigeSala={(a) => !!fatiaDaAula(a)?.exige_sala}
          salasParaTroca={salasParaTroca}
          aoAlocar={(dia, hora) => void alocarEm(dia, hora)}
          aoRemover={(a) => void removerAula(a)}
          aoFixar={(a) => void alternarFixada(a)}
          aoTrocarSala={(a, salaId) => void trocarSalaDe(a, salaId)}
        />
      </div>
    </>
  );
}
