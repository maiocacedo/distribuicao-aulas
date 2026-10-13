import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { AULAS_DA_GRADE, arrastar, celula, contar, irPara, segurarConsultas } from "./paginas";

const BASE = `
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
  INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
  INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 4);
  INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4);`;

const AULA = `${BASE}
  INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 2);`;

const onde = (banco: import("node:sqlite").DatabaseSync, dia: number, hora: number) =>
  contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = ? AND hora = ?", dia, hora);

const fixadas = (banco: import("node:sqlite").DatabaseSync) =>
  contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1");

/** Pega a origem e leva o ponteiro até o destino, sem soltar. */
async function pegar(page: Page, origem: Locator, destino: Locator) {
  const de = (await origem.boundingBox())!;
  const para = (await destino.boundingBox())!;
  await page.mouse.move(de.x + 10, de.y + 10);
  await page.mouse.down();
  await page.mouse.move(de.x + 30, de.y + 30, { steps: 4 });
  await page.mouse.move(para.x + para.width / 2, para.y + para.height / 2, { steps: 10 });
}

/**
 * Marco para afirmar que nada foi gravado: fixa (ou solta) a aula pelo botão,
 * o que entra na mesma fila de gravação. Uma gravação indevida do arrasto já
 * estaria no banco quando esta chega.
 */
async function alternarCadeado(page: Page, aula: Locator, banco: import("node:sqlite").DatabaseSync) {
  const antes = fixadas(banco);
  await aula.getByRole("button", { name: /^(Fixar|Soltar)$/ }).click();
  await expect.poll(() => fixadas(banco)).not.toBe(antes);
}

