import { expect, test } from "./fixtures";
import { escolher, irPara } from "./paginas";

test.describe("navegação", () => {
  test("o item ativo é marcado para leitor de tela", async ({ page }) => {
    await irPara(page, "Professores");
    const item = page.getByRole("navigation").getByRole("button", { name: "Professores", exact: true });
    await expect(item).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Professores");
  });
});

test.describe("seletor de curso", () => {
  test.use({ semente: "INSERT INTO cursos (id, nome) VALUES (2, 'Zeta');" });

  test("trocar de curso troca o conteúdo", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    await escolher(page.getByRole("navigation").getByRole("combobox", { name: "Curso" }), "Zeta");
    await expect(page.getByRole("row")).toHaveCount(0);
  });
});
