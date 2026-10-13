import { useCallback, useEffect, useRef, useState } from "react";
import { consultar, type Instrucao } from "../db";
import { carregarProblema } from "../solver/carregar";
import { resolver } from "../solver/solver";
import { buracos } from "../solver/custo";
import type { Alocacao, Problema, Resultado } from "../solver/tipos";
import { Alerta } from "@/componentes/alerta";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { useConfirmar } from "@/componentes/confirmacao";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { Secao } from "@/componentes/secao";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/componentes/ui/table";
import { mensagemErro } from "@/lib/erros";
import { historico } from "../grade";
import { BotaoDesfazer } from "../grade/BotaoDesfazer";
import { desfazerEAvisar } from "../grade/desfazer";
import { useHistorico } from "../grade/useHistorico";

interface Medidas {
  aulas: number;
  buracosProfessor: number;
  buracosAluno: number;
  foraDoTurno: number;
}

function medir(problema: Problema, alocacoes: Alocacao[]): Medidas {
  const turnoHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const turnoPeriodo = new Map(problema.periodos.map((p) => [p.numero, p.turno]));
  const turnoFatia = new Map(
    problema.fatias.map((f) => [`${f.disciplinaId}:${f.professorId}`, f.turno]),
  );
  return {
    aulas: alocacoes.length,
    buracosProfessor: buracos(problema, alocacoes, (a) => `p${a.professorId}`),
    buracosAluno: buracos(problema, alocacoes, (a) => `t${a.periodo}`),
    foraDoTurno: alocacoes.filter((a) => {
      const esperado =
        turnoFatia.get(`${a.disciplinaId}:${a.professorId}`) ??
        turnoPeriodo.get(a.periodo);
      return turnoHora.get(a.hora) !== esperado;
    }).length,
  };
}

/**
 * O que a tela carregou, com o curso de que é. Trocar de curso não remonta a
 * página: lido pelo curso, o que sobrou do anterior nunca chega ao desenho.
 */
interface Carga {
  cursoId: number;
  problema: Problema;
  atual: Alocacao[];
}

/** O que foi gerado, com o curso para o qual foi gerado. */
interface Gerado {
  cursoId: number;
  resultado: Resultado;
}

/** Id do aviso que diz por que "Gerar grade", "Aplicar" e "Descartar" estão parados. */
const MOTIVO = "motivo-grade-automatica";

/**
 * A palavra depois do número, em largura fixa (a de "melhor", na fonte de
 * largura fixa da coluna): os números das linhas continuam um embaixo do outro.
 */
const PALAVRA = "inline-block w-[6ch] text-left";

/**
 * A célula "Gerada" do comparativo: o número novo e, escrito, se ele é melhor,
 * pior ou igual ao da grade atual. A cor só acompanha a palavra. "Melhor" é da
 * medida, não do número: em buracos, o que desce é melhor.
 */
function Gerada({ antes, depois, menorEhMelhor }: { antes: number; depois: number; menorEhMelhor: boolean }) {
  if (depois === antes)
    return (
      <span>
        {depois} <span className={PALAVRA}>igual</span>
      </span>
    );
  const melhorou = (depois < antes) === menorEhMelhor;
  return (
    <span className={melhorou ? "font-semibold text-primary" : "font-semibold text-destructive"}>
      {depois} <span className={PALAVRA}>{melhorou ? "melhor" : "pior"}</span>
    </span>
  );
}

/** Coluna de número: ocupa só o que precisa, em fonte de largura fixa. */
const NUMERO = "w-[1%] pl-5 text-right font-mono text-[12px] whitespace-nowrap tabular-nums";

