import type { Locator, Page } from "@playwright/test";
import type { DatabaseSync } from "node:sqlite";
import { converter } from "../suporte/ponte";

export async function irPara(page: Page, rotulo: string) {
  await page.getByRole("navigation").getByRole("button", { name: rotulo, exact: true }).click();
}

/** Célula da grade manual ou de indisponibilidades, pelo `aria-label` "Segunda, M1". */
export function celula(page: Page, dia: string, codigo: string) {
  return page.getByLabel(`${dia}, ${codigo}`, { exact: true });
}

/**
 * Responde a toda confirmação que aparecer daqui em diante e devolve os textos,
 * na ordem. O array é preenchido conforme as confirmações acontecem.
 */
export async function responderConfirmacoes(
  page: Page,
  resposta: "aceitar" | "recusar" = "aceitar",
): Promise<string[]> {
  const mensagens: string[] = [];
  page.on("dialog", (d) => {
    mensagens.push(d.message());
    void (resposta === "aceitar" ? d.accept() : d.dismiss());
  });
  return mensagens;
}

const nativo = async (campo: Locator) => (await campo.evaluate((el) => el.tagName)) === "SELECT";

/** Escolhe uma opção pelo texto que o usuário vê. Serve ao `<select>` nativo e ao seletor novo. */
export async function escolher(campo: Locator, opcao: string | RegExp) {
  if (await nativo(campo)) {
    const textos = (await campo.locator("option").allTextContents()).map((t) => t.trim());
    const i = textos.findIndex((t) => (typeof opcao === "string" ? t === opcao : opcao.test(t)));
    if (i < 0) throw new Error(`opção não encontrada: ${opcao} em [${textos.join(" | ")}]`);
    await campo.selectOption({ index: i });
    return;
  }
  await campo.click();
  await campo.page().getByRole("option", { name: opcao, exact: typeof opcao === "string" }).click();
}

/** O texto da opção escolhida. */
export async function escolhida(campo: Locator): Promise<string> {
  if (await nativo(campo)) return ((await campo.locator("option:checked").textContent()) ?? "").trim();
  return ((await campo.textContent()) ?? "").trim();
}

/** A linha de tabela que contém exatamente este texto numa das células. */
export function linhaCom(page: Page, texto: string): Locator {
  return page.getByRole("row").filter({ has: page.getByText(texto, { exact: true }) });
}

export function contar(banco: DatabaseSync, sql: string, ...params: unknown[]): number {
  const linha = banco.prepare(sql).get(...params.map(converter)) as Record<string, number>;
  return Number(Object.values(linha)[0]);
}
