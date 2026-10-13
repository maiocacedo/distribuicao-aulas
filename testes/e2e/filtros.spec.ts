import { expect, test } from "./fixtures";
import { escolher, irPara } from "./paginas";

test.describe("Salas", () => {
  test.use({
    semMassa: true,
    semente: `INSERT INTO salas (id, nome, tipo, capacidade) VALUES
      (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40), (3, 'Lab 1', 'Laboratório', 30);`,
  });

  test("filtrar por tipo mostra o chip, muda a contagem e limpa", async ({ page }) => {
    await irPara(page, "Salas");
    await expect(page.getByText("3 de 3")).toBeVisible();
    const filtro = page.getByRole("button", { name: "Filtrar por Tipo" });
    await expect(filtro).toHaveAccessibleDescription("");
    await filtro.click();
    // O popover tem nome, e o botão diz que há filtro ativo sem mudar de nome.
    await expect(page.getByRole("dialog", { name: "Filtrar por Tipo" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Laboratório" }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(filtro).toHaveAccessibleName("Filtrar por Tipo");
    await expect(filtro).toHaveAccessibleDescription("1 marcado(s)");
    await expect(page.getByRole("row", { name: /Lab 1/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /A01/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Remover filtro Tipo: Laboratório" }).click();
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("a busca acha a sala pelo tipo", async ({ page }) => {
    await irPara(page, "Salas");
    await page.getByLabel("Buscar").fill("laboratorio");
    await expect(page.getByRole("row", { name: /Lab 1/ })).toBeVisible();
    await expect(page.getByText("1 de 3")).toBeVisible();
  });

  test("filtro sem resultado oferece limpar", async ({ page }) => {
    await irPara(page, "Salas");
    await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
    await page.getByRole("checkbox", { name: "Outro" }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Nenhuma sala encontrada.")).toBeVisible();
    await page.getByRole("button", { name: "Limpar busca e filtros" }).click();
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("busca sem resultado oferece limpar a busca", async ({ page }) => {
    await irPara(page, "Salas");
    const busca = page.getByLabel("Buscar");
    await busca.fill("zzzz");
    await expect(page.getByText("Nenhuma sala encontrada.")).toBeVisible();
    await page.getByRole("button", { name: "Limpar busca e filtros" }).click();
    await expect(busca).toHaveValue("");
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("remover um chip pelo teclado devolve o foco ao botão do filtro", async ({ page }) => {
    await irPara(page, "Salas");
    await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
    await page.getByRole("checkbox", { name: "Laboratório" }).check();
    await page.keyboard.press("Escape");
    const chip = page.getByRole("button", { name: "Remover filtro Tipo: Laboratório" });
    await chip.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("3 de 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Filtrar por Tipo" })).toBeFocused();
  });
});

test.describe("Disciplinas", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, optativa, ofertada, turno) VALUES
        (1, 1, 'Cálculo', 1, 4, 0, 0, 1, NULL),
        (2, 1, 'Física', 2, 4, 0, 0, 1, 'tarde'),
        (3, 1, 'Libras', 2, 2, 0, 1, 0, NULL);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4), (2, 2, 4), (3, 2, 2);`,
  });

  const marcar = async (page: import("@playwright/test").Page, filtro: string, opcao: string) => {
    await page.getByRole("button", { name: `Filtrar por ${filtro}` }).click();
    await page.getByRole("checkbox", { name: opcao, exact: true }).check();
    await page.keyboard.press("Escape");
    // O popover leva um instante para sair (animação de saída). Sem esperar, as
    // caixas dele ainda existem quando o filtro seguinte abre, e "Não" seria
    // achada duas vezes.
    await expect(page.getByRole("checkbox", { name: opcao, exact: true })).toHaveCount(0);
  };

  test("a busca acha a disciplina pelo professor", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await page.getByLabel("Buscar").fill("ana");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Cálculo/ })).toBeVisible();
  });

  test("filtra por período", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Período", "2º");
    await expect(page.getByText("2 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Cálculo/ })).toHaveCount(0);
  });

  test("combina optativa e não ofertada", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Optativa", "Sim");
    await marcar(page, "Ofertada", "Não");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Libras/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover filtro Optativa: Sim" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover filtro Ofertada: Não" })).toBeVisible();
  });

  test("filtra por turno forçado", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Turno forçado", "Tarde");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Física/ })).toBeVisible();
  });

  test("a opção Segue o período vem por último e lista as disciplinas sem turno forçado", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await page.getByRole("button", { name: "Filtrar por Turno forçado" }).click();
    await expect(page.locator("label").filter({ has: page.getByRole("checkbox") })).toHaveText(["Manhã", "Tarde", "Segue o período"]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await marcar(page, "Turno forçado", "Segue o período");
    await expect(page.getByText("2 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Cálculo/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Libras/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Física/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remover filtro Turno forçado: Segue o período" })).toBeVisible();
  });

  test("sem tipo cadastrado, o filtro Tipo não aparece, mesmo com a opção Sem tipo", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await expect(page.getByRole("button", { name: "Filtrar por Turno forçado" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filtrar por Tipo" })).toHaveCount(0);
  });

  test("Segue o período combina com outro filtro e com um turno da mesma lista", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Turno forçado", "Segue o período");
    await marcar(page, "Optativa", "Sim");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Libras/ })).toBeVisible();
    await page.getByRole("button", { name: "Remover filtro Optativa: Sim" }).click();
    // Dentro de um mesmo filtro as opções se somam: Tarde mais Segue o período.
    await marcar(page, "Turno forçado", "Tarde");
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("filtro sem resultado oferece limpar a busca e os filtros", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Turno forçado", "Manhã");
    await expect(page.getByText("Nenhuma disciplina encontrada.")).toBeVisible();
    // A barra continua à mostra: é por ela que se vê o que está filtrando.
    await expect(page.getByRole("button", { name: "Remover filtro Turno forçado: Manhã" })).toBeVisible();
    await page.getByRole("button", { name: "Limpar busca e filtros" }).click();
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("com dois períodos marcados, nova disciplina propõe o primeiro do curso", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Período", "2º");
    await marcar(page, "Período", "1º");
    await page.getByRole("button", { name: "Nova disciplina" }).click();
    await expect(page.getByRole("dialog").getByLabel("Período", { exact: true })).toContainText("1º");
  });

  test("nova disciplina propõe o período filtrado quando é um só", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Período", "2º");
    await page.getByRole("button", { name: "Nova disciplina" }).click();
    await expect(page.getByRole("dialog").getByLabel("Período", { exact: true })).toContainText("2º");
  });
});

test.describe("Disciplinas, troca de curso", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO cursos (id, nome) VALUES (2, 'Zeta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha'), (2, 1, 'manha'), (2, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES
        (1, 1, 'Cálculo', 1, 4, 0), (2, 1, 'Física', 2, 4, 0), (3, 2, 'Redes', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4), (2, 2, 4), (3, 1, 2);`,
  });

  test("busca e filtros ficam para trás: o curso novo aparece inteiro", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await page.getByRole("button", { name: "Filtrar por Período" }).click();
    await page.getByRole("checkbox", { name: "2º", exact: true }).check();
    await page.keyboard.press("Escape");
    await page.getByLabel("Buscar").fill("bruno");
    await expect(page.getByText("1 de 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover filtro Período: 2º" })).toBeVisible();

    // O período 2 existe nos dois cursos, então o chip faria sentido no novo;
    // sem a limpeza, "Redes" (período 1, professora Ana) ficaria escondida.
    await escolher(page.getByRole("navigation").getByRole("combobox", { name: "Curso" }), "Zeta");
    await expect(page.getByRole("row", { name: /Redes/ })).toBeVisible();
    await expect(page.getByText("1 de 1")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Remover filtro/ })).toHaveCount(0);
    await expect(page.getByLabel("Buscar")).toHaveValue("");
  });
});

test.describe("Disciplinas, filtro de tipo", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO tipos_disciplina (id, nome, exige_sala, tipo_sala) VALUES (1, 'Tipo Alfa', 1, NULL);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, tipo_id) VALUES
        (1, 1, 'Cálculo', 1, 4, 0, 1),
        (2, 1, 'Física', 1, 4, 0, NULL),
        (3, 1, 'Libras', 1, 2, 0, NULL);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4), (2, 1, 4), (3, 1, 2);`,
  });

  const marcar = async (page: import("@playwright/test").Page, filtro: string, opcao: string) => {
    await page.getByRole("button", { name: `Filtrar por ${filtro}` }).click();
    await page.getByRole("checkbox", { name: opcao, exact: true }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("checkbox", { name: opcao, exact: true })).toHaveCount(0);
  };

  test("Sem tipo vem por último e lista as disciplinas sem tipo", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
    await expect(page.locator("label").filter({ has: page.getByRole("checkbox") })).toHaveText(["Tipo Alfa", "Sem tipo"]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await marcar(page, "Tipo", "Sem tipo");
    await expect(page.getByText("2 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Física/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Libras/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Cálculo/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remover filtro Tipo: Sem tipo" })).toBeVisible();
  });

  test("Sem tipo junto com um tipo lista as duas coisas", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Tipo", "Sem tipo");
    await marcar(page, "Tipo", "Tipo Alfa");
    await expect(page.getByText("3 de 3")).toBeVisible();
  });
});
