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
    // O formulário é mais alto que a janela e o "Salvar" fica no fim dele: a
    // recusa, que aparece no topo, tem de ser trazida para a vista.
    await expect(page.getByText(/2º período já tem aula em Segunda M1/)).toBeInViewport();
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
    // Perder a sala foi o que se pediu: não há o que avisar. A marca "sem sala"
    // só chega à lista com a recarga, que vem depois do ponto em que o aviso
    // sairia: se ele existisse, a esta altura já estaria na tela. Contagem
    // direta, sem nova tentativa: `toHaveCount(0)` esperaria o aviso sumir.
    await expect(linhaCom(page, "Cálculo")).toContainText("sem sala");
    expect(await page.getByText(/mudaram de sala/).count()).toBe(0);
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
    await expect(page.getByText("2 aula(s) mudaram de sala")).toBeVisible();
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

test.describe("uma aula troca de sala e outra é apagada", () => {
  // O laboratório está tomado na M1 e livre na M2: das duas aulas de Cálculo,
  // a primeira não tem para onde ir e a segunda (fixada) vai para o laboratório.
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'Lab 1', 'Laboratório', 30);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, tipo_sala)
        VALUES (1, 1, 'Cálculo', 1, 2, 1, NULL), (2, 1, 'Química', 2, 1, 1, 'Laboratório');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 2, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id, fixada)
        VALUES (1, 1, 0, 0, 1, 1, 1, 0), (1, 1, 0, 1, 1, 1, 1, 1), (1, 2, 0, 0, 2, 2, 2, 0);`,
  });

  test("o aviso de troca de sala sai também quando a gravação apagou outra aula, e conta a fixada", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page);
    await editar(page, "Cálculo");
    await escolher(page.getByLabel(/^Requisito/), "Qualquer sala de um tipo");
    await escolher(page.getByLabel(/^Tipo exigido/), /^Laboratório/);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("1 aula(s) mudaram de sala")).toBeVisible();
    await expect(page.getByText("1 delas estavam fixadas.")).toBeVisible();
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]).toMatch(/Outras 1 aula\(s\) trocam de sala/);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND hora = 1 AND sala_id = 2")).toBe(1);
  });
});

test.describe("validação do formulário", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Libras', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);`,
  });

  test("fatias que não fecham com as aulas da semana são recusadas no grupo, com o foco na caixa", async ({ page, banco }) => {
    await editar(page, "Libras");
    const dialogo = page.getByRole("dialog");
    const aulasDaFatia = dialogo.getByLabel("Aulas da fatia 1");
    await aulasDaFatia.fill("1");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(
      dialogo.getByText("As fatias dos professores somam 1 aula(s), mas a disciplina tem 2. Os dois têm de fechar."),
    ).toBeVisible();
    await expect(aulasDaFatia).toHaveAttribute("aria-invalid", "true");
    await expect(aulasDaFatia).toBeFocused();
    expect(contar(banco, "SELECT aulas FROM disciplina_professores WHERE disciplina_id = 1")).toBe(2);
    // Quem mexeu nas fatias já leu a mensagem.
    await aulasDaFatia.fill("2");
    await expect(dialogo.getByText(/Os dois têm de fechar/)).toHaveCount(0);
    await expect(aulasDaFatia).not.toHaveAttribute("aria-invalid", "true");
  });

  test("nome vazio e aulas por semana fora de 1 a 40 são recusados junto de cada campo, sem a bolha do navegador", async ({
    page,
    banco,
  }) => {
    await editar(page, "Libras");
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Nome", { exact: true }).fill("");
    await dialogo.getByLabel("Aulas por semana").fill("0");
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(dialogo.getByText("O nome é obrigatório.")).toBeVisible();
    await expect(dialogo.getByText("Use um número inteiro de 1 a 40.")).toBeVisible();
    await expect(dialogo.getByLabel("Nome", { exact: true })).toBeFocused();
    await expect(dialogo.getByLabel("Aulas por semana")).toHaveAttribute("aria-invalid", "true");
    expect(contar(banco, "SELECT COUNT(*) FROM disciplinas WHERE nome = 'Libras' AND aulas_semanais = 2")).toBe(1);
  });

  test("sem fatia nenhuma, a recusa aponta o botão de adicionar professor", async ({ page, banco }) => {
    await editar(page, "Libras");
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Remover a fatia 1" }).click();
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await expect(dialogo.getByText("Atribua a disciplina a pelo menos um professor.")).toBeVisible();
    const adicionar = dialogo.getByRole("button", { name: "Adicionar professor" });
    await expect(adicionar).toBeFocused();
    // Botão não é campo: o marcador do diálogo, e nada de estado de campo inválido.
    await expect(adicionar).toHaveAttribute("data-acusado", "true");
    await expect(adicionar).not.toHaveAttribute("aria-invalid", /.*/);
    await expect(adicionar).toHaveAccessibleDescription("Atribua a disciplina a pelo menos um professor.");
    // Quem mexeu nas fatias já leu a mensagem (e o único professor foi usado: o botão sai).
    await adicionar.click();
    await expect(dialogo.getByText("Atribua a disciplina a pelo menos um professor.")).toHaveCount(0);
    expect(contar(banco, "SELECT COUNT(*) FROM disciplina_professores WHERE disciplina_id = 1")).toBe(1);
  });
});

