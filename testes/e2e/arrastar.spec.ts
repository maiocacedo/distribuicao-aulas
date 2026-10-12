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
