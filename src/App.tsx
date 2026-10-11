import { useCallback, useEffect, useState } from "react";
import { consultar } from "./db";
import type { Curso } from "./tipos";
import Cursos from "./paginas/Cursos";
import Disciplinas from "./paginas/Disciplinas";
import GradeAutomatica from "./paginas/GradeAutomatica";
import GradeManual from "./paginas/GradeManual";
import Indisponibilidades from "./paginas/Indisponibilidades";
import Instituicao from "./paginas/Instituicao";
import Periodos from "./paginas/Periodos";
import Professores from "./paginas/Professores";
import Salas from "./paginas/Salas";
import Tipos from "./paginas/Tipos";

type Props = { cursoId: number; aoMudarCursos: () => void };

/**
 * As páginas do curso selecionado ficam no primeiro grupo; as institucionais,
 * no segundo. A separação é a mesma do banco: o que é do curso tem `curso_id`,
 * o que é da instituição é compartilhado por todos.
 */
type Pagina = {
  id: string;
  rotulo: string;
  componente: (p: Props) => React.ReactNode;
};

const GRUPOS: { titulo: string; paginas: Pagina[] }[] = [
  {
    titulo: "curso",
    paginas: [
      { id: "periodos", rotulo: "Períodos", componente: (p) => <Periodos cursoId={p.cursoId} /> },
      {
        id: "disciplinas",
        rotulo: "Disciplinas",
        componente: (p) => <Disciplinas cursoId={p.cursoId} />,
      },
    ],
  },
  {
    titulo: "instituição",
    paginas: [
      { id: "professores", rotulo: "Professores", componente: () => <Professores /> },
      { id: "salas", rotulo: "Salas", componente: () => <Salas /> },
    ],
  },
  {
    titulo: "horários",
    paginas: [
      {
        id: "indisponibilidades",
        rotulo: "Indisponibilidades",
        componente: () => <Indisponibilidades />,
      },
      { id: "tipos", rotulo: "Tipos de disciplina", componente: () => <Tipos /> },
      { id: "regras", rotulo: "Regras", componente: () => <Instituicao /> },
    ],
  },
  {
    titulo: "grade de horários",
    paginas: [
      {
        id: "grade-manual",
        rotulo: "Manual",
        componente: (p) => <GradeManual cursoId={p.cursoId} />,
      },
      {
        id: "grade-automatica",
        rotulo: "Automática",
        componente: (p) => <GradeAutomatica cursoId={p.cursoId} />,
      },
    ],
  },
];

const PAGINA_CURSOS: Pagina = {
  id: "cursos",
  rotulo: "Cursos",
  componente: (p) => <Cursos aoMudarLista={p.aoMudarCursos} />,
};

const TODAS = [...GRUPOS.flatMap((g) => g.paginas), PAGINA_CURSOS];

function App() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursoId, setCursoId] = useState<number | null>(null);
  const [pagina, setPagina] = useState<string>("periodos");
  const [erro, setErro] = useState<string | null>(null);

  const carregarCursos = useCallback(async () => {
    const lista = await consultar<Curso>(
      "SELECT * FROM cursos ORDER BY nome COLLATE NOCASE",
    );
    setCursos(lista);
    setCursoId((atual) =>
      atual != null && lista.some((c) => c.id === atual) ? atual : (lista[0]?.id ?? null),
    );
  }, []);

  useEffect(() => {
    carregarCursos().catch((e) => setErro(String(e)));
  }, [carregarCursos]);

  if (erro) {
    return (
      <main className="falha">
        <h1>Distribuição de Aulas</h1>
        <div className="alerta">
          <strong>Falha ao abrir o banco</strong>
          <pre>{erro}</pre>
        </div>
      </main>
    );
  }

  const atual = TODAS.find((p) => p.id === pagina) ?? TODAS[0];
  const semCurso = cursoId == null;

  return (
    <div className="janela">
      <nav>
        <div className="marca">
          <strong>Distribuição de Aulas</strong>
        </div>

        <div className="caixa-curso">
          <span className="rotulo">Curso</span>
          <select
            className="seletor-curso"
            value={cursoId ?? ""}
            disabled={cursos.length === 0}
            onChange={(e) => setCursoId(Number(e.target.value))}
          >
            {cursos.length === 0 && <option value="">nenhum curso</option>}
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <button
          className={`gerenciar-cursos ${pagina === "cursos" ? "ativo" : ""}`}
          onClick={() => setPagina("cursos")}
        >
          Gerenciar cursos
        </button>

        {GRUPOS.map((g) => (
          <div key={g.titulo}>
            <div className="separador">{g.titulo}</div>
            {g.paginas.map((p) => (
              <button
                key={p.id}
                className={p.id === pagina ? "ativo" : ""}
                onClick={() => setPagina(p.id)}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main>
        {semCurso && atual.id !== "cursos" ? (
          <>
            <header className="cabecalho-pagina">
              <h1>Nenhum curso</h1>
            </header>
            <p className="vazio">
              Crie um curso na página Cursos para começar.
            </p>
          </>
        ) : (
          atual.componente({ cursoId: cursoId ?? 0, aoMudarCursos: carregarCursos })
        )}
      </main>
    </div>
  );
}

export default App;