test.describe("sem professor cadastrado", () => {
  test.use({ semMassa: true, semente: "INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');" });

  test("Nova disciplina fica desabilitada e o motivo está escrito ao lado", async ({ page }) => {
    await irPara(page, "Disciplinas");
    const nova = page.getByRole("button", { name: "Nova disciplina" });
    await expect(nova).toBeDisabled();
    await expect(page.getByText("Cadastre um professor antes")).toBeVisible();
    await expect(nova).toHaveAccessibleDescription("Cadastre um professor antes");
    // Nada cadastrado: uma frase só, sem barra de filtros nem botão de limpar.
    await expect(page.getByText("Nenhuma disciplina cadastrada neste curso.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Filtrar por/ })).toHaveCount(0);
  });
});

test.describe("sem professor para adicionar", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Libras', 1, 2, 0);`,
  });

  test("a recusa das fatias é anunciada e trazida à vista mesmo sem botão nem campo a focar", async ({ page, banco }) => {
    // Janela baixa: o grupo de fatias fica no meio do formulário, fora da vista.
    await page.setViewportSize({ width: 1280, height: 420 });
    await editar(page, "Libras");
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByRole("button", { name: "Adicionar professor" })).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    const recusa = dialogo.getByRole("alert").filter({ hasText: "Atribua a disciplina a pelo menos um professor." });
    await expect(recusa).toBeVisible();
    await expect(recusa).toBeInViewport();
    expect(contar(banco, "SELECT COUNT(*) FROM disciplina_professores WHERE disciplina_id = 1")).toBe(0);
  });
});

test.describe("professor que já tem fatia", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Libras', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);`,
  });

  test("a opção desabilitada diz o motivo, e o gatilho da própria fatia mostra só o nome", async ({ page }) => {
    await editar(page, "Libras");
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Adicionar professor" }).click();
    const segunda = dialogo.getByRole("combobox", { name: "Professor da fatia 2" });
    await expect(segunda).toHaveText("Bruno Lima");
    await expect(dialogo.getByRole("combobox", { name: "Professor da fatia 1" })).toHaveText("Ana Souza");
    await segunda.click();
    await expect(page.getByRole("option", { name: "Ana Souza — já tem fatia" })).toBeDisabled();
    // A própria escolha não é "já tem fatia": é a opção marcada, com o nome.
    await expect(page.getByRole("option", { name: "Bruno Lima", exact: true })).toBeEnabled();
  });
});
