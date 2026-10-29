import { expect, test } from "./fixtures";
import { AULAS_DA_GRADE, celula, contar, escolher, gerarEAplicar, irPara, responderConfirmacoes, segurarConsultas } from "./paginas";

const SEMENTE = `
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
  INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 4, 0);
  INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4);
  INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 0, 1, 1, 1);`;

test.use({ semMassa: true, semente: SEMENTE });

const total = (banco: import("node:sqlite").DatabaseSync) => contar(banco, "SELECT COUNT(*) FROM alocacoes");

test("clicar na aula não a remove; o botão remove e o toast desfaz", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").click();
  await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
  expect(total(banco)).toBe(2);

  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(() => total(banco)).toBe(1);
  await page.getByRole("button", { name: "Desfazer" }).last().click(); // o do toast
  await expect.poll(() => total(banco)).toBe(2);
  await expect(page.getByText("Desfeito: Remover Cálculo")).toBeVisible();
});

test("Ctrl+Z desfaz a alocação", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Terça", "M1").click();
  await expect.poll(() => total(banco)).toBe(3);
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
  await expect(celula(page, "Terça", "M1")).not.toContainText("Cálculo");
});

test("o botão Desfazer começa desabilitado e desfaz em ordem", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const desfazer = page.getByRole("main").getByRole("button", { name: "Desfazer" });
  await expect(desfazer).toBeDisabled();
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await celula(page, "Segunda", "M2").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(() => total(banco)).toBe(0);
  await desfazer.click();
  await expect.poll(() => total(banco)).toBe(1);
  await desfazer.click();
  await expect.poll(() => total(banco)).toBe(2);
  await expect(desfazer).toBeDisabled();
});

test("limpar período confirma, e desfazer devolve as aulas", async ({ page, banco }) => {
  const mensagens = await responderConfirmacoes(page);
  await irPara(page, "Manual");
  await page.getByRole("button", { name: "Limpar período" }).click();
  await expect.poll(() => total(banco)).toBe(0);
  expect(mensagens.join("\n")).toMatch(/Apagar as aulas do 1º período\?/);
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
});

