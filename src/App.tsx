import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CalendarCog,
  CalendarRange,
  CalendarX,
  DoorOpen,
  GraduationCap,
  Layers,
  Sparkles,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Alerta } from "@/componentes/alerta";
import { Seletor } from "@/componentes/seletor";
import { Toaster } from "@/componentes/ui/sonner";
import { TooltipProvider } from "@/componentes/ui/tooltip";
import { cn } from "@/lib/utils";
import { bancoEmMemoria, consultar } from "./db";
import { historico } from "./grade";
import type { Curso } from "./tipos";
import Cursos from "./paginas/Cursos";
import Disciplinas from "./paginas/disciplinas";
import GradeAutomatica from "./paginas/GradeAutomatica";
import GradeManual from "./paginas/grade-manual";
import Indisponibilidades from "./paginas/Indisponibilidades";
import Instituicao from "./paginas/Instituicao";
import Periodos from "./paginas/Periodos";
import Professores from "./paginas/Professores";
import Salas from "./paginas/Salas";
import Tipos from "./paginas/Tipos";

type Props = { cursoId: number; aoMudarCursos: () => void; aoNavegar: (id: string) => void };

type Pagina = {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  componente: (p: Props) => React.ReactNode;
};

/**
 * As páginas do curso selecionado ficam no primeiro grupo; as institucionais,
 * no segundo. A separação é a mesma do banco: o que é do curso tem `curso_id`,
 * o que é da instituição é compartilhado por todos.
 */
const GRUPOS: { titulo: string; paginas: Pagina[] }[] = [
  {
    titulo: "curso",
    paginas: [
      {
        id: "periodos",
        rotulo: "Períodos",
        icone: Layers,
        componente: (p) => <Periodos cursoId={p.cursoId} />,
      },
      {
        id: "disciplinas",
        rotulo: "Disciplinas",
        icone: BookOpen,
        componente: (p) => <Disciplinas cursoId={p.cursoId} />,
      },
    ],
  },
  {
    titulo: "instituição",
    paginas: [
      {
        id: "professores",
        rotulo: "Professores",
        icone: Users,
        componente: () => <Professores />,
      },
      { id: "salas", rotulo: "Salas", icone: DoorOpen, componente: () => <Salas /> },
    ],
  },
  {
    titulo: "horários",
    paginas: [
      {
        id: "indisponibilidades",
        rotulo: "Indisponibilidades",
        icone: CalendarX,
        componente: () => <Indisponibilidades />,
      },
      {
        id: "tipos",
        rotulo: "Tipos de disciplina",
        icone: Tags,
        componente: () => <Tipos />,
      },
      {
        id: "regras",
        rotulo: "Regras",
        icone: CalendarCog,
        componente: () => <Instituicao />,
      },
    ],
  },
  {
    titulo: "grade de horários",
    paginas: [
      {
        id: "grade-manual",
        rotulo: "Manual",
        icone: CalendarRange,
        componente: (p) => <GradeManual cursoId={p.cursoId} />,
      },
      {
        id: "grade-automatica",
        rotulo: "Automática",
        icone: Sparkles,
        componente: (p) => <GradeAutomatica cursoId={p.cursoId} aoNavegar={p.aoNavegar} />,
      },
    ],
  },
];

const PAGINA_CURSOS: Pagina = {
  id: "cursos",
  rotulo: "Gerenciar cursos",
  icone: GraduationCap,
  componente: (p) => <Cursos aoMudarLista={p.aoMudarCursos} />,
};

const TODAS = [...GRUPOS.flatMap((g) => g.paginas), PAGINA_CURSOS];

