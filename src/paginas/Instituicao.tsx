import { useEffect, useState } from "react";
import { consultar, executar } from "../db";
import { TURNOS, type Horario, type PadraoBloco } from "../tipos";
import { Erro, mensagemErro } from "../componentes/ui";

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

/**
 * O que vale para todos os cursos: os dias letivos, os horários do dia e os
 * padrões de bloco. Professores e salas também são institucionais, mas têm
 * páginas próprias por serem cadastros grandes.
 */
export default function Instituicao() {
  const [dias, setDias] = useState(6);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [padroes, setPadroes] = useState<PadraoBloco[]>([]);
  const [novoPadrao, setNovoPadrao] = useState("");
  const [custoPadrao, setCustoPadrao] = useState(0);
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);

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
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, []);

  async function tentar(acao: () => Promise<unknown>, contexto: string) {
    setErro("");
    try {
      await acao();
      await carregar();
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1500);
    } catch (e) {
      setErro(mensagemErro(e, contexto));
    }
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

  function acrescentarPadrao() {
    const p = partes(novoPadrao);
    if (!p) {
      setErro('Escreva o padrão como "2+2" ou "3+1" — números somados.');
      return;
    }
    // Ordem decrescente é a forma canônica: '1+3' e '3+1' são o mesmo padrão.
    const canonico = [...p].sort((a, b) => b - a).join("+");
    const total = p.reduce((s, x) => s + x, 0);
    tentar(
      () =>
        executar(
          "INSERT INTO padroes_blocos (aulas, padrao, custo) VALUES (?, ?, ?)" +
            " ON CONFLICT(aulas, padrao) DO UPDATE SET custo = excluded.custo",
          [total, canonico, custoPadrao],
        ),
      "O padrão",
    ).then(() => setNovoPadrao(""));
  }

  return (
    <div className="coluna-estreita">
      <header className="cabecalho-pagina">
        <div>
          <h1>Regras</h1>
          <p className="sub">
            Como a grade é montada: dias letivos, horários do dia e padrões de
            bloco. Valem para todos os cursos.
          </p>
        </div>
        {salvo && <span className="salvo">salvo</span>}
      </header>

      <Erro>{erro}</Erro>

      <section>
        <h2>Dias letivos</h2>
        <div className="linha-campos">
          <label className="campo estreito">
            <span className="rotulo">Semana</span>
            <select
              value={dias}
              onChange={(e) => {
                setDias(Number(e.target.value));
                gravarConfig("dias_letivos", e.target.value);
              }}
            >
              {[5, 6].map((d) => (
                <option key={d} value={d}>
                  {d === 5 ? "Segunda a sexta" : "Segunda a sábado"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2>Horários do dia</h2>
        <div className="horarios-fixos">
          {TURNOS.filter((t) => horarios.some((h) => h.turno === t.valor)).map((t) => (
            <div key={t.valor} className="grupo">
              <span className="turno">{t.rotulo}</span>
              {horarios
                .filter((h) => h.turno === t.valor)
                .map((h) => (
                  <span key={h.indice} className="horario" title={`${h.duracao_min} min`}>
                    <strong>{h.codigo}</strong>
                    <em>{h.rotulo}</em>
                  </span>
                ))}
              <span className="duracao">
                {horarios.find((h) => h.turno === t.valor)?.duracao_min} min
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Padrões de bloco</h2>
        <p className="explica">
          Cada linha é um total de aulas semanais. Os botões ao lado são as
          formas permitidas de dividir esse total em blocos de aulas seguidas:{" "}
          <strong>2+2</strong> são dois dias com duas aulas emendadas,{" "}
          <strong>3+1</strong> é um dia com três e outro com uma.
        </p>
        <p className="explica">
          Para adicionar, escreva a divisão no campo abaixo, escolha a nota e
          confirme. A nota ordena as opções: <strong>0</strong> é o que o gerador
          usa primeiro, e quanto maior, mais ele evita. Clique num padrão
          existente para removê-lo.
        </p>
        <p className="explica">
          O gerador só usa o que está aqui. Um total sem nenhum padrão não tem
          como ser distribuído — a disciplina fica de fora da geração.
        </p>

        {padroes.length === 0 ? (
          <p className="vazio">Nenhum padrão cadastrado.</p>
        ) : (
          <div className="padroes">
            {[...new Set(padroes.map((p) => p.aulas))].map((n) => (
              <div key={n} className="grupo">
                <span className="ch">
                  {n} aula{n === 1 ? "" : "s"}
                </span>
                {padroes
                  .filter((p) => p.aulas === n)
                  .map((p) => (
                    <button
                      key={p.padrao}
                      className={`padrao ${
                        p.custo <= 1 ? "ideal" : p.custo >= 5 ? "evitar" : ""
                      }`}
                      title={`Nota ${p.custo} · ${NOTAS[p.custo] ?? ""} — clique para remover este padrão`}
                      onClick={() =>
                        confirm(`Remover o padrão ${p.padrao} de ${n} aula(s)?`) &&
                        tentar(
                          () =>
                            executar(
                              "DELETE FROM padroes_blocos WHERE aulas = ? AND padrao = ?",
                              [p.aulas, p.padrao],
                            ),
                          "O padrão",
                        )
                      }
                    >
                      <b>{p.padrao}</b>
                      <em title={NOTAS[p.custo] ?? ""}>{p.custo}</em>
                      <i aria-hidden="true">×</i>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}

        <div className="acoes-secao">
          <input
            className="curto-medio"
            placeholder="ex.: 2+2"
            value={novoPadrao}
            onChange={(e) => setNovoPadrao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                acrescentarPadrao();
              }
            }}
          />
          <select
            className="seletor-nota"
            value={custoPadrao}
            onChange={(e) => setCustoPadrao(Number(e.target.value))}
          >
            {NOTAS.map((n, i) => (
              <option key={i} value={i}>
                {i} · {n}
              </option>
            ))}
          </select>
          <button onClick={acrescentarPadrao} disabled={!novoPadrao.trim()}>
            Adicionar padrão
          </button>
          {partes(novoPadrao) && (
            <span className="fraco previa">
              {partes(novoPadrao)!.reduce((s, x) => s + x, 0)} aulas
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
