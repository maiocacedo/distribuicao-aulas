import { test as base, expect } from "@playwright/test";
import type { DatabaseSync } from "node:sqlite";
import { criarBanco } from "../suporte/banco";
import { criarPonte, type OpcoesPonte } from "../suporte/ponte";

interface Opcoes {
  /** true = banco como na primeira abertura, sem a massa. */
  semMassa: boolean;
  /** SQL executado depois de montar o banco e antes de abrir o app. */
  semente: string;
  opcoesPonte: OpcoesPonte;
}

/**
 * Cada teste recebe um banco próprio e o app aberto com o IPC do Tauri
 * apontando para a ponte no Node. O teste pode consultar `banco` direto para
 * conferir o que a tela gravou.
 */
export const test = base.extend<Opcoes & { banco: DatabaseSync; chamadas: string[] }>({
  semMassa: [false, { option: true }],
  semente: ["", { option: true }],
  opcoesPonte: [{}, { option: true }],

  banco: async ({ semMassa, semente }, use) => {
    const db = criarBanco({ massa: !semMassa });
    if (semente) db.exec(semente);
    await use(db);
    db.close();
  },

  chamadas: async ({}, use) => {
    await use([]);
  },

  page: async ({ page, banco, opcoesPonte, chamadas }, use) => {
    await page.exposeFunction("__ipc", criarPonte(banco, { ...opcoesPonte, registro: chamadas }));
    await page.addInitScript(() => {
      type Resposta = { ok: boolean; valor?: unknown; erro?: string };
      const w = window as unknown as Record<string, unknown>;
      const ipc = (cmd: string, args: unknown) =>
        (w.__ipc as (c: string, a: unknown) => Promise<Resposta>)(cmd, args);
      w.__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args?: unknown) => {
          const r = await ipc(cmd, args ?? {});
          if (r.ok) return r.valor;
          throw r.erro; // o Tauri rejeita com a string de erro do Rust
        },
        transformCallback: () => 0,
        unregisterCallback: () => {},
        convertFileSrc: (s: string) => s,
        metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
      };
    });
    await page.goto("/");
    await use(page);
  },
});

export { expect };
