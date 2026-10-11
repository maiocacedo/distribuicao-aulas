import { expect, test } from "./fixtures";
import { contar, irPara, responderConfirmacoes } from "./paginas";

test.use({ semMassa: true, semente: "INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');" });

const abrir = async (page: import("@playwright/test").Page) => {
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

test("Esc sem alteração fecha direto", async ({ page }) => {
  await abrir(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("Esc com alteração pede confirmação, e recusar mantém o formulário", async ({ page }) => {
  await abrir(page);
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  await page.keyboard.press("Escape");
  const aviso = page.getByRole("alertdialog");
  await expect(aviso).toContainText("Descartar as alterações?");
  await aviso.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Ana S.");

  // Esc na confirmação fecha só a confirmação: o formulário por baixo fica.
  await page.keyboard.press("Escape");
  await expect(aviso).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(aviso).toHaveCount(0);
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Ana S.");
});

test("descartar não grava", async ({ page, banco }) => {
  const mensagens = await responderConfirmacoes(page);
  await abrir(page);
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(mensagens.join("\n")).toMatch(/Descartar as alterações/);
  expect(contar(banco, "SELECT COUNT(*) FROM professores WHERE nome = 'Ana Souza'")).toBe(1);
});

test("clicar fora não fecha", async ({ page }) => {
  await abrir(page);
  await page.mouse.click(5, 5);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("nome repetido aparece como erro dentro do formulário", async ({ page }) => {
  await abrir(page);
  await page.getByLabel("Nome", { exact: true }).fill("Bruno Lima");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog").getByText("Já existe um registro com esse nome.")).toBeVisible();
});

test("a lista ordena pelo cabeçalho e marca o sentido", async ({ page }) => {
  await irPara(page, "Professores");
  const nome = page.getByRole("columnheader", { name: "Nome" });
  await expect(nome).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("row").nth(1)).toContainText("Ana Souza");
  await nome.getByRole("button").click();
  await expect(nome).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("row").nth(1)).toContainText("Bruno Lima");
});
