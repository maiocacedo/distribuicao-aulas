import { expect, test } from "./fixtures";
import { irPara } from "./paginas";

test.describe("Salas", () => {
  test.use({
    semMassa: true,
    semente: `INSERT INTO salas (id, nome, tipo, capacidade) VALUES
      (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40), (3, 'Lab 1', 'Laboratório', 30);`,
  });

  test("filtrar por tipo mostra o chip, muda a contagem e limpa", async ({ page }) => {
    await irPara(page, "Salas");
    await expect(page.getByText("3 de 3")).toBeVisible();
    await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
    await page.getByRole("checkbox", { name: "Laboratório" }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Lab 1/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /A01/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Remover filtro Tipo: Laboratório" }).click();
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("a busca acha a sala pelo tipo", async ({ page }) => {
    await irPara(page, "Salas");
    await page.getByLabel("Buscar").fill("laboratorio");
    await expect(page.getByRole("row", { name: /Lab 1/ })).toBeVisible();
    await expect(page.getByText("1 de 3")).toBeVisible();
  });

  test("filtro sem resultado oferece limpar", async ({ page }) => {
    await irPara(page, "Salas");
    await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
    await page.getByRole("checkbox", { name: "Outro" }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Nenhuma sala encontrada.")).toBeVisible();
    await page.getByRole("button", { name: "Limpar busca e filtros" }).click();
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("busca sem resultado oferece limpar a busca", async ({ page }) => {
    await irPara(page, "Salas");
    const busca = page.getByLabel("Buscar");
    await busca.fill("zzzz");
    await expect(page.getByText("Nenhuma sala encontrada.")).toBeVisible();
    await page.getByRole("button", { name: "Limpar busca e filtros" }).click();
    await expect(busca).toHaveValue("");
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("remover um chip pelo teclado devolve o foco ao botão do filtro", async ({ page }) => {
    await irPara(page, "Salas");
    await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
    await page.getByRole("checkbox", { name: "Laboratório" }).check();
    await page.keyboard.press("Escape");
    const chip = page.getByRole("button", { name: "Remover filtro Tipo: Laboratório" });
    await chip.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("3 de 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Filtrar por Tipo" })).toBeFocused();
  });
});
