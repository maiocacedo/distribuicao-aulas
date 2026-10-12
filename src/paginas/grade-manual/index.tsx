import { useEffect, useState } from "react";
import { transacao, type Instrucao } from "../../db";
import { Erro, Vazio, mensagemErro } from "../../componentes/legado";
import { useConfirmar } from "../../componentes/confirmacao";
import { descrever } from "../../regras/descrever";
import { escolherSala, impedimento, salasPossiveis } from "../../regras/impedimentos";
import { Diagnostico } from "./Diagnostico";
import { Malha } from "./Malha";
import { Pendencias } from "./Pendencias";
import { chave, idAula, idFatia, usarGrade, type Aula, type Fatia } from "./usarGrade";

export default function GradeManual({ cursoId }: { cursoId: number }) {
  const confirmar = useConfirmar();
  const {
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
  const [trocando, setTrocando] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, [carregar]);

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

  async function alocar(dia: number, hora: number) {
    if (!fatiaEscolhida || periodo == null || !ctx) return;
    const motivo = motivoDe(fatiaEscolhida, dia, hora);
    if (motivo) return setErro(motivo);
    setErro("");
    // A sala da aula vizinha da mesma fatia, para o bloco não trocar de sala.
    const vizinha = [hora - 1, hora + 1]
      .map((h) => daGrade.get(chave(dia, h)))
      .find((a) => a && idAula(a) === idFatia(fatiaEscolhida));
    const sala = escolherSala(ctx, oc, regrasDe(fatiaEscolhida), dia, hora, vizinha?.salaId ?? null) ?? null;
    try {
      await transacao([
        {
          sql: `INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [cursoId, periodo, dia, hora, fatiaEscolhida.disciplina_id, fatiaEscolhida.professor_id, sala],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
      await carregar();
    }
  }

  /**
   * Salas que servem à aula e estão livres naquele horário (a dela inclusive).
   * A sala atual entra sempre: se o cadastro mudou e ela saiu do requisito, o
   * seletor sem ela mostraria outra como se fosse a atual.
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
    return opcoes;
  }

  async function trocarSala(a: Aula, salaId: number | null) {
    setTrocando(null);
    if (salaId === a.salaId) return;
    setErro("");
    try {
      await transacao([
        {
          sql: "UPDATE alocacoes SET sala_id = ? WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
          params: [salaId, cursoId, a.periodo, a.dia, a.hora],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
      await carregar();
    }
  }

  /**
   * Fixar protege a aula do gerador — e também do clique que remove, senão
   * bastaria um clique errado para perder o que se quis preservar.
   */
  async function alternarFixada(dia: number, hora: number) {
    const aula = daGrade.get(chave(dia, hora));
    if (!aula || periodo == null) return;
    setErro("");
    try {
      await transacao([
        {
          sql: `UPDATE alocacoes SET fixada = ?
                 WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?`,
          params: [aula.fixada ? 0 : 1, cursoId, periodo, dia, hora],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
    }
  }

  async function remover(dia: number, hora: number) {
    if (periodo == null) return;
    const aula = daGrade.get(chave(dia, hora));
    if (aula?.fixada) {
      setErro("Esta aula está fixada. Clique com o botão direito para soltá-la.");
      return;
    }
    setErro("");
    try {
      await transacao([
        {
          sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
          params: [cursoId, periodo, dia, hora],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
    }
  }

  async function limparPeriodo() {
    if (periodo == null) return;
    const fixadas = [...daGrade.values()].filter((a) => a.fixada).length;
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
    const instrucoes: Instrucao[] = [
      { sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND fixada = 0", params: [cursoId, periodo] },
    ];
    try {
      await transacao(instrucoes);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A grade"));
    }
  }

  if (periodos.length === 0) {
    return (
      <>
        <header className="cabecalho-pagina">
          <h1>Grade horária</h1>
        </header>
        <Vazio>Cadastre os períodos do curso primeiro.</Vazio>
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

  return (
    <>
      <header className="cabecalho-pagina">
        <div>
          <h1>Grade horária</h1>
          <p className="sub">
            {faltando === 0
              ? "Todas as aulas deste período estão alocadas."
              : `${faltando} aula(s) deste período ainda por alocar.`}
          </p>
        </div>
        <div className="acoes-cabecalho">
          <button className="perigo" onClick={limparPeriodo} disabled={[...daGrade.values()].every((a) => a.fixada)}>
            Limpar período
          </button>
        </div>
      </header>

      <Erro>{erro}</Erro>

      {violacoes.length > 0 && <Diagnostico violacoes={violacoes} codigoDe={codigoDe} nomes={nomes} />}

      <div className="abas-periodo">
        {periodos.map((p) => (
          <button
            key={p.numero}
            className={p.numero === periodo ? "ativo" : ""}
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

      <div className="painel-duplo largo">
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
          trocando={trocando}
          setTrocando={setTrocando}
          salasParaTroca={salasParaTroca}
          trocarSala={trocarSala}
          remover={remover}
          alocar={alocar}
          alternarFixada={alternarFixada}
        />
      </div>
    </>
  );
}
