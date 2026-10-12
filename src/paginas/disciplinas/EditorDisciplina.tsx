import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { TURNOS, type Periodo, type Professor, type Sala, type TipoDisciplina, type Turno } from "../../tipos";
import { RequisitoSala, modoDe } from "../../componentes/RequisitoSala";
import { PropriedadesDisciplina } from "../Tipos";
import { Alerta } from "@/componentes/alerta";
import { BotaoIcone } from "@/componentes/botao-icone";
import { Campo } from "@/componentes/campo";
import { DialogoFormulario } from "@/componentes/dialogo-formulario";
import { Marcador } from "@/componentes/marcador";
import { Seletor, type Opcao } from "@/componentes/seletor";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { Textarea } from "@/componentes/ui/textarea";
import { cn } from "@/lib/utils";
import type { ErrosDoRascunho, Fatia, Rascunho } from "./salvar";

export function EditorDisciplina({
  valor,
  periodos,
  professores,
  salas,
  tipos,
  aulasComPadrao,
  horasPorAula,
  turnosDoCurso,
  alterado,
  salvando,
  erro,
  erros,
  aoMudar,
  aoCorrigir,
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
  alterado: boolean;
  salvando: boolean;
  /** Recusa de regra ou falha ao gravar: o alerta do formulário. */
  erro: ReactNode;
  /** Validação por campo; a mensagem fica junto do campo. */
  erros: ErrosDoRascunho;
  aoMudar: (v: Rascunho) => void;
  /** O usuário mexeu nestes campos: a mensagem deles sai. */
  aoCorrigir: (...campos: (keyof ErrosDoRascunho)[]) => void;
  aoSalvar: (v: Rascunho) => void;
  aoFechar: () => void;
}) {
  const idDasFatias = useId();
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

  // A recusa das fatias fala da conta entre elas e o total da disciplina:
  // mexer em qualquer um dos dois lados tira a mensagem.
  const mudarAulas = (aulas_semanais: number) => {
    aoMudar({ ...valor, aulas_semanais });
    aoCorrigir("aulas", "fatias");
  };
  const mudarFatias = (fatias: Fatia[]) => {
    aoMudar({ ...valor, fatias });
    aoCorrigir("fatias");
  };
  const mudarFatia = (i: number, f: Fatia) => mudarFatias(valor.fatias.map((o, j) => (j === i ? f : o)));

  /** Atributos do campo da fatia que a recusa acusa: o diálogo leva o foco ao primeiro. */
  const acusado = (controle: "professor" | "aulas", i: number) =>
    erros.fatias?.controle === controle && erros.fatias.posicoes.includes(i)
      ? ({ "aria-invalid": true, "aria-describedby": `${idDasFatias}-erro` } as const)
      : {};
  /** O botão não é campo: leva o marcador do diálogo em vez de `aria-invalid`, que lhe daria a borda de erro. */
  const acusadoAdicionar =
    erros.fatias?.controle === "adicionar"
      ? ({ "data-acusado": true, "aria-describedby": `${idDasFatias}-erro` } as const)
      : {};

  const disponiveis = professores.filter(
    (p) => !valor.fatias.some((f) => f.professor_id === p.id),
  );

  const opcoesDeProfessor = (f: Fatia): Opcao<number>[] => [
    { valor: 0, rotulo: "escolha…" },
    ...professores.map((p) => {
      // Um professor tem uma fatia só por disciplina; a opção diz o motivo.
      const jaTem = p.id !== f.professor_id && valor.fatias.some((o) => o.professor_id === p.id);
      return { valor: p.id, rotulo: jaTem ? `${p.nome} — já tem fatia` : p.nome, desabilitada: jaTem };
    }),
  ];

  return (
    <DialogoFormulario
      titulo={valor.id ? "Editar disciplina" : "Nova disciplina"}
      largo
      alterado={alterado}
      salvando={salvando}
      erro={erro}
      aoFechar={aoFechar}
      aoSalvar={() => aoSalvar(valor)}
    >
      <div className="flex items-start gap-3">
        <Campo rotulo="Nome" erro={erros.nome} className="flex-1">
          {(a) => (
            <Input
              {...a}
              autoFocus
              value={valor.nome}
              onChange={(e) => {
                aoMudar({ ...valor, nome: e.target.value });
                aoCorrigir("nome");
              }}
            />
          )}
        </Campo>
        <Campo
          rotulo="Abreviação"
          dica="Como aparece na célula da grade. Vazio usa o nome completo."
          className="flex-1"
        >
          {(a) => (
            <Input
              {...a}
              className="w-32"
              placeholder={valor.nome.slice(0, 18)}
              value={valor.abreviacao ?? ""}
              onChange={(e) => aoMudar({ ...valor, abreviacao: e.target.value || null })}
            />
          )}
        </Campo>
      </div>

      <div className="flex items-start gap-3">
        <Campo rotulo="Período" className="flex-1">
          {(a) => (
            <Seletor
              {...a}
              className="w-full"
              valor={valor.periodo}
              opcoes={periodos.map((p) => ({ valor: p.numero, rotulo: `${p.numero}º (${p.turno})` }))}
              aoMudar={(periodo) => aoMudar({ ...valor, periodo })}
            />
          )}
        </Campo>
        <Campo rotulo="Aulas por semana" erro={erros.aulas} className="flex-1">
          {(a) => (
            <Input
              {...a}
              type="number"
              min={1}
              max={40}
              value={valor.aulas_semanais}
              onChange={(e) => mudarAulas(Number(e.target.value))}
            />
          )}
        </Campo>
        <Campo
          rotulo="Carga do currículo"
          dica={`${horasPorAula}h equivalem a 1 aula por semana`}
          className="flex-1"
        >
          {(a) => (
            <Input
              {...a}
              type="number"
              min={0}
              step={horasPorAula}
              value={valor.aulas_semanais * horasPorAula}
              onChange={(e) => mudarAulas(Math.max(1, Math.round(Number(e.target.value) / horasPorAula)))}
            />
          )}
        </Campo>
      </div>

      {semPadrao.length > 0 && (
        <Alerta tom="aviso" className="mb-0">
          Não há padrões de bloco cadastrados para fatia(s) de {semPadrao.join(", ")} aula(s). O gerador planeja cada
          professor separadamente e não saberá dividir essa carga — cadastre os padrões na página Regras, ou marque a
          disciplina como "blocos livres".
        </Alerta>
      )}

      {tipos.length > 0 && (
        <Campo
          rotulo="Tipo"
          dica="Preenche as propriedades abaixo de uma vez. Depois você pode ajustar cada uma."
        >
          {(a) => (
            <Seletor
              {...a}
              className="w-full"
              valor={valor.tipo_id}
              opcoes={[
                { valor: null, rotulo: "Sem tipo" },
                ...tipos.map((t): Opcao<number | null> => ({ valor: t.id, rotulo: t.nome })),
              ]}
              aoMudar={aplicarTipo}
            />
          )}
        </Campo>
      )}

      {/* O fio é sombra interna, como nos painéis: não conta na largura. */}
      <fieldset className="min-w-0 rounded-lg px-3.5 pt-3 pb-3.5 shadow-[inset_0_0_0_1px_var(--line)]">
        <legend className="flex items-baseline gap-2 px-1.5 text-xs font-semibold text-tx2">
          Professores
          {/* Os dois números dizem se fecha; a cor só acompanha. */}
          <span
            className={cn(
              "rounded-[3px] bg-poco px-[5px] font-mono tabular-nums",
              fecha ? "text-primary" : "text-destructive",
            )}
          >
            {soma} de {valor.aulas_semanais} aulas
          </span>
        </legend>
        <p className="mb-3 max-w-[68ch] text-xs leading-normal text-tx2">
          A carga pode ser repartida entre vários professores. Cada fatia é planejada em blocos próprios, como se fosse
          uma disciplina.
        </p>
        <div className="flex flex-col items-start gap-1.5">
          {valor.fatias.map((f, i) => (
            <div key={i} className="flex w-full gap-1.5">
              <Seletor
                rotulo={`Professor da fatia ${i + 1}`}
                className="min-w-0 flex-1"
                valor={f.professor_id}
                opcoes={opcoesDeProfessor(f)}
                aoMudar={(professor_id) => mudarFatia(i, { ...f, professor_id })}
                {...acusado("professor", i)}
              />
              <Input
                type="number"
                className="w-[58px] text-right"
                aria-label={`Aulas da fatia ${i + 1}`}
                min={1}
                value={f.aulas}
                onChange={(e) => mudarFatia(i, { ...f, aulas: Number(e.target.value) })}
                {...acusado("aulas", i)}
              />
              <BotaoIcone
                rotulo={`Remover a fatia ${i + 1}`}
                icone={X}
                perigo
                // Com contorno e da altura dos vizinhos: é um controle da linha, não uma ação solta.
                className="size-7 border-input bg-panel"
                aoClicar={() => mudarFatias(valor.fatias.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          {disponiveis.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                mudarFatias([
                  ...valor.fatias,
                  { professor_id: disponiveis[0].id, aulas: Math.max(1, valor.aulas_semanais - soma) },
                ])
              }
              {...acusadoAdicionar}
            >
              Adicionar professor
            </Button>
          )}
        </div>
        {/* `role="alert"`: anunciada ao aparecer e, sem botão ou campo a focar
            (nenhum professor para adicionar), é o que o diálogo traz para a vista. */}
        {erros.fatias && (
          <span
            id={`${idDasFatias}-erro`}
            role="alert"
            className="mt-1.5 block text-xs leading-4 text-destructive"
          >
            {erros.fatias.mensagem}
          </span>
        )}
      </fieldset>

      <Marcador
        rotulo="Ofertada neste semestre"
        descricao="desmarcada, sai da grade, das pendências e do gerador, mas continua cadastrada"
        marcado={!!valor.ofertada}
        aoMudar={() => aoMudar({ ...valor, ofertada: valor.ofertada ? 0 : 1 })}
      />

      <PropriedadesDisciplina valor={valor} aoMudar={(v) => aoMudar({ ...valor, ...v })} />

      <Campo
        rotulo="Turno"
        dica={`Por padrão segue o período (${turnoPeriodo ?? "—"}). Forçar um turno é regra: o gerador e a grade manual não põem a disciplina fora dele.`}
      >
        {(a) => (
          <Seletor
            {...a}
            className="w-full"
            valor={valor.turno}
            opcoes={[
              { valor: null, rotulo: "Segue o período" },
              ...TURNOS.filter((t) => turnosDoCurso.includes(t.valor) || t.valor === valor.turno).map(
                (t): Opcao<Turno | null> => ({ valor: t.valor, rotulo: t.rotulo }),
              ),
            ]}
            aoMudar={(turno) => aoMudar({ ...valor, turno })}
          />
        )}
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
        {(a) => (
          <Textarea
            {...a}
            rows={2}
            value={valor.observacao ?? ""}
            onChange={(e) => aoMudar({ ...valor, observacao: e.target.value || null })}
          />
        )}
      </Campo>
    </DialogoFormulario>
  );
}
