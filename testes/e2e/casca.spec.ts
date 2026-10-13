import { expect, test } from "./fixtures";
import { escolhida, escolher, irPara } from "./paginas";

test.describe("navegação", () => {
  test("o item ativo é marcado para leitor de tela", async ({ page }) => {
    await irPara(page, "Professores");
    const item = page.getByRole("navigation").getByRole("button", { name: "Professores", exact: true });
    await expect(item).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Professores");
  });

  test("Gerenciar cursos também é marcado quando ativo", async ({ page }) => {
    await irPara(page, "Gerenciar cursos");
    const item = page.getByRole("navigation").getByRole("button", { name: "Gerenciar cursos", exact: true });
    await expect(item).toHaveAttribute("aria-current", "page");
  });
});

test.describe("seletor de curso", () => {
  test.use({
    semente: "INSERT INTO cursos (id, nome) VALUES (2, 'Zeta'), (3, 'Ômega');",
  });

  const seletor = (page: import("@playwright/test").Page) =>
    page.getByRole("navigation").getByRole("combobox", { name: "Curso" });

  test("trocar de curso troca o conteúdo e o gatilho, e voltar traz as linhas de volta", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    const original = await escolhida(seletor(page));

    await escolher(seletor(page), "Zeta");
    expect(await escolhida(seletor(page))).toBe("Zeta");
    await expect(page.getByRole("row")).toHaveCount(0);

    await escolher(seletor(page), original);
    expect(await escolhida(seletor(page))).toBe(original);
    await expect(page.getByRole("row").nth(1)).toBeVisible();
  });

  test("abrir o seletor mostra os três cursos, inteiros dentro da janela", async ({ page }) => {
    await seletor(page).click();
    const opcoes = page.getByRole("option");
    await expect(opcoes).toHaveCount(3);
    for (const opcao of await opcoes.all()) await expect(opcao).toBeInViewport({ ratio: 1 });
    // Sem corte nem rolagem: a altura da lista acompanha o conteúdo, não o gatilho (que é baixo).
    const rolagem = await page
      .locator("[data-radix-select-viewport]")
      .evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(rolagem).toBe(0);
  });
});

test.describe("sem curso nenhum", () => {
  test.use({ semMassa: true, semente: "DELETE FROM cursos;" });

  test("a caixa do curso diz que não há curso, em vez de ficar vazia", async ({ page }) => {
    const seletor = page.getByRole("navigation").getByRole("combobox", { name: "Curso" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nenhum curso");
    await expect(seletor).toHaveText("nenhum curso");
    await expect(seletor).toBeDisabled();
  });
});