function App() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  // Enquanto a lista não chega, a caixa do curso fica em branco: "nenhum curso"
  // só é verdade depois de ler o banco.
  const [cursosLidos, setCursosLidos] = useState(false);
  const [cursoId, setCursoId] = useState<number | null>(null);
  const [pagina, setPagina] = useState<string>("periodos");
  const [erro, setErro] = useState<string | null>(null);
  // Só o banco do navegador pode estar em memória (janela anônima, navegador
  // sem armazenamento de origem): aí o aviso fica à vista o tempo todo, porque
  // o que se fizer some ao fechar a página.
  const [emMemoria, setEmMemoria] = useState(false);

  const carregarCursos = useCallback(async () => {
    const lista = await consultar<Curso>(
      "SELECT * FROM cursos ORDER BY nome COLLATE NOCASE",
    );
    setCursos(lista);
    setCursosLidos(true);
    setCursoId((atual) =>
      atual != null && lista.some((c) => c.id === atual) ? atual : (lista[0]?.id ?? null),
    );
  }, []);

  useEffect(() => {
    carregarCursos().catch((e) => setErro(String(e)));
  }, [carregarCursos]);

  useEffect(() => {
    // A falha de abertura já aparece pela carga dos cursos.
    bancoEmMemoria().then(setEmMemoria, () => {});
  }, []);

  // O histórico guarda a grade de um curso: trocar de curso o zera, para o
  // desfazer nunca agir sobre uma grade que não está na tela.
  useEffect(() => {
    historico.limpar();
  }, [cursoId]);

  if (erro) {
    return (
      <main className="p-10">
        <h1 className="mb-3 text-xl font-bold">Distribuição de Aulas</h1>
        <Alerta tom="erro">
          <strong>Falha ao abrir o banco</strong>
          <pre className="mt-1 whitespace-pre-wrap text-xs">{erro}</pre>
        </Alerta>
      </main>
    );
  }

  const atual = TODAS.find((p) => p.id === pagina) ?? TODAS[0];
  const semCurso = cursoId == null;
  const conteudo = atual.componente({
    cursoId: cursoId ?? 0,
    aoMudarCursos: carregarCursos,
    aoNavegar: setPagina,
  });

  const item = (p: Pagina, extra?: string) => (
    <button
      key={p.id}
      aria-current={p.id === pagina ? "page" : undefined}
      onClick={() => setPagina(p.id)}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] text-tx2 hover:bg-accent hover:text-foreground",
        extra,
        // Fundo e peso carregam o estado junto com a cor.
        p.id === pagina && "bg-acc-bg font-semibold text-primary hover:bg-acc-bg hover:text-primary",
      )}
    >
      <p.icone className="size-3.5 shrink-0" aria-hidden />
      {p.rotulo}
    </button>
  );

  return (
    <TooltipProvider delayDuration={400}>
      <div className="grid min-h-screen grid-cols-[216px_1fr]">
        <nav className="flex flex-col gap-px border-r border-line bg-panel px-2.5 py-3">
          <strong className="px-2.5 pb-2.5 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-tx3">
            Distribuição de Aulas
          </strong>

          {/* O escopo do que se edita fica visível o tempo todo, numa caixa
              rebaixada acima dos grupos: o curso vale para as páginas do
              primeiro grupo e para as grades. A altura de linha do gatilho
              (1,4286) é o que dá a altura da caixa, e o `min-h` a reserva
              enquanto ele está sem texto: sem isso o gatilho teria só a altura
              da seta até a lista de cursos chegar, e a barra inteira desceria
              quando o nome aparecesse. */}
          <div className="mx-0.5 mb-2.5 rounded-[5px] bg-poco px-[9px] pb-[5px] pt-1.5 shadow-[inset_0_0_0_1px_var(--lineC)]">
            <label htmlFor="curso-ativo" className="mb-0.5 block text-[10px] text-tx3">
              Curso
            </label>
            <Seletor
              id="curso-ativo"
              className="h-auto min-h-[1.4286em] w-full border-0 bg-transparent px-0 py-0 text-sm font-semibold leading-[1.4286] hover:bg-transparent"
              valor={cursoId}
              opcoes={cursos.map((c) => ({ valor: c.id as number | null, rotulo: c.nome }))}
              exibir={cursosLidos && cursos.length === 0 ? "nenhum curso" : undefined}
              aoMudar={(id) => setCursoId(id)}
              desabilitado={cursos.length === 0}
            />
          </div>
          {/* Atalho discreto: menor e em cinza, sem o fundo de item, com a
              altura de linha de 1,3333. */}
          {item(
            PAGINA_CURSOS,
            "mx-0.5 h-auto w-[calc(100%-4px)] px-2 pb-[7px] pt-[5px] text-xs leading-[1.3333] text-tx3",
          )}

          {GRUPOS.map((g) => (
            <div key={g.titulo} className="flex flex-col gap-px">
              <div className="px-2.5 pb-1 pt-4 text-[10px] uppercase tracking-[0.08em] text-tx3">
                {g.titulo}
              </div>
              {g.paginas.map((p) => item(p))}
            </div>
          ))}
        </nav>

        {/* `min-w-0`: sem ele a coluna `1fr` não encolhe abaixo do conteúdo e
            uma tela larga alargaria a janela em vez de rolar dentro da coluna. */}
        <main className="min-w-0 px-5 pb-10 pt-5">
          {emMemoria && (
            <Alerta tom="aviso">
              Este navegador não guarda os dados: o que você fizer some ao fechar a página.
            </Alerta>
          )}
          {semCurso && atual.id !== "cursos" ? (
            <>
              <h1 className="text-xl font-bold">Nenhum curso</h1>
              <p className="mt-2 text-tx2">Crie um curso em "Gerenciar cursos" para começar.</p>
            </>
          ) : (
            conteudo
          )}
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
