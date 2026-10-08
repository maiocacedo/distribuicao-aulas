import { expect, test } from "./fixtures";
import { aceitarConfirmacoes, celula, contar, irPara } from "./paginas";

test.describe("requisito de sala por tipo", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'Lab 1', 'Laboratório', 30);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, tipo_sala) VALUES (1, 1, 'Química', 1, 2, 'Laboratório');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
    `,
  });

  test("na grade manual a aula vai para o laboratório", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Química/ }).click();
    await celula(page, "Segunda", "M1").click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });

  test("no gerador todas as aulas vão para o laboratório", async ({ page, banco }) => {
    aceitarConfirmacoes(page);
    await irPara(page, "Automática");
    await page.getByRole("button", { name: "Gerar grade" }).click();
    await page.getByRole("button", { name: "Aplicar esta grade" }).click({ timeout: 30_000 });
    await expect(page.getByText("Grade aplicada.")).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND sala_id = 2")).toBe(2);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });
});

test.describe("motivo do impedimento na grade manual", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Álgebra', 1, 2, 0), (2, 1, 'Física', 2, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);
      INSERT INTO indisponibilidades (professor_id, dia, hora) VALUES (1, 0, 0);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 2, 1, 0, 2, 1);
    `,
  });

  test("cada célula impedida diz por quê", async ({ page }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Álgebra/ }).click();
    await expect(celula(page, "Segunda", "M1")).toContainText("A. Souza indisponível");
    await expect(celula(page, "Terça", "M1")).toContainText("A. Souza no 2º período");
    await expect(celula(page, "Sábado", "M1")).toContainText("Sábado desmarcado no cadastro");
  });
});
