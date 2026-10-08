import { expect, test } from "./fixtures";
import { aceitarConfirmacoes, celula, contar, irPara } from "./paginas";

test.describe("B2", () => {
  test.use({ semente: "INSERT INTO cursos (id, nome) VALUES (2, 'Zeta');" });

  test("B2: excluir curso com disciplinas remove tudo junto", async ({ page, banco }) => {
    test.fail(true, "B2 — falta ON DELETE CASCADE; corrigir no subprojeto 1");
    aceitarConfirmacoes(page);
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Remover" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM disciplinas WHERE curso_id = 1"), { timeout: 3_000 }).toBe(0);
  });
});

test("B3: mudar o período da disciplina leva as aulas junto", async ({ page, banco }) => {
  test.fail(true, "B3 — aulas ficam no período antigo; corrigir no subprojeto 1");
  const d = banco
    .prepare(
      `SELECT d.id, d.nome, d.periodo FROM disciplinas d
        WHERE d.curso_id = 1
          AND EXISTS (SELECT 1 FROM alocacoes a WHERE a.disciplina_id = d.id)
          AND d.aulas_semanais = (SELECT SUM(aulas) FROM disciplina_professores dp WHERE dp.disciplina_id = d.id)
          AND (SELECT COUNT(*) FROM disciplinas x WHERE x.nome = d.nome) = 1
        ORDER BY d.id LIMIT 1`,
    )
    .get() as { id: number; nome: string; periodo: number };
  const novo = d.periodo === 8 ? 7 : d.periodo + 1;

  await irPara(page, "Disciplinas");
  await page
    .locator("tr", { has: page.getByText(d.nome, { exact: true }) })
    .getByRole("button", { name: "Editar" })
    .click();
  await page.locator(".modal select").first().selectOption(String(novo));
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect
    .poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = ? AND periodo = ?", d.id, d.periodo), {
      timeout: 3_000,
    })
    .toBe(0);
});

test("B8: limpar período preserva as aulas fixadas", async ({ page, banco }) => {
  test.fail(true, "B8 — o DELETE ignora fixada; corrigir no subprojeto 1");
  banco.exec(`UPDATE alocacoes SET fixada = 1
               WHERE rowid = (SELECT rowid FROM alocacoes WHERE curso_id = 1 AND periodo = 1 LIMIT 1)`);
  await page.reload();
  aceitarConfirmacoes(page);
  await irPara(page, "Manual");
  await page.getByRole("button", { name: "Limpar período" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1 AND periodo = 1"), { timeout: 3_000 }).toBe(1);
});

test.describe("B5", () => {
  test.use({ opcoesPonte: { falharQuando: /^SELECT indice, turno FROM horarios/ } });

  test("B5: erro ao carregar a grade automática aparece na tela", async ({ page }) => {
    test.fail(true, "B5 — o return null vem antes do <Erro>; corrigir no subprojeto 1");
    await irPara(page, "Automática");
    await expect(page.getByText(/falha simulada/)).toBeVisible({ timeout: 3_000 });
  });
});

const DOIS_CURSOS = `
  UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
  INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
`;

test.describe("I1 — sala", () => {
  test.use({
    semMassa: true,
    semente: `${DOIS_CURSOS}
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2), (2, 2, 'Física', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (2, 1, 0, 0, 2, 2, 1);
    `,
  });

  test("I1: sala usada por outro curso aparece como impedida", async ({ page }) => {
    test.fail(true, "I1 — a grade manual só olha o próprio curso; corrigir no subprojeto 1");
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await expect(celula(page, "Segunda", "M1")).toContainText(/A01|Beta|ocupad/i, { timeout: 3_000 });
  });
});

test.describe("I1 — professor", () => {
  test.use({
    semMassa: true,
    semente: `${DOIS_CURSOS}
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Cálculo', 1, 2, 0), (2, 2, 'Física', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (2, 1, 0, 0, 2, 1);
    `,
  });

  test("I1: professor ocupado em outro curso aparece como impedido", async ({ page }) => {
    test.fail(true, "I1 — a grade manual só olha o próprio curso; corrigir no subprojeto 1");
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await expect(celula(page, "Segunda", "M1")).toContainText(/A\. Souza|Beta/, { timeout: 3_000 });
  });
});

test.describe("B4 — grade manual", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome, max_dias_semana) VALUES (1, 'Ana Souza', 1);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1);
    `,
  });

  test("B4: segundo dia é barrado para professor com máximo de 1 dia", async ({ page }) => {
    test.fail(true, "B4 — max_dias_semana não é checado; corrigir no subprojeto 1");
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await expect(celula(page, "Terça", "M1")).toContainText(/máx|dias/i, { timeout: 3_000 });
  });
});

test.describe("I2", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, permite_sabado)
        VALUES (1, 1, 'Cálculo', 1, 1, 0, 1);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 5, 0, 1, 1);
    `,
  });

  // Ao corrigir, a mensagem deve conter "aula(s) no sábado"; se a solução for um
  // diálogo, troque a asserção pela captura do diálogo.
  test("I2: tirar o sábado com aula no sábado avisa", async ({ page }) => {
    test.fail(true, "I2 — as aulas de sábado somem sem aviso; corrigir no subprojeto 1");
    await irPara(page, "Regras");
    await page.getByLabel("Semana").selectOption("5");
    await expect(page.getByText(/aulas? no sábado/i)).toBeVisible({ timeout: 3_000 });
  });
});
