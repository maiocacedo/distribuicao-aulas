import { useSyncExternalStore } from "react";

/**
 * Aparência e acessibilidade. São da pessoa e do aparelho, não dos dados: ficam
 * no `localStorage` (no navegador e no executável), fora do banco, e não vão
 * junto quando o banco é exportado. Quem abre o mesmo banco em outro lugar
 * mantém as próprias.
 *
 * `aplicar` escreve tudo como atributos do `<html>`, que o `tema.css` lê; o
 * tamanho do texto é `zoom` na raiz, porque o design é todo em pixels.
 */
export type Tema = "sistema" | "claro" | "escuro";
export type Acento = "azul" | "verde" | "violeta" | "grafite";

export interface Preferencias {
  tema: Tema;
  acento: Acento;
  /** Porcentagem do tamanho original. */
  tamanho: number;
  altoContraste: boolean;
  reduzirMovimento: boolean;
  focoReforcado: boolean;
}

export const TAMANHOS = [100, 112.5, 125, 150] as const;

export const PADRAO: Preferencias = {
  tema: "sistema",
  acento: "azul",
  tamanho: 100,
  altoContraste: false,
  reduzirMovimento: false,
  focoReforcado: false,
};

const CHAVE = "distribuicao-aulas:preferencias";

const TEMAS: Tema[] = ["sistema", "claro", "escuro"];
const ACENTOS: Acento[] = ["azul", "verde", "violeta", "grafite"];

/** Só o que for válido passa: um valor antigo ou estranho volta ao padrão. */
function sanear(bruto: unknown): Preferencias {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);
  return {
    tema: TEMAS.includes(o.tema as Tema) ? (o.tema as Tema) : PADRAO.tema,
    acento: ACENTOS.includes(o.acento as Acento) ? (o.acento as Acento) : PADRAO.acento,
    tamanho: (TAMANHOS as readonly number[]).includes(o.tamanho as number) ? (o.tamanho as number) : PADRAO.tamanho,
    altoContraste: bool(o.altoContraste, PADRAO.altoContraste),
    reduzirMovimento: bool(o.reduzirMovimento, PADRAO.reduzirMovimento),
    focoReforcado: bool(o.focoReforcado, PADRAO.focoReforcado),
  };
}

function ler(): Preferencias {
  try {
    const texto = localStorage.getItem(CHAVE);
    return texto ? sanear(JSON.parse(texto)) : PADRAO;
  } catch {
    // Armazenamento bloqueado ou JSON quebrado: o app abre com o padrão.
    return PADRAO;
  }
}

let atuais = ler();
const ouvintes = new Set<() => void>();

const escuroDoSistema = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

/** O modo que vale agora: "sistema" é resolvido pelo que o sistema operacional diz. */
export function modoResolvido(p: Preferencias = atuais): "claro" | "escuro" {
  if (p.tema !== "sistema") return p.tema;
  return escuroDoSistema() ? "escuro" : "claro";
}

export function aplicar(p: Preferencias = atuais) {
  const raiz = document.documentElement;
  raiz.dataset.modo = modoResolvido(p);
  raiz.dataset.acento = p.acento;
  raiz.dataset.contraste = p.altoContraste ? "alto" : "normal";
  raiz.dataset.movimento = p.reduzirMovimento ? "reduzido" : "normal";
  raiz.dataset.foco = p.focoReforcado ? "reforcado" : "normal";
  raiz.style.zoom = p.tamanho === 100 ? "" : String(p.tamanho / 100);
  // Com `zoom`, `100vh` vale a janela vezes o zoom: quem quer a altura da
  // janela divide por isto (a barra lateral).
  raiz.style.setProperty("--zoom", String(p.tamanho / 100));
}

export function preferencias(): Preferencias {
  return atuais;
}

export function mudarPreferencias(mudanca: Partial<Preferencias>) {
  atuais = sanear({ ...atuais, ...mudanca });
  try {
    localStorage.setItem(CHAVE, JSON.stringify(atuais));
  } catch {
    // Sem armazenamento a mudança vale até fechar a página.
  }
  aplicar();
  ouvintes.forEach((o) => o());
}

export function restaurarPadrao() {
  mudarPreferencias(PADRAO);
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function usePreferencias(): Preferencias {
  return useSyncExternalStore(assinar, preferencias, preferencias);
}

/**
 * Chamado uma vez, antes do primeiro desenho. Com o tema "sistema", trocar o
 * modo do sistema operacional troca o app junto, sem recarregar.
 */
export function iniciarPreferencias() {
  aplicar();
  if (typeof matchMedia === "function")
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (atuais.tema === "sistema") aplicar();
    });
}