test("fixar pelo botão, e a aula fixada não pode ser removida", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const aula = celula(page, "Segunda", "M1");
  await aula.getByRole("button", { name: "Fixar" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(1);
  await expect(aula.getByRole("button", { name: "Remover aula" })).toBeDisabled();
  await aula.getByRole("button", { name: "Soltar" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(0);
});

test("uma alteração de cadastro zera o histórico", async ({ page }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeEnabled();
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await irPara(page, "Manual");
  await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeDisabled();
});

test.describe("dois cursos", () => {
  test.use({
    semente: `${SEMENTE}
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Zeta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (2, 1, 'manha');`,
  });

  test("trocar de curso zera o histórico", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
    await expect.poll(() => total(banco)).toBe(1);
    const desfazer = page.getByRole("main").getByRole("button", { name: "Desfazer" });
    await expect(desfazer).toBeEnabled();

    const curso = page.getByRole("navigation").getByRole("combobox", { name: "Curso" });
    await escolher(curso, "Zeta");
    await expect(curso).toHaveText("Zeta");
    await escolher(curso, "Alfa");
    await expect(curso).toHaveText("Alfa");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await irPara(page, "Manual");
    // De volta ao primeiro curso, com a grade dele carregada: a aula que ficou.
    await expect(celula(page, "Segunda", "M2")).toContainText("Cálculo");
    await expect(desfazer).toBeDisabled();

    // O Ctrl+Z não restaura a aula removida antes da troca. Marco: fixar a
    // outra, pela mesma fila; um desfazer estaria antes dela.
    await page.keyboard.press("Control+z");
    await celula(page, "Segunda", "M2").click({ button: "right" });
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(1);
    expect(total(banco)).toBe(1);
    expect(await page.getByText(/^Desfeito/).count()).toBe(0);
  });
});

test("as células vazias são alcançáveis pelo teclado", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Quarta", "M1").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => total(banco)).toBe(3);
});

test("remover de aula fixada não age por clique, Enter nem Espaço, e a dica diz o motivo", async ({ page, banco }) => {
  banco.exec("UPDATE alocacoes SET fixada = 1 WHERE dia = 0 AND hora = 0");
  await page.reload();
  await irPara(page, "Manual");
  const fixada = celula(page, "Segunda", "M1");
  const remover = fixada.getByRole("button", { name: "Remover aula" });
  await expect(remover).toBeDisabled();
  // `force`: o Playwright esperaria o botão habilitar; o que se confere aqui é
  // justamente o clique no desabilitado.
  await remover.click({ force: true });
  // Chega pelo teclado, a partir do vizinho: é o foco de teclado que abre a dica.
  await fixada.getByRole("button", { name: "Soltar" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(remover).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText("Solte o cadeado para remover");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  // Marco: uma gravação que vem depois das três tentativas. Se alguma delas
  // tivesse removido a aula fixada, a contagem aqui seria 0.
  await celula(page, "Segunda", "M2").getByRole("button", { name: "Remover aula" }).click();
  await expect(celula(page, "Segunda", "M2")).not.toContainText("Cálculo");
  expect(total(banco)).toBe(1);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 0 AND hora = 0 AND fixada = 1")).toBe(1);
  await expect(fixada).toContainText("Cálculo");
  // O aviso é do toast, não da dica (que também diz isto): se o botão deixasse
  // o clique passar, a guarda de `removerAula` o acenderia. A afirmação vem
  // depois do marco, quando o aviso, se houvesse, ainda estaria na tela.
  expect(await page.locator("[data-sonner-toast]", { hasText: "Solte o cadeado para remover" }).count()).toBe(0);
});

test("sem o que desfazer, o botão é alcançável pelo teclado e diz por quê", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const desfazer = page.getByRole("main").getByRole("button", { name: "Desfazer" });
  await expect(desfazer).toBeDisabled();
  await page.getByRole("button", { name: "Limpar período" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(desfazer).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText("Nada para desfazer");
  await page.keyboard.press("Enter");
  await desfazer.click({ force: true });
  // Marco: uma ação de verdade depois das tentativas; nada foi desfeito antes dela.
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect(desfazer).toBeEnabled();
  expect(total(banco)).toBe(1);
  expect(await page.getByText(/^Desfeito/).count()).toBe(0);
  // Com o que desfazer, a dica diz o quê.
  await page.getByRole("button", { name: "Limpar período" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("tooltip")).toHaveText("Desfazer: Remover Cálculo (Ctrl+Z)");
});

test("segurar Ctrl+Z desfaz uma ação só", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await celula(page, "Segunda", "M2").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(() => total(banco)).toBe(0);
  await page.keyboard.down("Control");
  await page.keyboard.down("z");
  await page.keyboard.down("z"); // sem soltar: chega com `repeat`
  await page.keyboard.down("z");
  await page.keyboard.up("z");
  await page.keyboard.up("Control");
  await expect(page.getByText("Desfeito: Remover Cálculo")).toBeVisible();
  await expect(celula(page, "Segunda", "M2")).toContainText("Cálculo");
  expect(total(banco)).toBe(1);
  // Um segundo toque é outra ação desfeita.
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
});

test.describe("falha ao gravar", () => {
  test.use({ opcoesPonte: { falharQuando: /^DELETE FROM alocacoes WHERE curso_id = \? AND periodo = \? AND dia/ } });

  test("avisa, e a aula continua na grade", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
    await expect(page.getByText(/falha simulada/)).toBeVisible();
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    expect(total(banco)).toBe(2);
    await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeDisabled();
  });
});

test.describe("falha ao carregar", () => {
  test.use({ opcoesPonte: { falharQuando: /^SELECT \* FROM horarios ORDER BY indice/ } });

  test("o erro aparece na página", async ({ page }) => {
    await irPara(page, "Manual");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("falha simulada");
  });
});

test("Ctrl+Z não age com a confirmação aberta", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Fixar" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(1);
  await page.getByRole("button", { name: "Limpar período" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Control+z");
  // Marco: confirmar a limpeza, que entra na mesma fila do histórico. Um
  // desfazer indevido teria soltado a aula antes, e a limpeza a levaria junto.
  await page.getByRole("alertdialog").getByRole("button", { name: "Limpar período" }).click();
  await expect(celula(page, "Segunda", "M2")).not.toContainText("Cálculo");
  expect(total(banco)).toBe(1);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(1);
  expect(await page.getByText(/^Desfeito/).count()).toBe(0);
  // Fechado o diálogo, o atalho volta a valer e as duas ações continuam no
  // histórico: a limpeza volta primeiro, a fixação depois.
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(1);
  await page.keyboard.press("Control+z");
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(0);
});

test("só o toast mais recente oferece Desfazer", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const avisos = page.locator("[data-sonner-toast]");
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect(avisos.filter({ hasText: "removida de" })).toBeVisible();
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Terça", "M1").click();
  await expect(celula(page, "Terça", "M1")).toContainText("Cálculo");
  // O toast da remoção sai quando a alocação entra no histórico; o prazo dele
  // é de 10 s, então esperar menos que isso não passa por ele ter vencido.
  await expect(avisos.filter({ hasText: "removida de" })).toHaveCount(0, { timeout: 3_000 });
  expect(await avisos.getByRole("button", { name: "Desfazer" }).count()).toBe(0);
  // O que o Ctrl+Z desfaz é a alocação, a última.
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(1);
  await expect(celula(page, "Terça", "M1")).not.toContainText("Cálculo");
});

test("o toast de desfazer sai quando o histórico é zerado", async ({ page }) => {
  await irPara(page, "Manual");
  const avisos = page.locator("[data-sonner-toast]");
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect(avisos.filter({ hasText: "removida de" })).toBeVisible();
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(avisos.filter({ hasText: "removida de" })).toHaveCount(0, { timeout: 3_000 });
});

test("duplo clique em Remover aula grava e registra uma vez só", async ({ page, banco }) => {
  await irPara(page, "Manual");
  // Dois cliques no mesmo turno do JavaScript: o segundo sai antes da recarga.
  await celula(page, "Segunda", "M1")
    .getByRole("button", { name: "Remover aula" })
    .evaluate((botao: HTMLElement) => {
      botao.click();
      botao.click();
    });
  await expect.poll(() => total(banco)).toBe(1);
  await expect(celula(page, "Segunda", "M1")).not.toContainText("Cálculo");
  // Um registro só: um Ctrl+Z devolve a aula (com dois, o segundo "antes" já
  // não a tinha e nada voltaria).
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
});

test("o botão direito na célula vazia não abre o menu do navegador", async ({ page }) => {
  await irPara(page, "Manual");
  const impedido = await celula(page, "Quarta", "M1").evaluate((el) => {
    const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    el.dispatchEvent(evento);
    return evento.defaultPrevented;
  });
  expect(impedido).toBe(true);
});

test("o motivo de Limpar período fica antes dos botões, na altura deles, e some ao soltar", async ({ page, banco }) => {
  banco.exec("UPDATE alocacoes SET fixada = 1");
  await page.reload();
  await irPara(page, "Manual");
  const main = page.getByRole("main");
  const motivo = main.getByText("As aulas deste período estão fixadas.");
  const desfazer = main.getByRole("button", { name: "Desfazer" });
  const limpar = main.getByRole("button", { name: "Limpar período" });
  await expect(motivo).toBeVisible();
  const [m, d, l] = await Promise.all([motivo.boundingBox(), desfazer.boundingBox(), limpar.boundingBox()]);
  expect(m!.x + m!.width).toBeLessThanOrEqual(d!.x);
  const centro = (c: { y: number; height: number }) => c.y + c.height / 2;
  expect(Math.abs(centro(m!) - centro(d!))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(centro(m!) - centro(l!))).toBeLessThanOrEqual(0.5);
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Soltar" }).click();
  await expect(motivo).toHaveCount(0);
  await expect(limpar).toBeEnabled();
  // O motivo aparecer e sumir não mexe nos botões.
  const depois = await desfazer.boundingBox();
  expect(depois!.x).toBe(d!.x);
});

test("alocar pelo teclado e remover pelo botão devolvem o foco à célula", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Quarta", "M1").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => total(banco)).toBe(3);
  await expect(celula(page, "Quarta", "M1")).toContainText("Cálculo");
  await expect(celula(page, "Quarta", "M1")).toBeFocused();
  // Remover pelo teclado: o foco vai ao botão da célula que ficou vazia.
  const remover = celula(page, "Quarta", "M1").getByRole("button", { name: "Remover aula" });
  await remover.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => total(banco)).toBe(2);
  await expect(celula(page, "Quarta", "M1")).not.toContainText("Cálculo");
  await expect(celula(page, "Quarta", "M1")).toBeFocused();
});

test("o foco só volta à célula se estava nela", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const pendencia = page.getByRole("button", { name: /Cálculo/ });
  await pendencia.click();
  // O `click()` do DOM não leva o foco: ele continua na pendência.
  await celula(page, "Quarta", "M1").evaluate((el: HTMLElement) => el.click());
  await expect.poll(() => total(banco)).toBe(3);
  await expect(celula(page, "Quarta", "M1")).toContainText("Cálculo");
  await expect(pendencia).toBeFocused();
});

