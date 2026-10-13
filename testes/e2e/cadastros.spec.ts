import { expect, test } from "./fixtures";
import { celula, contar, escolher, escolhida, falharConsultas, irPara, linhaCom, responderConfirmacoes, segurarConsultas } from "./paginas";

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
    // O "Salvar" fica desabilitado enquanto `salvando`: habilitado de novo, a
    // tela terminou de reagir à recusa e o banco já não pode mudar.
    await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled();
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

test.describe("conversão de horas do curso", () => {
  test.use({ semMassa: true, semente: "UPDATE cursos SET nome = 'Engenharia', horas_por_aula_semanal = 15 WHERE id = 1;" });

  test("zero é recusado junto do campo, sem a bolha do navegador", async ({ page, banco }) => {
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    const campo = page.getByLabel("Horas de currículo por aula semanal");
    await campo.fill("0");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("A conversão tem de ser ao menos 1h.")).toBeVisible();
    await expect(campo).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM cursos WHERE horas_por_aula_semanal = 15")).toBe(1);
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

  test("o botão sobe fora da janela: o ponteiro que volta sem botão apertado encerra o arrasto e não pinta", async ({ page, banco, chamadas }) => {
    await irPara(page, "Indisponibilidades");
    await page.getByRole("button", { name: "Ana Souza" }).click();
    await celula(page, "Segunda", "M1").hover();
    await page.mouse.down();
    await celula(page, "Segunda", "M2").hover();
    // O `mouseup` ficou lá fora: o ponteiro volta e entra numa célula, vindo de
    // fora da janela (sem `relatedTarget`), sem botão nenhum apertado.
    await celula(page, "Segunda", "M3").evaluate((el) =>
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, buttons: 0 })),
    );
    // O arrasto acabou ali: grava o que pintou, e a célula da volta fica como estava.
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades")).toBe(2);
    await expect(celula(page, "Segunda", "M3")).toHaveText("");
    // Para o teste o botão ainda está apertado: solto agora, não há mais o que gravar.
    await page.mouse.up();
    // Marco: um clique de verdade, que grava a sua marca numa transação só dele.
    await celula(page, "Terça", "M1").click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades")).toBe(3);
    expect(chamadas.filter((c) => c === "transacao")).toHaveLength(2);
    expect(contar(banco, "SELECT COUNT(*) FROM indisponibilidades WHERE dia = 0 AND hora = 2")).toBe(0);
  });
});

