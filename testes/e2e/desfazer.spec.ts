import { expect, test } from "./fixtures";
import { celula, contar, irPara, responderConfirmacoes } from "./paginas";

const SEMENTE = `
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
  INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 4, 0);
  INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4);
  INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 0, 1, 1, 1);`;

test.use({ semMassa: true, semente: SEMENTE });

const total = (banco: import("node:sqlite").DatabaseSync) => contar(banco, "SELECT COUNT(*) FROM alocacoes");

test("clicar na aula não a remove; o botão remove e o toast desfaz", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").click();
  await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
  expect(total(banco)).toBe(2);

  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(() => total(banco)).toBe(1);
  await page.getByRole("button", { name: "Desfazer" }).last().click(); // o do toast
  await expect.poll(() => total(banco)).toBe(2);
  await expect(page.getByText("Desfeito: Remover Cálculo")).toBeVisible();
});

test("Ctrl+Z desfaz a alocação", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Terça", "M1").click();
  await expect.poll(() => total(banco)).toBe(3);
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
  await expect(celula(page, "Terça", "M1")).not.toContainText("Cálculo");
});

test("o botão Desfazer começa desabilitado e desfaz em ordem", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const desfazer = page.getByRole("main").getByRole("button", { name: "Desfazer" });
  await expect(desfazer).toBeDisabled();
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await celula(page, "Segunda", "M2").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(() => total(banco)).toBe(0);
  await desfazer.click();
  await expect.poll(() => total(banco)).toBe(1);
  await desfazer.click();
  await expect.poll(() => total(banco)).toBe(2);
  await expect(desfazer).toBeDisabled();
});

test("limpar período confirma, e desfazer devolve as aulas", async ({ page, banco }) => {
  const mensagens = await responderConfirmacoes(page);
  await irPara(page, "Manual");
  await page.getByRole("button", { name: "Limpar período" }).click();
  await expect.poll(() => total(banco)).toBe(0);
  expect(mensagens.join("\n")).toMatch(/Apagar as aulas do 1º período\?/);
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
});

test("fixar pelo botão, e a aula fixada não pode ser removida", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const aula = celula(page, "Segunda", "M1");
  await aula.getByRole("button", { name: "Fixar" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(1);
  await expect(aula.getByRole("button", { name: "Remover aula" })).toBeDisabled();
  await aula.getByRole("button", { name: "Soltar" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(0);
});

test("uma alteração de cadastro zera o histórico", async ({ page }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeEnabled();
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await irPara(page, "Manual");
  await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeDisabled();
});

test("as células vazias são alcançáveis pelo teclado", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Quarta", "M1").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => total(banco)).toBe(3);
});

test("remover de aula fixada não age por clique, Enter nem Espaço, e a dica diz o motivo", async ({ page, banco }) => {
  banco.exec("UPDATE alocacoes SET fixada = 1 WHERE dia = 0 AND hora = 0");
  await page.reload();
  await irPara(page, "Manual");
  const fixada = celula(page, "Segunda", "M1");
  const remover = fixada.getByRole("button", { name: "Remover aula" });
  await expect(remover).toBeDisabled();
  // `force`: o Playwright esperaria o botão habilitar; o que se confere aqui é
  // justamente o clique no desabilitado.
  await remover.click({ force: true });
  // Chega pelo teclado, a partir do vizinho: é o foco de teclado que abre a dica.
  await fixada.getByRole("button", { name: "Soltar" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(remover).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText("Solte o cadeado para remover");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  // Marco: uma gravação que vem depois das três tentativas. Se alguma delas
  // tivesse removido a aula fixada, a contagem aqui seria 0.
  await celula(page, "Segunda", "M2").getByRole("button", { name: "Remover aula" }).click();
  await expect(celula(page, "Segunda", "M2")).not.toContainText("Cálculo");
  expect(total(banco)).toBe(1);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 0 AND hora = 0 AND fixada = 1")).toBe(1);
  await expect(fixada).toContainText("Cálculo");
});

test("sem o que desfazer, o botão é alcançável pelo teclado e diz por quê", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const desfazer = page.getByRole("main").getByRole("button", { name: "Desfazer" });
  await expect(desfazer).toBeDisabled();
  await page.getByRole("button", { name: "Limpar período" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(desfazer).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText("Nada para desfazer");
  await page.keyboard.press("Enter");
  await desfazer.click({ force: true });
  // Marco: uma ação de verdade depois das tentativas; nada foi desfeito antes dela.
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect(desfazer).toBeEnabled();
  expect(total(banco)).toBe(1);
  expect(await page.getByText(/^Desfeito/).count()).toBe(0);
  // Com o que desfazer, a dica diz o quê.
  await page.getByRole("button", { name: "Limpar período" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("tooltip")).toHaveText("Desfazer: Remover Cálculo (Ctrl+Z)");
});

test("segurar Ctrl+Z desfaz uma ação só", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await celula(page, "Segunda", "M2").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(() => total(banco)).toBe(0);
  await page.keyboard.down("Control");
  await page.keyboard.down("z");
  await page.keyboard.down("z"); // sem soltar: chega com `repeat`
  await page.keyboard.down("z");
  await page.keyboard.up("z");
  await page.keyboard.up("Control");
  await expect(page.getByText("Desfeito: Remover Cálculo")).toBeVisible();
  await expect(celula(page, "Segunda", "M2")).toContainText("Cálculo");
  expect(total(banco)).toBe(1);
  // Um segundo toque é outra ação desfeita.
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
});

test.describe("falha ao gravar", () => {
  test.use({ opcoesPonte: { falharQuando: /^DELETE FROM alocacoes WHERE curso_id = \? AND periodo = \? AND dia/ } });

  test("avisa, e a aula continua na grade", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
    await expect(page.getByText(/falha simulada/)).toBeVisible();
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    expect(total(banco)).toBe(2);
    await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeDisabled();
  });
});

test.describe("falha ao carregar", () => {
  test.use({ opcoesPonte: { falharQuando: /^SELECT \* FROM horarios ORDER BY indice/ } });

  test("o erro aparece na página", async ({ page }) => {
    await irPara(page, "Manual");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("falha simulada");
  });
});
