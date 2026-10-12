import { TIPOS_SALA, type Sala } from "../tipos";
import { Alerta } from "@/componentes/alerta";
import { Campo } from "@/componentes/campo";
import { Marcador } from "@/componentes/marcador";
import { Seletor, type Opcao } from "@/componentes/seletor";
import { Button } from "@/componentes/ui/button";

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
  /** Das `salas`, as que são só "aceitáveis" (preferência 2); as demais são ideais. */
  aceitaveis?: number[];
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

const MODOS: Opcao<Modo>[] = [
  { valor: "nenhuma", rotulo: "Não ocupa sala" },
  { valor: "qualquer", rotulo: "Qualquer sala" },
  { valor: "tipo", rotulo: "Qualquer sala de um tipo" },
  { valor: "especificas", rotulo: "Salas específicas" },
];

/** Preferência gravada em `disciplina_salas`: 1 = ideal, 2 = aceitável. */
const PREFERENCIAS: Opcao<number>[] = [
  { valor: 1, rotulo: "ideal" },
  { valor: 2, rotulo: "aceitável" },
];

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
      aoMudar({ ...valor, exige_sala: 0, tipo_sala: null, salas: [], aceitaveis: [] }, novo);
    } else if (novo === "qualquer") {
      aoMudar({ ...valor, exige_sala: 1, tipo_sala: null, salas: [], aceitaveis: [] }, novo);
    } else if (novo === "tipo") {
      aoMudar(
        {
          ...valor,
          exige_sala: 1,
          tipo_sala: valor.tipo_sala ?? TIPOS_SALA[0],
          salas: [],
          aceitaveis: [],
        },
        novo,
      );
    } else {
      aoMudar(
        {
          ...valor,
          exige_sala: 1,
          tipo_sala: null,
          salas: valor.salas ?? [],
          aceitaveis: valor.aceitaveis ?? [],
        },
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

  const aceitaveis = valor.aceitaveis ?? [];

  return (
    // O fio é sombra interna, como nos painéis: não conta na largura.
    <fieldset className="min-w-0 rounded-lg px-3.5 pt-3 pb-3.5 shadow-[inset_0_0_0_1px_var(--line)]">
      <legend className="px-1.5 text-xs font-semibold text-tx2">Sala</legend>

      <div className="flex flex-col gap-4">
        <Campo rotulo="Requisito" dica={DESCRICAO[modo]}>
          {(a) => (
            <Seletor
              {...a}
              className="w-full"
              valor={modo}
              opcoes={permitirEspecificas ? MODOS : MODOS.filter((m) => m.valor !== "especificas")}
              aoMudar={trocarModo}
            />
          )}
        </Campo>

        {modo === "tipo" && (
          <Campo rotulo="Tipo exigido">
            {(a) => (
              <Seletor
                {...a}
                className="w-full"
                valor={valor.tipo_sala}
                opcoes={TIPOS_SALA.map((t): Opcao<string | null> => ({
                  valor: t,
                  rotulo: `${t} — ${salas.filter((s) => s.tipo === t).length} sala(s) hoje`,
                }))}
                aoMudar={(tipo_sala) => aoMudar({ ...valor, tipo_sala }, modo)}
              />
            )}
          </Campo>
        )}

        {modo === "especificas" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {salas.map((s) => {
                const marcada = marcadas.includes(s.id);
                return (
                  // A preferência fica ao lado da sala marcada, sem empurrar a grade.
                  <div key={s.id} className="flex items-start justify-between gap-2">
                    <Marcador
                      rotulo={s.nome}
                      descricao={`${s.tipo} · ${s.capacidade}`}
                      marcado={marcada}
                      aoMudar={() =>
                        aoMudar(
                          {
                            ...valor,
                            salas: marcada ? marcadas.filter((x) => x !== s.id) : [...marcadas, s.id],
                            aceitaveis: aceitaveis.filter((x) => x !== s.id),
                          },
                          modo,
                        )
                      }
                    />
                    {marcada && (
                      <Seletor
                        rotulo={`Preferência por ${s.nome}`}
                        className="w-[104px] shrink-0"
                        valor={aceitaveis.includes(s.id) ? 2 : 1}
                        opcoes={PREFERENCIAS}
                        aoMudar={(preferencia) =>
                          aoMudar(
                            {
                              ...valor,
                              aceitaveis:
                                preferencia === 2 ? [...aceitaveis, s.id] : aceitaveis.filter((x) => x !== s.id),
                            },
                            modo,
                          )
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {marcadas.length === 0 && (
              <Alerta tom="aviso" className="mb-0">
                Nenhuma sala marcada. Assim, na prática, qualquer sala serve — marque as que valem.
              </Alerta>
            )}

            <p className="max-w-[68ch] text-xs leading-normal text-tx2">
              O gerador e a grade manual tentam primeiro as salas ideais; as aceitáveis entram quando nenhuma ideal
              está livre.
            </p>

            {equivaleATipo && (
              <Alerta tom="aviso" className="mb-0">
                Você marcou exatamente todas as salas do tipo <strong>{equivaleATipo}</strong>. Se a intenção é
                "qualquer sala deste tipo", troque o requisito acima: assim as salas cadastradas no futuro passam a
                valer sozinhas.{" "}
                <Button
                  // Sem isto o clique enviaria o formulário em que o requisito está.
                  type="button"
                  variant="link"
                  className="h-auto border-0 px-0 align-baseline text-base underline"
                  onClick={() =>
                    aoMudar({ ...valor, exige_sala: 1, tipo_sala: equivaleATipo, salas: [], aceitaveis: [] }, "tipo")
                  }
                >
                  Trocar
                </Button>
              </Alerta>
            )}
          </>
        )}
      </div>
    </fieldset>
  );
}
