import { useEffect, useRef, useState, type ReactNode } from "react";
import { consultar, executar, transacao } from "../db";
import { TURNOS, type Horario, type PadraoBloco } from "../tipos";
import { Alerta } from "@/componentes/alerta";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { Campo } from "@/componentes/campo";
import { useConfirmar } from "@/componentes/confirmacao";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { Secao } from "@/componentes/secao";
import { Seletor } from "@/componentes/seletor";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { useSinalDeSalvo } from "@/componentes/use-sinal-de-salvo";
import { mensagemErro } from "@/lib/erros";
import { cn } from "@/lib/utils";

/**
 * Nome de cada nota. A escala é 0..6 porque é o que o solver usa como custo;
 * dar nome a cada degrau evita que a pessoa tenha de adivinhar a diferença
 * entre "4" e "5" na hora de cadastrar.
 */
const NOTAS = [
  "ideal",
  "ótimo",
  "bom",
  "aceitável",
  "pouco desejável",
  "ruim",
  "evitar ao máximo",
];

const OPCOES_DE_NOTA = NOTAS.map((nome, i) => ({ valor: i, rotulo: `${i} · ${nome}` }));

const OPCOES_DE_SEMANA = [
  { valor: 5, rotulo: "Segunda a sexta" },
  { valor: 6, rotulo: "Segunda a sábado" },
];

/**
 * A nota tem três faixas: 0 e 1 no acento, 2 a 4 neutros, 5 e 6 em negativo.
 * A cor só reforça: o que diz o quanto o gerador evita o padrão é o número, e
 * o filete que o separa da divisão. No pouso, tudo vira negativo: é o que o
 * clique vai fazer (remover) antes de ele acontecer.
 */
function faixaDaNota(custo: number) {
  if (custo <= 1) return { chip: "border-acc-line text-primary", filete: "border-acc-line" };
  if (custo >= 5) return { chip: "border-destructive text-destructive", filete: "border-destructive" };
  return { chip: "border-input", filete: "border-line" };
}

