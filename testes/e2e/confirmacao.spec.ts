import { expect, test } from "./fixtures";
import { contar, irPara } from "./paginas";

test.use({ semMassa: true, semente: "INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');" });

test("a confirmação abre com o foco em Cancelar e Esc cancela", async ({ page, banco }) => {
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Remover" }).click();
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo).toContainText("Remover Ana Souza?");
  await expect(dialogo.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialogo).toHaveCount(0);
  expect(contar(banco, "SELECT COUNT(*) FROM professores")).toBe(1);
});

test("o botão de confirmar diz o que faz e executa", async ({ page, banco }) => {
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Remover" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover professor" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM professores")).toBe(0);
});