test.describe("pendência", () => {
  test.use({ semMassa: true, semente: `${BASE} INSERT INTO indisponibilidades (professor_id, dia, hora) VALUES (1, 2, 0);` });

  test("arrastar para célula apta aloca", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, page.getByRole("button", { name: /Cálculo/ }), celula(page, "Terça", "M2"));
    await expect.poll(() => onde(banco, 1, 1)).toBe(1);
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
  });

  test("durante o arrasto a célula impedida mostra o motivo, e soltar nela não grava", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    const de = (await pendencia.boundingBox())!;
    const alvo = (await celula(page, "Quarta", "M1").boundingBox())!;
    await page.mouse.move(de.x + 10, de.y + 10);
    await page.mouse.down();
    await page.mouse.move(de.x + 30, de.y + 30, { steps: 4 });
    await page.mouse.move(alvo.x + alvo.width / 2, alvo.y + alvo.height / 2, { steps: 10 });
    await expect(celula(page, "Quarta", "M1")).toContainText("A. Souza indisponível");
    await page.mouse.up();
    await expect(page.getByText("A. Souza indisponível").last()).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
    // Marco: uma alocação de verdade, pela mesma fila. Se soltar na impedida
    // tivesse gravado, seriam duas aulas.
    await arrastar(page, pendencia, celula(page, "Terça", "M2"));
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
  });

  test("arrastar não escolhe a pendência, e o clique continua escolhendo", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await arrastar(page, pendencia, celula(page, "Terça", "M2"));
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
    await expect(pendencia).toHaveAttribute("aria-pressed", "false");
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
    await celula(page, "Quinta", "M1").click();
    await expect.poll(() => onde(banco, 3, 0)).toBe(1);
  });

  test("Esc cancela o arrasto, nada é gravado e a pendência escolhida continua escolhida", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
    await pegar(page, pendencia, celula(page, "Quinta", "M3"));
    await expect(page.locator(".celula.arrastando")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".celula.arrastando")).toHaveCount(0);
    await page.mouse.up();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
    // Marco: a pendência continua em mãos, e alocar pelo clique grava uma aula
    // só, onde foi clicado.
    await celula(page, "Terça", "M2").click();
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    expect(onde(banco, 3, 2)).toBe(0);
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
  });

  test("soltar o mouse sobre a própria pendência depois do Esc não a escolhe", async ({ page }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    const caixa = (await pendencia.boundingBox())!;
    // O relógio é o do teste: o dnd-kit engole por 50 ms o clique que vem logo
    // depois de um arrasto, e quem desiste com o Esc demora mais que isso para
    // soltar o botão. Adiantar o relógio põe o teste depois desse prazo sem
    // esperar por ele.
    await page.clock.install();
    await page.mouse.move(caixa.x + 10, caixa.y + 10);
    await page.mouse.down();
    await page.mouse.move(caixa.x + 30, caixa.y + 20, { steps: 4 });
    await expect(page.locator(".celula.arrastando")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".celula.arrastando")).toHaveCount(0);
    await page.clock.fastForward(1_000);
    await page.mouse.up();
    await page.clock.fastForward(1_000);
    // Marco: um clique de verdade em seguida escolhe. Se soltar o mouse já
    // tivesse escolhido, este a soltaria.
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("aula", () => {
  test.use({ semMassa: true, semente: AULA });

  test("arrastar para outra célula move e mantém a sala", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect.poll(() => onde(banco, 3, 2)).toBe(1);
    expect(onde(banco, 0, 0)).toBe(0);
    expect(contar(banco, "SELECT sala_id FROM alocacoes")).toBe(2);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
  });

  test("mover desfaz com Ctrl+Z", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect.poll(() => onde(banco, 3, 2)).toBe(1);
    await page.keyboard.press("Control+z");
    await expect.poll(() => onde(banco, 0, 0)).toBe(1);
  });

  test("arrastar para o painel de pendências remove", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), page.getByRole("region", { name: "Pendências" }));
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
    await expect(page.getByRole("button", { name: "Desfazer" }).last()).toBeVisible();
  });

  test("sobre as pendências, o anúncio diz que soltar ali remove", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await pegar(page, celula(page, "Segunda", "M1"), page.getByRole("region", { name: "Pendências" }));
    await expect(anuncio(page)).toHaveText("Sobre as pendências: solte para remover");
    await page.mouse.up();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
  });

  test("os botões da aula são descritos pela disciplina dela", async ({ page }) => {
    await irPara(page, "Manual");
    const aula = celula(page, "Segunda", "M1");
    await expect(aula).toHaveAccessibleName("Segunda, M1");
    await expect(aula).toHaveAccessibleDescription("Cálculo");
  });

  test("soltar na própria célula não faz nada", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const origem = celula(page, "Segunda", "M1");
    const caixa = (await origem.boundingBox())!;
    await page.mouse.move(caixa.x + 10, caixa.y + 10);
    await page.mouse.down();
    await page.mouse.move(caixa.x + 30, caixa.y + 20, { steps: 4 });
    await page.mouse.up();
    expect(onde(banco, 0, 0)).toBe(1);
    await alternarCadeado(page, origem, banco);
    expect(onde(banco, 0, 0)).toBe(1);
    // No histórico só a fixação, sem um "mover" para o mesmo lugar: desfeita
    // ela, não sobra o que desfazer.
    await page.keyboard.press("Control+z");
    await expect(page.getByText("Desfeito: Fixar Cálculo")).toBeVisible();
    await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeDisabled();
  });

  test("a sala ainda se troca pelo seletor, sem iniciar arrasto", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const sala = page.getByRole("combobox", { name: "Trocar sala de Cálculo" });
    await sala.click();
    await page.getByRole("option", { name: "A01", exact: true }).click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes")).toBe(1);
  });

  test("os botões da aula não iniciam arrasto, e o grupo continua como era", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const aula = celula(page, "Segunda", "M1");
    await expect(aula).toHaveAttribute("role", "group");
    await expect(aula).toHaveAttribute("tabindex", "-1");
    expect(await aula.getAttribute("aria-roledescription")).toBeNull();
    // Um arrasto que começa no botão de fixar não leva a aula: o gesto é do botão.
    await arrastar(page, aula.getByRole("button", { name: "Fixar" }), celula(page, "Quinta", "M3"));
    await alternarCadeado(page, aula, banco);
    expect(onde(banco, 0, 0)).toBe(1);
    expect(onde(banco, 3, 2)).toBe(0);
  });

  test("Ctrl+Z durante o arrasto não desfaz por baixo da mão", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await alternarCadeado(page, celula(page, "Segunda", "M1"), banco);
    expect(fixadas(banco)).toBe(1);
    await pegar(page, page.getByRole("button", { name: /Cálculo/ }), celula(page, "Terça", "M2"));
    await expect(page.locator(".celula.arrastando")).toBeVisible();
    await page.keyboard.press("Control+z");
    await page.mouse.up();
    // A alocação é o marco: um desfazer indevido estaria antes dela na fila e
    // teria soltado a aula fixada.
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
    expect(fixadas(banco)).toBe(1);
    expect(await page.getByText(/^Desfeito/).count()).toBe(0);
    // Solto o mouse, o atalho volta a valer.
    await page.keyboard.press("Control+z");
    await expect.poll(() => onde(banco, 1, 1)).toBe(0);
  });

  test("fixada com o botão direito depois de pega, a aula não se move, e o aviso diz por quê", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const origem = celula(page, "Segunda", "M1");
    const de = (await origem.boundingBox())!;
    const para = (await celula(page, "Quinta", "M3").boundingBox())!;
    // O botão esquerdo desce sobre a aula e, antes de o ponteiro andar os 6 px
    // que começam o arrasto, o direito a fixa: o sensor já está com ela.
    await page.mouse.move(de.x + 10, de.y + 10);
    await page.mouse.down();
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await expect.poll(() => fixadas(banco)).toBe(1);
    await expect(origem.getByRole("button", { name: "Soltar" })).toBeVisible();
    await page.mouse.move(de.x + 30, de.y + 30, { steps: 4 });
    await page.mouse.move(para.x + para.width / 2, para.y + para.height / 2, { steps: 10 });
    await expect(page.locator(".celula.arrastando")).toBeVisible();
    await page.mouse.up();
    await expect(page.locator("[data-sonner-toast]", { hasText: "Solte o cadeado para mover" })).toBeVisible();
    expect(onde(banco, 0, 0)).toBe(1);
    expect(onde(banco, 3, 2)).toBe(0);
    // No histórico só a fixação, sem um "mover" que não moveu nada: desfeita
    // ela, não sobra o que desfazer.
    await page.keyboard.press("Control+z");
    await expect(page.getByText("Desfeito: Fixar Cálculo")).toBeVisible();
    await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeDisabled();
    expect(onde(banco, 0, 0)).toBe(1);
    expect(onde(banco, 3, 2)).toBe(0);
  });
});

