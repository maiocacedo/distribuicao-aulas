import { expect, test } from "./fixtures";
import { celula, contar, irPara } from "./paginas";

test.use({ semMassa: true });

test("cadastra do zero e fecha as pendências na grade manual", async ({ page, banco }) => {
  await irPara(page, "Períodos");
  await page.getByRole("button", { name: "Adicionar 1º período" }).click();
  await expect(page.getByRole("cell", { name: "1º", exact: true })).toBeVisible();

  await irPara(page, "Professores");
  for (const nome of ["Ana Souza", "Bruno Lima"]) {
    await page.getByRole("button", { name: "Novo professor" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(nome)).toBeVisible();
  }

  await irPara(page, "Salas");
  await page.getByRole("button", { name: "Nova sala" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("A01");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("A01")).toBeVisible();

  await irPara(page, "Disciplinas");
  await page.getByRole("button", { name: "Nova disciplina" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Cálculo");
  await page.getByRole("button", { name: "Adicionar professor" }).click();
  await page.locator(".linha-fatia input[type=number]").first().fill("2");
  await page.getByRole("button", { name: "Adicionar professor" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  // GROUP_CONCAT não garante ordem: confere cada professor separadamente.
  await expect(page.getByText(/Ana Souza \(2\)/)).toBeVisible();
  await expect(page.getByText(/Bruno Lima \(2\)/)).toBeVisible();

  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Ana Souza/ }).click();
  for (const codigo of ["M1", "M2"]) {
    await celula(page, "Segunda", codigo).click();
    await expect(celula(page, "Segunda", codigo)).toContainText("Cálculo");
  }
  await page.getByRole("button", { name: /Bruno Lima/ }).click();
  for (const codigo of ["M1", "M2"]) {
    await celula(page, "Terça", codigo).click();
    await expect(celula(page, "Terça", codigo)).toContainText("Cálculo");
  }

  await expect(page.getByText("Todas as aulas deste período estão alocadas.")).toBeVisible();
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(4);
});
