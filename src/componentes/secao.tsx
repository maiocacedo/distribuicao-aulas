import type { ReactNode } from "react";

/**
 * Painel de uma seção da página, com o contorno de 1 px em sombra interna (que
 * não conta na largura) e, se houver `titulo`, o `h2` em caixa alta.
 */
export function Secao({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section className="mb-3 rounded-lg bg-panel px-4 pb-4 pt-3 shadow-[inset_0_0_0_1px_var(--line)]">
      {titulo && <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-tx3">{titulo}</h2>}
      {children}
    </section>
  );
}