export default function GradeAutomatica({
  cursoId,
  aoNavegar,
}: {
  cursoId: number;
  aoNavegar: (id: string) => void;
}) {
  const confirmar = useConfirmar();
  const { versao } = useHistorico();
  const [lido, setLido] = useState<Carga | null>(null);
  const [gerado, setGerado] = useState<Gerado | null>(null);
  const [gerando, setGerando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [aplicadoEm, setAplicadoEm] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  // Só o que é do curso na tela conta: o resto é de um curso que já saiu, e
  // aplicá-lo gravaria a grade de um curso no outro.
  const carga = lido?.cursoId === cursoId ? lido : null;
  const resultado = gerado?.cursoId === cursoId ? gerado.resultado : null;
  const aplicado = aplicadoEm === cursoId;

  // O curso de agora, para quem acorda depois de um `await` (a carga, a
  // geração, a gravação) saber se a tela ainda é a do curso que o chamou.
  const cursoAtual = useRef(cursoId);
  useEffect(() => {
    cursoAtual.current = cursoId;
  }, [cursoId]);
  // Cada carga leva um número: a que chega depois de outra mais nova não vale.
  const geracao = useRef(0);

  /**
   * Lê o problema e a grade do curso. Não rejeita: o erro é da carga e vai para
   * a página por aqui, com a mesma guarda do resultado — a carga superada, ou a
   * de um curso que já saiu da tela, não escreve nem o que leu nem a falha dela.
   */
  const carregar = useCallback(async () => {
    const minha = ++geracao.current;
    const vale = () => minha === geracao.current && cursoId === cursoAtual.current;
    try {
      const problema = await carregarProblema(cursoId);
      const atual = (
        await consultar<{
          periodo: number;
          dia: number;
          hora: number;
          disciplina_id: number;
          professor_id: number;
          sala_id: number | null;
        }>("SELECT * FROM alocacoes WHERE curso_id = ?", [cursoId])
      ).map((a) => ({
        periodo: a.periodo,
        dia: a.dia,
        hora: a.hora,
        disciplinaId: a.disciplina_id,
        professorId: a.professor_id,
        salaId: a.sala_id,
      }));
      if (!vale()) return;
      setLido({ cursoId, problema, atual });
      setErro("");
    } catch (e) {
      if (vale()) setErro(String(e));
    }
  }, [cursoId]);

  // Carrega ao abrir, ao trocar de curso e depois de cada desfazer (`versao`),
  // venha ele do botão, do toast, do Ctrl+Z ou da grade manual. O que foi
  // gerado não sobrevive: era para uma grade que já não é a de agora.
  useEffect(() => {
    setGerado(null);
    setAplicadoEm(null);
    void carregar();
  }, [carregar, versao]);

  function gerar() {
    if (!carga) return;
    setErro("");
    // O resultado de antes fica à vista até o novo chegar (sem ele a página
    // encolhe e volta a crescer), mas parado: "Aplicar" e "Descartar" ficam
    // desabilitados enquanto se gera, e `aplicar` confere de novo.
    setAplicadoEm(null);
    setGerando(true);
    // Um quadro antes de bloquear: sem isto o "gerando…" nunca chega à tela,
    // porque o solver roda no mesmo thread que desenha.
    setTimeout(() => {
      try {
        const feito = resolver(carga.problema);
        if (cursoAtual.current === cursoId) setGerado({ cursoId, resultado: feito });
      } catch (e) {
        setErro(String(e));
      } finally {
        setGerando(false);
      }
    }, 30);
  }

  async function aplicar() {
    // Gerando, o resultado à mostra é o que está sendo substituído.
    if (!resultado || !carga || gerando) return;
    // Aplicar duas vezes: durante a confirmação, um segundo pedido recusa o
    // primeiro (é do `confirmar`); depois dela, o botão fica parado até o fim.
    try {
      const { problema } = carga;
      const fixadas = problema.fixadas.length;
      if (
        !(await confirmar({
          titulo: "Substituir a grade atual pela gerada?",
          descricao:
            `${carga.atual.length} aula(s) hoje → ${resultado.alocacoes.length} aula(s).` +
            (fixadas ? ` As ${fixadas} aula(s) fixadas são preservadas.` : ""),
          confirmar: "Aplicar a grade",
        }))
      )
        return;
      setAplicando(true);
      setErro("");
      // As instruções só tocam `alocacoes` do curso: é só isso que o desfazer restaura.
      const instrucoes: Instrucao[] = [
        // As fixadas ficam: elas já constam do resultado e apagá-las junto
        // faria o INSERT seguinte recriá-las, perdendo a marca de fixada.
        {
          sql: "DELETE FROM alocacoes WHERE curso_id = ? AND fixada = 0",
          params: [cursoId],
        },
        ...resultado.alocacoes
          .filter(
            (a) =>
              !problema.fixadas.some(
                (f) => f.periodo === a.periodo && f.dia === a.dia && f.hora === a.hora,
              ),
          )
          .map((a) => ({
            sql: `INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id,
                                         professor_id, sala_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [
              cursoId,
              a.periodo,
              a.dia,
              a.hora,
              a.disciplinaId,
              a.professorId,
              a.salaId,
            ],
          })),
      ];
      try {
        // Pelo histórico, que é o que torna a aplicação desfazível.
        await historico.executarNaGrade(cursoId, "Aplicar a grade gerada", instrucoes);
      } catch (e) {
        avisar.erro(mensagemErro(e, "A grade"));
        await carregar();
        return;
      }
      // O histórico já publicou (o toast de desfazer anterior fechou) antes de
      // este abrir. A ação que cruza com uma escrita de cadastro, ou com a
      // troca de curso, fica gravada sem entrar nele: um "Desfazer" ali não
      // teria o que desfazer, ou desfaria outra ação.
      if (cursoAtual.current === cursoId && historico.estado().podeDesfazer)
        avisar.desfazer("Grade aplicada", () => void desfazerEAvisar());
      else avisar.sucesso("Grade aplicada");
      // Antes de recarregar, e não depois: um desfazer que chegue durante a
      // recarga zera os dois (pelo efeito de `versao`), e escrevê-los depois
      // dela reacenderia o aviso de uma grade que já foi desfeita.
      if (cursoAtual.current === cursoId) {
        setGerado(null);
        setAplicadoEm(cursoId);
      }
      await carregar();
    } finally {
      setAplicando(false);
    }
  }

  // O erro de carga precisa aparecer mesmo sem problema montado (B5). Enquanto
  // carrega, o que há é de outro curso (ou nada).
  if (!carga)
    return (
      <>
        <CabecalhoPagina titulo="Grade automática" />
        <Alerta tom="erro">{erro}</Alerta>
      </>
    );

  const { problema, atual } = carga;
  const semFatias = problema.fatias.length === 0;
  const previstas = problema.fatias.reduce((s, f) => s + f.aulas, 0);
  const antes = medir(problema, atual);
  const depois = resultado ? medir(problema, resultado.alocacoes) : null;
  // Por que "Gerar grade" não age. O botão desabilitado não recebe foco nem
  // pouso: o motivo fica à vista, ao lado, e antes dos botões, para não os
  // empurrar quando aparece. É também o motivo de "Aplicar" e "Descartar",
  // lá embaixo, enquanto se aplica ou se gera.
  const motivo = aplicando
    ? "Aplicando a grade…"
    : gerando
      ? "Gerando a grade…"
      : semFatias
        ? "Não há o que distribuir."
        : "";
  const parado = aplicando || gerando;

  const linha = (rotulo: string, a: number, d: number | undefined, menorEhMelhor = true) => (
    <TableRow key={rotulo}>
      <TableCell className="w-[60%]">{rotulo}</TableCell>
      <TableCell className={NUMERO}>{a}</TableCell>
      <TableCell className={NUMERO}>
        {d == null ? "—" : <Gerada antes={a} depois={d} menorEhMelhor={menorEhMelhor} />}
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Grade automática"
        sub={
          `${previstas} aula(s) a distribuir em ${problema.periodos.length} período(s).` +
          (problema.externas.length > 0
            ? ` ${problema.externas.length} aula(s) de outros cursos respeitadas.`
            : "")
        }
      >
        {motivo && (
          <span id={MOTIVO} className="inline-flex h-7 items-center text-xs text-tx2">
            {motivo}
          </span>
        )}
        <BotaoDesfazer />
        <Button onClick={gerar} disabled={gerando || aplicando || semFatias} aria-describedby={motivo ? MOTIVO : undefined}>
          {gerando ? "Gerando…" : "Gerar grade"}
        </Button>
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      {aplicado && (
        <Alerta tom="sucesso">
          Grade aplicada.{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => aoNavegar("grade-manual")}>
            Abrir a grade manual
          </Button>
        </Alerta>
      )}

      {semFatias ? (
        <EstadoVazio>
          Nenhuma disciplina com professor atribuído neste curso — não há o que distribuir.
        </EstadoVazio>
      ) : (
        <>
          <Secao titulo="O que o gerador respeita">
            <p className="mb-3 max-w-[68ch] text-xs leading-normal text-tx2">
              Restrições duras, que ele nunca viola: um professor num lugar por vez, uma sala por vez,
              indisponibilidades declaradas, sábado só para quem pode, requisito de sala, e blocos de
              aulas seguidas dentro dos padrões cadastrados. Aulas fixadas na grade manual ficam onde
              estão — hoje são <strong>{problema.fixadas.length}</strong>.
            </p>
            <p className="mb-3 max-w-[68ch] text-xs leading-normal text-tx2">
              Preferências, que ele tenta e às vezes não consegue: manter cada período no seu turno,
              evitar janelas na agenda do professor e na grade da turma, e respeitar a preferência de
              distribuição de dias de cada professor.
            </p>
          </Secao>

          {resultado && (
            <Secao titulo="Resultado">
              {!resultado.completo && (
                <Alerta tom="aviso">
                  {resultado.faltantes.length} fatia(s) não couberam. A grade gerada é parcial — o resto
                  continua por alocar à mão.
                </Alerta>
              )}

              <Table className="[&_td]:h-8">
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <span className="sr-only">Medida</span>
                    </TableHead>
                    <TableHead className="w-[1%] pl-5 text-right font-mono">Grade atual</TableHead>
                    <TableHead className="w-[1%] pl-5 text-right font-mono">Gerada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linha("Aulas alocadas", antes.aulas, depois?.aulas, false)}
                  {linha("Buracos na agenda dos professores", antes.buracosProfessor, depois?.buracosProfessor)}
                  {linha("Buracos na grade das turmas", antes.buracosAluno, depois?.buracosAluno)}
                  {linha("Aulas fora do turno", antes.foraDoTurno, depois?.foraDoTurno)}
                </TableBody>
              </Table>

              <p className="mb-3 max-w-[68ch] text-xs leading-normal text-tx2">
                Resolvido em {resultado.milissegundos} ms, {resultado.passos} tentativas de posicionamento.
              </p>

              {resultado.faltantes.length > 0 && (
                <>
                  <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-tx3">Não couberam</h2>
                  <Table aria-label="Fatias que não couberam" className="[&_td]:h-8">
                    <TableBody>
                      {resultado.faltantes.map((f) => (
                        <TableRow key={`${f.fatia.disciplinaId}:${f.fatia.professorId}`}>
                          <TableCell className="font-semibold">{f.fatia.nome}</TableCell>
                          <TableCell className={NUMERO}>{f.fatia.aulas} aula(s)</TableCell>
                          <TableCell className="text-tx3">{f.motivo}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}

              <div className="mt-3 flex items-center gap-2">
                <Button onClick={() => void aplicar()} disabled={parado} aria-describedby={parado ? MOTIVO : undefined}>
                  {aplicando ? "Aplicando…" : "Aplicar esta grade"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setGerado(null)}
                  disabled={parado}
                  aria-describedby={parado ? MOTIVO : undefined}
                >
                  Descartar
                </Button>
              </div>
            </Secao>
          )}
        </>
      )}
    </>
  );
}
