import { expect, test } from "./fixtures";
import { contar, escolher, irPara, linhaCom, responderConfirmacoes } from "./paginas";

test.describe("tipos de disciplina", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO tipos_disciplina (id, nome, exige_sala, tipo_sala) VALUES (1, 'Tipo Alfa', 1, NULL);`,
  });

  test("criar um tipo grava o nome e o requisito de sala", async ({ page, banco }) => {
    await irPara(page, "Tipos de disciplina");
    await page.getByRole("button", { name: "Novo tipo" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Nome").fill("Tipo Beta");
    await escolher(dialogo.getByLabel(/^Requisito/), "Qualquer sala de um tipo");
    await escolher(dialogo.getByLabel(/^Tipo exigido/), /^Laboratório/);
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(linhaCom(page, "Tipo Beta")).toBeVisible();
    expect(
      contar(banco, "SELECT COUNT(*) FROM tipos_disciplina WHERE nome = ? AND exige_sala = 1 AND tipo_sala = 'Laboratório'", "Tipo Beta"),
    ).toBe(1);
  });

  test("editar um tipo muda o nome e o requisito", async ({ page, banco }) => {
    await irPara(page, "Tipos de disciplina");
    await linhaCom(page, "Tipo Alfa").getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Nome").fill("Tipo Alfa 2");
    await escolher(dialogo.getByLabel(/^Requisito/), "Não ocupa sala");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(linhaCom(page, "Tipo Alfa 2")).toBeVisible();
    expect(
      contar(banco, "SELECT COUNT(*) FROM tipos_disciplina WHERE id = 1 AND nome = 'Tipo Alfa 2' AND exige_sala = 0 AND tipo_sala IS NULL"),
    ).toBe(1);
  });

  test("nome vazio mostra o erro junto do campo e não grava", async ({ page, banco }) => {
    await irPara(page, "Tipos de disciplina");
    await page.getByRole("button", { name: "Novo tipo" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(dialogo.getByText("O nome é obrigatório.")).toBeVisible();
    await expect(dialogo.getByLabel("Nome")).toHaveAttribute("aria-invalid", "true");
    expect(contar(banco, "SELECT COUNT(*) FROM tipos_disciplina")).toBe(1);
  });

  test("remover um tipo, com a confirmação, tira da lista e do banco", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page);
    await irPara(page, "Tipos de disciplina");
    await linhaCom(page, "Tipo Alfa").getByRole("button", { name: "Remover" }).click();
    await expect(linhaCom(page, "Tipo Alfa")).toHaveCount(0);
    expect(contar(banco, "SELECT COUNT(*) FROM tipos_disciplina")).toBe(0);
    // Sem disciplina com o tipo, a confirmação não fala de disciplinas.
    expect(mensagens[0]).not.toContain("disciplina");
  });

  test("a confirmação de remover diz quantas disciplinas ficam sem tipo", async ({ page, banco }) => {
    banco.exec(`
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, tipo_id) VALUES (1, 1, 'Cálculo', 1, 2, 1), (2, 1, 'Física', 1, 2, 1);`);
    const mensagens = await responderConfirmacoes(page);
    await page.reload();
    await irPara(page, "Tipos de disciplina");
    await linhaCom(page, "Tipo Alfa").getByRole("button", { name: "Remover" }).click();
    await expect(linhaCom(page, "Tipo Alfa")).toHaveCount(0);
    expect(mensagens[0]).toContain("2 disciplina(s) ficam sem tipo e conservam as propriedades que já têm.");
    expect(contar(banco, "SELECT COUNT(*) FROM disciplinas WHERE tipo_id IS NULL")).toBe(2);
  });
});
