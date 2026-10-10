import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { contar, irPara } from "./paginas";

const mudarTipo = async (page: Page, sala: string, tipo: string) => {
  await irPara(page, "Salas");
  await page.getByRole("row", { name: new RegExp(sala) }).getByRole("button", { name: "Editar" }).click();
  await page.getByLabel(/^Tipo/).selectOption(tipo);
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
    const mensagens: string[] = [];
    page.on("dialog", (d) => {
      mensagens.push(d.message());
      d.dismiss();
    });
    await mudarTipo(page, "A01", "Laboratório");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT tipo = 'Laboratório' FROM salas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND sala_id = 2")).toBe(2);
    // Sala é da instituição: a aula do outro curso também muda.
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 2 AND sala_id = 2")).toBe(1);
    // Quem não exige tipo continua onde estava.
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 3 AND sala_id = 1")).toBe(1);
    expect(mensagens).toEqual([]);
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
    const mensagens: string[] = [];
    page.on("dialog", (d) => {
      mensagens.push(d.message());
      d.accept();
    });
    await mudarTipo(page, "A01", "Laboratório");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT tipo = 'Laboratório' FROM salas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]).toMatch(/1 aula\(s\) serão apagadas/);
    expect(mensagens[0]).toMatch(/Alfa, 1º período, Segunda M1 — Cálculo/);
  });

  test("cancelar não muda nada", async ({ page, banco }) => {
    page.on("dialog", (d) => d.dismiss());
    await mudarTipo(page, "A01", "Laboratório");
    // Sem esperar o diálogo, as asserções do banco correriam antes do salvar.
    const dialogo = page.waitForEvent("dialog");
    await page.getByRole("button", { name: "Salvar" }).click();
    await dialogo;
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    expect(contar(banco, "SELECT tipo = 'Sala de Aula' FROM salas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE sala_id = 1")).toBe(1);
  });
});
