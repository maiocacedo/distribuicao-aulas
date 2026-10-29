import { expect, test } from "@playwright/test";
import { irPara } from "../e2e/paginas";

/**
 * Num banco recém-migrado, sem nada cadastrado, toda tela abre sem erro: é o
 * primeiro contato de quem experimenta o app no navegador, e é o caso que os
 * e2e (sempre com a massa ou com semente) quase não exercitam.
 */
const TELAS = [
  "Períodos",
  "Disciplinas",
  "Professores",
  "Salas",
  "Indisponibilidades",
  "Tipos de disciplina",
  "Regras",
  "Manual",
  "Automática",
  "Gerenciar cursos",
];

test("todas as telas abrem num banco vazio sem erro", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(`console: ${m.text()}`);
  });

  await page.goto("/");
  await expect(page.locator("#curso-ativo")).toHaveText("Curso");
  for (const tela of TELAS) {
    await irPara(page, tela);
    await expect(page.getByRole("navigation").getByRole("button", { name: tela, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("main h1").first()).toBeVisible();
    // Alerta de erro da página, falha de render ou de fora da tela: todos têm `role="alert"`.
    await expect(page.locator("main [role=alert]"), tela).toHaveCount(0);
  }
  expect(erros).toEqual([]);
});
