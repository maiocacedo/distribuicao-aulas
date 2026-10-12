import type { ReactNode } from "react";

// O que a grade automática, a última tela ainda não convertida, usa das telas
// antigas. O resto saiu com as outras telas.

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>;
}

export function Erro({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="alerta">{children}</div>;
}

export { mensagemErro } from "@/lib/erros";
