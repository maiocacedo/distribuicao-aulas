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
  await page.getByLabel("Aulas da fatia 1").fill("2");
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

test.describe("contraturno do período", () => {
  const ROTULO_1 = "Máx. de obrigatórias no contraturno (1º período)";
  const ROTULO_2 = "Máx. de obrigatórias no contraturno (2º período)";
  const AVISO = "Use um número inteiro, zero ou maior.";
  const gravado = (banco: Parameters<typeof contar>[0], numero: number) =>
    contar(banco, "SELECT max_disciplinas_contraturno FROM periodos WHERE curso_id = 1 AND numero = ?", numero);

  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno, max_disciplinas_contraturno) VALUES (1, 1, 'manha', 0), (1, 2, 'manha', 2);`,
  });

  test("esvaziar a caixa com 0 gravado recusa e devolve o 0", async ({ page, banco }) => {
    await irPara(page, "Períodos");
    const caixa = page.getByLabel(ROTULO_1);
    await caixa.fill("");
    await caixa.blur();
    await expect(page.getByText(AVISO)).toBeVisible();
    // Recusa de digitação: informa e some. Não é o aviso de erro, que fica até ser fechado.
    const aviso = page.locator("[data-sonner-toast]", { hasText: AVISO });
    await expect(aviso).not.toHaveAttribute("data-type", "error");
    expect(await aviso.locator("[data-close-button]").count()).toBe(0);
    await expect(caixa).toHaveValue("0");
    expect(gravado(banco, 1)).toBe(0);
  });

  for (const [descricao, texto] of [
    ["negativo", "-3"],
    ["decimal", "1.5"],
    ["vazio", ""],
  ] as const) {
    test(`${descricao} não grava e a caixa volta ao valor gravado`, async ({ page, banco }) => {
      await irPara(page, "Períodos");
      const caixa = page.getByLabel(ROTULO_2);
      await caixa.fill(texto);
      await caixa.blur();
      await expect(page.getByText(AVISO)).toBeVisible();
      await expect(caixa).toHaveValue("2");
      expect(gravado(banco, 2)).toBe(2);
    });
  }

  test("um valor válido grava", async ({ page, banco }) => {
    await irPara(page, "Períodos");
    const caixa = page.getByLabel(ROTULO_2);
    await caixa.fill("1");
    await caixa.blur();
    await expect(page.getByText("salvo", { exact: true })).toBeVisible();
    await expect(caixa).toHaveValue("1");
    expect(gravado(banco, 2)).toBe(1);
  });

  test.describe("com a gravação falhando", () => {
    test.use({ opcoesPonte: { falharQuando: /^UPDATE periodos SET max_disciplinas_contraturno/ } });

    test("a caixa volta ao valor gravado", async ({ page, banco }) => {
      await irPara(page, "Períodos");
      const caixa = page.getByLabel(ROTULO_2);
      await caixa.fill("5");
      await caixa.blur();
      await expect(page.getByText(/falha simulada/)).toBeVisible();
      await expect(caixa).toHaveValue("2");
      expect(gravado(banco, 2)).toBe(2);
    });
  });
});
