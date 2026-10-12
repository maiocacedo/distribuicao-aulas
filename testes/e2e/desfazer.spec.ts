import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { celula, contar, irPara, responderConfirmacoes } from "./paginas";

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

type JanelaSegura = { __seguras: (() => void)[] | null };

/**
 * Segura a resposta de toda consulta cujo SQL contém `trecho`, até o teste
 * soltar. A ponte responde na hora; é assim que se monta uma corrida entre
 * duas cargas da grade. `soltar(1)` solta a mais antiga; `soltar()` solta
 * todas e deixa de segurar.
 */
async function segurarConsultas(page: Page, trecho: string) {
  await page.evaluate((trecho) => {
    type Interno = { invoke: (cmd: string, args?: { query?: unknown }) => Promise<unknown> };
    const w = window as unknown as JanelaSegura & { __TAURI_INTERNALS__: Interno };
    const invocar = w.__TAURI_INTERNALS__.invoke;
    w.__seguras = [];
    w.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      const resposta = await invocar(cmd, args);
      const seguras = w.__seguras;
      if (seguras && cmd === "plugin:sql|select" && String(args?.query).includes(trecho))
        await new Promise<void>((solta) => seguras.push(solta));
      return resposta;
    };
  }, trecho);
  return {
    seguras: () => page.evaluate(() => (window as unknown as JanelaSegura).__seguras?.length ?? 0),
    soltar: (quantas?: number) =>
      page.evaluate((quantas) => {
        const w = window as unknown as JanelaSegura;
        const seguras = w.__seguras ?? [];
        if (quantas == null) w.__seguras = null;
        seguras.splice(0, quantas ?? seguras.length).forEach((solta) => solta());
      }, quantas),
  };
}

/** A consulta das aulas, no meio da carga da grade. */
const AULAS_DA_GRADE = "FROM alocacoes a";

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
