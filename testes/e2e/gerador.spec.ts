import type { Page } from "@playwright/test";
import type { DatabaseSync } from "node:sqlite";
import { carregarProblema } from "../../src/solver/carregar";
import { conferir } from "../../src/solver/conferir";
import { DIAS } from "../../src/tipos";
import { lerAlocacoes, lerDe } from "../suporte/banco";
import { expect, test } from "./fixtures";
import { aceitarConfirmacoes, celula, contar, irPara } from "./paginas";

async function gerarEAplicar(page: Page) {
  aceitarConfirmacoes(page);
  await irPara(page, "Automática");
  await page.getByRole("button", { name: "Gerar grade" }).click();
  await page.getByRole("button", { name: "Aplicar esta grade" }).click({ timeout: 30_000 });
  await expect(page.getByText("Grade aplicada.")).toBeVisible();
}

const umaLinha = <T,>(banco: DatabaseSync, sql: string, ...params: (number | string)[]) =>
  ({ ...(banco.prepare(sql).get(...params) as object) }) as T;

test("gera e aplica uma grade que o auditor aprova", async ({ page, banco }) => {
  await gerarEAplicar(page);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1")).toBe(223);
  const problema = await carregarProblema(1, lerDe(banco));
  expect(conferir(problema, lerAlocacoes(banco, 1))).toEqual([]);
});

test("aula fixada com o botão direito sobrevive à geração", async ({ page, banco }) => {
  const alvo = umaLinha<{ dia: number; hora: number; codigo: string; disciplina_id: number }>(
    banco,
    `SELECT a.dia, a.hora, h.codigo, a.disciplina_id FROM alocacoes a
       JOIN horarios h ON h.indice = a.hora
      WHERE a.curso_id = 1 AND a.periodo = 1 ORDER BY a.dia, a.hora LIMIT 1`,
  );
  await irPara(page, "Manual");
  await celula(page, DIAS[alvo.dia], alvo.codigo).click({ button: "right" });
  await expect
    .poll(() => contar(banco, "SELECT fixada FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND dia = ? AND hora = ?", alvo.dia, alvo.hora))
    .toBe(1);

  await gerarEAplicar(page);
  expect(
    contar(
      banco,
      "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND dia = ? AND hora = ? AND disciplina_id = ? AND fixada = 1",
      alvo.dia,
      alvo.hora,
      alvo.disciplina_id,
    ),
  ).toBe(1);
});

test("indisponibilidade marcada por arrasto é respeitada pelo gerador", async ({ page, banco }) => {
  const { id } = umaLinha<{ id: number }>(banco, "SELECT id FROM professores WHERE nome = 'Professor 01'");
  const { dia } = umaLinha<{ dia: number }>(
    banco,
    `SELECT d.dia FROM (SELECT 0 AS dia UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) d
      WHERE NOT EXISTS (SELECT 1 FROM alocacoes a WHERE a.professor_id = ? AND a.dia = d.dia AND a.hora <= 2)
      ORDER BY d.dia LIMIT 1`,
    id,
  );

  await irPara(page, "Indisponibilidades");
  await page.getByRole("button", { name: "Professor 01" }).click();
  await celula(page, DIAS[dia], "M1").hover();
  await page.mouse.down();
  await celula(page, DIAS[dia], "M2").hover();
  await celula(page, DIAS[dia], "M3").hover();
  await page.mouse.up();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades WHERE professor_id = ?", id)).toBe(3);

  await gerarEAplicar(page);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE professor_id = ? AND dia = ? AND hora <= 2", id, dia)).toBe(0);
});