test.describe("aula, com a carga parada", () => {
  test.use({ semMassa: true, semente: AULA });

  test("mover trava a origem e o destino até a tela mostrar a aula no lugar novo", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    const consultas = await segurarConsultas(page, AULAS_DA_GRADE);
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect.poll(consultas.seguras).toBe(1);
    expect(onde(banco, 3, 2)).toBe(1);
    // A tela ainda é a de antes: a aula na origem, o destino vazio. Alocar no
    // destino (daria erro: já há aula lá) e remover da origem (entraria no
    // histórico sem ter o que remover) têm de ser ignorados.
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await celula(page, "Quinta", "M3").click();
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
    await consultas.soltar();
    await expect(celula(page, "Quinta", "M3")).toContainText("Cálculo");
    await expect(celula(page, "Segunda", "M1")).not.toContainText("Cálculo");
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    // O topo do histórico é o mover: um Ctrl+Z devolve a aula à origem.
    await page.keyboard.press("Control+z");
    await expect.poll(() => onde(banco, 0, 0)).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
  });
});

test.describe("a mesma pendência em duas células, com a carga parada", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 1, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1);`,
  });

  test("o segundo clique, em outra célula, não aloca além das aulas da disciplina", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
    const consultas = await segurarConsultas(page, AULAS_DA_GRADE);
    await celula(page, "Segunda", "M1").click();
    await expect.poll(consultas.seguras).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    // A tela ainda é a de antes: 0 de 1 aula, e a outra célula continua apta.
    await celula(page, "Terça", "M2").click();
    await consultas.soltar();
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    // Marco: fixar a aula, pela mesma fila. Uma segunda alocação já estaria no
    // banco quando esta chega.
    await celula(page, "Segunda", "M1").click({ button: "right" });
    await expect.poll(() => fixadas(banco)).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    expect(onde(banco, 1, 1)).toBe(0);
  });
});

test.describe("aula fixada", () => {
  test.use({ semMassa: true, semente: `${AULA} UPDATE alocacoes SET fixada = 1;` });

  test("não arrasta", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    expect(onde(banco, 0, 0)).toBe(1);
    expect(onde(banco, 3, 2)).toBe(0);
    // Nem para o painel. O marco é soltar o cadeado, pela mesma fila.
    await arrastar(page, celula(page, "Segunda", "M1"), page.getByRole("region", { name: "Pendências" }));
    await alternarCadeado(page, celula(page, "Segunda", "M1"), banco);
    expect(onde(banco, 0, 0)).toBe(1);
    expect(onde(banco, 3, 2)).toBe(0);
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
  });
});

test.describe("sala ocupada no destino", () => {
  test.use({
    semMassa: true,
    semente: `${AULA}
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (2, 1, 'Física', 2, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (2, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 2, 1, 0, 2, 2, 2);`,
  });

  test("mover para um horário em que a sala está tomada troca a sala", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Terça", "M1"));
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND dia = 1 AND hora = 0")).toBe(1);
    expect(contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
  });
});

test.describe("duas aulas", () => {
  test.use({
    semMassa: true,
    semente: `${AULA}
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 1, 1, 1, 1, 2);`,
  });

  test("soltar uma aula sobre outra não faz nada", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Terça", "M2"));
    await alternarCadeado(page, celula(page, "Segunda", "M1"), banco);
    expect(onde(banco, 0, 0)).toBe(1);
    expect(onde(banco, 1, 1)).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(2);
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
  });

  test("mover fecha o aviso de desfazer que estava aberto", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const avisos = page.locator("[data-sonner-toast]");
    await arrastar(page, celula(page, "Terça", "M2"), page.getByRole("region", { name: "Pendências" }));
    await expect(avisos.filter({ hasText: "removida de" })).toBeVisible();
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect.poll(() => onde(banco, 3, 2)).toBe(1);
    // O prazo do aviso é de 10 s: esperar menos que isso não passa por ele ter vencido.
    await expect(avisos.filter({ hasText: "removida de" })).toHaveCount(0, { timeout: 3_000 });
    expect(await avisos.getByRole("button", { name: "Desfazer" }).count()).toBe(0);
  });

  test("soltar numa célula impedida não move e avisa o motivo", async ({ page, banco }) => {
    banco.exec("INSERT INTO indisponibilidades (professor_id, dia, hora) VALUES (1, 2, 0)");
    await page.reload();
    await irPara(page, "Manual");
    await pegar(page, celula(page, "Segunda", "M1"), celula(page, "Quarta", "M1"));
    await expect(celula(page, "Quarta", "M1")).toContainText("A. Souza indisponível");
    // Quem não vê a malha ouve o mesmo motivo que está escrito na célula.
    await expect(anuncio(page)).toHaveText("Sobre Quarta, M1: A. Souza indisponível");
    await page.mouse.up();
    await expect(page.locator("[data-sonner-toast]", { hasText: "A. Souza indisponível" })).toBeVisible();
    await alternarCadeado(page, celula(page, "Segunda", "M1"), banco);
    expect(onde(banco, 0, 0)).toBe(1);
    expect(onde(banco, 2, 0)).toBe(0);
  });
});

test.describe("mover não conflita consigo mesma", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome, max_dias_semana) VALUES (1, 'Ana Souza', 1);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 1, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1);`,
  });

  // A disciplina está com todas as aulas alocadas e a professora só pode vir um
  // dia: contada a própria aula, nenhum outro dia a aceitaria.
  test("a aula de disciplina fechada vai para outro dia", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await pegar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect(celula(page, "Quinta", "M3")).toContainText("Alocar");
    await page.mouse.up();
    await expect.poll(() => onde(banco, 3, 2)).toBe(1);
    expect(onde(banco, 0, 0)).toBe(0);
  });

  test("uma recarga no meio do arrasto não faz a aula disputar o dia com ela mesma", async ({ page, banco }) => {
    // Duas aulas, em dois dias, e a professora pode vir dois: a de terça só
    // muda de dia se ela mesma não contar.
    banco.exec(`
      UPDATE professores SET max_dias_semana = 2;
      UPDATE disciplinas SET aulas_semanais = 2;
      UPDATE disciplina_professores SET aulas = 2;
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 1, 1, 1, 1);`);
    await page.reload();
    await irPara(page, "Manual");
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
    const consultas = await segurarConsultas(page, AULAS_DA_GRADE);
    // Fixar a outra aula deixa uma recarga parada; ela chega com a de terça em mãos.
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Fixar" }).click();
    await expect.poll(consultas.seguras).toBe(1);
    await pegar(page, celula(page, "Terça", "M2"), celula(page, "Quinta", "M3"));
    await expect(page.locator(".celula.arrastando")).toBeVisible();
    await consultas.soltar();
    await expect(celula(page, "Segunda", "M1").getByRole("button", { name: "Soltar" })).toBeVisible();
    await expect(celula(page, "Quinta", "M3")).toContainText("Alocar");
    await page.mouse.up();
    await expect.poll(() => onde(banco, 3, 2)).toBe(1);
    expect(onde(banco, 1, 1)).toBe(0);
  });

  test("a pendência fechada não arrasta", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, page.getByRole("button", { name: /Cálculo/ }), celula(page, "Terça", "M2"));
    // Marco: mover a aula, pela mesma fila. Arrastada, a pendência fechada
    // teria sido recusada com o aviso de que não há mais aulas a alocar.
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect(celula(page, "Quinta", "M3")).toContainText("Cálculo");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
  });
});

