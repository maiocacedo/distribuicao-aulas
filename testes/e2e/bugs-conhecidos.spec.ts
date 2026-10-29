import { expect, test } from "./fixtures";
import { celula, contar, escolher, escolhida, irPara, linhaCom, responderConfirmacoes } from "./paginas";

test.describe("B2", () => {
  test.use({ semente: "INSERT INTO cursos (id, nome) VALUES (2, 'Zeta');" });

  test("B2: excluir curso com disciplinas remove tudo junto", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Gerenciar cursos");
    const linha = page.getByRole("row", { name: /Engenharia/ });
    await expect(linha).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM disciplinas WHERE curso_id = 1")).toBeGreaterThan(0);
    await linha.getByRole("button", { name: "Remover" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM disciplinas WHERE curso_id = 1"), { timeout: 3_000 }).toBe(0);
  });
});

test("B3: mudar o período da disciplina leva as aulas junto", async ({ page, banco }) => {
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
  expect(d).toBeTruthy();
  const novo = d.periodo === 8 ? 7 : d.periodo + 1;
  const antes = contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = ?", d.id);
  expect(antes).toBeGreaterThan(0);

  await irPara(page, "Disciplinas");
  await linhaCom(page, d.nome).getByRole("button", { name: "Editar" }).click();
  const periodo = page.getByRole("dialog").getByRole("combobox", { name: "Período", exact: true });
  await expect(periodo).toBeVisible();
  await escolher(periodo, new RegExp(`^${novo}º`));

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect
    .poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = ? AND periodo = ?", d.id, d.periodo), {
      timeout: 3_000,
    })
    .toBe(0);
  // As aulas têm de ir junto para o novo período, não ser apagadas.
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = ? AND periodo = ?", d.id, novo)).toBe(antes);
});

test("B8: limpar período preserva as aulas fixadas", async ({ page, banco }) => {
  banco.exec(`UPDATE alocacoes SET fixada = 1
               WHERE rowid = (SELECT rowid FROM alocacoes WHERE curso_id = 1 AND periodo = 1 LIMIT 1)`);
  await page.reload();
  await responderConfirmacoes(page);
  await irPara(page, "Manual");
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND fixada = 1")).toBe(1);
  const limpar = page.getByRole("button", { name: "Limpar período" });
  await expect(limpar).toBeVisible();
  await limpar.click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1 AND periodo = 1"), { timeout: 3_000 }).toBe(1);
});

test.describe("B5", () => {
  test.use({ opcoesPonte: { falharQuando: /^SELECT indice, turno FROM horarios/ } });

  test("B5: erro ao carregar a grade automática aparece na tela", async ({ page }) => {
    const botao = page.getByRole("navigation").getByRole("button", { name: "Automática", exact: true });
    await expect(botao).toBeVisible();
    await botao.click();
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
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
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
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
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
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
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

  test("I2: tirar o sábado com aula no sábado avisa, e cancelar não muda nada", async ({ page, banco }) => {
    await irPara(page, "Regras");
    const semana = page.getByLabel("Semana");
    await expect(semana).toBeVisible();
    const mensagens = await responderConfirmacoes(page, "recusar");
    await escolher(semana, "Segunda a sexta");
    await expect.poll(() => mensagens.join("\n")).toMatch(/aulas? no sábado/i);
    await expect.poll(() => escolhida(semana)).toBe("Segunda a sábado");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 5")).toBe(1);
    expect(contar(banco, "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'")).toBe(6);
  });

  test("I2: confirmar apaga as aulas do sábado e grava 5 dias", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Regras");
    await escolher(page.getByLabel("Semana"), "Segunda a sexta");
    await expect.poll(() => contar(banco, "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'")).toBe(5);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 5")).toBe(0);
  });
});
