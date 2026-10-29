import type { ReactNode } from "react";

/** O que aparece no lugar de uma lista sem nada: o mesmo painel, com uma frase. */
export function EstadoVazio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-panel p-8 text-center text-[12px] text-tx3 shadow-[inset_0_0_0_1px_var(--line)]">
      {children}
    </p>
  );
}
