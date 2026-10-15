import { expect, test, type Page } from "@playwright/test";
import { irPara } from "../e2e/paginas";

/**
 * O app como num navegador comum: sem `__TAURI_INTERNALS__`, `src/db.ts`
 * escolhe o banco do navegador (SQLite em WebAssembly, no armazenamento de
 * origem). Nada aqui é simulado.
 *
 * O Playwright dá a cada teste um contexto novo, com armazenamento de origem
 * próprio e vazio; o teste de persistência confere isso abrindo um segundo
 * contexto.
 */

const AVISO_MEMORIA = "Este navegador não guarda os dados: o que você fizer some ao fechar a página.";

/**
 * Consulta pelo mesmo módulo `db.ts` que o app usa: o servidor de dev o serve
 * em `/src/db.ts`, e o import devolve a mesma instância (e o mesmo worker).
 */
function noBanco<T>(page: Page, sql: string, params: unknown[] = []): Promise<T[]> {
  return page.evaluate(
    async ([caminho, sql, params]) => {
      const db = await import(/* @vite-ignore */ caminho as string);
      return db.consultar(sql, params);
    },
    ["/src/db.ts", sql, params] as const,
  );
}

function gravarNoBanco(page: Page, sql: string, params: unknown[] = []) {
  return page.evaluate(
    async ([caminho, sql, params]) => {
      const db = await import(/* @vite-ignore */ caminho as string);
      return db.executar(sql, params);
    },
    ["/src/db.ts", sql, params] as const,
  );
}

async function cadastrarProfessor(page: Page, nome: string) {
  await irPara(page, "Professores");
  await page.getByRole("button", { name: "Novo professor" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(nome);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(nome) })).toBeVisible();
}

test("abre num banco vazio, já migrado, com o curso que a migração 005 cria", async ({ page }) => {
  await page.goto("/");
  // A 005 cria o curso 1, "Curso": a casca o seleciona e abre em Períodos, vazia.
  await expect(page.locator("#curso-ativo")).toHaveText("Curso");
  await expect(page.getByRole("heading", { name: "Períodos" })).toBeVisible();
  await expect(page.getByText("Nenhum período ainda. Acrescente o primeiro.")).toBeVisible();
  // O Chromium tem armazenamento de origem: nada de aviso de memória.
  await expect(page.getByText(AVISO_MEMORIA)).toHaveCount(0);

  const migracoes = await noBanco<{ version: number; success: number; n: number }>(
    page,
    "SELECT version, success, length(checksum) AS n FROM _sqlx_migrations ORDER BY version",
  );
  expect(migracoes).toEqual(Array.from({ length: 10 }, (_, i) => ({ version: i + 1, success: 1, n: 48 })));
  await expect(noBanco(page, "SELECT id, nome FROM cursos")).resolves.toEqual([{ id: 1, nome: "Curso" }]);
});

test("cadastra um professor, e ele continua lá depois de recarregar a página", async ({ page, browser }) => {
  await page.goto("/");
  await cadastrarProfessor(page, "Ana Souza");

  await page.reload();
  await irPara(page, "Professores");
  await expect(page.getByRole("row", { name: /Ana Souza/ })).toBeVisible();

  // Outro contexto é outro armazenamento: começa vazio.
  const outro = await browser.newContext();
  try {
    const pagina = await outro.newPage();
    await pagina.goto("/");
    await irPara(pagina, "Professores");
    await expect(pagina.getByRole("heading", { name: "Professores" })).toBeVisible();
    await expect(pagina.getByText("Ana Souza")).toHaveCount(0);
    await expect(noBanco(pagina, "SELECT COUNT(*) AS n FROM professores")).resolves.toEqual([{ n: 0 }]);
  } finally {
    await outro.close();
  }
});

test("a recusa da chave estrangeira chega à tela com a frase de mensagemErro", async ({ page }) => {
  await page.goto("/");
  await cadastrarProfessor(page, "Ana Souza");
  // Por trás da tela, que segue mostrando o professor sem disciplina: assim a
  // remoção vai até o banco, e é ele quem recusa.
  await gravarNoBanco(page, "INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha')");
  await gravarNoBanco(page, "INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2)");
  await gravarNoBanco(
    page,
    "INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) SELECT 1, id, 2 FROM professores",
  );

  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Remover" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover professor" }).click();
  await expect(
    page.getByText("O professor está em uso e não pode ser removido. Remova antes os registros que dependem dele."),
  ).toBeVisible();
  await expect(noBanco(page, "SELECT COUNT(*) AS n FROM professores")).resolves.toEqual([{ n: 1 }]);
});

test("sem armazenamento de origem, o banco fica em memória e o aviso fica à vista", async ({ page }) => {
  // Como num navegador sem o acesso síncrono ao armazenamento, que é o que o
  // VFS usa. Tem de ser dentro do worker, onde o banco abre (`addInitScript`
  // só alcança a página): a linha entra no começo do módulo dele.
  await page.route(/\/src\/banco\/trabalhador\.ts/, async (rota) => {
    const resposta = await rota.fetch();
    const corpo = await resposta.text();
    await rota.fulfill({
      response: resposta,
      body: "delete FileSystemFileHandle.prototype.createSyncAccessHandle;\n" + corpo,
    });
  });
  await page.goto("/");
  await expect(page.getByText(AVISO_MEMORIA)).toBeVisible();
  await expect(page.locator("#curso-ativo")).toHaveText("Curso");
  await cadastrarProfessor(page, "Ana Souza");
  await irPara(page, "Salas");
  await expect(page.getByText(AVISO_MEMORIA)).toBeVisible();
});
