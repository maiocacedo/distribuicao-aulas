import { expect, type Locator, type Page } from "@playwright/test";
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
 * na ordem. Um observador na própria página clica no botão assim que o diálogo
 * aparece: funciona mesmo quando o teste está parado num `expect.poll` sobre o
 * banco, sem tocar na página.
 */
export async function responderConfirmacoes(
  page: Page,
  resposta: "aceitar" | "recusar" = "aceitar",
): Promise<string[]> {
  const mensagens: string[] = [];
  await page.exposeFunction("__confirmacao", (texto: string) => {
    mensagens.push(texto);
  });
  const instalar = (resposta: string) => {
    const responder = () => {
      const abertos = document.querySelectorAll<HTMLElement>('[role="alertdialog"]:not([data-respondido])');
      for (const dialogo of abertos) {
        dialogo.dataset.respondido = "1";
        void (window as unknown as { __confirmacao: (t: string) => void }).__confirmacao(dialogo.innerText);
        const slot = resposta === "aceitar" ? "alert-dialog-action" : "alert-dialog-cancel";
        dialogo.querySelector<HTMLElement>(`[data-slot="${slot}"]`)?.click();
      }
    };
    new MutationObserver(responder).observe(document, { childList: true, subtree: true });
    responder();
  };
  await page.addInitScript(instalar, resposta); // sobrevive a `page.reload()`
  await page.evaluate(instalar, resposta);
  return mensagens;
}

/**
 * Na tela da grade automática: gera, aplica e espera o aviso da página. Quem
 * chama já está na tela e já responde à confirmação (`responderConfirmacoes`).
 */
export async function gerarEAplicar(page: Page) {
  await page.getByRole("button", { name: "Gerar grade" }).click();
  await page.getByRole("button", { name: "Aplicar esta grade" }).click({ timeout: 30_000 });
  await expect(page.getByText("Grade aplicada.")).toBeVisible();
}

/** Escolhe uma opção do seletor pelo texto que o usuário vê. */
export async function escolher(campo: Locator, opcao: string | RegExp) {
  await campo.click();
  await campo.page().getByRole("option", { name: opcao, exact: typeof opcao === "string" }).click();
}

/** O texto da opção escolhida. */
export async function escolhida(campo: Locator): Promise<string> {
  return ((await campo.textContent()) ?? "").trim();
}

/** A linha de tabela que contém exatamente este texto numa das células. */
export function linhaCom(page: Page, texto: string): Locator {
  return page.getByRole("row").filter({ has: page.getByText(texto, { exact: true }) });
}

/**
 * Arrasta com o mouse de verdade. O arrasto só começa depois de alguns pixels
 * de movimento, então o ponteiro anda em passos e passa duas vezes pelo destino.
 */
export async function arrastar(page: Page, origem: Locator, destino: Locator) {
  const de = await origem.boundingBox();
  const para = await destino.boundingBox();
  if (!de || !para) throw new Error("arrastar: origem ou destino fora da tela");
  await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2);
  await page.mouse.down();
  await page.mouse.move(de.x + de.width / 2 + 12, de.y + de.height / 2 + 12, { steps: 4 });
  await page.mouse.move(para.x + para.width / 2, para.y + para.height / 2, { steps: 12 });
  await page.mouse.move(para.x + para.width / 2 + 1, para.y + para.height / 2 + 1);
  await page.mouse.up();
}

type JanelaSegura = { __seguras: (() => void)[] | null };

/**
 * Segura a resposta de toda consulta cujo SQL contém `trecho`, até o teste
 * soltar. A ponte responde na hora; é assim que se monta uma corrida entre
 * duas cargas da grade. `soltar(1)` solta a mais antiga; `soltar()` solta
 * todas e deixa de segurar.
 */
export async function segurarConsultas(page: Page, trecho: string) {
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

/**
 * Faz falhar, daqui em diante, toda consulta cujo SQL contém `trecho`.
 * Instalada depois de a página carregar, a primeira a falhar é a recarga que
 * vem depois de uma gravação. O `falharAPartirDe` da ponte conta execuções, e
 * a carga inicial não tem número certo: em desenvolvimento o `StrictMode` roda
 * cada efeito de carga duas vezes.
 */
export async function falharConsultas(page: Page, trecho: string) {
  await page.evaluate((trecho) => {
    type Interno = { invoke: (cmd: string, args?: { query?: unknown }) => Promise<unknown> };
    const w = window as unknown as { __TAURI_INTERNALS__: Interno };
    const invocar = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      // Rejeita com texto, como o Tauri faz com o erro que vem do Rust.
      if (cmd === "plugin:sql|select" && String(args?.query).includes(trecho)) throw `falha simulada: ${String(args?.query)}`;
      return invocar(cmd, args);
    };
  }, trecho);
}

/** A consulta das aulas, no meio da carga da grade. */
export const AULAS_DA_GRADE = "FROM alocacoes a";

export function contar(banco: DatabaseSync, sql: string, ...params: unknown[]): number {
  const linha = banco.prepare(sql).get(...params.map(converter)) as Record<string, number>;
  return Number(Object.values(linha)[0]);
}
