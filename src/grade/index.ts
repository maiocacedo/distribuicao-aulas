import { aoEscrever, consultar, transacao } from "../db";
import { criarHistorico } from "./historico";

/** O histórico do app. Vive enquanto a janela estiver aberta. */
export const historico = criarHistorico({ consultar, transacao, aoEscrever });
