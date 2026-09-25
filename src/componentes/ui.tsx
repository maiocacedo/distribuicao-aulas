import type { ReactNode } from "react";
import { useEffect } from "react";

/** Painel modal simples. Fecha no Esc e no clique fora. */
export function Modal({
  titulo,
  children,
  aoFechar,
}: {
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  return (
    <div className="fundo-modal" onMouseDown={aoFechar}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

export function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <label className="campo">
      <span className="rotulo">{rotulo}</span>
      {children}
      {dica && <span className="dica">{dica}</span>}
    </label>
  );
}

export interface Ordem<C extends string> {
  campo: C;
  desc: boolean;
}

/**
 * Cabeçalho de coluna ordenável. Texto ordena crescente por padrão; número
 * ordena decrescente, que é o que se quer ao procurar "quem tem mais".
 */
export function Ordenavel<C extends string>({
  campo,
  ordem,
  aoOrdenar,
  numerico,
  centro,
  children,
}: {
  campo: C;
  ordem: Ordem<C>;
  aoOrdenar: (o: Ordem<C>) => void;
  numerico?: boolean;
  /** Coluna curta, que fica melhor centrada que encostada na borda. */
  centro?: boolean;
  children: ReactNode;
}) {
  const ativo = ordem.campo === campo;
  return (
    <th className={[numerico ? "num" : "", centro ? "centro" : ""].filter(Boolean).join(" ") || undefined}>
      <button
        className={`ordenavel ${ativo ? "ativo" : ""}`}
        onClick={() =>
          aoOrdenar(
            ativo ? { campo, desc: !ordem.desc } : { campo, desc: !!numerico },
          )
        }
      >
        {children}
        <em>{ativo ? (ordem.desc ? "▾" : "▴") : ""}</em>
      </button>
    </th>
  );
}

/** Comparador estável: desempata sempre pelo mesmo critério textual. */
export function comparar<T>(
  linhas: T[],
  ordem: Ordem<string>,
  desempate: (l: T) => string,
): T[] {
  return [...linhas].sort((a, b) => {
    const x = (a as Record<string, unknown>)[ordem.campo];
    const y = (b as Record<string, unknown>)[ordem.campo];
    let r: number;
    if (typeof x === "number" && typeof y === "number") r = x - y;
    else r = String(x ?? "").localeCompare(String(y ?? ""), "pt-BR");
    if (r === 0) return desempate(a).localeCompare(desempate(b), "pt-BR");
    return ordem.desc ? -r : r;
  });
}

/**
 * Cabeçalho de uma tela de lista: título e escopo na mesma linha, filtro e
 * contagem à direita, ação principal no fim.
 *
 * O escopo ao lado do título não é enfeite — é o que responde "isto vale só
 * para o curso selecionado ou para a instituição inteira?", pergunta que a
 * pessoa faria toda vez que abrisse a tela.
 */
export function CabecalhoLista({
  titulo,
  escopo,
  contagem,
  filtro,
  aoFiltrar,
  children,
}: {
  titulo: string;
  escopo: string;
  contagem: string;
  filtro?: string;
  aoFiltrar?: (v: string) => void;
  children?: ReactNode;
}) {
  return (
    <header className="cabecalho-lista">
      <h1>{titulo}</h1>
      <span className="escopo">{escopo}</span>
      <span className="espaco" />
      {aoFiltrar && (
        <input
          className="filtro"
          placeholder="Filtrar por nome…"
          value={filtro ?? ""}
          onChange={(e) => aoFiltrar(e.target.value)}
        />
      )}
      <span className="contagem">{contagem}</span>
      {children}
    </header>
  );
}

/**
 * Ações de linha como ícone, não como texto.
 *
 * Numa lista de 60 linhas, "Editar Remover" repetido 60 vezes é mais tinta que
 * conteúdo. O rótulo vive no `title` para quem passa o mouse e no `aria-label`
 * para quem não usa o mouse.
 */
export function BotaoIcone({
  rotulo,
  perigo,
  aoClicar,
  children,
}: {
  rotulo: string;
  perigo?: boolean;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`icone ${perigo ? "perigo" : ""}`}
      title={rotulo}
      aria-label={rotulo}
      onClick={aoClicar}
    >
      {children}
    </button>
  );
}

export const Lapis = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor">
    <path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" strokeWidth="1.2" />
  </svg>
);

export const Lixeira = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor">
    <path d="M2.5 3.5h9M5.5 3.5V2h3v1.5M4 3.5l.5 8h5l.5-8" strokeWidth="1.2" />
  </svg>
);

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>;
}

export function Erro({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="alerta">{children}</div>;
}

/**
 * Traduz erro do SQLite para algo que o usuário entenda. A violação de chave
 * estrangeira é a comum: apagar um professor que ainda dá aula, por exemplo.
 */
export function mensagemErro(e: unknown, contexto: string): string {
  const texto = String(e);
  if (/FOREIGN KEY constraint failed/i.test(texto)) {
    return `${contexto} está em uso e não pode ser removido. Remova antes os registros que dependem dele.`;
  }
  if (/UNIQUE constraint failed/i.test(texto)) {
    return "Já existe um registro com esse nome.";
  }
  if (/CHECK constraint failed/i.test(texto)) {
    return "Algum valor está fora do permitido pelo esquema.";
  }
  return texto;
}
