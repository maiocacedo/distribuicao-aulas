import { $, browser, expect } from "@wdio/globals";

// Isolamento: o app de debug só usa o banco temporário se o binário for recente.
// Um binário velho apontaria para o banco real do usuário, então checamos antes.
// O WebDriver aguarda a Promise devolvida por `browser.execute` neste ambiente
// (Edge + tauri-driver), por isso não foi preciso `executeAsync`.
before(async () => {
  const url = await browser.execute(() =>
    (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string) => Promise<string> } }).__TAURI_INTERNALS__.invoke("banco"),
  );
  if (typeof url !== "string" || !url.includes("distribuicao-smoke-")) {
    throw new Error(
      `O app não está usando o banco temporário do smoke (banco: ${String(url)}).
` +
        "Um binário de debug desatualizado pode estar apontando para o banco REAL. " +
        "Recompile com: npm run tauri build -- --debug --no-bundle",
    );
  }
});

const ir = async (rotulo: string) => (await $("nav")).$(`button=${rotulo}`).click();

describe("binário real", () => {
  it("abre com as migrações aplicadas pelo sqlx", async () => {
    await ir("Gerenciar cursos");
    await expect($("td=Curso")).toBeDisplayed();
  });

  it("grava pelo comando transacao e lê pelo plugin", async () => {
    await ir("Professores");
    for (const nome of ["Ana Souza", "Bruno Lima"]) {
      await $("button=Novo professor").click();
      await $('[role="dialog"] input').setValue(nome);
      await $("button=Salvar").click();
      await expect($(`td*=${nome}`)).toBeDisplayed();
    }
  });

  it("aplica a chave estrangeira de verdade", async () => {
    await ir("Períodos");
    await $("button=Adicionar 1º período").click();

    // Sem sala cadastrada, o requisito padrão ("qualquer sala") deixaria a célula impedida.
    await ir("Salas");
    await $("button=Nova sala").click();
    await $('[role="dialog"] input').setValue("A01");
    await $("button=Salvar").click();
    await expect($("td*=A01")).toBeDisplayed();

    await ir("Disciplinas");
    await $("button=Nova disciplina").click();
    await $('[role="dialog"] input').setValue("Cálculo");
    await $("button=Adicionar professor").click();
    await $("button=Salvar").click();
    // Marco: a disciplina na lista. Sem ele o clique em "Manual" disputa com o
    // diálogo, que enquanto fecha deixa o resto da página sem receber o ponteiro.
    await expect($("td*=Cálculo")).toBeDisplayed();

    await ir("Manual");
    await $("button*=Cálculo").click();
    await $('[aria-label="Segunda, M1"]').click();
    await expect($('[aria-label="Segunda, M1"]')).toHaveText(expect.stringContaining("Cálculo"));

    await ir("Disciplinas");
    await (await $("tr*=Cálculo")).$('button[aria-label="Editar"]').click();
    // O seletor é o do shadcn: abre-se o gatilho e escolhe-se a opção pelo texto.
    await $('[aria-label="Professor da fatia 1"]').click();
    await $('[role="option"]*=Bruno Lima').click();
    await $("button=Salvar").click();
    await expect($('[role="dialog"] [role="alert"]')).toHaveText(expect.stringContaining("ainda tem"));
  });
});
