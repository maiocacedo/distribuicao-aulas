import { expect, test } from "@playwright/test";
import { irPara } from "../e2e/paginas";
import { AVISO_MEMORIA, cadastrarProfessor, comoAbriu, gravarNoBanco, noBanco } from "./apoio";

/**
 * O app como num navegador comum: sem `__TAURI_INTERNALS__`, `src/db.ts`
 * escolhe o banco do navegador (SQLite em WebAssembly, no armazenamento de
 * origem). Nada aqui é simulado.
 *
 * O Playwright dá a cada teste um contexto novo, com armazenamento de origem
 * próprio e vazio; o teste de persistência confere isso abrindo um segundo
 * contexto.
 */


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

  // Em memória, importar e o exemplo sumiriam na recarga que termina a troca.
  await irPara(page, "Dados do navegador");
  await expect(page.getByRole("button", { name: "Importar banco…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Carregar dados de exemplo" })).toBeDisabled();
  await expect(page.getByText(/o banco trocado sumiria na recarga/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar banco" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Começar vazio" })).toBeEnabled();
});


/**
 * Entra no começo do módulo do worker. A corrida perigosa é a da primeira
 * abertura: o VFS lista a pasta do pool, e se as duas abas a veem vazia, cada
 * uma cria os seus arquivos e o banco se divide em dois. Na máquina de verdade
 * isso depende do acaso; aqui cada worker, depois de listar, espera o outro
 * listar também (ou desiste em 2 s, quando só um chega a listar).
 */
const ENCONTRO_NA_LISTAGEM = `{
  const canal = new BroadcastChannel("teste-duas-abas");
  let outroListou = false;
  let seguir = null;
  canal.onmessage = () => { outroListou = true; seguir?.(); };
  const listar = FileSystemDirectoryHandle.prototype[Symbol.asyncIterator];
  FileSystemDirectoryHandle.prototype[Symbol.asyncIterator] = async function* () {
    const itens = [];
    for await (const item of listar.call(this)) itens.push(item);
    canal.postMessage("listei");
    if (!outroListou) await new Promise((r) => { seguir = r; setTimeout(r, 2000); });
    yield* itens;
  };
}
`;

test("duas abas abrindo juntas: uma abre, a outra pede para fechar a primeira", async ({ context }) => {
  await context.route(/\/src\/banco\/trabalhador\.ts/, async (rota) => {
    const resposta = await rota.fetch();
    await rota.fulfill({ response: resposta, body: ENCONTRO_NA_LISTAGEM + (await resposta.text()) });
  });
  const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all([a.goto("/"), b.goto("/")]);
  const estados = await Promise.all([comoAbriu(a), comoAbriu(b)]);
  expect([...estados].sort()).toEqual(["aberta", "recusada"]);

  const [aberta, recusada] = estados[0] === "aberta" ? [a, b] : [b, a];
  await expect(recusada.getByText(/aberto em outra aba/)).toBeVisible();
  await expect(recusada.getByText(/(o banco está em uso em outra aba)/)).toBeVisible();
  await cadastrarProfessor(aberta, "Ana Souza");

  // Fechada a que abriu, a outra abre ao recarregar, e com o que foi gravado.
  await aberta.close();
  await recusada.reload();
  await expect(recusada.locator("#curso-ativo")).toHaveText("Curso");
  await expect(noBanco(recusada, "SELECT nome FROM professores")).resolves.toEqual([{ nome: "Ana Souza" }]);
});

test("a aba que pega a trava e não consegue abrir a solta para a próxima", async ({ context }) => {
  // Na primeira aba, a migração falha depois de a trava e o VFS serem tomados:
  // o checksum (SHA-384 do navegador) é derrubado no começo do worker dela.
  const quebrada = await context.newPage();
  await quebrada.route(/\/src\/banco\/trabalhador\.ts/, async (rota) => {
    const resposta = await rota.fetch();
    await rota.fulfill({
      response: resposta,
      body:
        'crypto.subtle.digest = () => Promise.reject(new Error("checksum derrubado pelo teste"));\n' +
        (await resposta.text()),
    });
  });
  await quebrada.goto("/");
  await expect(quebrada.getByText("Falha ao abrir o banco")).toBeVisible();
  await expect(quebrada.getByText(/checksum derrubado pelo teste/)).toBeVisible();

  // Com ela ainda aberta, a segunda abre: a trava e os arquivos foram soltos.
  const outra = await context.newPage();
  await outra.goto("/");
  await expect(outra.locator("#curso-ativo")).toHaveText("Curso");
  await expect(outra.getByText("Falha ao abrir o banco")).toHaveCount(0);
});

test("a abertura espera a trava ser solta, como na recarga logo depois de uma troca", async ({ page }) => {
  // A página segura a trava antes de o app carregar, como o worker da página
  // anterior que ainda não terminou de morrer.
  await page.addInitScript(() => {
    void navigator.locks.request(
      "distribuicao.db",
      () =>
        new Promise<void>((soltar) => {
          (window as unknown as Record<string, unknown>).__soltarTrava = soltar;
        }),
    );
  });
  await page.goto("/");
  // Solta assim que o worker pede a trava — ou assim que o app desiste dela.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { pending } = await navigator.locks.query();
        const pedida = (pending ?? []).some((p) => p.name === "distribuicao.db");
        return pedida || document.body.innerText.includes("Falha ao abrir o banco");
      }),
    )
    .toBe(true);
  await page.evaluate(() => (window as unknown as { __soltarTrava: () => void }).__soltarTrava());
  await expect(page.locator("#curso-ativo")).toHaveText("Curso");
  expect(await page.getByText("Falha ao abrir o banco").count()).toBe(0);
});
