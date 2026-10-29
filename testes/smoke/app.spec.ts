import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";

// Isolamento: o app de debug só usa o banco temporário se o binário for recente.
// Um binário velho apontaria para o banco real do usuário, então conferimos que
// o app criou o arquivo temporário que o wdio.conf.ts lhe passou. Não dá para
// perguntar ao app pelo comando `banco`: o Tauri recusa um `invoke` feito pelo
// `browser.execute` ("Origin header is not a valid URL"), porque o script do
// WebDriver chega sem uma origem válida.
before(async () => {
  const caminho = process.env.SMOKE_BANCO;
  if (!caminho) throw new Error("SMOKE_BANCO não definido: é o wdio.conf.ts que cria o banco temporário.");
  try {
    await $("nav").waitForDisplayed({ timeout: 20_000 });
  } catch (e) {
    // Sem a barra lateral não há o que testar: diga o que a janela mostra.
    const foto = join(tmpdir(), "smoke-sem-barra.png");
    await browser.saveScreenshot(foto).catch(() => undefined);
    const url = await browser.getUrl().catch((erro) => `(sem URL: ${String(erro)})`);
    const texto = await browser
      .execute(() => document.body?.innerText ?? "(sem body)")
      .catch((erro) => `(sem texto: ${String(erro)})`);
    throw new Error(
      `A barra lateral não apareceu em 20 s.\nURL: ${url}\nCaptura: ${foto}\n` +
        `Texto da janela:\n${String(texto).slice(0, 1500)}\n(${String(e)})`,
    );
  }
  await browser.waitUntil(() => existsSync(caminho), {
    timeout: 10_000,
    timeoutMsg:
      `O app não criou o banco temporário do smoke (${caminho}).\n` +
      "Um binário de debug desatualizado pode estar apontando para o banco REAL. " +
      "Recompile com: npm run tauri build -- --debug --no-bundle",
  });
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
