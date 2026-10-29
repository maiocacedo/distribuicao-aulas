import { useSyncExternalStore } from "react";
import { historico } from ".";

export function useHistorico() {
  return useSyncExternalStore(historico.assinar, historico.estado);
}
