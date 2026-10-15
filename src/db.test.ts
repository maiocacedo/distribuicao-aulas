import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Só `invoke` importa aqui: `transacao` não abre a pool do plugin de SQL.
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));
// O motor do navegador de verdade abre um worker, que o Node não tem.
const navegador = vi.hoisted(() => ({
  banco: vi.fn(async () => "distribuicao.db"),
  consultar: vi.fn(async () => [{ n: 1 }]),
  transacao: vi.fn(async () => ({ rowsAffected: 2, lastInsertId: 9 })),
  emMemoria: vi.fn(async () => true),
}));
vi.mock("./banco/navegador", () => ({ motorNavegador: navegador }));

import { aoEscrever, banco, bancoEmMemoria, consultar, transacao, type Origem } from "./db";

let eventos: string[];
let cancelar: Array<() => void>;

beforeEach(() => {
  // O Tauri injeta isto na página; sem ele, `db.ts` escolhe o motor do navegador.
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  eventos = [];
  cancelar = [];
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => {
    eventos.push(`invoke:${cmd}`);
    return cmd === "banco" ? "teste.db" : { rowsAffected: 1, lastInsertId: 7 };
  });
});

afterEach(() => {
  cancelar.forEach((c) => c());
  vi.unstubAllGlobals();
});

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

describe("escolha do motor", () => {
  it("com o Tauri, o banco é o do desktop e nunca está em memória", async () => {
    await expect(banco()).resolves.toBe("teste.db");
    await expect(bancoEmMemoria()).resolves.toBe(false);
    expect(navegador.banco).not.toHaveBeenCalled();
  });

  it("sem o Tauri, tudo vai para o motor do navegador, e o aviso de escrita vale igual", async () => {
    vi.unstubAllGlobals();
    ouvir((o) => eventos.push(`aviso:${o}`));
    await expect(banco()).resolves.toBe("distribuicao.db");
    await expect(bancoEmMemoria()).resolves.toBe(true);
    await expect(consultar("SELECT 1 AS n", [3])).resolves.toEqual([{ n: 1 }]);
    expect(navegador.consultar).toHaveBeenCalledWith("SELECT 1 AS n", [3]);
    await expect(transacao([{ sql: "DELETE FROM x" }], { origem: "grade" })).resolves.toEqual({
      rowsAffected: 2,
      lastInsertId: 9,
    });
    expect(eventos).toEqual(["aviso:grade"]);
    expect(invoke).not.toHaveBeenCalled();
  });
});
