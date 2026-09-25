import { useEffect, useMemo, useState } from "react";
import { consultar, executar } from "../db";
import { TIPOS_SALA, type Sala } from "../tipos";
import {
  BotaoIcone,
  CabecalhoLista,
  Campo,
  Erro,
  Lapis,
  Lixeira,
  Modal,
  Ordenavel,
  Vazio,
  comparar,
  mensagemErro,
  type Ordem,
} from "../componentes/ui";

interface Linha extends Sala {
  n_disciplinas: number;
  n_aulas: number;
}

type Campo = "nome" | "tipo" | "capacidade" | "n_disciplinas" | "n_aulas";

const vazio = (): Sala => ({ id: 0, nome: "", tipo: "Sala de Aula", capacidade: 40 });

export default function Salas() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<Sala | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [ordem, setOrdem] = useState<Ordem<Campo>>({ campo: "nome", desc: false });
  const [busca, setBusca] = useState("");

  async function carregar() {
    setLinhas(
      await consultar<Linha>(`
        SELECT s.*,
               (SELECT COUNT(*) FROM disciplina_salas ds WHERE ds.sala_id = s.id)
                 AS n_disciplinas,
               (SELECT COUNT(*) FROM alocacoes a WHERE a.sala_id = s.id) AS n_aulas
        FROM salas s
        ORDER BY s.nome COLLATE NOCASE`),
    );
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => setErro(String(e)));
  }, []);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const recorte = termo
      ? linhas.filter((l) => l.nome.toLowerCase().includes(termo))
      : linhas;
    return comparar(recorte, ordem, (l) => l.nome);
  }, [linhas, ordem, busca]);

  async function salvar(s: Sala) {
    setErro("");
    const nome = s.nome.trim();
    const tipo = s.tipo.trim();
    if (!nome) return setErro("O nome é obrigatório.");
    if (!tipo) return setErro("O tipo é obrigatório.");
    if (!Number.isFinite(s.capacidade) || s.capacidade < 0) {
      return setErro("Capacidade inválida.");
    }
    try {
      if (s.id) {
        await executar(
          "UPDATE salas SET nome = ?, tipo = ?, capacidade = ? WHERE id = ?",
          [nome, tipo, s.capacidade, s.id],
        );
      } else {
        await executar(
          "INSERT INTO salas (nome, tipo, capacidade) VALUES (?, ?, ?)",
          [nome, tipo, s.capacidade],
        );
      }
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A sala"));
    }
  }

  async function remover(l: Linha) {
    if (l.n_aulas > 0 || l.n_disciplinas > 0) {
      setErro(
        `${l.nome} está em uso: ${l.n_aulas} aula(s) na grade e ` +
          `${l.n_disciplinas} disciplina(s) que a exigem.`,
      );
      return;
    }
    if (!confirm(`Remover a sala ${l.nome}?`)) return;
    setErro("");
    try {
      await executar("DELETE FROM salas WHERE id = ?", [l.id]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A sala"));
    }
  }

  return (
    <>
      <CabecalhoLista
        titulo="Salas"
        escopo="Instituição · comuns a todos os cursos"
        contagem={`${visiveis.length} de ${linhas.length}`}
        filtro={busca}
        aoFiltrar={setBusca}
      >
        <button className="primario" onClick={() => setEdicao(vazio())}>
          Nova sala
        </button>
      </CabecalhoLista>

      <Erro>{erro}</Erro>

      {carregando ? null : linhas.length === 0 ? (
        <Vazio>
          Nenhuma sala cadastrada. Disciplinas que não ocupam sala não precisam
          de nenhuma aqui.
        </Vazio>
      ) : (
        <table className="lista">
          <thead>
            <tr>
              <Ordenavel campo="nome" ordem={ordem} aoOrdenar={setOrdem}>
                Nome
              </Ordenavel>
              <Ordenavel campo="tipo" ordem={ordem} aoOrdenar={setOrdem}>
                Tipo
              </Ordenavel>
              <Ordenavel campo="capacidade" ordem={ordem} aoOrdenar={setOrdem} numerico>
                Capacidade
              </Ordenavel>
              <Ordenavel campo="n_disciplinas" ordem={ordem} aoOrdenar={setOrdem} numerico>
                Exigida por
              </Ordenavel>
              <Ordenavel campo="n_aulas" ordem={ordem} aoOrdenar={setOrdem} numerico>
                Aulas
              </Ordenavel>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td className="forte">{l.nome}</td>
                <td>{l.tipo}</td>
                <td className="num">{l.capacidade}</td>
                <td className="num">{l.n_disciplinas || "—"}</td>
                <td className="num">{l.n_aulas || "—"}</td>
                <td className="acoes">
                  <BotaoIcone rotulo="Editar" aoClicar={() => setEdicao(l)}>
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
          titulo={edicao.id ? "Editar sala" : "Nova sala"}
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

            <Campo
              rotulo="Tipo"
              dica="É por aqui que uma disciplina exige laboratório sem exigir uma sala específica."
            >
              <select
                value={edicao.tipo}
                onChange={(e) => setEdicao({ ...edicao, tipo: e.target.value })}
              >
                {/* Um valor antigo fora da lista continua visível, para
                    editar a sala não trocar o tipo dela sem querer. */}
                {[...new Set<string>([...TIPOS_SALA, edicao.tipo])]
                  .filter(Boolean)
                  .map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
              </select>
            </Campo>

            <Campo rotulo="Capacidade">
              <input
                type="number"
                min={0}
                value={edicao.capacidade}
                onChange={(e) =>
                  setEdicao({ ...edicao, capacidade: Number(e.target.value) })
                }
              />
            </Campo>

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
