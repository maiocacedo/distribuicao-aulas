import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { criarBanco } from "../suporte/banco";
import { conferirComoSqlx, registrarComoSqlx } from "../suporte/sqlx";
import { irPara } from "../e2e/paginas";
import { cadastrarProfessor, noBanco } from "./apoio";

/**
 * A página "Dados do navegador": exportar, importar, exemplo, vazio. Toda
 * troca de banco termina recarregando o app; os testes marcam a página antes
 * (`__antes`) e conferem que a marca sumiu.
 */

const MASSA = readFileSync(new URL("../massa/engenharia_v9.sql", import.meta.url), "utf-8");
/** Quantos registros de uma tabela a massa traz, lido dela mesma. */
const naMassa = (tabela: string) => MASSA.split(`INSERT INTO ${tabela} `).length - 1;

async function marcar(page: Page) {
  await page.evaluate(() => ((window as unknown as Record<string, unknown>).__antes = true));
}

async function confirmar(page: Page, botao: string) {
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: botao }).click();
}

/** Confirma a troca e espera a recarga que a termina: a página nova não tem a marca. */
async function confirmarERecarregar(page: Page, botao: string) {
  const carregou = page.waitForEvent("load");
  await confirmar(page, botao);
  await carregou;
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__antes ?? null)).toBeNull();
  await expect(page.getByRole("navigation")).toBeVisible();
}

const dados = (page: Page) => irPara(page, "Dados do navegador");
const arquivo = (page: Page) => page.getByLabel("Arquivo do banco a importar");

test("a página diz onde os dados ficam", async ({ page }) => {
  await page.goto("/");
  await dados(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dados do navegador");
  await expect(page.getByText("O banco fica neste navegador, nesta máquina.", { exact: false })).toBeVisible();
  await expect(page.getByText(/numa janela anônima somem ao fechar a janela/)).toBeVisible();
});

test("exportar, começar vazio e importar de volta: o dado volta", async ({ page }, info) => {
  await page.goto("/");
  await cadastrarProfessor(page, "Ana Souza");
  await dados(page);

  const [baixado] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar banco" }).click(),
  ]);
  expect(baixado.suggestedFilename()).toMatch(/^distribuicao-\d{4}-\d{2}-\d{2}\.db$/);
  const caminho = info.outputPath("exportado.db");
  await baixado.saveAs(caminho);

  // Navegador → desktop: o arquivo baixado abre no SQLite do Node, e o sqlx
  // do desktop não teria migração a aplicar nem checksum a recusar.
  const node = new DatabaseSync(caminho);
  try {
    expect(conferirComoSqlx(node)).toEqual([]);
    expect(node.prepare("SELECT nome FROM professores").all().map((l) => ({ ...(l as object) }))).toEqual([
      { nome: "Ana Souza" },
    ]);
  } finally {
    node.close();
  }

  await marcar(page);
  await page.getByRole("button", { name: "Começar vazio" }).click();
  await confirmarERecarregar(page, "Apagar e começar vazio");
  await expect(page.locator("#curso-ativo")).toHaveText("Curso");
  await irPara(page, "Professores");
  await expect(page.getByText("Nenhum professor cadastrado ainda.")).toBeVisible();

  await dados(page);
  await marcar(page);
  await arquivo(page).setInputFiles(caminho);
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo).toContainText("Substituir o banco deste navegador?");
  await expect(dialogo).toContainText("1 curso, 1 professor e 0 disciplinas");
  await confirmarERecarregar(page, "Substituir o banco");
  await irPara(page, "Professores");
  await expect(page.getByRole("row", { name: /Ana Souza/ })).toBeVisible();
});

test("importar um arquivo que não é banco: recusado, sem confirmação, e nada muda", async ({ page }) => {
  await page.goto("/");
  await cadastrarProfessor(page, "Ana Souza");
  await dados(page);
  await marcar(page);
  await arquivo(page).setInputFiles({
    name: "notas.db",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("isto não é um banco de dados ".repeat(10)),
  });
  await expect(page.getByText("O arquivo não é um banco deste aplicativo: não é um banco SQLite.")).toBeVisible();
  expect(await page.getByRole("alertdialog").count()).toBe(0);
  // Sem recarga, e o banco segue o mesmo.
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__antes)).toBe(true);
  await expect(noBanco(page, "SELECT nome FROM professores")).resolves.toEqual([{ nome: "Ana Souza" }]);
});