test.describe("Indisponibilidades", () => {
  test.use({
    semMassa: true,
    semente: "INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');",
  });

  test("o professor escolhido fica marcado com aria-pressed", async ({ page }) => {
    await irPara(page, "Indisponibilidades");
    const ana = page.getByRole("button", { name: "Ana Souza" });
    const bruno = page.getByRole("button", { name: "Bruno Lima" });
    await expect(ana).toHaveAttribute("aria-pressed", "false");
    await expect(bruno).toHaveAttribute("aria-pressed", "false");
    await ana.click();
    await expect(ana).toHaveAttribute("aria-pressed", "true");
    await expect(bruno).toHaveAttribute("aria-pressed", "false");
    await bruno.click();
    await expect(bruno).toHaveAttribute("aria-pressed", "true");
    await expect(ana).toHaveAttribute("aria-pressed", "false");
  });

  test("a contagem concorda com o número e Limpar tudo apaga as marcas", async ({ page, banco }) => {
    await irPara(page, "Indisponibilidades");
    await page.getByRole("button", { name: "Ana Souza" }).click();
    const limpar = page.getByRole("button", { name: "Limpar tudo" });
    await expect(page.getByText("0 horários indisponíveis")).toBeVisible();
    await expect(limpar).toBeDisabled();

    await celula(page, "Segunda", "M1").click();
    await expect(page.getByText("1 horário indisponível", { exact: true })).toBeVisible();
    await celula(page, "Terça", "M1").click();
    await expect(page.getByText("2 horários indisponíveis")).toBeVisible();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades")).toBe(2);

    await limpar.click();
    await expect(page.getByText("0 horários indisponíveis")).toBeVisible();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades")).toBe(0);
  });

  test.describe("com a gravação falhando", () => {
    test.use({ opcoesPonte: { falharQuando: /^INSERT OR IGNORE INTO indisponibilidades/ } });

    test("avisa por toast e a célula volta a livre", async ({ page, banco }) => {
      await irPara(page, "Indisponibilidades");
      await page.getByRole("button", { name: "Ana Souza" }).click();
      await celula(page, "Segunda", "M1").click();
      await expect(page.getByText(/falha simulada/)).toBeVisible();
      await expect(celula(page, "Segunda", "M1")).toHaveText("");
      await expect(page.getByText("0 horários indisponíveis")).toBeVisible();
      expect(contar(banco, "SELECT COUNT(*) FROM indisponibilidades")).toBe(0);
    });
  });

  test.describe("com a recontagem falhando depois de gravar", () => {
    // A recontagem roda na carga (1ª vez) e depois de cada gravação (2ª): a gravação passa e só ela falha.
    test.use({ opcoesPonte: { falharAPartirDe: { quando: /^SELECT professor_id, COUNT\(\*\) AS n FROM indisponibilidades/, vez: 2 } } });

    test("a marca gravada fica, e o erro é da página, não de gravação", async ({ page, banco }) => {
      await irPara(page, "Indisponibilidades");
      await page.getByRole("button", { name: "Ana Souza" }).click();
      await celula(page, "Segunda", "M1").click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("falha simulada");
      // Nada de aviso de falha de gravação: a gravação deu certo, e a marca fica na malha e no banco.
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      await expect(celula(page, "Segunda", "M1")).toHaveText("×");
      expect(contar(banco, "SELECT COUNT(*) FROM indisponibilidades")).toBe(1);
    });
  });

  test.describe("com a carga falhando", () => {
    test.use({ opcoesPonte: { falharQuando: /FROM professores ORDER BY nome/ } });

    test("mostra o erro na página", async ({ page }) => {
      await irPara(page, "Indisponibilidades");
      await expect(page.getByRole("alert").filter({ hasText: /falha simulada/ })).toBeVisible();
    });
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

  test("a falha sai num aviso de erro, o seletor continua mostrando o que está no banco e a tela segue utilizável", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Regras");
    const semana = page.getByLabel("Semana");
    await escolher(semana, "Segunda a sexta");
    // Falha de gravação é aviso de erro, como nas outras telas: fica até ser fechado.
    const aviso = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(aviso).toContainText("falha simulada", { timeout: 3_000 });
    await expect(aviso.locator("[data-close-button]")).toBeVisible();
    // O alerta da página é da carga, e a carga não falhou.
    expect(await page.getByRole("main").getByRole("alert").count()).toBe(0);
    await expect.poll(() => escolhida(semana)).toBe("Segunda a sábado");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 5")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM configuracao WHERE chave = 'dias_letivos' AND valor = '5'")).toBe(0);
    // A tela não ficou presa no erro: outra gravação, que não falha, passa.
    await page.getByLabel("Divisão do novo padrão").fill("5+2");
    await page.getByRole("button", { name: "Adicionar padrão" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM padroes_blocos WHERE padrao = '5+2'")).toBe(1);
    await expect(page.getByRole("button", { name: "Remover o padrão 5+2 (nota 0)" })).toBeVisible();
  });
});

test.describe("tirar o sábado com a consulta falhando", () => {
  test.use({ semMassa: true, semente: AULA_NO_SABADO, opcoesPonte: { falharQuando: /FROM alocacoes WHERE dia >= / } });

  test("a falha sai num aviso de erro e o seletor não muda", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Regras");
    const semana = page.getByLabel("Semana");
    await escolher(semana, "Segunda a sexta");
    // A consulta é parte da ação de mudar a semana: a falha dela é da ação, não da carga.
    const aviso = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(aviso).toContainText("falha simulada", { timeout: 3_000 });
    await expect(aviso.locator("[data-close-button]")).toBeVisible();
    // Num aviso, com a tela inteira no lugar — não na rede global de promessa
    // rejeitada, que troca a tela toda pela mensagem.
    await expect(page.getByText("Erro fora da tela")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Regras");
    expect(await page.getByRole("main").getByRole("alert").count()).toBe(0);
    await expect.poll(() => escolhida(semana)).toBe("Segunda a sábado");
    expect(contar(banco, "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'")).toBe(6);
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

test.describe("padrões de bloco", () => {
  test.use({ semMassa: true });

  test("a recarga que falha depois de gravar é erro da página: o padrão ficou gravado e o campo limpa", async ({ page, banco }) => {
    await irPara(page, "Regras");
    await expect(page.getByLabel("Semana")).toBeVisible();
    const campo = page.getByLabel("Divisão do novo padrão");
    await campo.fill("5+2");
    // A falha entra agora, com a tela já carregada: a primeira consulta a falhar é a recarga.
    await falharConsultas(page, "FROM padroes_blocos");
    await page.getByRole("button", { name: "Adicionar padrão" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("falha simulada");
    expect(contar(banco, "SELECT COUNT(*) FROM padroes_blocos WHERE aulas = 7 AND padrao = '5+2'")).toBe(1);
    await expect(campo).toHaveValue("");
    // Nada de aviso de falha de gravação: ele sairia antes da recarga, e a gravação deu certo.
    expect(await page.locator('[data-sonner-toast][data-type="error"]').count()).toBe(0);
  });

  test.describe("com a gravação falhando", () => {
    test.use({ opcoesPonte: { falharQuando: /^INSERT INTO padroes_blocos/ } });

    test("a falha sai num aviso de erro, e o que foi digitado fica no campo", async ({ page, banco }) => {
      const padroes = contar(banco, "SELECT COUNT(*) FROM padroes_blocos");
      await irPara(page, "Regras");
      const campo = page.getByLabel("Divisão do novo padrão");
      await campo.fill("5+2");
      await page.getByRole("button", { name: "Adicionar padrão" }).click();
      const aviso = page.locator('[data-sonner-toast][data-type="error"]');
      await expect(aviso).toContainText("falha simulada");
      await expect(aviso.locator("[data-close-button]")).toBeVisible();
      expect(await page.getByRole("main").getByRole("alert").count()).toBe(0);
      await expect(campo).toHaveValue("5+2");
      expect(contar(banco, "SELECT COUNT(*) FROM padroes_blocos")).toBe(padroes);
    });
  });

  test.describe("com a carga falhando", () => {
    test.use({ opcoesPonte: { falharQuando: /FROM padroes_blocos/ } });

    test("o erro de carga fica na página, e não num aviso", async ({ page }) => {
      await irPara(page, "Regras");
      await expect(page.getByRole("main").getByRole("alert")).toContainText("falha simulada");
      await expect(page.getByText("Erro fora da tela")).toHaveCount(0);
      expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
    });
  });

  test("a divisão mal escrita é recusada junto do campo, e a mensagem sai ao digitar", async ({ page, banco }) => {
    const padroes = contar(banco, "SELECT COUNT(*) FROM padroes_blocos");
    await irPara(page, "Regras");
    const campo = page.getByLabel("Divisão do novo padrão");
    await campo.fill("2+x");
    await page.getByRole("button", { name: "Adicionar padrão" }).click();
    await expect(campo).toHaveAttribute("aria-invalid", "true");
    await expect(campo).toHaveAccessibleDescription('Escreva o padrão como "2+2" ou "3+1" — números somados.');
    // Uma mensagem só, a do campo: o alerta do topo da página é da carga.
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("alert")).toHaveAttribute("id", "erro-do-novo-padrao");
    await expect(campo).toBeFocused();
    expect(contar(banco, "SELECT COUNT(*) FROM padroes_blocos")).toBe(padroes);
    await campo.fill("2+");
    await expect(campo).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/Escreva o padrão como/)).toHaveCount(0);
  });

  test("o chip do padrão se chama pelo que o clique faz, e o \"salvo\" é anunciado", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Regras");
    // A região existe antes de haver o que dizer: é a mudança dentro dela que o leitor de tela anuncia.
    const salvo = page.getByRole("main").locator("header").getByRole("status");
    await expect(salvo).toHaveText("");
    await page.getByRole("button", { name: "Remover o padrão 3+1 (nota 1)" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM padroes_blocos WHERE padrao = '3+1'")).toBe(0);
    await expect(salvo).toHaveText("salvo");
  });
});

test.describe("contagem do cabeçalho durante a carga", () => {
  test.use({ semMassa: true });

  for (const [tela, consulta, contagem, carregada] of [
    ["Professores", "FROM professores p", "0 de 0", "0 de 0"],
    ["Salas", "FROM salas s", "0 de 0", "0 de 0"],
    ["Tipos de disciplina", "FROM tipos_disciplina t", "0 tipo(s)", "0 tipo(s)"],
    ["Gerenciar cursos", "FROM cursos c", "0 curso(s)", "1 curso(s)"],
  ] as const) {
    test(`${tela}: sem número enquanto a lista não chega`, async ({ page }) => {
      const consultas = await segurarConsultas(page, consulta);
      await irPara(page, tela);
      await expect.poll(consultas.seguras).toBeGreaterThan(0);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.getByText(contagem, { exact: true }).count()).toBe(0);
      const altura = (await page.locator("main header").boundingBox())!.height;
      await consultas.soltar();
      await expect(page.getByText(carregada, { exact: true })).toBeVisible();
      // O número chega sem empurrar a tela: o cabeçalho tem a mesma altura antes e depois.
      expect((await page.locator("main header").boundingBox())!.height).toBe(altura);
    });
  }
});

test.describe("lista de professores", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);`,
  });

  test("busca sem resultado oferece limpar a busca", async ({ page }) => {
    await irPara(page, "Professores");
    const busca = page.getByLabel("Buscar");
    await busca.fill("zzzz");
    await expect(page.getByText("Nenhum professor encontrado.")).toBeVisible();
    await page.getByRole("button", { name: "Limpar busca" }).click();
    await expect(busca).toHaveValue("");
    await expect(page.getByText("2 de 2")).toBeVisible();
  });

  test("o aviso que ficou aberto se fecha com o diálogo por cima dele", async ({ page }) => {
    await irPara(page, "Professores");
    // O professor com disciplina não é removido, e o aviso de erro fica até ser fechado.
    await linhaCom(page, "Ana Souza").getByRole("button", { name: "Remover" }).click();
    const aviso = page.locator("[data-sonner-toast]", { hasText: "disciplina(s) atribuída(s)" });
    await expect(aviso).toBeVisible();
    await page.getByRole("button", { name: "Novo professor" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Com o diálogo aberto o resto da página não recebe o ponteiro; o aviso recebe.
    await aviso.locator("[data-close-button]").click();
    await expect(aviso).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("troca de curso em Períodos", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');`,
  });

  test("a legenda não fica com os turnos do curso anterior enquanto o novo carrega", async ({ page }) => {
    await irPara(page, "Períodos");
    await expect(page.getByText(/Este curso ocupa/)).toBeVisible();
    const consultas = await segurarConsultas(page, "SELECT turnos FROM cursos WHERE id = ?");
    await escolher(page.getByRole("navigation").getByRole("combobox", { name: "Curso" }), "Beta");
    await expect.poll(consultas.seguras).toBe(1);
    // Com a lista de cursos aberta o resto da página sai da árvore de acessibilidade.
    await expect(page.getByRole("listbox")).toHaveCount(0);
    expect(await page.getByText(/Este curso ocupa/).count()).toBe(0);
    await consultas.soltar();
    await expect(page.getByText(/Este curso ocupa/)).toBeVisible();
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
