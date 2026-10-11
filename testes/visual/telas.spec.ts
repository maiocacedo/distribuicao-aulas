import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../e2e/fixtures";
import { celula, irPara } from "../e2e/paginas";

/** Cada tela, com o que precisa estar visível para ela estar pronta. */
const TELAS: { id: string; rotulo: string; pronta: (p: Page) => Locator }[] = [
  { id: "periodos", rotulo: "Períodos", pronta: (p) => p.getByRole("cell").first() },
  { id: "disciplinas", rotulo: "Disciplinas", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "professores", rotulo: "Professores", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "salas", rotulo: "Salas", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "indisponibilidades", rotulo: "Indisponibilidades", pronta: (p) => p.getByRole("main").getByRole("listitem").first() },
  { id: "tipos", rotulo: "Tipos de disciplina", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "regras", rotulo: "Regras", pronta: (p) => p.getByLabel("Semana") },
  { id: "grade-manual", rotulo: "Manual", pronta: (p) => celula(p, "Segunda", "M1") },
  { id: "grade-automatica", rotulo: "Automática", pronta: (p) => p.getByRole("button", { name: "Gerar grade" }) },
  { id: "cursos", rotulo: "Gerenciar cursos", pronta: (p) => p.getByRole("row").nth(1) },
];

for (const [esquema, sufixo] of [["light", "claro"], ["dark", "escuro"]] as const) {
  test.describe(sufixo, () => {
    test.use({ colorScheme: esquema });

    for (const tela of TELAS) {
      test(tela.rotulo, async ({ page }) => {
        await irPara(page, tela.rotulo);
        await expect(tela.pronta(page)).toBeVisible();
        await expect(page).toHaveScreenshot(`${tela.id}-${sufixo}.png`, { fullPage: true });
      });
    }

    test("Disciplinas, editor aberto", async ({ page }) => {
      await irPara(page, "Disciplinas");
      await page.getByRole("row").nth(1).getByRole("button", { name: "Editar" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page).toHaveScreenshot(`disciplinas-editor-${sufixo}.png`);
    });

    test("Manual, pendência escolhida", async ({ page, banco }) => {
      // A massa tem o 1º período fechado. Tirar as aulas da segunda-feira abre
      // pendências (células aptas e impedidas) e fixar uma aula mostra o cadeado.
      banco.exec(`
        DELETE FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND dia = 0;
        UPDATE alocacoes SET fixada = 1
         WHERE rowid = (SELECT rowid FROM alocacoes WHERE curso_id = 1 AND periodo = 1 ORDER BY dia, hora LIMIT 1);
      `);
      await page.reload();
      await irPara(page, "Manual");
      await expect(celula(page, "Segunda", "M1")).toBeVisible();
      // Primeira pendência incompleta, na ordem da lista (a mesma toda vez).
      const pendencia = page.getByRole("main").getByRole("listitem").filter({ has: page.locator("button:not(.completa)") }).first().getByRole("button");
      await pendencia.click();
      await expect(pendencia).toHaveAttribute("aria-pressed", "true");
      await expect(page).toHaveScreenshot(`grade-manual-escolhida-${sufixo}.png`, { fullPage: true });
    });
  });
}