test("a célula vazia sem pendência escolhida diz o que falta", async ({ page }) => {
  await irPara(page, "Manual");
  await expect(celula(page, "Quarta", "M1")).toHaveAccessibleDescription("Escolha uma pendência para alocar");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await expect(celula(page, "Quarta", "M1")).toHaveAccessibleDescription("Alocar");
});

test("dois cliques seguidos em Alocar gravam uma aula e não dão erro", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Quarta", "M1").evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });
  await expect(celula(page, "Quarta", "M1")).toContainText("Cálculo");
  // Marco: fixar outra aula, que entra na mesma fila de gravação e não abre
  // aviso. O erro do segundo clique, se houvesse, já estaria na tela quando o
  // cadeado dela aparece.
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Fixar" }).click();
  await expect(celula(page, "Segunda", "M1").getByRole("button", { name: "Soltar" })).toBeVisible();
  expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
  expect(total(banco)).toBe(3);
});

test("a célula continua travada até a tela mostrar a ação, mesmo com a carga dela superada", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await expect(celula(page, "Segunda", "M2")).toContainText("Cálculo");
  const consultas = await segurarConsultas(page, AULAS_DA_GRADE);
  // A carga da primeira remoção fica parada; a da segunda a supera.
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(consultas.seguras).toBe(1);
  await celula(page, "Segunda", "M2").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(consultas.seguras).toBe(2);
  expect(total(banco)).toBe(0);
  // A carga superada termina, e a tela ainda mostra a aula de M1 (a carga que
  // vale não chegou): o segundo "Remover" nela tem de ser ignorado.
  await consultas.soltar(1);
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await consultas.soltar();
  await expect(celula(page, "Segunda", "M1")).not.toContainText("Cálculo");
  await expect(celula(page, "Segunda", "M2")).not.toContainText("Cálculo");
  // Dois registros, um por aula: dois Ctrl+Z devolvem as duas. Com um terceiro
  // (a remoção repetida, cujo "antes" já não tinha aula), o primeiro Ctrl+Z não
  // devolveria nada.
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(1);
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
});

