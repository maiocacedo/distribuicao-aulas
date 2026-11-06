import type { SVGProps } from "react";

/**
 * O símbolo de acessibilidade (a pessoa de braços abertos), desenhado aqui por
 * não haver um igual no lucide. Grade de 24 como os ícones do lucide, cor do
 * texto (`currentColor`) e o mesmo `size-*` por classe.
 */
export function IconeAcessibilidade(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="4.4" r="2.4" />
      {/* Braços: um arco só, mais baixo no meio, de um ombro ao outro. */}
      <path d="M4.6 8.1Q12 10.3 19.4 8.1" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
      {/* Tronco, estreitando até o quadril. */}
      <path d="M9.5 9.3h5l-.55 5.4h-3.9z" />
      {/* Pernas, abrindo um pouco até os pés. */}
      <path d="M10.65 13.8 9.75 20.6M13.35 13.8l.9 6.8" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  );
}
