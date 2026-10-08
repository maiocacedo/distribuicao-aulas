import { $, expect } from "@wdio/globals";

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
      await $(".modal input").setValue(nome);
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
    await $(".modal input").setValue("A01");
    await $("button=Salvar").click();
    await expect($("td*=A01")).toBeDisplayed();

    await ir("Disciplinas");
    await $("button=Nova disciplina").click();
    await $(".modal input").setValue("Cálculo");
    await $("button=Adicionar professor").click();
    await $("button=Salvar").click();

    await ir("Manual");
    await $("button*=Cálculo").click();
    await $('[aria-label="Segunda, M1"]').click();
    await expect($('[aria-label="Segunda, M1"]')).toHaveText(expect.stringContaining("Cálculo"));

    await ir("Disciplinas");
    await (await $("tr*=Cálculo")).$('button[aria-label="Editar"]').click();
    await $(".linha-fatia select").selectByVisibleText("Bruno Lima");
    await $("button=Salvar").click();
    await expect($(".alerta")).toHaveText(expect.stringContaining("está em uso"));
  });
});