test("recusar a confirmação não troca nada", async ({ page }) => {
  await page.goto("/");
  await cadastrarProfessor(page, "Ana Souza");
  await dados(page);
  await page.getByRole("button", { name: "Começar vazio" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(noBanco(page, "SELECT nome FROM professores")).resolves.toEqual([{ nome: "Ana Souza" }]);
});

test("carregar o exemplo: as telas mostram a massa, e o desfazer começa vazio", async ({ page }) => {
  const professores = naMassa("professores");
  expect(professores).toBeGreaterThan(0);

  await page.goto("/");
  await dados(page);
  await marcar(page);
  await page.getByRole("button", { name: "Carregar dados de exemplo" }).click();
  await confirmarERecarregar(page, "Carregar o exemplo");
  await irPara(page, "Professores");
  await expect(page.getByText(`${professores} de ${professores}`)).toBeVisible();

  // Uma ação de grade enche o histórico; carregar o exemplo de novo o zera.
  await irPara(page, "Manual");
  const desfazer = page.getByRole("main").getByRole("button", { name: "Desfazer" });
  await expect(desfazer).toBeDisabled();
  const aulas = async () => (await noBanco<{ n: number }>(page, "SELECT COUNT(*) AS n FROM alocacoes"))[0].n;
  const antes = await aulas();
  await page.getByRole("button", { name: "Limpar período" }).click();
  await confirmar(page, "Limpar período");
  await expect(desfazer).toBeEnabled();
  await expect.poll(aulas).toBeLessThan(antes);

  await dados(page);
  await marcar(page);
  await page.getByRole("button", { name: "Carregar dados de exemplo" }).click();
  await confirmarERecarregar(page, "Carregar o exemplo");
  await irPara(page, "Manual");
  await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeDisabled();
  await expect.poll(aulas).toBe(antes);
});

test("começar vazio depois do exemplo: tudo some", async ({ page }) => {
  await page.goto("/");
  await dados(page);
  await marcar(page);
  await page.getByRole("button", { name: "Carregar dados de exemplo" }).click();
  await confirmarERecarregar(page, "Carregar o exemplo");
  await expect(noBanco(page, "SELECT COUNT(*) AS n FROM professores")).resolves.toEqual([{ n: naMassa("professores") }]);

  await dados(page);
  await marcar(page);
  await page.getByRole("button", { name: "Começar vazio" }).click();
  await confirmarERecarregar(page, "Apagar e começar vazio");
  await expect(page.locator("#curso-ativo")).toHaveText("Curso");
  for (const tabela of ["professores", "salas", "disciplinas", "alocacoes"])
    await expect(noBanco(page, `SELECT COUNT(*) AS n FROM ${tabela}`), tabela).resolves.toEqual([{ n: 0 }]);
});

test("desktop → navegador: um banco como o desktop o grava entra pela importação", async ({ page }, info) => {
  // A massa montada como nos testes, com o registro do sqlx que o desktop faria.
  const desktop = criarBanco();
  registrarComoSqlx(desktop);
  const caminho = info.outputPath("desktop.db");
  desktop.exec(`VACUUM INTO '${caminho.replace(/'/g, "''")}'`);
  desktop.close();

  await page.goto("/");
  await dados(page);
  await marcar(page);
  await arquivo(page).setInputFiles(caminho);
  await confirmarERecarregar(page, "Substituir o banco");
  await expect(noBanco(page, "SELECT COUNT(*) AS n FROM professores")).resolves.toEqual([{ n: naMassa("professores") }]);
  // Entrou sem reaplicar nada: o registro é o que veio no arquivo.
  await expect(noBanco(page, "SELECT COUNT(*) AS n FROM _sqlx_migrations WHERE execution_time <> 1000")).resolves.toEqual([
    { n: 0 },
  ]);
});
