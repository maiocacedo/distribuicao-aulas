import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  timeout: 60_000,
  snapshotPathTemplate: "testes/visual/__capturas__/{arg}{ext}",
  expect: { timeout: 10_000, toHaveScreenshot: { animations: "disabled", maxDiffPixels: 0, threshold: 0 } },
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