/** A região viva em que o dnd-kit anuncia o arrasto. */
const anuncio = (page: Page) => page.locator('[id^="DndLiveRegion"]');

test.describe("o arrasto sempre termina", () => {
  test.use({ semMassa: true, semente: BASE });

  test("pegar e soltar antes de a tela se redesenhar não deixa a página presa", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await expect(pendencia).toBeVisible();
    // O dnd-kit engole por 50 ms o clique que vem depois de um arrasto: o
    // relógio do teste passa desse prazo sem esperar por ele.
    await page.clock.install();
    // Os três eventos no mesmo turno: o arrasto começa (o ponteiro andou mais
    // que 6 px) e o botão sobe antes de o React desenhar. É o escorregão de
    // quem clica: nesse caso o dnd-kit não avisa que o arrasto acabou.
    await pendencia.evaluate((el) => {
      const { left, top } = el.getBoundingClientRect();
      const ponteiro = (tipo: string, x: number, y: number, buttons: number) =>
        new PointerEvent(tipo, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons,
          clientX: x,
          clientY: y,
        });
      el.dispatchEvent(ponteiro("pointerdown", left + 10, top + 10, 1));
      el.dispatchEvent(ponteiro("pointermove", left + 30, top + 30, 1));
      el.dispatchEvent(ponteiro("pointerup", left + 30, top + 30, 0));
    });
    await page.clock.fastForward(1_000);
    // A tela segue viva: a pendência se escolhe, o horário aloca, o Ctrl+Z desfaz.
    await pendencia.click();
    await expect(pendencia).toHaveAttribute("aria-pressed", "true");
    await celula(page, "Terça", "M2").click();
    await expect.poll(() => onde(banco, 1, 1)).toBe(1);
    await page.keyboard.press("Control+z");
    await expect.poll(() => onde(banco, 1, 1)).toBe(0);
  });

  test("a janela perde o foco no meio do arrasto: ele é cancelado, e soltar o mouse depois não grava", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await pegar(page, pendencia, celula(page, "Terça", "M2"));
    await expect(page.locator(".celula.arrastando")).toBeVisible();
    // Alt+Tab com o botão apertado: o botão sobe em outra janela, e esta não fica sabendo.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator(".celula.arrastando")).toHaveCount(0);
    await expect(celula(page, "Terça", "M2")).not.toContainText("Alocar");
    // De volta à janela, o primeiro clique não solta a carga onde o ponteiro estiver.
    await page.mouse.up();
    // Marco: uma alocação de verdade, pela mesma fila. Com a carga solta no
    // clique, seriam duas aulas.
    await arrastar(page, pendencia, celula(page, "Quinta", "M1"));
    await expect(celula(page, "Quinta", "M1")).toContainText("Cálculo");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    expect(onde(banco, 1, 1)).toBe(0);
  });

  test("o botão sobe fora da janela: o ponteiro que volta sem botão apertado cancela o arrasto, e nada é gravado", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    await pegar(page, pendencia, celula(page, "Terça", "M2"));
    await expect(page.locator(".celula.arrastando")).toBeVisible();
    // O `pointerup` ficou lá fora: o que a janela vê, na volta, é o ponteiro
    // andando sem botão nenhum apertado.
    await page.evaluate(() =>
      document.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0, clientX: 700, clientY: 400 }),
      ),
    );
    await expect(page.locator(".celula.arrastando")).toHaveCount(0);
    await expect(celula(page, "Terça", "M2")).not.toContainText("Alocar");
    // O primeiro clique depois disso não solta a carga onde o ponteiro estiver.
    await page.mouse.up();
    // Marco: uma alocação de verdade, pela mesma fila. Com a carga solta no
    // clique, seriam duas aulas.
    await arrastar(page, pendencia, celula(page, "Quinta", "M1"));
    await expect(celula(page, "Quinta", "M1")).toContainText("Cálculo");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    expect(onde(banco, 1, 1)).toBe(0);
  });

  test("soltar a pendência sobre o painel de pendências não faz nada", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    const painel = page.getByRole("region", { name: "Pendências" });
    await pegar(page, pendencia, celula(page, "Terça", "M2"));
    await expect(celula(page, "Terça", "M2")).toContainText("Alocar");
    const caixa = (await painel.boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2, { steps: 10 });
    await expect(celula(page, "Terça", "M2")).not.toHaveClass(/sobre/);
    // O painel só é destino para uma aula: não convida a soltar a pendência.
    await expect(painel).not.toHaveClass(/soltar-aqui/);
    await page.mouse.up();
    await expect(page.locator(".celula.arrastando")).toHaveCount(0);
    await expect(pendencia).toHaveAttribute("aria-pressed", "false");
    // Marco: uma alocação de verdade, pela mesma fila.
    await arrastar(page, pendencia, celula(page, "Quinta", "M1"));
    await expect(celula(page, "Quinta", "M1")).toContainText("Cálculo");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
  });

  test("o anúncio não fica para trás: some fora de um destino e depois de soltar", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    const painel = (await page.getByRole("region", { name: "Pendências" }).boundingBox())!;
    await pegar(page, pendencia, celula(page, "Terça", "M2"));
    await expect(anuncio(page)).toHaveText("Sobre Terça, M2");
    // Em mãos, a pendência fica marcada como a origem, e só enquanto está em mãos.
    await expect(pendencia).toHaveClass(/origem/);
    // Para a pendência o painel não é destino: ali não há o que anunciar.
    await page.mouse.move(painel.x + painel.width / 2, painel.y + painel.height / 2, { steps: 10 });
    await expect(anuncio(page)).toHaveText("");
    const alvo = (await celula(page, "Quinta", "M3").boundingBox())!;
    await page.mouse.move(alvo.x + alvo.width / 2, alvo.y + alvo.height / 2, { steps: 10 });
    await expect(anuncio(page)).toHaveText("Sobre Quinta, M3");
    await page.mouse.up();
    await expect.poll(() => onde(banco, 3, 2)).toBe(1);
    await expect(anuncio(page)).toHaveText("");
    await expect(pendencia).not.toHaveClass(/origem/);
  });
});

