import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  timeout: 60_000,
  snapshotPathTemplate: "testes/visual/__capturas__/{arg}{ext}",
  // `threshold`: tolerância de cor por pixel. 0,01 absorve a diferença estável de
  // 1 a 2 níveis (com 0, "Tipos de disciplina" falha em toda execução). A oscilação
  // dos ícones da barra lateral é outra coisa e é tratada em `capturar()`
  // (testes/visual/telas.spec.ts). `maxDiffPixels: 0` exige que nenhum pixel passe
  // da tolerância.
  expect: { timeout: 10_000, toHaveScreenshot: { animations: "disabled", maxDiffPixels: 0, threshold: 0.01 } },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testDir: "testes/e2e",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
    },
    {
      // Só local: a renderização de fonte muda entre sistemas, e as referências são do Windows.
      name: "visual",
      testDir: "testes/visual",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
    },
    {
      // Sem a ponte falsa do Tauri: o app abre como num navegador comum, com o
      // banco do navegador de verdade (SQLite em WebAssembly no armazenamento de
      // origem). Cada teste ganha um contexto novo, e com ele um armazenamento vazio.
      name: "navegador",
      testDir: "testes/navegador",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
