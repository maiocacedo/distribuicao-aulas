import { useCallback, useEffect, useState } from "react";
import { consultar, executar } from "../db";
import { TURNOS, type Periodo } from "../tipos";
import { Alerta } from "@/componentes/alerta";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { Secao } from "@/componentes/secao";
import { Seletor } from "@/componentes/seletor";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/componentes/ui/table";
import { useSinalDeSalvo } from "@/componentes/use-sinal-de-salvo";
import { mensagemErro } from "@/lib/erros";

interface Linha extends Periodo {
  n_disciplinas: number;
  n_aulas: number;
}

/** Zero vira travessão: numa coluna de contagens, o que salta é quem tem algo. */
const contagem = (n: number) => n || "—";

/** Os períodos do curso selecionado. */
export default function Periodos({ cursoId }: { cursoId: number }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState("");
  const [salvo, piscar] = useSinalDeSalvo();
  const [carregando, setCarregando] = useState(true);
  // Só os turnos que o curso ocupa: oferecer um turno de fora é
  // convidar a um estado que a grade não sabe mostrar.
  const [turnosDoCurso, setTurnosDoCurso] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    const [curso] = await consultar<{ turnos: string }>(
      "SELECT turnos FROM cursos WHERE id = ?",
      [cursoId],
    );
    setTurnosDoCurso((curso?.turnos ?? "manha,tarde").split(",").filter(Boolean));
    setLinhas(
      await consultar<Linha>(
        `SELECT p.*,
                (SELECT COUNT(*) FROM disciplinas d
                  WHERE d.curso_id = p.curso_id AND d.periodo = p.numero) AS n_disciplinas,
                (SELECT COUNT(*) FROM alocacoes a
                  WHERE a.curso_id = p.curso_id AND a.periodo = p.numero) AS n_aulas
           FROM periodos p WHERE p.curso_id = ? ORDER BY p.numero`,
        [cursoId],
      ),
    );
    setCarregando(false);
    setErro("");
  }, [cursoId]);

  // A falha de carga aparece na página, venha da abertura da tela ou da recarga
  // depois de gravar: nos dois casos o que está errado é o quadro.
  const recarregar = useCallback(() => carregar().catch((e) => setErro(String(e))), [carregar]);

  useEffect(() => {
    // Trocou de curso: até a recarga chegar, as linhas à mostra são do curso
    // anterior e os botões "Adicionar" calculariam o próximo número sobre elas.
    setCarregando(true);
    void recarregar();
  }, [recarregar]);

  /** Devolve se gravou, para quem precisa desfazer o que o controle mostra. */
  async function tentar(acao: () => Promise<unknown>, contexto: string): Promise<boolean> {
    try {
      await acao();
    } catch (e) {
      // Controle embutido na linha: não há formulário onde a recusa caiba.
      avisar.erro(mensagemErro(e, contexto));
      return false;
    }
    // Fora do `try`: a falha da recarga é do quadro e fica na página.
    await recarregar();
    piscar();
    return true;
  }

  const proximo = linhas.length ? Math.max(...linhas.map((p) => p.numero)) + 1 : 1;
  const ultimo = linhas[linhas.length - 1];
  const ultimoTemDisciplinas = !!ultimo && ultimo.n_disciplinas > 0;

  return (
    <>
      <CabecalhoPagina titulo="Períodos">
        {salvo && <span className="text-xs text-primary">salvo</span>}
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      <Secao>
        {carregando ? null : linhas.length === 0 ? (
          <EstadoVazio>Nenhum período ainda. Acrescente o primeiro.</EstadoVazio>
        ) : (
          // Colunas de largura igual: sem `table-fixed`, a coluna sem largura
          // declarada absorveria a sobra e cresceria sozinha com a janela.
          <Table className="table-fixed [&_td]:h-8 [&_td]:text-center [&_th]:text-center">
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono">Período</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead className="font-mono">Máx. de obrigatórias no contraturno</TableHead>
                <TableHead className="font-mono">Disciplinas</TableHead>
                <TableHead className="font-mono">Aulas na grade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((p) => (
                <TableRow key={p.numero}>
                  <TableCell className="font-mono text-[12px] font-semibold tabular-nums">{p.numero}º</TableCell>
                  <TableCell>
                    <Seletor
                      rotulo={`Turno do ${p.numero}º período`}
                      className="mx-auto h-6 w-[150px] *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:justify-center"
                      valor={p.turno}
                      opcoes={TURNOS.filter((t) => turnosDoCurso.includes(t.valor) || t.valor === p.turno).map((t) => ({
                        valor: t.valor,
                        rotulo: t.rotulo,
                      }))}
                      aoMudar={(turno) =>
                        void tentar(
                          () =>
                            executar("UPDATE periodos SET turno = ? WHERE curso_id = ? AND numero = ?", [
                              turno,
                              cursoId,
                              p.numero,
                            ]),
                          "O período",
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      // Sem "turno do Nº período" no texto: o rótulo do seletor de turno seria achado junto.
                      aria-label={`Máx. de obrigatórias no contraturno (${p.numero}º período)`}
                      type="number"
                      min={0}
                      // Sem a chave, trocar de curso ou recarregar deixaria o valor
                      // digitado na caixa em vez do que está no banco.
                      key={`${cursoId}-${p.numero}-${p.max_disciplinas_contraturno}`}
                      className="mx-auto block h-5 w-16 px-1 text-center font-mono"
                      defaultValue={p.max_disciplinas_contraturno}
                      onBlur={async (e) => {
                        // Guardada antes do `await`: depois dele o evento já passou.
                        const caixa = e.target;
                        const texto = caixa.value.trim();
                        const valor = Number(texto);
                        // Fora de um formulário o navegador não valida: o `min` só ajuda as
                        // setas. Valida o texto antes de compará-lo ao gravado; senão o vazio
                        // (que dá 0) passaria por "sem mudança" com a caixa vazia.
                        if (texto === "" || !Number.isInteger(valor) || valor < 0) {
                          caixa.value = String(p.max_disciplinas_contraturno);
                          return avisar.erro("Use um número inteiro, zero ou maior.");
                        }
                        if (valor === p.max_disciplinas_contraturno) {
                          caixa.value = String(valor);
                          return;
                        }
                        const gravou = await tentar(
                          () =>
                            executar(
                              "UPDATE periodos SET max_disciplinas_contraturno = ? WHERE curso_id = ? AND numero = ?",
                              [valor, cursoId, p.numero],
                            ),
                          "O período",
                        );
                        // Gravou: a chave muda e a caixa nasce com o valor novo. Não gravou: o
                        // banco guarda o antigo, e a caixa não pode seguir mostrando o digitado.
                        if (!gravou) caixa.value = String(p.max_disciplinas_contraturno);
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[12px] tabular-nums">{contagem(p.n_disciplinas)}</TableCell>
                  <TableCell className="font-mono text-[12px] tabular-nums">{contagem(p.n_aulas)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <dl className="mt-3.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 border-t border-line pt-3 text-xs">
          <dt className="font-semibold whitespace-nowrap text-tx2">Turno</dt>
          <dd className="text-tx3">
            Onde o período acontece por padrão. Este curso ocupa{" "}
            <strong>
              {turnosDoCurso
                .map((t) => TURNOS.find((x) => x.valor === t)?.rotulo ?? t)
                .join(" e ")}
            </strong>
            ; para liberar outro turno, mude em <strong>Gerenciar cursos</strong>.
          </dd>
          <dt className="font-semibold whitespace-nowrap text-tx2">Máx. de obrigatórias no contraturno</dt>
          <dd className="text-tx3">
            Quantas disciplinas obrigatórias podem escapar do turno do período. Optativas não contam: o gerador as põe
            no contraturno quando convém, mantendo ao menos uma no turno.
          </dd>
          <dt className="font-semibold whitespace-nowrap text-tx2">Disciplinas</dt>
          <dd className="text-tx3">Quantas disciplinas estão cadastradas neste período.</dd>
          <dt className="font-semibold whitespace-nowrap text-tx2">Aulas na grade</dt>
          <dd className="text-tx3">Quantas aulas do período já foram alocadas na grade horária.</dd>
        </dl>

        {/* Antes da carga `proximo` seria 1 e o botão inseriria um período que já existe. */}
        {!carregando && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void tentar(
                  () =>
                    executar("INSERT INTO periodos (curso_id, numero, turno) VALUES (?, ?, ?)", [
                      cursoId,
                      proximo,
                      ultimo?.turno ?? turnosDoCurso[0] ?? "manha",
                    ]),
                  "O período",
                )
              }
            >
              Adicionar {proximo}º período
            </Button>
            {ultimo && (
              <Button
                variant="outline"
                className="text-destructive"
                disabled={ultimoTemDisciplinas}
                aria-describedby={ultimoTemDisciplinas ? "motivo-remover-ultimo" : undefined}
                onClick={() =>
                  void tentar(
                    () => executar("DELETE FROM periodos WHERE curso_id = ? AND numero = ?", [cursoId, ultimo.numero]),
                    "O período",
                  )
                }
              >
                Remover o último
              </Button>
            )}
            {/* O botão desabilitado não recebe foco nem pouso: o motivo fica à
                vista, ao lado, em vez de numa dica que ninguém alcança. */}
            {ultimoTemDisciplinas && (
              <span id="motivo-remover-ultimo" className="text-xs text-tx3">
                O último período ainda tem disciplinas.
              </span>
            )}
          </div>
        )}
      </Secao>
    </>
  );
}
