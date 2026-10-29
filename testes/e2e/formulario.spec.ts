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

test("nome vazio: a mensagem fica junto do campo, que recebe o foco, e nada é gravado", async ({ page, banco }) => {
  await irPara(page, "Professores");
  await page.getByRole("button", { name: "Novo professor" }).click();
  const dialogo = page.getByRole("dialog");
  const nome = dialogo.getByLabel("Nome", { exact: true });
  const mensagem = dialogo.getByText("O nome é obrigatório.");

  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(mensagem).toBeVisible();
  await expect(nome).toHaveAttribute("aria-invalid", "true");
  await expect(nome).toHaveAccessibleDescription("O nome é obrigatório.");
  // O clique levou o foco ao botão; o erro o traz de volta ao campo que o tem.
  await expect(nome).toBeFocused();
  // Validação de campo não é o alerta do formulário.
  await expect(dialogo.getByRole("alert")).toHaveCount(0);
  expect(contar(banco, "SELECT COUNT(*) FROM professores")).toBe(2);

  await nome.pressSequentially("C");
  await expect(mensagem).toHaveCount(0);
  await expect(nome).not.toHaveAttribute("aria-invalid", "true");
});

test("fechar sem alteração devolve o foco ao botão que abriu o formulário", async ({ page }) => {
  await irPara(page, "Professores");
  // A segunda linha: se o foco voltasse para "o primeiro Editar", o teste acusaria.
  const editar = page.getByRole("row", { name: /Bruno Lima/ }).getByRole("button", { name: "Editar" });
  await editar.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(editar).toBeFocused();
});

test("recusar o descarte devolve o foco ao formulário", async ({ page }) => {
  await abrir(page);
  const nome = page.getByRole("dialog").getByLabel("Nome", { exact: true });
  await nome.fill("Ana S.");
  await page.keyboard.press("Escape");
  const aviso = page.getByRole("alertdialog");
  await aviso.getByRole("button", { name: "Cancelar" }).click();
  await expect(aviso).toHaveCount(0);
  // Volta para onde estava quando a confirmação abriu, não para o `body`.
  await expect(nome).toBeFocused();
});

test("empate na coluna ordenada fica em ordem de nome, nos dois sentidos", async ({ page }) => {
  await irPara(page, "Professores");
  const disciplinas = page.getByRole("columnheader", { name: "Disciplinas" });
  const linhas = page.getByRole("row");

  // Coluna numérica começa do maior; os dois da semente empatam em zero.
  await disciplinas.getByRole("button").click();
  await expect(disciplinas).toHaveAttribute("aria-sort", "descending");
  await expect(linhas.nth(1)).toContainText("Ana Souza");
  await expect(linhas.nth(2)).toContainText("Bruno Lima");

  // Inverter o sentido não inverte o desempate.
  await disciplinas.getByRole("button").click();
  await expect(disciplinas).toHaveAttribute("aria-sort", "ascending");
  await expect(linhas.nth(1)).toContainText("Ana Souza");
  await expect(linhas.nth(2)).toContainText("Bruno Lima");
});

test("remover não deixa o foco no botão de outra linha", async ({ page }) => {
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Remover" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover professor" }).click();
  await expect(page.getByRole("row", { name: /Ana Souza/ })).toHaveCount(0);
  // A linha seguinte sobe para o lugar da removida. Se a linha fosse a posição
  // na lista, o foco ficaria no "Remover" dela, e um Enter a mais pediria para
  // remover outro professor.
  await expect(page.getByRole("row", { name: /Bruno Lima/ }).getByRole("button", { name: "Remover" })).not.toBeFocused();
});

test("falha ao recarregar depois de gravar aparece na página, com o formulário já fechado", async ({ page, banco }) => {
  await abrir(page);
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  // A gravação mexe só em `professores`; a consulta da lista lê também esta
  // tabela. Sem ela, a gravação dá certo e é a recarga que falha.
  banco.exec("ALTER TABLE indisponibilidades RENAME TO indisponibilidades_fora");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("indisponibilidades");
  expect(contar(banco, "SELECT COUNT(*) FROM professores WHERE nome = 'Ana S.'")).toBe(1);
});