test.describe("a aula da célula muda no meio do arrasto", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO professores (id, nome) VALUES (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (2, 1, 'Física', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (2, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 2, 2, 1);`,
  });

  const disciplinaEm = (banco: import("node:sqlite").DatabaseSync, dia: number, hora: number) =>
    contar(banco, "SELECT COALESCE(MAX(disciplina_id), 0) FROM alocacoes WHERE dia = ? AND hora = ?", dia, hora);

  test("dois desfazer que chegam com a aula em mãos: soltar não move a que tomou o lugar dela", async ({ page, banco }) => {
    await irPara(page, "Manual");
    // A Física sai da segunda e o Cálculo entra no lugar dela.
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
    await expect.poll(() => onde(banco, 0, 0)).toBe(0);
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await celula(page, "Segunda", "M1").click();
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    // Dois desfazer com a recarga parada: no banco a célula volta a ser da
    // Física, e a tela ainda mostra o Cálculo.
    const consultas = await segurarConsultas(page, AULAS_DA_GRADE);
    await page.keyboard.press("Control+z");
    await expect.poll(consultas.seguras).toBe(1);
    await page.keyboard.press("Control+z");
    await expect.poll(() => disciplinaEm(banco, 0, 0)).toBe(2);
    await pegar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect(page.locator(".celula.arrastando")).toContainText("Cálculo");
    await consultas.soltar();
    await expect(celula(page, "Segunda", "M1")).toContainText("Física");
    await page.mouse.up();
    // Marco: uma alocação de verdade, pela mesma fila. Outro arrasto, e não um
    // clique: o dnd-kit engole o clique que chega até 50 ms depois de soltar.
    await arrastar(page, page.getByRole("button", { name: /Cálculo/ }), celula(page, "Terça", "M2"));
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
    expect(disciplinaEm(banco, 0, 0)).toBe(2);
    expect(onde(banco, 3, 2)).toBe(0);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(2);
  });
});

test.describe("dois períodos com aula no mesmo horário", () => {
  test.use({
    semMassa: true,
    semente: `${AULA}
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (2, 1, 'Física', 2, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (2, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 2, 0, 0, 2, 2, 1);`,
  });

  // Com algo em mãos o dnd-kit engole todo clique, e o Enter ou o Espaço num
  // botão é um clique: a aba não troca. Se um dia trocar, a aula do outro
  // período, que ocupa o mesmo horário, não pode ser a que se move.
  test("o teclado não troca de período com a aula em mãos, e a que se move é a que foi pega", async ({ page, banco }) => {
    const aulaDo = (periodo: number, dia: number, hora: number) =>
      contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE periodo = ? AND dia = ? AND hora = ?", periodo, dia, hora);
    await irPara(page, "Manual");
    await pegar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect(page.locator(".celula.arrastando")).toContainText("Cálculo");
    const segundo = page.getByRole("button", { name: "2º", exact: true });
    await segundo.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await page.mouse.up();
    await expect.poll(() => aulaDo(1, 3, 2)).toBe(1);
    await expect(segundo).toHaveAttribute("aria-pressed", "false");
    expect(aulaDo(2, 0, 0)).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(2);
  });
});

test.describe("dois cursos", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO cursos (id, nome) VALUES (2, 'Zeta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (2, 1, 'manha');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (3, 2, 'Redes', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (3, 1, 2);`,
  });

  // O seletor de curso abre e escolhe ao apertar a tecla, sem clique: é o
  // caminho que resta para trocar de curso com o botão do mouse apertado.
  test("trocar de curso pelo teclado com a pendência em mãos: soltar não grava no curso que saiu da tela", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await pegar(page, page.getByRole("button", { name: /Cálculo/ }), celula(page, "Terça", "M2"));
    await expect(celula(page, "Terça", "M2")).toContainText("Alocar");
    await page.getByRole("navigation").getByRole("combobox", { name: "Curso" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: "Zeta", exact: true }).focus();
    await page.keyboard.press("Enter");
    const pendencia = page.getByRole("button", { name: /Redes/ });
    await expect(pendencia).toBeVisible();
    // A lista do seletor tapa a tela para o ponteiro enquanto fecha.
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await page.mouse.up();
    // Marco: uma alocação no curso novo, pela mesma fila.
    await arrastar(page, pendencia, celula(page, "Quinta", "M1"));
    await expect(celula(page, "Quinta", "M1")).toContainText("Redes");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1")).toBe(0);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
  });
});

