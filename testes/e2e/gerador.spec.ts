import type { DatabaseSync } from "node:sqlite";
import { carregarProblema } from "../../src/solver/carregar";
import { conferir } from "../../src/solver/conferir";
import { DIAS } from "../../src/tipos";
import { lerAlocacoes, lerDe } from "../suporte/banco";
import { expect, test } from "./fixtures";
import { celula, contar, gerarEAplicar, irPara, responderConfirmacoes } from "./paginas";

const umaLinha = <T,>(banco: DatabaseSync, sql: string, ...params: (number | string)[]) => {
  const linha = banco.prepare(sql).get(...params);
  if (!linha) throw new Error(`consulta sem resultado: ${sql}`);
  return { ...(linha as object) } as T;
};

test("gera e aplica uma grade que o auditor aprova", async ({ page, banco }) => {
  await responderConfirmacoes(page);
  await irPara(page, "Automática");
  await gerarEAplicar(page);
  // A massa é totalmente resolúvel: a grade gerada deve colocar todas as aulas.
  const total = contar(
    banco,
    "SELECT SUM(dp.aulas) FROM disciplina_professores dp JOIN disciplinas d ON d.id = dp.disciplina_id WHERE d.curso_id = 1",
  );
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1")).toBe(total);
  const problema = await carregarProblema(1, lerDe(banco));
  expect(conferir(problema, lerAlocacoes(banco, 1))).toEqual([]);
});

test("aula fixada com o botão direito sobrevive à geração", async ({ page, banco }) => {
  await responderConfirmacoes(page);
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

  await irPara(page, "Automática");
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
  expect(conferir(await carregarProblema(1, lerDe(banco)), lerAlocacoes(banco, 1))).toEqual([]);
});

test("indisponibilidade marcada por arrasto é respeitada pelo gerador", async ({ page, banco }) => {
  await responderConfirmacoes(page);

  // Controle: gera uma grade sem restrições para achar um professor que usa o intervalo M1-M3.
  banco.exec("DELETE FROM alocacoes WHERE curso_id = 1");
  await page.reload();
  await irPara(page, "Automática");
  await gerarEAplicar(page);
  const { id, nome, dia } = umaLinha<{ id: number; nome: string; dia: number }>(
    banco,
    `SELECT a.professor_id AS id, p.nome, a.dia FROM alocacoes a JOIN professores p ON p.id = a.professor_id
      WHERE a.curso_id = 1 AND a.dia < 5 AND a.hora <= 2 ORDER BY p.nome, a.dia LIMIT 1`,
  );
  expect(
    contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE professor_id = ? AND dia = ? AND hora <= 2", id, dia),
  ).toBeGreaterThanOrEqual(1);

  // Libera a grade e marca a indisponibilidade exatamente nesse intervalo.
  banco.exec("DELETE FROM alocacoes WHERE curso_id = 1");
  await page.reload();
  await irPara(page, "Indisponibilidades");
  await page.getByRole("button", { name: nome }).click();
  await celula(page, DIAS[dia], "M1").hover();
  await page.mouse.down();
  await celula(page, DIAS[dia], "M2").hover();
  await celula(page, DIAS[dia], "M3").hover();
  await page.mouse.up();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades WHERE professor_id = ?", id)).toBe(3);

  await irPara(page, "Automática");
  await gerarEAplicar(page);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE professor_id = ?", id)).toBeGreaterThan(0);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE professor_id = ? AND dia = ? AND hora <= 2", id, dia)).toBe(0);
});
