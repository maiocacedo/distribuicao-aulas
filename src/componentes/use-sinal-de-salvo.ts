import { useCallback, useEffect, useRef, useState } from "react";

const DURACAO_MS = 1500;

/**
 * O sinal "salvo" de uma tela sem botão de salvar: `piscar()` o acende e ele
 * some sozinho. O relógio fica guardado para que o sinal de uma gravação não
 * apague o da seguinte, nem dispare depois de a tela sair.
 */
export function useSinalDeSalvo(): [salvo: boolean, piscar: () => void] {
  const [salvo, setSalvo] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(relogio.current), []);
  const piscar = useCallback(() => {
    setSalvo(true);
    clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setSalvo(false), DURACAO_MS);
  }, []);
  return [salvo, piscar];
}
