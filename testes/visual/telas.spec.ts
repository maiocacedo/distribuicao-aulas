import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../e2e/fixtures";
import { celula, contar, irPara, linhaCom } from "../e2e/paginas";

/** Cada tela, com o que precisa estar visível para ela estar pronta. */
const TELAS: { id: string; rotulo: string; pronta: (p: Page) => Locator }[] = [
  { id: "periodos", rotulo: "Períodos", pronta: (p) => p.getByRole("cell").first() },
  { id: "disciplinas", rotulo: "Disciplinas", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "professores", rotulo: "Professores", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "salas", rotulo: "Salas", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "indisponibilidades", rotulo: "Indisponibilidades", pronta: (p) => p.getByRole("main").getByRole("listitem").first() },
  { id: "tipos", rotulo: "Tipos de disciplina", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "regras", rotulo: "Regras", pronta: (p) => p.getByLabel("Semana") },
  { id: "grade-manual", rotulo: "Manual", // Só existe com as aulas carregadas (a massa tem aulas no 1º período).
    pronta: (p) => p.getByText(/^[1-9]\d* de \d+ posições ocupadas$/) },
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
      // A captura inclui o anel de foco do campo Nome (autofoco do diálogo): quem regerar na tarefa que troca o diálogo deve esperar essa diferença.
      await expect(page).toHaveScreenshot(`disciplinas-editor-${sufixo}.png`);
    });

    test("Confirmação", async ({ page }) => {
      await irPara(page, "Professores");
      // Só quem não tem disciplina chega à confirmação (os outros recebem o aviso de uso); na massa, é o Professor 07.
      await linhaCom(page, "Professor 07").getByRole("button", { name: "Remover" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page).toHaveScreenshot(`confirmacao-${sufixo}.png`);
    });

    test("Manual, pendência escolhida", async ({ page, banco }) => {
      // A massa tem o 1º período fechado. Tirar as aulas da segunda-feira abre
      // pendências (células aptas e impedidas) e fixar uma aula mostra o cadeado.
      // dia = 0 é segunda-feira.
      banco.exec(`
        DELETE FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND dia = 0;
        UPDATE alocacoes SET fixada = 1
         WHERE rowid = (SELECT rowid FROM alocacoes WHERE curso_id = 1 AND periodo = 1 ORDER BY dia, hora LIMIT 1);
      `);
      const ocupadas = contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1 AND periodo = 1");
      await page.reload();
      await irPara(page, "Manual");
      // "N de 72 posições ocupadas" só mostra N depois que as aulas chegam;
      // sem isso a lista de pendências pode aparecer com tudo em 0 feitas.
      await expect(page.getByText(new RegExp(`^${ocupadas} de \\d+ posições ocupadas$`))).toBeVisible();
      // Primeira pendência incompleta (progresso "n/m" com n < m), na ordem da lista.
      const itens = page.getByRole("main").getByRole("listitem");
      const textos = await itens.allInnerTexts();
      const indice = textos.findIndex((t) => {
        const m = t.match(/(\d+)\s*\/\s*(\d+)/);
        return m !== null && Number(m[1]) < Number(m[2]);
      });
      if (indice < 0) throw new Error("Nenhuma pendência incompleta na lista: a massa de teste mudou?");
      const pendencia = itens.nth(indice).getByRole("button");
      await pendencia.click();
      await expect(pendencia).toHaveAttribute("aria-pressed", "true");
      await expect(page).toHaveScreenshot(`grade-manual-escolhida-${sufixo}.png`, { fullPage: true });
    });
  });
}
