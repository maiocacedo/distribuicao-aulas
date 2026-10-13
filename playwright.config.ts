import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  timeout: 60_000,
  snapshotPathTemplate: "testes/visual/__capturas__/{arg}{ext}",
  // `threshold` é a tolerância de cor por pixel (0 a 1). 0,01 absorve diferenças
  // de um ou dois níveis de cor que são estáveis, não oscilação: com 0, "Tipos de
  // disciplina" falha em toda execução (claro e escuro) contra a referência.
  // A oscilação de ícones da barra lateral (1 a 5 níveis em x=21, y=106/172/175/205,
  // de vez em quando, mais sob carga) NÃO é isto: vinha da camada da barra ficar com
  // o desenho de antes de a lista de cursos chegar e mudar a altura da caixa do
  // curso; `capturar`, em testes/visual/telas.spec.ts, repinta a barra antes da foto
  // e a explica. `maxDiffPixels: 0` continua exigindo que nenhum pixel passe da
  // tolerância.
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
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
