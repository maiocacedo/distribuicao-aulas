import { TIPOS_SALA, type Sala } from "../tipos";
import { Campo } from "./ui";

/**
 * O requisito de sala de uma disciplina, como uma escolha de quatro modos
 * mutuamente exclusivos. Guardar os três campos separados no banco é o certo
 * — cada um responde uma pergunta diferente — mas oferecê-los soltos na tela
 * deixaria combinações sem sentido ao alcance do clique.
 */
export type Modo = "nenhuma" | "qualquer" | "tipo" | "especificas";

export interface ValorSala {
  exige_sala: number;
  tipo_sala: string | null;
  salas?: number[];
}

/**
 * Deduz o modo a partir do que está gravado. Serve para ABRIR o formulário —
 * daí em diante o modo é estado explícito de quem chama.
 *
 * Ele não pode ser derivado continuamente: "salas específicas" com a lista
 * ainda vazia é indistinguível de "qualquer sala", e o modo se desfaria no
 * instante em que fosse escolhido, antes de dar tempo de marcar a primeira.
 */
export function modoDe(v: ValorSala): Modo {
  if (!v.exige_sala) return "nenhuma";
  if (v.salas && v.salas.length > 0) return "especificas";
  if (v.tipo_sala) return "tipo";
  return "qualquer";
}

const DESCRICAO: Record<Modo, string> = {
  nenhuma: "Não recebe sala e não disputa sala com ninguém.",
  qualquer: "Qualquer sala livre no horário serve.",
  tipo: "Qualquer sala do tipo escolhido, inclusive as que forem cadastradas depois.",
  especificas:
    "Apenas as salas marcadas. Salas cadastradas depois não entram sozinhas.",
};

export function RequisitoSala({
  valor,
  modo,
  salas,
  permitirEspecificas,
  aoMudar,
}: {
  valor: ValorSala;
  modo: Modo;
  salas: Sala[];
  permitirEspecificas: boolean;
  /**
   * Valor e modo mudam SEMPRE juntos, numa chamada só. Separá-los em dois
   * callbacks fazia duas atualizações de estado partirem do mesmo valor
   * antigo, e a segunda apagava a primeira: o modo escolhido voltava sozinho.
   */
  aoMudar: (v: ValorSala, modo: Modo) => void;
}) {
  function trocarModo(novo: Modo) {
    if (novo === "nenhuma") {
      aoMudar({ ...valor, exige_sala: 0, tipo_sala: null, salas: [] }, novo);
    } else if (novo === "qualquer") {
      aoMudar({ ...valor, exige_sala: 1, tipo_sala: null, salas: [] }, novo);
    } else if (novo === "tipo") {
      aoMudar(
        {
          ...valor,
          exige_sala: 1,
          tipo_sala: valor.tipo_sala ?? TIPOS_SALA[0],
          salas: [],
        },
        novo,
      );
    } else {
      aoMudar(
        { ...valor, exige_sala: 1, tipo_sala: null, salas: valor.salas ?? [] },
        novo,
      );
    }
  }

  const marcadas = valor.salas ?? [];

  // Se a seleção manual coincide exatamente com todas as salas de um tipo, o
  // usuário quase certamente queria o requisito por tipo — que também vale
  // para as salas cadastradas depois. Vale avisar em vez de deixar passar.
  const equivaleATipo = TIPOS_SALA.find((t) => {
    const doTipo = salas.filter((s) => s.tipo === t).map((s) => s.id);
    return (
      doTipo.length > 0 &&
      doTipo.length === marcadas.length &&
      doTipo.every((id) => marcadas.includes(id))
    );
  });

  return (
    <fieldset>
      <legend>Sala</legend>

      <Campo rotulo="Requisito" dica={DESCRICAO[modo]}>
        <select value={modo} onChange={(e) => trocarModo(e.target.value as Modo)}>
          <option value="nenhuma">Não ocupa sala</option>
          <option value="qualquer">Qualquer sala</option>
          <option value="tipo">Qualquer sala de um tipo</option>
          {permitirEspecificas && <option value="especificas">Salas específicas</option>}
        </select>
      </Campo>

      {modo === "tipo" && (
        <Campo rotulo="Tipo exigido">
          <select
            value={valor.tipo_sala ?? ""}
            onChange={(e) => aoMudar({ ...valor, tipo_sala: e.target.value }, modo)}
          >
            {TIPOS_SALA.map((t) => (
              <option key={t} value={t}>
                {t}
                {" — "}
                {salas.filter((s) => s.tipo === t).length} sala(s) hoje
              </option>
            ))}
          </select>
        </Campo>
      )}

      {modo === "especificas" && (
        <>
          <div className="grade-salas">
            {salas.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={marcadas.includes(s.id)}
                  onChange={() =>
                    aoMudar(
                      {
                        ...valor,
                        salas: marcadas.includes(s.id)
                          ? marcadas.filter((x) => x !== s.id)
                          : [...marcadas, s.id],
                      },
                      modo,
                    )
                  }
                />
                <span>
                  {s.nome}
                  <em>
                    {s.tipo} · {s.capacidade}
                  </em>
                </span>
              </label>
            ))}
          </div>

          {marcadas.length === 0 && (
            <p className="aviso">
              Nenhuma sala marcada. Assim, na prática, qualquer sala serve —
              marque as que valem.
            </p>
          )}

          {equivaleATipo && (
            <p className="aviso">
              Você marcou exatamente todas as salas do tipo{" "}
              <strong>{equivaleATipo}</strong>. Se a intenção é "qualquer sala
              deste tipo", troque o requisito acima: assim as salas cadastradas
              no futuro passam a valer sozinhas.{" "}
              <button
                type="button"
                className="ligacao"
                onClick={() =>
                  aoMudar(
                    { ...valor, exige_sala: 1, tipo_sala: equivaleATipo, salas: [] },
                    "tipo",
                  )
                }
              >
                Trocar
              </button>
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}
