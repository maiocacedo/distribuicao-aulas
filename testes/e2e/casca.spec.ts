import { expect, test } from "./fixtures";
import { contar, escolhida, escolher, irPara } from "./paginas";

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

  test("no desktop não há página de dados do navegador", async ({ page }) => {
    const barra = page.getByRole("navigation");
    // O item sairia no mesmo desenho dos outros: com eles à vista, a ausência vale.
    await expect(barra.getByRole("button", { name: "Gerenciar cursos", exact: true })).toBeVisible();
    expect(await barra.getByRole("button", { name: "Dados do navegador" }).count()).toBe(0);
    expect(await barra.getByText("este navegador").count()).toBe(0);
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
    await expect(seletor(page)).toHaveText("Zeta");
    // Com a lista de cursos aberta o resto da página sai da árvore de
    // acessibilidade: sem esperar ela fechar, "nenhuma linha" seria por isso.
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByRole("row")).toHaveCount(0);

    await escolher(seletor(page), original);
    await expect(seletor(page)).toHaveText(original);
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(page.getByRole("row").nth(1)).toBeVisible();
  });

  test("abrir o seletor mostra todos os cursos, inteiros dentro da janela", async ({ page, banco }) => {
    await seletor(page).click();
    const opcoes = page.getByRole("option");
    // Os dois da semente e os que a massa trouxer.
    const cursos = contar(banco, "SELECT COUNT(*) FROM cursos");
    expect(cursos).toBeGreaterThanOrEqual(3);
    await expect(opcoes).toHaveCount(cursos);
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
