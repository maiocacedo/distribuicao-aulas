import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Só `invoke` importa aqui: `transacao` não abre a pool do plugin de SQL.
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

import { aoEscrever, transacao, type Origem } from "./db";

let eventos: string[];
let cancelar: Array<() => void>;

beforeEach(() => {
  eventos = [];
  cancelar = [];
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => {
    eventos.push(`invoke:${cmd}`);
    return cmd === "banco" ? "teste.db" : { rowsAffected: 1, lastInsertId: 7 };
  });
});

afterEach(() => cancelar.forEach((c) => c()));

function ouvir(ouvinte: (o: Origem) => void) {
  cancelar.push(aoEscrever(ouvinte));
}

describe("transacao", () => {
  it("avisa depois da gravação, com 'cadastro' por padrão e 'grade' quando pedido", async () => {
    ouvir((o) => eventos.push(`aviso:${o}`));
    await transacao([{ sql: "SELECT 1" }]);
    await transacao([{ sql: "SELECT 1" }], { origem: "grade" });
    expect(eventos.filter((e) => e !== "invoke:banco")).toEqual([
      "invoke:transacao",
      "aviso:cadastro",
      "invoke:transacao",
      "aviso:grade",
    ]);
  });

  it("um ouvinte que lança não derruba a gravação nem impede os seguintes", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    ouvir(() => {
      throw new Error("ouvinte quebrado");
    });
    ouvir((o) => eventos.push(`aviso:${o}`));
    await expect(transacao([{ sql: "SELECT 1" }])).resolves.toEqual({ rowsAffected: 1, lastInsertId: 7 });
    expect(eventos).toContain("aviso:cadastro");
    expect(erro).toHaveBeenCalledTimes(1);
    erro.mockRestore();
  });

  it("se a gravação falha, ninguém é avisado", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "banco") return "teste.db";
      throw new Error("falhou");
    });
    ouvir((o) => eventos.push(`aviso:${o}`));
    await expect(transacao([{ sql: "SELECT 1" }])).rejects.toThrow("falhou");
    expect(eventos).toEqual([]);
  });
});