test.describe("dois períodos", () => {
  test.use({
    semente: `${SEMENTE}
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (2, 1, 'Física', 2, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (2, 2, 2);`,
  });

  test("a ação em voo num período não trava o mesmo horário de outro", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    const consultas = await segurarConsultas(page, AULAS_DA_GRADE);
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
    await expect.poll(consultas.seguras).toBe(1);
    // Com a remoção do 1º período ainda em voo, o mesmo horário do 2º aloca.
    await page.getByRole("button", { name: "2º", exact: true }).click();
    await page.getByRole("button", { name: /Física/ }).click();
    await celula(page, "Segunda", "M1").click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE periodo = 2")).toBe(1);
    await consultas.soltar();
    await expect(celula(page, "Segunda", "M1")).toContainText("Física");
  });
});

test.describe("grade gerada", () => {
  // Estes usam a massa, que a SEMENTE do arquivo dispensa.
  test.use({ semMassa: false, semente: "" });

  const TOTAL_DO_CURSO =
    "SELECT SUM(dp.aulas) FROM disciplina_professores dp JOIN disciplinas d ON d.id = dp.disciplina_id WHERE d.curso_id = 1";
  const ALOCADAS = "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1";

  /** Tira o 1º período da grade (a massa é toda resolúvel) e devolve quantas aulas sobram. */
  async function esvaziarOPrimeiro(page: import("@playwright/test").Page, banco: import("node:sqlite").DatabaseSync) {
    banco.exec("DELETE FROM alocacoes WHERE curso_id = 1 AND periodo = 1");
    await page.reload();
    return contar(banco, ALOCADAS);
  }

  test("aplicar, abrir a grade manual pelo botão e desfazer lá", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    // A massa é totalmente resolúvel: a grade gerada coloca todas as aulas.
    const total = contar(banco, TOTAL_DO_CURSO);
    const semOPrimeiro = await esvaziarOPrimeiro(page, banco);
    expect(semOPrimeiro).toBeLessThan(total);

    await irPara(page, "Automática");
    await gerarEAplicar(page);
    await expect.poll(() => contar(banco, ALOCADAS)).toBe(total);

    await page.getByRole("button", { name: "Abrir a grade manual" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Grade horária");
    await page.getByRole("main").getByRole("button", { name: "Desfazer" }).click();
    await expect.poll(() => contar(banco, ALOCADAS)).toBe(semOPrimeiro);
  });

  test("Ctrl+Z na própria tela devolve o antes, e o comparativo parte dele", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    const total = contar(banco, TOTAL_DO_CURSO);
    const semOPrimeiro = await esvaziarOPrimeiro(page, banco);

    await irPara(page, "Automática");
    await gerarEAplicar(page);
    // O toast oferece o desfazer da ação que acabou de entrar no histórico.
    await expect(page.locator("[data-sonner-toast]").getByRole("button", { name: "Desfazer" })).toBeVisible();
    await expect.poll(() => contar(banco, ALOCADAS)).toBe(total);

    await page.keyboard.press("Control+z");
    await expect.poll(() => contar(banco, ALOCADAS)).toBe(semOPrimeiro);
    // O aviso falava da grade que acabou de sair.
    await expect(page.getByText("Grade aplicada.")).toHaveCount(0);

    await page.getByRole("button", { name: "Gerar grade" }).click();
    const aulas = page.getByRole("row", { name: /Aulas alocadas/ }).getByRole("cell");
    await expect(aulas.nth(1)).toHaveText(String(semOPrimeiro), { timeout: 30_000 });
    // Mais aulas é melhor: a palavra diz, e não só a cor. Sem seta nem legenda.
    await expect(aulas.nth(2)).toHaveText(`${total} melhor`);
    expect(await page.getByRole("main").getByText(/[▲▼]|Em Gerada/).count()).toBe(0);
  });

  test("sem mudança, o comparativo diz igual", async ({ page }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Automática");
    await gerarEAplicar(page);
    await page.getByRole("button", { name: "Gerar grade" }).click();
    const aulas = page.getByRole("row", { name: /Aulas alocadas/ }).getByRole("cell");
    await expect(aulas.nth(2)).toHaveText(/^\d+ igual$/, { timeout: 30_000 });
  });

  test("gerar de novo deixa o resultado anterior à vista, sem poder ser aplicado, até o novo chegar", async ({ page }) => {
    await irPara(page, "Automática");
    await page.getByRole("button", { name: "Gerar grade" }).click();
    await expect(page.getByRole("button", { name: "Aplicar esta grade" })).toBeEnabled({ timeout: 30_000 });
    // A geração ocupa o fio da interface: de fora não dá para olhar no meio
    // dela. Um observador na página anota o que a tela mostra a cada desenho
    // em que o botão diz "Gerando…".
    await page.evaluate(() => {
      const w = window as unknown as { __durante: { resultado: boolean; aplicar: boolean | null; descartar: boolean | null; motivo: string }[] };
      w.__durante = [];
      const botao = (texto: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === texto);
      new MutationObserver(() => {
        if (!botao("Gerando…")) return;
        w.__durante.push({
          resultado: [...document.querySelectorAll("h2")].some((h) => h.textContent === "Resultado"),
          aplicar: botao("Aplicar esta grade")?.disabled ?? null,
          descartar: botao("Descartar")?.disabled ?? null,
          motivo: document.getElementById("motivo-grade-automatica")?.textContent ?? "",
        });
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    await page.getByRole("button", { name: "Gerar grade" }).click();
    await expect(page.getByRole("button", { name: "Aplicar esta grade" })).toBeEnabled({ timeout: 30_000 });
    const durante = await page.evaluate(() => (window as unknown as { __durante: unknown[] }).__durante);
    expect(durante.length).toBeGreaterThan(0);
    for (const amostra of durante)
      expect(amostra).toEqual({ resultado: true, aplicar: true, descartar: true, motivo: "Gerando a grade…" });
    // Terminada a geração, o motivo sai.
    expect(await page.getByText("Gerando a grade…").count()).toBe(0);
  });

  test("enquanto aplica, os botões ficam parados e dizem por quê; terminando, um Ctrl+Z desfaz tudo", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    const semOPrimeiro = await esvaziarOPrimeiro(page, banco);
    await irPara(page, "Automática");
    await page.getByRole("button", { name: "Gerar grade" }).click();
    const aplicar = page.getByRole("button", { name: "Aplicar esta grade" });
    await aplicar.waitFor({ timeout: 30_000 });

    // O "antes" do histórico é a primeira leitura da aplicação: segurá-la é parar no meio dela.
    const consultas = await segurarConsultas(page, "SELECT * FROM alocacoes WHERE curso_id = ?");
    await aplicar.click();
    await expect.poll(consultas.seguras).toBe(1);
    const aplicando = page.getByRole("button", { name: "Aplicando…" });
    await expect(aplicando).toBeDisabled();
    await expect(page.getByRole("button", { name: "Descartar" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Gerar grade" })).toBeDisabled();
    // O motivo está escrito, à vista, e ligado aos três botões.
    await expect(page.getByRole("main").getByText("Aplicando a grade…")).toBeVisible();
    for (const botao of [aplicando, page.getByRole("button", { name: "Descartar" }), page.getByRole("button", { name: "Gerar grade" })])
      await expect(botao).toHaveAccessibleDescription("Aplicando a grade…");
    // Um segundo clique, que o botão desabilitado não deixa passar, não grava nada.
    await aplicando.evaluate((el: HTMLElement) => el.click());
    expect(contar(banco, ALOCADAS)).toBe(semOPrimeiro);

    await consultas.soltar();
    await expect(page.getByText("Grade aplicada.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar grade" })).toBeEnabled();
    expect(await page.getByText("Aplicando a grade…").count()).toBe(0);
    // Uma ação no histórico: um Ctrl+Z devolve o antes, e o botão fica sem o que desfazer.
    await page.keyboard.press("Control+z");
    await expect.poll(() => contar(banco, ALOCADAS)).toBe(semOPrimeiro);
    await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toHaveAttribute("aria-disabled", "true");
  });

  test("um desfazer que chega enquanto a tela recarrega depois de aplicar não deixa o aviso de grade aplicada", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    const total = contar(banco, TOTAL_DO_CURSO);
    const semOPrimeiro = await esvaziarOPrimeiro(page, banco);
    await irPara(page, "Automática");
    await page.getByRole("button", { name: "Gerar grade" }).click();
    const aplicar = page.getByRole("button", { name: "Aplicar esta grade" });
    await aplicar.waitFor({ timeout: 30_000 });

    // A mesma leitura serve ao "antes" do histórico e à recarga da tela: a
    // primeira segue, e a aplicação fica parada na recarga que vem depois dela.
    const consultas = await segurarConsultas(page, "SELECT * FROM alocacoes WHERE curso_id = ?");
    await aplicar.click();
    await expect.poll(consultas.seguras).toBe(1);
    await consultas.soltar(1);
    await expect.poll(() => contar(banco, ALOCADAS)).toBe(total);
    await expect.poll(consultas.seguras).toBe(1);
    // O desfazer chega no meio da recarga, e a recarga dele também fica parada.
    await page.keyboard.press("Control+z");
    await expect.poll(() => contar(banco, ALOCADAS)).toBe(semOPrimeiro);
    await expect.poll(consultas.seguras).toBe(2);
    await consultas.soltar();
    // Marco: os botões só voltam depois de a aplicação terminar o que tinha a fazer.
    await expect(page.getByRole("button", { name: "Gerar grade" })).toBeEnabled();
    expect(await page.getByText("Grade aplicada.").count()).toBe(0);
    expect(await page.getByRole("button", { name: "Abrir a grade manual" }).count()).toBe(0);
  });
});

test.describe("grade gerada, troca de curso", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0), (2, 2, 'Física', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 2, 2);`,
  });

  test("a grade gerada para um curso não fica à mostra, nem se aplica, no outro", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    await irPara(page, "Automática");
    await page.getByRole("button", { name: "Gerar grade" }).click();
    await expect(page.getByRole("button", { name: "Aplicar esta grade" })).toBeVisible({ timeout: 30_000 });

    // A carga do curso novo fica parada: é o intervalo em que a tela ainda tinha o resultado do antigo.
    const consultas = await segurarConsultas(page, "SELECT * FROM alocacoes WHERE curso_id = ?");
    await escolher(page.getByRole("navigation").getByRole("combobox", { name: "Curso" }), "Beta");
    await expect.poll(consultas.seguras).toBe(1);
    // Com a lista de cursos aberta, o resto da página sai da árvore de acessibilidade: espera ela fechar,
    // senão a contagem seria zero por isso e o teste passaria com o defeito.
    await expect(page.getByRole("listbox")).toHaveCount(0);
    expect(await page.getByRole("button", { name: "Aplicar esta grade" }).count()).toBe(0);
    await consultas.soltar();
    await expect(page.getByRole("button", { name: "Gerar grade" })).toBeEnabled();
    expect(await page.getByRole("button", { name: "Aplicar esta grade" }).count()).toBe(0);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
  });

  test("a carga do curso de que se saiu, falhando depois, não põe erro na tela do outro", async ({ page }) => {
    // A leitura das aulas do primeiro curso fica parada, e falha quando o teste mandar.
    await page.evaluate(() => {
      type Interno = { invoke: (cmd: string, args?: { query?: unknown; values?: unknown[] }) => Promise<unknown> };
      const w = window as unknown as { __TAURI_INTERNALS__: Interno; __falhar: (() => void)[] };
      const invocar = w.__TAURI_INTERNALS__.invoke;
      w.__falhar = [];
      w.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
        const doPrimeiro = String(args?.query).includes("SELECT * FROM alocacoes WHERE curso_id = ?") && args?.values?.[0] === 1;
        if (cmd === "plugin:sql|select" && doPrimeiro)
          await new Promise<void>((_, falha) => w.__falhar.push(() => falha("falha simulada")));
        return invocar(cmd, args);
      };
    });
    await irPara(page, "Automática");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __falhar: unknown[] }).__falhar.length)).toBeGreaterThan(0);
    await escolher(page.getByRole("navigation").getByRole("combobox", { name: "Curso" }), "Beta");
    // A tela já é a do segundo curso, carregada.
    await expect(page.getByRole("main").getByText(/2 aula\(s\) a distribuir/)).toBeVisible();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    // A falha chega agora. Marco: dois quadros depois dela a tela já a teria desenhado.
    await page.evaluate(async () => {
      (window as unknown as { __falhar: (() => void)[] }).__falhar.splice(0).forEach((falhar) => falhar());
      await new Promise((seguir) => requestAnimationFrame(() => requestAnimationFrame(seguir)));
    });
    expect(await page.getByRole("main").getByRole("alert").count()).toBe(0);
    await expect(page.getByRole("button", { name: "Gerar grade" })).toBeEnabled();
  });
});
