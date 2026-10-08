/**
 * Benchmark do solver: cenários × sementes × solvers, com a grade conferida
 * pelo auditor independente.
 *
 *   npm run bench:solver                       massa anonimizada
 *   npm run bench:solver -- --banco meu.db     banco real, só leitura
 *   npm run bench:solver -- --salvar           grava testes/benchmark/linha-de-base.md
 *                                              (só na massa anonimizada: recusa --banco e --curso)
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { carregarProblema } from "../src/solver/carregar";
import { conferir } from "../src/solver/conferir";
import { buracos } from "../src/solver/custo";
import { resolver } from "../src/solver/solver";
import type { Alocacao, Problema, Resultado } from "../src/solver/tipos";
import { criarBanco, lerDe } from "../testes/suporte/banco";
import { CENARIOS } from "../testes/suporte/cenarios";

interface Solver {
  nome: string;
  resolver: (p: Problema, semente: number) => Resultado;
}

/** O solver v2 entra nesta lista, ao lado do atual. */
const SOLVERS: Solver[] = [{ nome: "atual", resolver: (p, semente) => resolver(p, { semente }) }];
const SEMENTES = [1, 2, 3];

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function foraDoTurno(p: Problema, alocacoes: Alocacao[]): number {
  const turnoDaHora = new Map(p.horarios.map((h) => [h.indice, h.turno]));
  const turnoDoPeriodo = new Map(p.periodos.map((x) => [x.numero, x.turno]));
  const forcado = new Map(p.fatias.map((f) => [`${f.disciplinaId}:${f.professorId}`, f.turno]));
  return alocacoes.filter(
    (a) => turnoDaHora.get(a.hora) !== (forcado.get(`${a.disciplinaId}:${a.professorId}`) ?? turnoDoPeriodo.get(a.periodo)),
  ).length;
}

const arquivo = argumento("--banco");
if (process.argv.includes("--salvar") && (arquivo || argumento("--curso"))) {
  throw new Error(
    "--salvar não pode ser usado com --banco nem --curso: a linha de base só vale para a massa anonimizada do curso 1.",
  );
}
const banco = arquivo ? new DatabaseSync(arquivo, { readOnly: true }) : criarBanco();
const base = await carregarProblema(Number(argumento("--curso") ?? 1), lerDe(banco));

const linhas = [
  "| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma | fora do turno | ms |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
];
for (const solver of SOLVERS) {
  for (const cenario of CENARIOS) {
    for (const semente of SEMENTES) {
      const p = cenario.montar(structuredClone(base));
      const r = solver.resolver(p, semente);
      linhas.push(
        `| ${solver.nome} | ${cenario.nome} | ${semente} | ${r.completo ? "sim" : "não"} | ${r.faltantes.length} | ` +
          `${r.custo} | ${conferir(p, r.alocacoes).length} | ` +
          `${buracos(p, r.alocacoes, (a) => `p${a.professorId}`)} | ${buracos(p, r.alocacoes, (a) => `t${a.periodo}`)} | ` +
          `${foraDoTurno(p, r.alocacoes)} | ${r.milissegundos} |`,
      );
    }
  }
}

const tabela = linhas.join("\n");
console.log(tabela);
if (process.argv.includes("--salvar")) {
  const data = new Date().toISOString().slice(0, 10);
  let commit = "desconhecido";
  try {
    commit = execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Fora de um repositório git: segue com "desconhecido".
  }
  writeFileSync(
    "testes/benchmark/linha-de-base.md",
    `# Linha de base do solver\n\nGerada por \`npm run bench:solver -- --salvar\` em ${data}, ` +
      `sobre a massa anonimizada. É a referência "antes" para comparar o solver v2.\n\n` +
      `- Commit: ${commit}\n- Node: ${process.version}\n- Sementes: ${SEMENTES.join(", ")}\n\n${tabela}\n`,
  );
}
