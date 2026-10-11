import { expect, test } from "./fixtures";
import { contar, escolher, irPara, linhaCom, responderConfirmacoes } from "./paginas";

const editar = async (page: import("@playwright/test").Page, nome: string) => {
  await irPara(page, "Disciplinas");
  await linhaCom(page, nome).getByRole("button", { name: "Editar" }).click();
};

test.describe("oferta", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Libras', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 0, 1, 1, 1);`,
  });

  test("desmarcar Ofertada confirma e apaga as aulas", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page);
    await editar(page, "Libras");
    await page.getByRole("checkbox", { name: /Ofertada/ }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT ofertada FROM disciplinas WHERE id = 1")).toBe(0);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1")).toBe(0);
    expect(mensagens.join("\n")).toMatch(/2 aula\(s\) desta disciplina serão apagadas/);
    // Quantas e quais: uma linha por aula, com o horário e o motivo.
    expect(mensagens.join("\n")).toMatch(/Segunda M1 — Disciplina não ofertada/);
  });

  test("cancelar a confirmação não muda nada", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page, "recusar");
    await editar(page, "Libras");
    await page.getByRole("checkbox", { name: /Ofertada/ }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    // Sem esperar o diálogo, as asserções do banco correriam antes do salvar.
    await expect.poll(() => mensagens.length).toBe(1);
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    expect(contar(banco, "SELECT ofertada FROM disciplinas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });
});

test.describe("B9", () => {
  test.use({
    semMassa: true,
    semente: `
      DELETE FROM padroes_blocos WHERE aulas = 5;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Projeto', 1, 6);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 5), (1, 2, 1);`,
  });

  test("B9: o aviso de padrão olha a fatia de cada professor", async ({ page, banco }) => {
    expect(contar(banco, "SELECT COUNT(*) FROM padroes_blocos WHERE aulas = 6")).toBeGreaterThan(0);
    await editar(page, "Projeto");
    await expect(page.getByText(/fatia\(s\) de 5 aula\(s\)/)).toBeVisible();
  });
});

test.describe("preferência de sala", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (1, 1, 1), (1, 2, 1);`,
  });

  test("marca uma sala como só aceitável", async ({ page, banco }) => {
    await editar(page, "Cálculo");
    await escolher(page.getByLabel("Preferência por A02"), "aceitável");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect
      .poll(() => contar(banco, "SELECT preferencia FROM disciplina_salas WHERE disciplina_id = 1 AND sala_id = 2"))
      .toBe(2);
    expect(contar(banco, "SELECT preferencia FROM disciplina_salas WHERE disciplina_id = 1 AND sala_id = 1")).toBe(1);
  });
});

test.describe("B3 com choque", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Cálculo', 1, 1, 0), (2, 1, 'Física', 2, 1, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1), (2, 2, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id)
        VALUES (1, 1, 0, 0, 1, 1), (1, 2, 0, 0, 2, 2);`,
  });

  test("mudar para um período com o horário ocupado é recusado", async ({ page, banco }) => {
    await editar(page, "Cálculo");
    await escolher(page.getByRole("dialog").getByRole("combobox", { name: "Período", exact: true }), /^2º/);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/2º período já tem aula em Segunda M1/)).toBeVisible();
    expect(contar(banco, "SELECT periodo FROM disciplinas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT periodo FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
  });
});

test.describe("sala inválida é reatribuída, não apagada", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'Lab 1', 'Laboratório', 30);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Cálculo', 1, 2, 1), (2, 1, 'Química', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id)
        VALUES (1, 1, 0, 0, 1, 1, 1), (1, 1, 0, 1, 1, 1, 1), (1, 1, 1, 0, 2, 1, NULL), (1, 1, 1, 1, 2, 1, NULL);`,
  });

  test("deixar de ocupar sala mantém as aulas, sem sala e sem diálogo", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page, "recusar");
    await editar(page, "Cálculo");
    await escolher(page.getByLabel(/^Requisito/), "Não ocupa sala");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT exige_sala FROM disciplinas WHERE id = 1")).toBe(0);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND sala_id IS NULL")).toBe(2);
    expect(mensagens).toEqual([]);
  });

  test("passar a exigir laboratório leva as aulas para o laboratório livre", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page, "recusar");
    await editar(page, "Química");
    await escolher(page.getByLabel(/^Requisito/), "Qualquer sala de um tipo");
    await escolher(page.getByLabel(/^Tipo exigido/), /^Laboratório/);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect
      .poll(() => contar(banco, "SELECT tipo_sala = 'Laboratório' FROM disciplinas WHERE id = 2"))
      .toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 2 AND sala_id = 2")).toBe(2);
    expect(mensagens).toEqual([]);
  });
});

test.describe("sem sala válida livre", () => {
  // O único laboratório está tomado por outro período no horário da aula.
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'Lab 1', 'Laboratório', 30);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, tipo_sala)
        VALUES (1, 1, 'Cálculo', 1, 1, 1, NULL), (2, 1, 'Química', 2, 1, 1, 'Laboratório');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1), (2, 2, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id)
        VALUES (1, 1, 0, 0, 1, 1, 1), (1, 2, 0, 0, 2, 2, 2);`,
  });

  const exigirLaboratorio = async (page: import("@playwright/test").Page) => {
    await editar(page, "Cálculo");
    await escolher(page.getByLabel(/^Requisito/), "Qualquer sala de um tipo");
    await escolher(page.getByLabel(/^Tipo exigido/), /^Laboratório/);
  };

  test("exigir um tipo sem sala livre no horário lista a aula e, aceito, a apaga", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page);
    await exigirLaboratorio(page);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect
      .poll(() => contar(banco, "SELECT tipo_sala = 'Laboratório' FROM disciplinas WHERE id = 1"))
      .toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1")).toBe(0);
    // A aula que ocupa o laboratório não é tocada.
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 2 AND sala_id = 2")).toBe(1);
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]).toMatch(/1 aula\(s\) desta disciplina serão apagadas/);
    expect(mensagens[0]).toMatch(/Segunda M1 — sem sala válida livre/);
  });

  test("cancelar mantém a aula, a sala e o requisito", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page, "recusar");
    await exigirLaboratorio(page);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => mensagens.length).toBe(1);
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM disciplinas WHERE id = 1 AND tipo_sala IS NULL")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND sala_id = 1")).toBe(1);
  });
});