/** Parágrafo de explicação: o texto vai até a borda do painel, justificado. */
function Explica({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-justify text-xs leading-normal text-pretty text-tx2">{children}</p>;
}

/**
 * O que vale para todos os cursos: os dias letivos, os horários do dia e os
 * padrões de bloco. Professores e salas também são institucionais, mas têm
 * páginas próprias por serem cadastros grandes.
 */
export default function Instituicao() {
  const confirmar = useConfirmar();
  const [dias, setDias] = useState(6);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [padroes, setPadroes] = useState<PadraoBloco[]>([]);
  const [novoPadrao, setNovoPadrao] = useState("");
  const [custoPadrao, setCustoPadrao] = useState(0);
  // Falha de carga ou de recarga: o que a tela mostra pode não ser o que o
  // banco guarda. Falha de gravação é toast.
  const [erro, setErro] = useState("");
  // A divisão mal escrita é erro do campo, não da página: fica junto dele.
  const [erroDoPadrao, setErroDoPadrao] = useState("");
  const campoDoPadrao = useRef<HTMLInputElement>(null);
  const [salvo, piscar] = useSinalDeSalvo();

  async function carregar() {
    const cfg = await consultar<{ chave: string; valor: string }>(
      "SELECT chave, valor FROM configuracao",
    );
    const mapa = Object.fromEntries(cfg.map((c) => [c.chave, c.valor]));
    setDias(Number(mapa.dias_letivos ?? 6));

    setHorarios(await consultar<Horario>("SELECT * FROM horarios ORDER BY indice"));

    setPadroes(
      await consultar<PadraoBloco>(
        "SELECT * FROM padroes_blocos ORDER BY aulas, custo, padrao",
      ),
    );
    setErro("");
  }

  // A falha de carga aparece na página, venha da abertura da tela ou da
  // recarga depois de gravar: nos dois casos o que está errado é o que ela mostra.
  const recarregar = () => carregar().catch((e) => setErro(String(e)));

  useEffect(() => {
    void recarregar();
  }, []);

  /**
   * Grava e relê. A tela não tem formulário onde a falha de gravação caiba:
   * ela sai num aviso de erro, que fica até ser fechado, e a tela continua
   * mostrando o que o banco guarda. Devolve se gravou, para quem precisa
   * limpar o campo.
   */
  async function tentar(acao: () => Promise<unknown>, contexto: string): Promise<boolean> {
    try {
      await acao();
    } catch (e) {
      avisar.erro(mensagemErro(e, contexto));
      return false;
    }
    // Fora do `try`: o que já foi gravado não é falha de gravação. Se a
    // releitura falhar, o erro é da página e quem chamou fica sabendo que gravou.
    await recarregar();
    piscar();
    return true;
  }

  const gravarConfig = (chave: string, valor: string) =>
    tentar(
      () =>
        executar(
          "INSERT INTO configuracao (chave, valor) VALUES (?, ?)" +
            " ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
          [chave, valor],
        ),
      "A configuração",
    );

  /**
   * Tirar o sábado com aula no sábado apagaria aulas sem ninguém ver — a grade
   * só esconderia a coluna (I2). Vale para todos os cursos: os dias letivos
   * são da instituição.
   */
  async function mudarDias(novo: number) {
    // Sem `setDias(novo)`: `tentar` relê o banco depois de gravar, e é só aí
    // que o seletor muda. Se a gravação falhar, ele continua mostrando o que
    // está no banco, em vez de 5 dias com o banco em 6.
    if (novo < dias) {
      let n: number;
      try {
        [{ n }] = await consultar<{ n: number }>("SELECT COUNT(*) AS n FROM alocacoes WHERE dia >= ?", [novo]);
      } catch (e) {
        // A consulta é parte da ação de mudar a semana: a falha dela é da ação.
        return avisar.erro(mensagemErro(e, "A configuração"));
      }
      if (n > 0) {
        if (
          !(await confirmar({
            titulo: "Tirar o sábado da semana?",
            descricao: `${n} ${n === 1 ? "aula" : "aulas"} no sábado, somando todos os cursos, serão apagadas.`,
            confirmar: "Apagar e tirar o sábado",
            perigo: true,
          }))
        )
          return;
        return tentar(
          () =>
            transacao([
              { sql: "DELETE FROM alocacoes WHERE dia >= ?", params: [novo] },
              {
                sql:
                  "INSERT INTO configuracao (chave, valor) VALUES ('dias_letivos', ?)" +
                  " ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
                params: [String(novo)],
              },
            ]),
          "A configuração",
        );
      }
    }
    return gravarConfig("dias_letivos", String(novo));
  }

  /** Chamada de um `onClick`: `tentar` já trata os erros de gravação, e `confirmar` não rejeita. */
  async function removerPadrao(p: PadraoBloco, n: number) {
    if (
      !(await confirmar({
        titulo: `Remover o padrão ${p.padrao} de ${n} aula(s)?`,
        confirmar: "Remover padrão",
        perigo: true,
      }))
    )
      return;
    await tentar(
      () => executar("DELETE FROM padroes_blocos WHERE aulas = ? AND padrao = ?", [p.aulas, p.padrao]),
      "O padrão",
    );
  }

  /** '2+2' → [2,2]; devolve null se a escrita não for válida. */
  function partes(texto: string): number[] | null {
    const p = texto
      .split("+")
      .map((x) => Number(x.trim()))
      .filter((x) => !Number.isNaN(x));
    if (p.length === 0 || p.some((x) => !Number.isInteger(x) || x < 1)) return null;
    if (p.join("+") !== texto.replace(/\s/g, "")) return null;
    return p;
  }

  async function acrescentarPadrao() {
    const p = partes(novoPadrao);
    if (!p) {
      setErroDoPadrao('Escreva o padrão como "2+2" ou "3+1" — números somados.');
      // Quem clicou no botão está longe do campo: o foco volta para onde se corrige.
      campoDoPadrao.current?.focus();
      return;
    }
    // Ordem decrescente é a forma canônica: '1+3' e '3+1' são o mesmo padrão.
    const canonico = [...p].sort((a, b) => b - a).join("+");
    const total = p.reduce((s, x) => s + x, 0);
    const gravou = await tentar(
      () =>
        executar(
          "INSERT INTO padroes_blocos (aulas, padrao, custo) VALUES (?, ?, ?)" +
            " ON CONFLICT(aulas, padrao) DO UPDATE SET custo = excluded.custo",
          [total, canonico, custoPadrao],
        ),
      "O padrão",
    );
    // Se falhou, o que foi digitado fica: a pessoa corrige em vez de reescrever.
    if (gravou) setNovoPadrao("");
  }

  const divisao = partes(novoPadrao);
  const semDivisao = !novoPadrao.trim();

  return (
    <div className="max-w-[780px]">
      <CabecalhoPagina
        titulo="Regras"
        sub="Como a grade é montada: dias letivos, horários do dia e padrões de bloco. Valem para todos os cursos."
      >
        {/* A região existe sempre e o texto entra e sai dentro dela: é a
            mudança que o leitor de tela anuncia, não o elemento que aparece. */}
        <span role="status" className="text-xs text-primary">
          {salvo ? "salvo" : ""}
        </span>
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      <Secao titulo="Dias letivos">
        <Campo rotulo="Semana" className="w-[190px]">
          {(a) => (
            <Seletor
              {...a}
              className="w-full"
              valor={dias}
              opcoes={OPCOES_DE_SEMANA}
              aoMudar={(d) => void mudarDias(d)}
            />
          )}
        </Campo>
      </Secao>

      <Secao titulo="Horários do dia">
        <div className="flex flex-col gap-1.5">
          {TURNOS.filter((t) => horarios.some((h) => h.turno === t.valor)).map((t) => (
            <div key={t.valor} className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-[54px] text-[10px] uppercase tracking-[0.08em] text-tx3">{t.rotulo}</span>
              {horarios
                .filter((h) => h.turno === t.valor)
                .map((h) => (
                  <span
                    key={h.indice}
                    className="inline-flex items-baseline gap-[5px] rounded-[4px] bg-poco px-[7px] py-[3px] font-mono"
                    title={`${h.duracao_min} min`}
                  >
                    <strong className="text-[11px] font-semibold">{h.codigo}</strong>
                    <em className="text-[10px] not-italic text-tx3">{h.rotulo}</em>
                  </span>
                ))}
              <span className="text-[10.5px] text-tx3">
                {horarios.find((h) => h.turno === t.valor)?.duracao_min} min
              </span>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Padrões de bloco">
        <Explica>
          Cada linha é um total de aulas semanais. Os botões ao lado são as formas permitidas de dividir esse total em
          blocos de aulas seguidas: <strong>2+2</strong> são dois dias com duas aulas emendadas, <strong>3+1</strong> é
          um dia com três e outro com uma.
        </Explica>
        <Explica>
          Para adicionar, escreva a divisão no campo abaixo, escolha a nota e confirme. A nota ordena as opções:{" "}
          <strong>0</strong> é o que o gerador usa primeiro, e quanto maior, mais ele evita. Clique num padrão
          existente para removê-lo.
        </Explica>
        <Explica>
          O gerador só usa o que está aqui. Um total sem nenhum padrão não tem como ser distribuído — a disciplina fica
          de fora da geração.
        </Explica>

        {padroes.length === 0 ? (
          <EstadoVazio>Nenhum padrão cadastrado.</EstadoVazio>
        ) : (
          <div className="flex flex-col gap-1.5">
            {[...new Set(padroes.map((p) => p.aulas))].map((n) => (
              <div key={n} className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-[62px] text-xs tabular-nums text-tx3">
                  {n} aula{n === 1 ? "" : "s"}
                </span>
                {padroes
                  .filter((p) => p.aulas === n)
                  .map((p) => {
                    const faixa = faixaDaNota(p.custo);
                    return (
                      // O chip é um botão: remover é o clique. A divisão e a nota
                      // são dois dados e ficam em campos separados por um filete.
                      <button
                        key={p.padrao}
                        type="button"
                        className={cn(
                          "group inline-flex cursor-pointer items-baseline rounded-[4px] border bg-panel py-px pr-[3px] pl-1.5 font-mono text-[11.5px] transition-colors hover:border-destructive hover:bg-accent hover:text-destructive",
                          faixa.chip,
                        )}
                        // O texto do chip ("2+2 0") não diz o que o clique faz.
                        aria-label={`Remover o padrão ${p.padrao} (nota ${p.custo})`}
                        title={`Nota ${p.custo} · ${NOTAS[p.custo] ?? ""} — clique para remover este padrão`}
                        onClick={() => void removerPadrao(p, n)}
                      >
                        <b className="font-semibold">{p.padrao}</b>
                        <em
                          className={cn(
                            "ml-1.5 border-l px-[5px] text-[9.5px] not-italic text-tx3 group-hover:border-destructive group-hover:text-destructive",
                            faixa.filete,
                          )}
                          title={NOTAS[p.custo] ?? ""}
                        >
                          {p.custo}
                        </em>
                        {/* O × só aparece no pouso (ou no foco do teclado), mas o
                            espaço é reservado sempre: o chip não muda de largura. */}
                        <i
                          aria-hidden="true"
                          className="w-[7px] text-[11px] not-italic text-destructive opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                        >
                          ×
                        </i>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Input
            ref={campoDoPadrao}
            aria-label="Divisão do novo padrão"
            aria-invalid={erroDoPadrao ? true : undefined}
            aria-describedby={erroDoPadrao ? "erro-do-novo-padrao" : undefined}
            className="w-32"
            placeholder="ex.: 2+2"
            value={novoPadrao}
            onChange={(e) => {
              setNovoPadrao(e.target.value);
              // Quem voltou a digitar já leu a mensagem.
              setErroDoPadrao("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void acrescentarPadrao();
              }
            }}
          />
          <Seletor
            rotulo="Nota do padrão"
            className="w-[190px]"
            valor={custoPadrao}
            opcoes={OPCOES_DE_NOTA}
            aoMudar={setCustoPadrao}
          />
          <Button
            variant="outline"
            onClick={() => void acrescentarPadrao()}
            disabled={semDivisao}
            aria-describedby={semDivisao ? "motivo-adicionar-padrao" : undefined}
          >
            Adicionar padrão
          </Button>
          {/* O botão desabilitado não recebe foco nem pouso: o motivo fica à
              vista, ao lado, em vez de numa dica que ninguém alcança. */}
          {semDivisao && (
            <span id="motivo-adicionar-padrao" className="text-xs text-tx2">
              Digite a divisão do padrão
            </span>
          )}
          {divisao && <span className="self-center text-xs text-tx3">{divisao.reduce((s, x) => s + x, 0)} aulas</span>}
        </div>
        {/* `role="alert"`: com o Enter o foco já está no campo, e a descrição
            que muda num campo focado não é lida sozinha. */}
        {erroDoPadrao && (
          <p id="erro-do-novo-padrao" role="alert" className="mt-1 text-xs leading-4 text-destructive">
            {erroDoPadrao}
          </p>
        )}
      </Secao>
    </div>
  );
}
