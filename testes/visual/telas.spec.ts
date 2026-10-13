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

/**
 * `irPara` clica no item da barra e o ponteiro fica ali; sem estacionar, toda
 * captura sairia com aquele item em estado de pouso. O canto inferior direito
 * da janela cai no `<main>` fora de qualquer conteúdo (nenhuma tela chega lá com
 * tabela, botão ou célula) e é o mesmo ponto em todos os testes, com ou sem
 * diálogo aberto (nele, cai sobre o fundo escurecido). Ficou local ao spec: os
 * e2e não precisam disso.
 *
 * Antes de fotografar, repinta a barra lateral. Os itens dela ficam em posição
 * fracionária: acima deles estão o gatilho do curso, com 17,84 px de altura de
 * linha, e o atalho "Gerenciar cursos", com 26,66 px. Em parte das execuções a
 * camada da barra fica com os ícones rasterizados de um desenho anterior (1 a
 * 5 níveis de cor em alguns pixels de três ícones), e isso não se corrige
 * sozinho: fica igual por quanto tempo se espere. Reservar a altura da caixa
 * do curso em `src/App.tsx`, para a barra não mudar de posição quando a lista
 * de cursos chega, não bastou: sem o repinte, a captura clara de "Automática"
 * continuou diferindo da referência na execução completa. Posições inteiras na
 * barra seriam a correção de verdade, e obrigam a regerar todas as
 * referências. Aqui, esconder e mostrar a barra força o desenho final, o mesmo
 * da referência, sem tocar no que é fotografado.
 */
async function capturar(page: Page, nome: string, opcoes: { fullPage?: boolean } = {}) {
  await page.mouse.move(1390, 890);
  // Com um diálogo aberto a barra sai da árvore de acessibilidade, e continua
  // sendo ela a repintar. Se a barra sumir, isto falha em vez de passar calado.
  await page.getByRole("navigation", { includeHidden: true }).evaluate((barra: HTMLElement) => {
    barra.style.display = "none";
    void barra.offsetHeight; // aplica o estilo antes de devolver
    barra.style.removeProperty("display");
  });
  await expect(page).toHaveScreenshot(nome, opcoes);
}

for (const [esquema, sufixo] of [["light", "claro"], ["dark", "escuro"]] as const) {
  test.describe(sufixo, () => {
    test.use({ colorScheme: esquema });

    for (const tela of TELAS) {
      test(tela.rotulo, async ({ page }) => {
        await irPara(page, tela.rotulo);
        await expect(tela.pronta(page)).toBeVisible();
        await capturar(page, `${tela.id}-${sufixo}.png`, { fullPage: true });
      });
    }

    test("Disciplinas, editor aberto", async ({ page }) => {
      await irPara(page, "Disciplinas");
      await page.getByRole("row").nth(1).getByRole("button", { name: "Editar" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // A captura inclui o anel de foco do campo Nome (autofoco do diálogo): quem regerar na tarefa que troca o diálogo deve esperar essa diferença.
      await capturar(page, `disciplinas-editor-${sufixo}.png`);
    });

    test("Indisponibilidades, professor escolhido", async ({ page, banco }) => {
      // A captura da tela sozinha não mostra a malha. Escolhe o professor com mais
      // aulas (células ocupadas) e marca três horários livres dele (células
      // indisponíveis); o resto fica livre, os três estados à vista.
      const { id, nome } = banco
        .prepare(
          `SELECT p.id, p.nome FROM professores p JOIN alocacoes a ON a.professor_id = p.id
            GROUP BY p.id ORDER BY COUNT(*) DESC, p.nome LIMIT 1`,
        )
        .get() as { id: number; nome: string };
      const ocupadas = new Set(
        (banco.prepare("SELECT dia, hora FROM alocacoes WHERE professor_id = ?").all(id) as { dia: number; hora: number }[]).map(
          (a) => `${a.dia}-${a.hora}`,
        ),
      );
      const livres = [[4, 0], [4, 1], [3, 3], [1, 4], [2, 6]].filter(([d, h]) => !ocupadas.has(`${d}-${h}`)).slice(0, 3);
      for (const [dia, hora] of livres) {
        banco.prepare("INSERT INTO indisponibilidades (professor_id, dia, hora) VALUES (?, ?, ?)").run(id, dia, hora);
      }
      await page.reload();
      await irPara(page, "Indisponibilidades");
      await page.getByRole("button", { name: nome }).click();
      await expect(celula(page, "Segunda", "M1")).toBeVisible();
      await capturar(page, `indisponibilidades-escolhido-${sufixo}.png`, { fullPage: true });
    });

    test("Confirmação", async ({ page }) => {
      await irPara(page, "Professores");
      // Só quem não tem disciplina chega à confirmação (os outros recebem o aviso de uso); na massa, é o Professor 07.
      await linhaCom(page, "Professor 07").getByRole("button", { name: "Remover" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await capturar(page, `confirmacao-${sufixo}.png`);
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
      await capturar(page, `grade-manual-escolhida-${sufixo}.png`, { fullPage: true });
    });
  });
}
