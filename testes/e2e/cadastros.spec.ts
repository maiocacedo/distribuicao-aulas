import { expect, test } from "./fixtures";
import { celula, contar, escolher, escolhida, irPara, responderConfirmacoes } from "./paginas";

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
    const mensagens = await responderConfirmacoes(page);
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde", exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
    expect(mensagens.join("\n")).toMatch(/1 aula no turno da tarde/);
  });

  test("cancelar a remoção do turno não muda nada", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page, "recusar");
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde", exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => mensagens.length).toBe(1);
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM cursos WHERE turnos = 'manha,tarde'")).toBe(1);
  });

  test("as caixas de turno formam um grupo rotulado", async ({ page }) => {
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    const grupo = page.getByRole("group", { name: "Turnos" });
    await expect(grupo.getByRole("checkbox", { name: "Manhã", exact: true })).toBeChecked();
    await expect(grupo.getByRole("checkbox", { name: "Tarde", exact: true })).toBeChecked();
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
    await responderConfirmacoes(page);
    await irPara(page, "Automática");
    await expect(page.getByText(/1 aula\(s\) de outros cursos respeitadas/)).toBeVisible();
  });
});

test.describe("máximo de dias com a consulta falhando", () => {
  test.use({
    semMassa: true,
    semente: "INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');",
    opcoesPonte: { falharQuando: /COUNT\(DISTINCT dia\)/ },
  });

  test("o erro aparece na tela e nada é gravado", async ({ page, banco }) => {
    await irPara(page, "Professores");
    await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Máximo de dias na semana").fill("1");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/falha simulada/)).toBeVisible({ timeout: 3_000 });
    // Na própria tela, com o formulário aberto — não no aviso global de promessa rejeitada.
    await expect(page.getByText("Erro fora da tela")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM professores WHERE max_dias_semana IS NULL")).toBe(1);
  });
});

const AULA_NO_SABADO = `
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
  INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, permite_sabado)
    VALUES (1, 1, 'Cálculo', 1, 1, 0, 1);
  INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1);
  INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 5, 0, 1, 1);`;

test.describe("tirar o sábado com a gravação falhando", () => {
  test.use({ semMassa: true, semente: AULA_NO_SABADO, opcoesPonte: { falharQuando: /^DELETE FROM alocacoes WHERE dia/ } });

  test("o seletor continua mostrando o que está no banco", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Regras");
    const semana = page.getByLabel("Semana");
    await escolher(semana, "Segunda a sexta");
    await expect(page.getByText(/falha simulada/)).toBeVisible({ timeout: 3_000 });
    await expect.poll(() => escolhida(semana)).toBe("Segunda a sábado");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 5")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM configuracao WHERE chave = 'dias_letivos' AND valor = '5'")).toBe(0);
  });
});

test.describe("tirar o sábado com a consulta falhando", () => {
  test.use({ semMassa: true, semente: AULA_NO_SABADO, opcoesPonte: { falharQuando: /FROM alocacoes WHERE dia >= / } });

  test("o erro aparece na tela e o seletor não muda", async ({ page }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Regras");
    const semana = page.getByLabel("Semana");
    await escolher(semana, "Segunda a sexta");
    await expect(page.getByText(/falha simulada/)).toBeVisible({ timeout: 3_000 });
    // Na própria tela — não no aviso global de promessa rejeitada, que a substitui.
    await expect(page.getByText("Erro fora da tela")).toHaveCount(0);
    await expect.poll(() => escolhida(semana)).toBe("Segunda a sábado");
  });
});

test.describe("dias letivos sem aula no sábado", () => {
  test.use({ semMassa: true });

  test("mudar a semana grava e o seletor acompanha, nos dois sentidos", async ({ page, banco }) => {
    await irPara(page, "Regras");
    const semana = page.getByLabel("Semana");
    await escolher(semana, "Segunda a sexta");
    await expect.poll(() => contar(banco, "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'")).toBe(5);
    await expect.poll(() => escolhida(semana)).toBe("Segunda a sexta");
    await escolher(semana, "Segunda a sábado");
    await expect.poll(() => contar(banco, "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'")).toBe(6);
    await expect.poll(() => escolhida(semana)).toBe("Segunda a sábado");
  });
});

test.describe("turno do curso usado por disciplina com turno forçado", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Engenharia' WHERE id = 1;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, turno) VALUES (1, 1, 'Cálculo', 1, 2, 0, 'tarde');`,
  });

  test("tirar o turno é recusado e diz qual disciplina o usa", async ({ page, banco }) => {
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde", exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/Cálculo|disciplina/);
    expect(contar(banco, "SELECT COUNT(*) FROM cursos WHERE turnos = 'manha,tarde'")).toBe(1);
  });
});