test.describe("contraturno", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, turno) VALUES
        (1, 1, 'Cálculo', 1, 2, 0, NULL), (2, 1, 'Física', 1, 2, 0, 'manha');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 1, 0, 2, 2);`,
  });

  const t1 = (banco: import("node:sqlite").DatabaseSync) => contar(banco, "SELECT indice FROM horarios WHERE codigo = 'T1'");

  test("mover para o contraturno é aceito como ao alocar, e a aula fica marcada", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Segunda", "T1"));
    await expect.poll(() => onde(banco, 0, t1(banco))).toBe(1);
    expect(onde(banco, 0, 0)).toBe(0);
    await expect(celula(page, "Segunda", "T1")).toContainText("fora do turno");
  });

  test("mover para o contraturno é recusado, com o motivo, se a disciplina só pode de manhã", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await pegar(page, celula(page, "Terça", "M1"), celula(page, "Terça", "T1"));
    await expect(celula(page, "Terça", "T1")).toContainText("Disciplina só de manhã");
    await page.mouse.up();
    await expect(page.locator("[data-sonner-toast]", { hasText: "Disciplina só de manhã" })).toBeVisible();
    // Marco: mover a outra aula, pela mesma fila.
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quarta", "M1"));
    await expect(celula(page, "Quarta", "M1")).toContainText("Cálculo");
    expect(onde(banco, 1, 0)).toBe(1);
    expect(onde(banco, 1, t1(banco))).toBe(0);
  });
});
