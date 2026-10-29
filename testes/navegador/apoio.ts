import { expect, type Page } from "@playwright/test";
import { irPara } from "../e2e/paginas";

/** O que os testes do projeto `navegador` usam: o app de verdade, sem ponte. */

export const AVISO_MEMORIA = "Este navegador não guarda os dados: o que você fizer some ao fechar a página.";

/**
 * Consulta pelo mesmo módulo `db.ts` que o app usa: o servidor de dev o serve
 * em `/src/db.ts`, e o import devolve a mesma instância (e o mesmo worker).
 */
export function noBanco<T>(page: Page, sql: string, params: unknown[] = []): Promise<T[]> {
  return page.evaluate(
    async ([caminho, sql, params]) => {
      const db = await import(/* @vite-ignore */ caminho as string);
      return db.consultar(sql, params);
    },
    ["/src/db.ts", sql, params] as const,
  );
}

export function gravarNoBanco(page: Page, sql: string, params: unknown[] = []) {
  return page.evaluate(
    async ([caminho, sql, params]) => {
      const db = await import(/* @vite-ignore */ caminho as string);
      return db.executar(sql, params);
    },
    ["/src/db.ts", sql, params] as const,
  );
}

export async function cadastrarProfessor(page: Page, nome: string) {
  await irPara(page, "Professores");
  await page.getByRole("button", { name: "Novo professor" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(nome);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(nome) })).toBeVisible();
}

/** Como a página terminou de abrir: com o banco, ou com a falha de abertura. */
export function comoAbriu(page: Page): Promise<"aberta" | "recusada"> {
  return Promise.race([
    page.locator("#curso-ativo", { hasText: "Curso" }).waitFor().then(() => "aberta" as const),
    page.getByText("Falha ao abrir o banco").waitFor().then(() => "recusada" as const),
  ]);
}
