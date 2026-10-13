import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { RequisitoSala, modoDe, type Modo } from "../componentes/RequisitoSala";
import { consultar, executar } from "../db";
import type { Sala, TipoDisciplina } from "../tipos";
import { Alerta } from "@/componentes/alerta";
import { BotaoIcone } from "@/componentes/botao-icone";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { Campo } from "@/componentes/campo";
import { useConfirmar } from "@/componentes/confirmacao";
import { DialogoFormulario, useAlterado } from "@/componentes/dialogo-formulario";
import { EstadoVazio } from "@/componentes/estado-vazio";
import { Marcador } from "@/componentes/marcador";
import { Seletor, type Opcao } from "@/componentes/seletor";
import { TabelaDados, useTabela } from "@/componentes/tabela-dados";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { Input } from "@/componentes/ui/input";
import { mensagemErro } from "@/lib/erros";

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

/** Mensagem de validação por campo do formulário; fica junto do campo, não no alerta. */
type ErrosDeCampo = Partial<Record<"nome", string>>;

const SEM_ERROS: ErrosDeCampo = {};

/** Zero vira travessão: numa coluna de contagens, o que salta é quem tem algo. */
const contagem = (n: number) => n || "—";

/** O que o tipo tem de diferente do padrão, em palavras curtas; vazio = é o padrão. */
const marcas = (t: TipoDisciplina) =>
  [
    t.optativa ? "optativa" : null,
    !t.exige_sala ? "sem sala" : null,
    t.tipo_sala ? `só ${t.tipo_sala}` : null,
    t.blocos_livres ? "blocos livres" : null,
    t.permite_sabado ? "sábado" : null,
    t.prioridade === 1 ? "prioridade alta" : t.prioridade === 3 ? "prioridade baixa" : null,
  ].filter(Boolean) as string[];

