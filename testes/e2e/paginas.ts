import type { Page } from "@playwright/test";
import type { DatabaseSync } from "node:sqlite";
import { converter } from "../suporte/ponte";

export async function irPara(page: Page, rotulo: string) {
  await page.getByRole("navigation").getByRole("button", { name: rotulo, exact: true }).click();
}

/** Célula da grade manual ou de indisponibilidades, pelo `aria-label` "Segunda, M1". */
export function celula(page: Page, dia: string, codigo: string) {
  return page.getByLabel(`${dia}, ${codigo}`, { exact: true });
}

/** O Playwright recusa `confirm()` por padrão; isto passa a aceitar. */
export function aceitarConfirmacoes(page: Page) {
  page.on("dialog", (d) => d.accept());
}

export function contar(banco: DatabaseSync, sql: string, ...params: unknown[]): number {
  const linha = banco.prepare(sql).get(...params.map(converter)) as Record<string, number>;
  return Number(Object.values(linha)[0]);
}
