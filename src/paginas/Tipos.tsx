import { useEffect, useState } from "react";
import { RequisitoSala, modoDe, type Modo } from "../componentes/RequisitoSala";
import { consultar, executar } from "../db";
import type { Sala, TipoDisciplina } from "../tipos";
import {
  BotaoIcone,
  CabecalhoLista,
  Campo,
  Erro,
  Lapis,
  Lixeira,
  Modal,
  Vazio,
  mensagemErro,
} from "../componentes/legado";
import { useConfirmar } from "../componentes/confirmacao";

interface Linha extends TipoDisciplina {
  n_disciplinas: number;
}

const vazio = (): TipoDisciplina => ({
  id: 0,
  nome: "",
  exige_sala: 1,
  tipo_sala: null,
  blocos_livres: 0,
  prioridade: 2,
  permite_sabado: 0,
  optativa: 0,
});

export default function Tipos() {
  const confirmar = useConfirmar();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<TipoDisciplina | null>(null);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [modoSala, setModoSala] = useState<Modo>("qualquer");
  const [erro, setErro] = useState("");

  async function carregar() {
    setSalas(
      await consultar<Sala>("SELECT * FROM salas ORDER BY nome COLLATE NOCASE"),
    );
    setLinhas(
      await consultar<Linha>(`
        SELECT t.*, (SELECT COUNT(*) FROM disciplinas d WHERE d.tipo_id = t.id)
                      AS n_disciplinas
        FROM tipos_disciplina t ORDER BY t.nome COLLATE NOCASE`),
    );
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, []);

  async function salvar(t: TipoDisciplina) {
    setErro("");
    const nome = t.nome.trim();
    if (!nome) return setErro("O nome é obrigatório.");
    const campos = [
      nome,
      t.exige_sala,
      t.tipo_sala,
      t.blocos_livres,
      t.prioridade,
      t.permite_sabado,
      t.optativa,
    ];
    try {
      if (t.id) {
        await executar(
          `UPDATE tipos_disciplina SET nome = ?, exige_sala = ?, tipo_sala = ?,
                  blocos_livres = ?, prioridade = ?, permite_sabado = ?, optativa = ?
             WHERE id = ?`,
          [...campos, t.id],
        );
      } else {
        await executar(
          `INSERT INTO tipos_disciplina
             (nome, exige_sala, tipo_sala, blocos_livres, prioridade,
              permite_sabado, optativa)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          campos,
        );
      }
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "O tipo"));
    }
  }

  async function remover(l: Linha) {
    if (!(await confirmar({ titulo: `Remover o tipo "${l.nome}"?`, confirmar: "Remover tipo", perigo: true }))) return;
    setErro("");
    try {
      // A FK é ON DELETE SET NULL: as disciplinas ficam sem tipo, mas
      // conservam as propriedades que já tinham. O tipo é molde, não dono.
      await executar("DELETE FROM tipos_disciplina WHERE id = ?", [l.id]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "O tipo"));
    }
  }

  const marcas = (t: TipoDisciplina) =>
    [
      t.optativa ? "optativa" : null,
      !t.exige_sala ? "sem sala" : null,
      t.tipo_sala ? `só ${t.tipo_sala}` : null,
      t.blocos_livres ? "blocos livres" : null,
      t.permite_sabado ? "sábado" : null,
      t.prioridade === 1 ? "prioridade alta" : t.prioridade === 3 ? "prioridade baixa" : null,
    ].filter(Boolean) as string[];

  return (
    <>
      <CabecalhoLista
        titulo="Tipos de disciplina"
        escopo="Instituição · moldes de cadastro"
        contagem={`${linhas.length} tipo(s)`}
      >
        <button
          className="primario"
          onClick={() => {
            setModoSala("qualquer");
            setEdicao(vazio());
          }}
        >
          Novo tipo
        </button>
      </CabecalhoLista>

      <Erro>{erro}</Erro>

      <p className="explica">
        Cadastre tipos de disciplinas com características específicas.
      </p>

      {linhas.length === 0 ? (
        <Vazio>
          Nenhum tipo cadastrado. Eles são opcionais — servem para não marcar os
          mesmos campos repetidamente.
        </Vazio>
      ) : (
        <table className="lista">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Propriedades</th>
              <th className="num">Disciplinas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="forte">{l.nome}</td>
                <td>
                  {marcas(l).length === 0 ? (
                    <span className="fraco">padrão</span>
                  ) : (
                    marcas(l).map((m) => (
                      <span key={m} className="marca-prop">
                        {m}
                      </span>
                    ))
                  )}
                </td>
                <td className="num">{l.n_disciplinas || "—"}</td>
                <td className="acoes">
                  <BotaoIcone
                    rotulo="Editar"
                    aoClicar={() => {
                      setModoSala(modoDe(l));
                      setEdicao(l);
                    }}
                  >
                    <Lapis />
                  </BotaoIcone>
                  <BotaoIcone rotulo="Remover" perigo aoClicar={() => remover(l)}>
                    <Lixeira />
                  </BotaoIcone>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edicao && (
        <Modal
          titulo={edicao.id ? "Editar tipo" : "Novo tipo"}
          aoFechar={() => setEdicao(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              salvar(edicao);
            }}
          >
            <Campo rotulo="Nome">
              <input
                autoFocus
                value={edicao.nome}
                onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
              />
            </Campo>
            <RequisitoSala
              valor={edicao}
              modo={modoSala}
              salas={salas}
                  permitirEspecificas={false}
              aoMudar={(v, m) => {
                setEdicao({ ...edicao, ...v });
                setModoSala(m);
              }}
            />
            <PropriedadesDisciplina valor={edicao} aoMudar={setEdicao} />
            <div className="rodape-modal">
              <button type="button" onClick={() => setEdicao(null)}>
                Cancelar
              </button>
              <button type="submit" className="primario">
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Reaproveitado pelo cadastro de disciplinas — são os mesmos campos. */
export function PropriedadesDisciplina<
  T extends {
    blocos_livres: number;
    prioridade: number;
    permite_sabado: number;
    optativa: number;
  },
>({ valor, aoMudar }: { valor: T; aoMudar: (v: T) => void }) {
  const alterna = (campo: keyof T) =>
    aoMudar({ ...valor, [campo]: valor[campo] ? 0 : 1 });

  return (
    <>
      <Campo
        rotulo="Prioridade na distribuição"
        dica="Prioridade baixa é alocada por último, no que sobrar, e com as preferências atenuadas."
      >
        <select
          value={valor.prioridade}
          onChange={(e) => aoMudar({ ...valor, prioridade: Number(e.target.value) })}
        >
          <option value={1}>Alta — aloca primeiro</option>
          <option value={2}>Normal</option>
          <option value={3}>Baixa — encaixa nas folgas</option>
        </select>
      </Campo>

      <div className="marcadores">
        <label>
          <input
            type="checkbox"
            checked={!!valor.optativa}
            onChange={() => alterna("optativa")}
          />
          <span>
            Optativa
            <em>o gerador a põe no contraturno quando convém, mantendo ao menos uma optativa do período no turno</em>
          </span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!valor.permite_sabado}
            onChange={() => alterna("permite_sabado")}
          />
          <span>
            Pode ir ao sábado
            <em>sem isto, o sábado nem entra nas possibilidades</em>
          </span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!valor.blocos_livres}
            onChange={() => alterna("blocos_livres")}
          />
          <span>
            Blocos livres
            <em>qualquer divisão da carga vale; ignora os padrões de bloco</em>
          </span>
        </label>
      </div>
    </>
  );
}