export default function Tipos() {
  const confirmar = useConfirmar();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [edicao, setEdicao] = useState<TipoDisciplina | null>(null);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [modoSala, setModoSala] = useState<Modo>("qualquer");
  const [erro, setErro] = useState("");
  const [erroDoFormulario, setErroDoFormulario] = useState("");
  const [errosDeCampo, setErrosDeCampo] = useState<ErrosDeCampo>(SEM_ERROS);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const alterado = useAlterado(edicao);

  const carregar = useCallback(async () => {
    setSalas(await consultar<Sala>("SELECT * FROM salas ORDER BY nome COLLATE NOCASE"));
    setLinhas(
      await consultar<Linha>(`
        SELECT t.*, (SELECT COUNT(*) FROM disciplinas d WHERE d.tipo_id = t.id)
                      AS n_disciplinas
        FROM tipos_disciplina t ORDER BY t.nome COLLATE NOCASE`),
    );
    setCarregando(false);
    setErro("");
  }, []);

  // A falha de carga aparece na página, venha da abertura da tela ou da recarga
  // depois de gravar: nos dois casos o que está errado é a lista.
  const recarregar = useCallback(() => carregar().catch((e) => setErro(String(e))), [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // O modo do requisito de sala é estado à parte (ver `RequisitoSala`): ao abrir
  // ele sai do que está gravado, e daí em diante quem muda é o próprio formulário.
  const abrir = useCallback((t: TipoDisciplina) => {
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    setModoSala(modoDe(t));
    setEdicao(t);
  }, []);

  async function salvar(t: TipoDisciplina) {
    // Cada tentativa começa limpa: ver o mesmo trecho em `Salas`.
    setErroDoFormulario("");
    setErrosDeCampo(SEM_ERROS);
    const nome = t.nome.trim();
    if (!nome) return setErrosDeCampo({ nome: "O nome é obrigatório." });
    const campos = [nome, t.exige_sala, t.tipo_sala, t.blocos_livres, t.prioridade, t.permite_sabado, t.optativa];
    setSalvando(true);
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
    } catch (e) {
      return setErroDoFormulario(mensagemErro(e, "O tipo"));
    } finally {
      setSalvando(false);
    }
    // Só chega aqui o que foi gravado; a falha da recarga é da lista (ver `Salas`).
    setEdicao(null);
    await recarregar();
  }

  const remover = useCallback(
    async (l: Linha) => {
      if (
        !(await confirmar({
          titulo: `Remover o tipo "${l.nome}"?`,
          // O que a remoção faz com quem usa o tipo (ver o `DELETE` abaixo).
          descricao:
            l.n_disciplinas > 0
              ? `${l.n_disciplinas} disciplina(s) ficam sem tipo e conservam as propriedades que já têm.`
              : undefined,
          confirmar: "Remover tipo",
          perigo: true,
        }))
      )
        return;
      try {
        // A FK é ON DELETE SET NULL: as disciplinas ficam sem tipo, mas
        // conservam as propriedades que já tinham. O tipo é molde, não dono.
        await executar("DELETE FROM tipos_disciplina WHERE id = ?", [l.id]);
      } catch (e) {
        return avisar.erro(mensagemErro(e, "O tipo"));
      }
      await recarregar();
    },
    [confirmar, recarregar],
  );

  // As colunas não podem ser recriadas a cada desenho: ver `useTabela`.
  const colunas = useMemo<ColumnDef<Linha, any>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => <span className="font-semibold">{row.original.nome}</span>,
      },
      {
        id: "propriedades",
        header: "Propriedades",
        // Ordena pelo texto que a célula mostra: "padrão" para quem não tem marca.
        accessorFn: (l) => (marcas(l).length === 0 ? "padrão" : marcas(l).join(", ")),
        cell: ({ row }) =>
          marcas(row.original).length === 0 ? (
            <span className="text-tx3">padrão</span>
          ) : (
            marcas(row.original).map((m) => (
              <span key={m} className="mr-1 inline-block rounded-[3px] bg-poco px-1.5 py-px text-[10.5px] whitespace-nowrap text-tx2">
                {m}
              </span>
            ))
          ),
      },
      {
        accessorKey: "n_disciplinas",
        header: "Disciplinas",
        meta: { numerico: true },
        sortDescFirst: true,
        cell: ({ row }) => contagem(row.original.n_disciplinas),
      },
      {
        id: "acoes",
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => (
          <>
            <BotaoIcone rotulo="Editar" icone={Pencil} aoClicar={() => abrir(row.original)} />
            <BotaoIcone rotulo="Remover" icone={Trash2} perigo aoClicar={() => void remover(row.original)} />
          </>
        ),
      },
    ],
    [abrir, remover],
  );

  const tabela = useTabela({
    dados: linhas,
    colunas,
    ordemInicial: [{ id: "nome", desc: false }],
    desempate: (l) => l.nome,
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Tipos de disciplina"
        escopo="Instituição · moldes de cadastro"
        // Antes da carga seria "0 tipo(s)". Vazia, e não ausente: sem busca, é a
        // contagem que faz deste um cabeçalho de lista, e ausente ele mudaria de
        // desenho (e de altura) quando a lista chegasse.
        contagem={carregando ? "" : `${linhas.length} tipo(s)`}
      >
        <Button onClick={() => abrir(vazio())}>Novo tipo</Button>
      </CabecalhoPagina>

      <Alerta tom="erro">{erro}</Alerta>

      <p className="mb-3 max-w-[68ch] text-xs leading-normal text-tx2">
        Cadastre tipos de disciplinas com características específicas.
      </p>

      {carregando ? null : (
        <TabelaDados
          tabela={tabela}
          vazio={
            <EstadoVazio>
              Nenhum tipo cadastrado. Eles são opcionais — servem para não marcar os mesmos campos repetidamente.
            </EstadoVazio>
          }
        />
      )}

      {edicao && (
        <DialogoFormulario
          titulo={edicao.id ? "Editar tipo" : "Novo tipo"}
          alterado={alterado}
          salvando={salvando}
          erro={erroDoFormulario}
          aoFechar={() => setEdicao(null)}
          aoSalvar={() => void salvar(edicao)}
        >
          <Campo rotulo="Nome" erro={errosDeCampo.nome}>
            {(a) => (
              <Input
                {...a}
                autoFocus
                value={edicao.nome}
                onChange={(e) => {
                  setEdicao({ ...edicao, nome: e.target.value });
                  // Quem voltou a digitar no campo já leu a mensagem dele.
                  setErrosDeCampo((erros) => ({ ...erros, nome: undefined }));
                }}
              />
            )}
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
        </DialogoFormulario>
      )}
    </>
  );
}

const PRIORIDADES: Opcao<number>[] = [
  { valor: 1, rotulo: "Alta — aloca primeiro" },
  { valor: 2, rotulo: "Normal" },
  { valor: 3, rotulo: "Baixa — encaixa nas folgas" },
];

/**
 * Reaproveitado pelo cadastro de disciplinas — são os mesmos campos. Devolve
 * dois blocos soltos, sem margem: quem os desenha (o diálogo) dá o espaço.
 */
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
        {(a) => (
          <Seletor
            {...a}
            className="w-full"
            valor={valor.prioridade}
            opcoes={PRIORIDADES}
            aoMudar={(prioridade) => aoMudar({ ...valor, prioridade })}
          />
        )}
      </Campo>

      <div className="flex flex-col gap-2">
        <Marcador
          rotulo="Optativa"
          descricao="o gerador a põe no contraturno quando convém, mantendo ao menos uma optativa do período no turno"
          marcado={!!valor.optativa}
          aoMudar={() => alterna("optativa")}
        />
        <Marcador
          rotulo="Pode ir ao sábado"
          descricao="sem isto, o sábado nem entra nas possibilidades"
          marcado={!!valor.permite_sabado}
          aoMudar={() => alterna("permite_sabado")}
        />
        <Marcador
          rotulo="Blocos livres"
          descricao="qualquer divisão da carga vale; ignora os padrões de bloco"
          marcado={!!valor.blocos_livres}
          aoMudar={() => alterna("blocos_livres")}
        />
      </div>
    </>
  );
}
