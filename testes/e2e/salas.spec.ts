import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { contar, escolher, irPara, responderConfirmacoes } from "./paginas";

const mudarTipo = async (page: Page, sala: string, tipo: string) => {
  await irPara(page, "Salas");
  await page.getByRole("row", { name: new RegExp(sala) }).getByRole("button", { name: "Editar" }).click();
  await escolher(page.getByLabel(/^Tipo/), tipo);
};

test.describe("mudar o tipo da sala com outra sala do tipo livre", () => {
  // A01 tem aulas de dois cursos que exigem 'Sala de Aula' e uma que aceita qualquer sala.
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, tipo_sala) VALUES
        (1, 1, 'Cálculo', 1, 2, 1, 'Sala de Aula'), (2, 2, 'Física', 1, 1, 1, 'Sala de Aula'), (3, 1, 'História', 1, 1, 1, NULL);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 2, 1), (3, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES
        (1, 1, 0, 0, 1, 1, 1), (1, 1, 0, 1, 1, 1, 1), (2, 1, 1, 0, 2, 2, 1), (1, 1, 2, 0, 3, 1, 1);`,
  });

  test("as aulas que exigem o tipo antigo vão para a outra sala, sem diálogo", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page, "recusar");
    await mudarTipo(page, "A01", "Laboratório");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT tipo = 'Laboratório' FROM salas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND sala_id = 2")).toBe(2);
    // Sala é da instituição: a aula do outro curso também muda.
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 2 AND sala_id = 2")).toBe(1);
    // Quem não exige tipo continua onde estava.
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 3 AND sala_id = 1")).toBe(1);
    expect(mensagens).toEqual([]);
    // Três aulas mudaram de sala: duas de uma disciplina e uma de outra.
    await expect(page.getByText("3 aula(s) mudaram de sala")).toBeVisible();
  });

  test("mudar só o nome ou a capacidade não mexe nas aulas", async ({ page, banco }) => {
    await irPara(page, "Salas");
    await page.getByRole("row", { name: /A01/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByLabel(/^Capacidade/).fill("35");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT capacidade FROM salas WHERE id = 1")).toBe(35);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE sala_id = 1")).toBe(4);
  });
});

test.describe("mudar o tipo da sala sem outra sala do tipo", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'Lab 1', 'Laboratório', 30);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, tipo_sala)
        VALUES (1, 1, 'Cálculo', 1, 1, 1, 'Sala de Aula');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 1);`,
  });

  test("o diálogo lista a aula; aceitar apaga a aula e grava o tipo", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page);
    await mudarTipo(page, "A01", "Laboratório");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT tipo = 'Laboratório' FROM salas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]).toMatch(/1 aula\(s\) serão apagadas/);
    expect(mensagens[0]).toMatch(/Alfa, 1º período, Segunda M1 — Cálculo/);
  });

  test("cancelar não muda nada", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page, "recusar");
    await mudarTipo(page, "A01", "Laboratório");
    await page.getByRole("button", { name: "Salvar" }).click();
    // Sem esperar o diálogo, as asserções do banco correriam antes do salvar.
    await expect.poll(() => mensagens.length).toBe(1);
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    expect(contar(banco, "SELECT tipo = 'Sala de Aula' FROM salas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE sala_id = 1")).toBe(1);
  });
});

test.describe("mudar o tipo da sala com aulas fixadas", () => {
  // As duas aulas de Cálculo estão em A01; uma delas está fixada. A02 é do mesmo tipo e está livre.
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, tipo_sala)
        VALUES (1, 1, 'Cálculo', 1, 2, 1, 'Sala de Aula');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id, fixada) VALUES
        (1, 1, 0, 0, 1, 1, 1, 1), (1, 1, 0, 1, 1, 1, 1, 0);`,
  });

  test("o aviso conta as aulas fixadas que mudaram de sala", async ({ page }) => {
    await mudarTipo(page, "A01", "Laboratório");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("2 aula(s) mudaram de sala")).toBeVisible();
    await expect(page.getByText("1 delas estavam fixadas.")).toBeVisible();
  });
});

test.describe("mudar o tipo da sala quando só algumas aulas acham outra sala", () => {
  // A02 é do tipo antigo, mas está ocupada na terça M1 por uma aula de outro curso:
  // a aula de segunda troca para A02, a de terça não tem para onde ir e é apagada.
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, tipo_sala) VALUES
        (1, 1, 'Cálculo', 1, 2, 1, 'Sala de Aula'), (2, 2, 'Física', 1, 1, 1, 'Sala de Aula');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 2, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES
        (1, 1, 0, 0, 1, 1, 1), (1, 1, 1, 0, 1, 1, 1), (2, 1, 1, 0, 2, 2, 2);`,
  });

  test("a aula que acha sala é trocada, a que não acha é apagada, e o aviso da troca aparece", async ({
    page,
    banco,
  }) => {
    const mensagens = await responderConfirmacoes(page);
    await mudarTipo(page, "A01", "Laboratório");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT tipo = 'Laboratório' FROM salas WHERE id = 1")).toBe(1);
    expect(mensagens).toHaveLength(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 0 AND sala_id = 2")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 1 AND curso_id = 1")).toBe(0);
    // A aula de outro curso na A02 não foi tocada.
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 2 AND sala_id = 2")).toBe(1);
    await expect(page.getByText("1 aula(s) mudaram de sala")).toBeVisible();
  });
});

test.describe("capacidade da sala", () => {
  test.use({ semMassa: true, semente: "INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40);" });

  test("negativa ou fracionada é recusada junto do campo, e nada é gravado", async ({ page, banco }) => {
    await irPara(page, "Salas");
    await page.getByRole("row", { name: /A01/ }).getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog");
    const campo = dialogo.getByLabel("Capacidade");
    for (const valor of ["-1", "30.5"]) {
      await campo.fill(valor);
      await dialogo.getByRole("button", { name: "Salvar" }).click();
      await expect(campo).toHaveAttribute("aria-invalid", "true");
      await expect(campo).toHaveAccessibleDescription("Capacidade inválida.");
      await expect(campo).toBeFocused();
    }
    expect(contar(banco, "SELECT capacidade FROM salas WHERE id = 1")).toBe(40);
    await campo.fill("35");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT capacidade FROM salas WHERE id = 1")).toBe(35);
  });
});
