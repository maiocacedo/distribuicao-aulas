import { TURNOS, type Periodo, type Professor, type Sala, type TipoDisciplina, type Turno } from "../../tipos";
import { Campo, Modal } from "../../componentes/legado";
import { RequisitoSala, modoDe } from "../../componentes/RequisitoSala";
import { PropriedadesDisciplina } from "../Tipos";
import type { Rascunho } from "./salvar";

export function EditorDisciplina({
  valor,
  periodos,
  professores,
  salas,
  tipos,
  aulasComPadrao,
  horasPorAula,
  turnosDoCurso,
  aoMudar,
  aoSalvar,
  aoFechar,
}: {
  valor: Rascunho;
  periodos: Periodo[];
  professores: Professor[];
  salas: Sala[];
  tipos: TipoDisciplina[];
  aulasComPadrao: Set<number>;
  horasPorAula: number;
  turnosDoCurso: string[];
  aoMudar: (v: Rascunho) => void;
  aoSalvar: (v: Rascunho) => void;
  aoFechar: () => void;
}) {
  const soma = valor.fatias.reduce((s, f) => s + f.aulas, 0);
  const fecha = soma === valor.aulas_semanais;
  const turnoPeriodo = periodos.find((p) => p.numero === valor.periodo)?.turno;
  // O gerador planeja cada professor separadamente: o padrão que importa é o
  // da fatia, não o do total da disciplina (B9).
  const cargas = valor.fatias.length ? valor.fatias.map((f) => f.aulas) : [valor.aulas_semanais];
  const semPadrao = valor.blocos_livres ? [] : [...new Set(cargas)].filter((n) => !aulasComPadrao.has(n));

  const aplicarTipo = (id: number | null) => {
    const t = tipos.find((x) => x.id === id);
    if (!t) return aoMudar({ ...valor, tipo_id: null });
    // O molde traz o requisito de sala junto, então o modo tem de acompanhar.
    aoMudar({
      ...valor,
      tipo_id: t.id,
      exige_sala: t.exige_sala,
      tipo_sala: t.tipo_sala,
      salas: [],
      aceitaveis: [],
      modoSala: modoDe({ exige_sala: t.exige_sala, tipo_sala: t.tipo_sala, salas: [] }),
      blocos_livres: t.blocos_livres,
      prioridade: t.prioridade,
      permite_sabado: t.permite_sabado,
      optativa: t.optativa,
    });
  };

  const disponiveis = professores.filter(
    (p) => !valor.fatias.some((f) => f.professor_id === p.id),
  );

  return (
    <Modal
      titulo={valor.id ? "Editar disciplina" : "Nova disciplina"}
      aoFechar={aoFechar}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(valor);
        }}
      >
        <div className="linha-campos">
          <Campo rotulo="Nome">
            <input
              autoFocus
              value={valor.nome}
              onChange={(e) => aoMudar({ ...valor, nome: e.target.value })}
            />
          </Campo>
          <Campo
            rotulo="Abreviação"
            dica="Como aparece na célula da grade. Vazio usa o nome completo."
          >
            <input
              className="curto-medio"
              placeholder={valor.nome.slice(0, 18)}
              value={valor.abreviacao ?? ""}
              onChange={(e) =>
                aoMudar({ ...valor, abreviacao: e.target.value || null })
              }
            />
          </Campo>
        </div>

        <div className="linha-campos">
          <Campo rotulo="Período">
            <select
              value={valor.periodo}
              onChange={(e) => aoMudar({ ...valor, periodo: Number(e.target.value) })}
            >
              {periodos.map((p) => (
                <option key={p.numero} value={p.numero}>
                  {p.numero}º ({p.turno})
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Aulas por semana">
            <input
              type="number"
              min={1}
              max={40}
              value={valor.aulas_semanais}
              onChange={(e) =>
                aoMudar({ ...valor, aulas_semanais: Number(e.target.value) })
              }
            />
          </Campo>
          <Campo
            rotulo="Carga do currículo"
            dica={`${horasPorAula}h equivalem a 1 aula por semana`}
          >
            <input
              type="number"
              min={0}
              step={horasPorAula}
              value={valor.aulas_semanais * horasPorAula}
              onChange={(e) =>
                aoMudar({
                  ...valor,
                  aulas_semanais: Math.max(
                    1,
                    Math.round(Number(e.target.value) / horasPorAula),
                  ),
                })
              }
            />
          </Campo>
        </div>

        {semPadrao.length > 0 && (
          <p className="aviso">
            Não há padrões de bloco cadastrados para fatia(s) de {semPadrao.join(", ")} aula(s). O
            gerador planeja cada professor separadamente e não saberá dividir essa carga —
            cadastre os padrões na página Regras, ou marque a disciplina como "blocos livres".
          </p>
        )}

        {tipos.length > 0 && (
          <Campo
            rotulo="Tipo"
            dica="Preenche as propriedades abaixo de uma vez. Depois você pode ajustar cada uma."
          >
            <select
              value={valor.tipo_id ?? ""}
              onChange={(e) =>
                aplicarTipo(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Sem tipo</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <fieldset>
          <legend>
            Professores
            <span className={fecha ? "contador ok" : "contador falta"}>
              {soma} de {valor.aulas_semanais} aulas
            </span>
          </legend>
          <p className="explica">
            A carga pode ser repartida entre vários professores. Cada fatia é
            planejada em blocos próprios, como se fosse uma disciplina.
          </p>
          {valor.fatias.map((f, i) => (
            <div key={i} className="linha-fatia">
              <select
                aria-label={`Professor da fatia ${i + 1}`}
                value={f.professor_id}
                onChange={(e) => {
                  const fatias = [...valor.fatias];
                  fatias[i] = { ...f, professor_id: Number(e.target.value) };
                  aoMudar({ ...valor, fatias });
                }}
              >
                <option value={0}>escolha…</option>
                {professores.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={
                      p.id !== f.professor_id &&
                      valor.fatias.some((o) => o.professor_id === p.id)
                    }
                  >
                    {p.nome}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="curto"
                aria-label={`Aulas da fatia ${i + 1}`}
                min={1}
                value={f.aulas}
                onChange={(e) => {
                  const fatias = [...valor.fatias];
                  fatias[i] = { ...f, aulas: Number(e.target.value) };
                  aoMudar({ ...valor, fatias });
                }}
              />
              <button
                type="button"
                className="perigo"
                onClick={() =>
                  aoMudar({
                    ...valor,
                    fatias: valor.fatias.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          {disponiveis.length > 0 && (
            <button
              type="button"
              onClick={() =>
                aoMudar({
                  ...valor,
                  fatias: [
                    ...valor.fatias,
                    {
                      professor_id: disponiveis[0].id,
                      aulas: Math.max(1, valor.aulas_semanais - soma),
                    },
                  ],
                })
              }
            >
              Adicionar professor
            </button>
          )}
        </fieldset>

        <div className="marcadores">
          <label>
            <input
              type="checkbox"
              checked={!!valor.ofertada}
              onChange={() => aoMudar({ ...valor, ofertada: valor.ofertada ? 0 : 1 })}
            />
            <span>
              Ofertada neste semestre
              <em>desmarcada, sai da grade, das pendências e do gerador, mas continua cadastrada</em>
            </span>
          </label>
        </div>

        <PropriedadesDisciplina
          valor={valor}
          aoMudar={(v) => aoMudar({ ...valor, ...v })}
        />

        <Campo
          rotulo="Turno"
          dica={`Por padrão segue o período (${turnoPeriodo ?? "—"}). Forçar um turno é regra: o gerador e a grade manual não põem a disciplina fora dele.`}
        >
          <select
            value={valor.turno ?? ""}
            onChange={(e) =>
              aoMudar({ ...valor, turno: (e.target.value || null) as Turno | null })
            }
          >
            <option value="">Segue o período</option>
            {TURNOS.filter((t) => turnosDoCurso.includes(t.valor) || t.valor === valor.turno).map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </Campo>

        <RequisitoSala
          valor={valor}
          modo={valor.modoSala}
          salas={salas}
          permitirEspecificas
          aoMudar={(v, m) =>
            aoMudar({ ...valor, ...v, salas: v.salas ?? [], aceitaveis: v.aceitaveis ?? [], modoSala: m })
          }
        />

        <Campo rotulo="Observação">
          <textarea
            rows={2}
            value={valor.observacao ?? ""}
            onChange={(e) =>
              aoMudar({ ...valor, observacao: e.target.value || null })
            }
          />
        </Campo>

        <div className="rodape-modal">
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="primario" disabled={!fecha}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
