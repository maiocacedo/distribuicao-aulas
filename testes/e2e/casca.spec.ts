import { expect, test } from "./fixtures";
import { contar, escolhida, escolher, irPara } from "./paginas";

test.describe("navegação", () => {
  test("o item ativo é marcado para leitor de tela", async ({ page }) => {
    await irPara(page, "Professores");
    const item = page.getByRole("navigation").getByRole("button", { name: "Professores", exact: true });
    await expect(item).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Professores");
  });

  test("Geral também é marcado quando ativo, e abre em Cursos", async ({ page }) => {
    await irPara(page, "Geral");
    const item = page.getByRole("navigation").getByRole("button", { name: "Geral", exact: true });
    await expect(item).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("tab", { name: "Cursos" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cursos");
  });

  test("no desktop, Dados exporta e importa, sem exemplo nem banco vazio", async ({ page }) => {
    await irPara(page, "Dados");
    await expect(page.getByRole("button", { name: "Exportar banco" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Importar banco…" })).toBeEnabled();
    expect(await page.getByRole("button", { name: "Carregar dados de exemplo" }).count()).toBe(0);
    expect(await page.getByRole("button", { name: "Começar vazio" }).count()).toBe(0);
  });

  test("Sobre abre com o contato e fecha", async ({ page }) => {
    await page.getByRole("navigation").getByRole("button", { name: "Sobre" }).click();
    const janela = page.getByRole("dialog", { name: "Distribuição de Aulas" });
    await expect(janela.getByRole("link", { name: /@/ })).toBeVisible();
    await expect(janela.getByRole("img", { name: /UTFPR/ })).toBeVisible();
    await janela.getByRole("button", { name: "Fechar" }).first().click();
    await expect(janela).toHaveCount(0);
  });
});

test.describe("preferências", () => {
  test("tema, destaque e acessibilidade valem na hora e sobrevivem à recarga", async ({ page }) => {
    const raiz = page.locator("html");
    await irPara(page, "Aparência");
    await page.getByRole("radio", { name: "Escuro" }).check();
    await page.getByRole("radio", { name: "Violeta" }).check();
    await expect(raiz).toHaveAttribute("data-modo", "escuro");
    await expect(raiz).toHaveAttribute("data-acento", "violeta");

    await irPara(page, "Acessibilidade");
    await page.getByRole("radio", { name: "125%" }).check();
    await page.getByLabel("Alto contraste").click();
    await page.getByLabel("Reduzir animações").click();
    await expect(raiz).toHaveAttribute("data-contraste", "alto");
    await expect(raiz).toHaveAttribute("data-movimento", "reduzido");
    expect(await raiz.evaluate((h) => h.style.zoom)).toBe("1.25");

    await page.reload();
    await expect(raiz).toHaveAttribute("data-modo", "escuro");
    await expect(raiz).toHaveAttribute("data-acento", "violeta");
    await expect(raiz).toHaveAttribute("data-contraste", "alto");
    expect(await raiz.evaluate((h) => h.style.zoom)).toBe("1.25");

    // A barra lateral cabe na janela mesmo com o zoom: o pé fica à vista.
    await expect(page.getByRole("navigation").getByRole("button", { name: "Sobre" })).toBeInViewport();

    await irPara(page, "Acessibilidade");
    await page.getByRole("button", { name: "restaurar todas as preferências" }).click();
    await expect(raiz).toHaveAttribute("data-acento", "azul");
    await expect(raiz).toHaveAttribute("data-contraste", "normal");
    expect(await raiz.evaluate((h) => h.style.zoom)).toBe("");
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
