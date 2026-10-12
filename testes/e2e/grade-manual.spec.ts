import { expect, test } from "./fixtures";
import { celula, contar, escolher, irPara } from "./paginas";

const BASE = `
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
`;

test.describe("turno forçado", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, turno) VALUES (1, 1, 'Cálculo', 1, 2, 0, 'tarde');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);`,
  });

  test("a célula fora do turno forçado diz por quê", async ({ page }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await expect(celula(page, "Segunda", "M1")).toContainText("Disciplina só à tarde");
    await expect(celula(page, "Segunda", "T1")).toContainText("Alocar");
  });
});

test.describe("sala", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (1, 1, 2), (1, 2, 1);`,
  });

  test("a aula vai para a sala ideal", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await celula(page, "Segunda", "M1").click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });

  test("a sala se troca pela célula", async ({ page, banco }) => {
    banco.exec(
      "INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 2)",
    );
    await page.reload();
    await irPara(page, "Manual");
    await escolher(page.getByRole("combobox", { name: "Trocar sala de Cálculo" }), "A01 (aceitável)");
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
  });
});

test.describe("sala fora do requisito", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'Lab 1', 'Laboratório', 30);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, tipo_sala) VALUES (1, 1, 'Química', 1, 2, 'Laboratório');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 1);`,
  });

  test("a troca mostra a sala atual e a leva para o laboratório", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const sala = page.getByRole("combobox", { name: "Trocar sala de Química" });
    await sala.click();
    await expect(page.getByRole("option", { name: "A01 (atual, fora do requisito)" })).toHaveAttribute("data-state", "checked");
    await page.getByRole("option", { name: "Lab 1", exact: true }).click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });
});

test.describe("diagnóstico", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Cálculo', 1, 2, 0), (2, 2, 'Física', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id)
        VALUES (1, 1, 0, 0, 1, 1), (2, 1, 0, 0, 2, 1);`,
  });

  test("lista a aula que choca com outro curso", async ({ page }) => {
    await irPara(page, "Manual");
    const resumo = page.getByText("1 aula(s) deste curso violam regra dura");
    await expect(resumo).toBeVisible();
    await resumo.click();
    await expect(page.getByText(/A\. Souza em Beta/)).toBeVisible();
  });
});

test.describe("oferta", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, ofertada)
        VALUES (1, 1, 'Cálculo', 1, 2, 0, 1), (2, 1, 'Libras', 1, 2, 0, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);`,
  });

  test("disciplina não ofertada não aparece nas pendências", async ({ page }) => {
    await irPara(page, "Manual");
    await expect(page.getByRole("button", { name: /Cálculo/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Libras/ })).toHaveCount(0);
  });
});

test.describe("avisos da pendência", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 4, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 0, 3, 1, 1);`,
  });

  test("avisa dois blocos no mesmo dia", async ({ page }) => {
    await irPara(page, "Manual");
    await expect(page.getByText("dois blocos no mesmo dia")).toBeVisible();
  });
});

test.describe("aula sem sala em disciplina que exige sala", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, NULL);`,
  });

  test("a célula oferece onde corrigir", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const sala = page.getByRole("combobox", { name: "Trocar sala de Cálculo" });
    await expect(sala).toContainText("sem sala");
    await escolher(sala, "A01");
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
  });
});

test.describe("aula órfã", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO professores (id, nome) VALUES (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (1, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 2);
      PRAGMA foreign_keys = OFF;
      DELETE FROM disciplina_professores WHERE professor_id = 2;
      PRAGMA foreign_keys = ON;`,
  });

  test("entra no diagnóstico", async ({ page }) => {
    await irPara(page, "Manual");
    await page.getByText("1 aula(s) deste curso violam regra dura").click();
    await expect(page.getByText(/este professor não leciona mais a disciplina/)).toBeVisible();
  });
});

test.describe("aula órfã com sala", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40);
      INSERT INTO professores (id, nome) VALUES (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (1, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 2, 1);
      PRAGMA foreign_keys = OFF;
      DELETE FROM disciplina_professores WHERE professor_id = 2;
      PRAGMA foreign_keys = ON;`,
  });

  test("mostra a sala como texto, sem seletor", async ({ page }) => {
    await irPara(page, "Manual");
    await expect(celula(page, "Segunda", "M1")).toContainText("A01");
    await expect(celula(page, "Segunda", "M1").getByRole("combobox")).toHaveCount(0);
  });
});

test.describe("sala: lista aberta", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (1, 1, 2), (1, 2, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 2);`,
  });

  test("o botão direito sobre a lista de salas não fixa a aula", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await page.getByRole("combobox", { name: "Trocar sala de Cálculo" }).click();
    await page.getByRole("listbox").dispatchEvent("contextmenu");
    // Marco: a troca de sala entra na mesma fila de gravação; se o botão
    // direito tivesse fixado a aula, a fixação já estaria gravada.
    await page.getByRole("option", { name: "A01 (aceitável)" }).click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes")).toBe(1);
    expect(contar(banco, "SELECT fixada FROM alocacoes")).toBe(0);
  });

  test("o Esc que fecha a lista de salas mantém a pendência; o seguinte a solta", async ({ page }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("combobox", { name: "Trocar sala de Cálculo" }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(pendencia).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("aula de contraturno", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id)
        VALUES (1, 1, 0, (SELECT indice FROM horarios WHERE codigo = 'T1'), 1, 1);`,
  });

  test("o ponto de fora do turno não cobre os botões e tem texto", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const aula = celula(page, "Segunda", "T1");
    await expect(aula).toContainText("fora do turno");
    await aula.hover();
    // O clique de verdade: com o ponto por cima, o Playwright acusaria que
    // outro elemento recebe o clique.
    await aula.getByRole("button", { name: "Fixar" }).click();
    await expect.poll(() => contar(banco, "SELECT fixada FROM alocacoes")).toBe(1);
  });
});

test.describe("disciplina que não exige sala", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 1);`,
  });

  test("a troca de sala oferece 'Sem sala'", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await escolher(page.getByRole("combobox", { name: "Trocar sala de Cálculo" }), "Sem sala");
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE sala_id IS NULL")).toBe(1);
  });
});

test.describe("sala vizinha", () => {
  // A02 é só aceitável, mas a aula ao lado já está nela: o bloco não troca de sala.
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (1, 1, 1), (1, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 2);`,
  });

  test("a aula ao lado vai para a mesma sala, mesmo havendo uma ideal livre", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await celula(page, "Segunda", "M2").click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE sala_id = 2")).toBe(2);
  });
});

test.describe("limpar período", () => {
  // O motivo em texto e o botão habilitado ao soltar já têm teste em desfazer.spec.ts;
  // aqui fica o que lá não se afirma: o botão é `disabled` de verdade.
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, fixada) VALUES (1, 1, 0, 0, 1, 1, 1);`,
  });

  test("fica desabilitado quando só há aula fixada, e habilita ao soltar", async ({ page }) => {
    await irPara(page, "Manual");
    const limpar = page.getByRole("button", { name: "Limpar período" });
    await expect(limpar).toBeDisabled();
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Soltar" }).click();
    await expect(limpar).toBeEnabled();
  });
});
