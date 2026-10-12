import type { ReactNode } from "react";

// O que as telas de grade, ainda não convertidas, usam das telas antigas. O
// resto saiu com a última lista convertida (Disciplinas).

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>;
}

export function Erro({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="alerta">{children}</div>;
}

export { mensagemErro } from "@/lib/erros";
