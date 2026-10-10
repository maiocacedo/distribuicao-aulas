import { expect, test } from "./fixtures";
import { aceitarConfirmacoes, celula, contar, irPara } from "./paginas";

test.describe("turnos do curso", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Engenharia' WHERE id = 1;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 1, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 6, 1, 1);`,
  });

  test("tirar a tarde com aula na tarde confirma e apaga", async ({ page, banco }) => {
    const mensagens: string[] = [];
    page.on("dialog", (d) => {
      mensagens.push(d.message());
      d.accept();
    });
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde", exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
    expect(mensagens.join("\n")).toMatch(/1 aula no turno da tarde/);
  });
});

test.describe("turno do curso em uso", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Engenharia' WHERE id = 1;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'tarde');`,
  });

  test("tirar um turno que um período usa é recusado", async ({ page, banco }) => {
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde", exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/período\(s\) 2º/)).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM cursos WHERE turnos = 'manha,tarde'")).toBe(1);
  });
});

test.describe("máximo de dias", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 2, 0, 1, 1);`,
  });

  test("baixar o máximo abaixo dos dias em uso é recusado", async ({ page, banco }) => {
    await irPara(page, "Professores");
    await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Máximo de dias na semana").fill("1");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/já dá aula em 2 dias/)).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM professores WHERE max_dias_semana IS NULL")).toBe(1);
  });
});

test.describe("B10", () => {
  test.use({ semMassa: true, semente: "INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');" });

  test("B10: um arrasto grava numa transação só", async ({ page, banco, chamadas }) => {
    await irPara(page, "Indisponibilidades");
    await page.getByRole("button", { name: "Ana Souza" }).click();
    await celula(page, "Segunda", "M1").hover();
    await page.mouse.down();
    await celula(page, "Segunda", "M2").hover();
    await page.mouse.up();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades")).toBe(2);
    expect(chamadas.filter((c) => c === "transacao")).toHaveLength(1);
  });
});

test.describe("grade automática", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (2, 2, 'Física', 1, 1, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (2, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (2, 1, 0, 0, 2, 1);`,
  });

  test("informa quantas aulas de outros cursos respeita", async ({ page }) => {
    aceitarConfirmacoes(page);
    await irPara(page, "Automática");
    await expect(page.getByText(/1 aula\(s\) de outros cursos respeitadas/)).toBeVisible();
  });
});
