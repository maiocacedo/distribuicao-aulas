/**
 * Roda o solver contra um problema exportado e confere o resultado.
 *
 *   python scripts/exportar_problema.py <banco.db> -o problema.json
 *   npx esbuild scripts/testar_solver.ts --bundle --platform=node --format=esm \
 *       --outfile=.solver.mjs && node .solver.mjs problema.json
 *
 * A conferência é o que importa: não basta o solver devolver uma grade, ela
 * precisa não violar nenhuma restrição dura. As checagens aqui são
 * independentes do solver — recontam tudo a partir da saída.
 */
import { readFileSync } from "node:fs";
import { resolver } from "../src/solver/solver";
import { buracos } from "../src/solver/custo";
import type { Alocacao, Problema } from "../src/solver/tipos";

const problema: Problema = JSON.parse(readFileSync(process.argv[2], "utf-8"));

const resultado = resolver(problema, {
  maxPassos: Number(process.env.MAX_PASSOS ?? 400_000),
  rodadasDeMelhoria: Number(process.env.RODADAS ?? 3000),
  pesos: process.env.PESOS ? JSON.parse(process.env.PESOS) : undefined,
});

const previstas = problema.fatias.reduce((s, f) => s + f.aulas, 0);
console.log(`\naulas previstas ..... ${previstas}`);
console.log(`aulas alocadas ...... ${resultado.alocacoes.length}`);
console.log(`completo ............ ${resultado.completo ? "sim" : "NÃO"}`);
console.log(`custo brando ........ ${resultado.custo}`);
console.log(`passos .............. ${resultado.passos}`);
console.log(`tempo ............... ${resultado.milissegundos} ms`);

if (resultado.faltantes.length) {
  console.log(`\nnão couberam (${resultado.faltantes.length}):`);
  for (const f of resultado.faltantes.slice(0, 15)) {
    console.log(`  ${f.fatia.nome} (${f.fatia.aulas} aulas) — ${f.motivo}`);
  }
}

// ---------------------------------------------------------------- conferência

const erros: string[] = [];
const a = resultado.alocacoes;
const turnoHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
const contar = <T>(xs: T[], k: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const c = k(x);
    m.set(c, [...(m.get(c) ?? []), x]);
  }
  return m;
};

for (const [k, v] of contar(a, (x) => `${x.periodo}:${x.dia}:${x.hora}`))
  if (v.length > 1) erros.push(`duas aulas no mesmo horário do período: ${k}`);

for (const [k, v] of contar(a, (x) => `${x.professorId}:${x.dia}:${x.hora}`))
  if (v.length > 1) erros.push(`professor em dois lugares: ${k}`);

for (const [k, v] of contar(a.filter((x) => x.salaId != null), (x) => `${x.salaId}:${x.dia}:${x.hora}`))
  if (v.length > 1) erros.push(`sala em dois lugares: ${k}`);

const indisponiveis = new Set(problema.indisponiveis);
for (const x of a)
  if (indisponiveis.has(`${x.professorId}:${x.dia}:${x.hora}`))
    erros.push(`aula em horário indisponível: professor ${x.professorId} dia ${x.dia} hora ${x.hora}`);

const porFatia = contar(a, (x) => `${x.disciplinaId}:${x.professorId}`);
for (const f of problema.fatias) {
  const feitas = porFatia.get(`${f.disciplinaId}:${f.professorId}`)?.length ?? 0;
  if (feitas !== 0 && feitas !== f.aulas)
    erros.push(`${f.nome}: ${feitas} aulas alocadas, ${f.aulas} previstas`);
  if (!f.permiteSabado && (porFatia.get(`${f.disciplinaId}:${f.professorId}`) ?? []).some((x) => x.dia === 5))
    erros.push(`${f.nome} foi ao sábado sem permissão`);
  if (f.exigeSala) {
    for (const x of porFatia.get(`${f.disciplinaId}:${f.professorId}`) ?? []) {
      if (x.salaId == null) erros.push(`${f.nome} ficou sem sala`);
      else if (f.tipoSala) {
        const sala = problema.salas.find((s) => s.id === x.salaId);
        if (sala?.tipo !== f.tipoSala) erros.push(`${f.nome} caiu em sala do tipo errado`);
      } else if (f.salas.length > 0 && !f.salas.includes(x.salaId)) {
        erros.push(`${f.nome} caiu em sala fora da lista aceita`);
      }
    }
  } else {
    for (const x of porFatia.get(`${f.disciplinaId}:${f.professorId}`) ?? [])
      if (x.salaId != null) erros.push(`${f.nome} recebeu sala sem precisar`);
  }
}

// Blocos: aulas seguidas do mesmo dia não podem atravessar troca de turno.
for (const [id, aulas] of porFatia) {
  const porDia = contar(aulas, (x) => `${x.dia}`);
  for (const [, doDia] of porDia) {
    const hs = doDia.map((x) => x.hora).sort((x, y) => x - y);
    for (let i = 1; i < hs.length; i++)
      if (hs[i] === hs[i - 1] + 1 && turnoHora.get(hs[i]) !== turnoHora.get(hs[i - 1]))
        erros.push(`${id}: bloco atravessa troca de turno`);
  }
}

console.log(`\nconferência: ${erros.length === 0 ? "nenhuma violação" : erros.length + " VIOLAÇÕES"}`);
for (const e of [...new Set(erros)].slice(0, 20)) console.log(`  ${e}`);

// ---------------------------------------------------------------- qualidade

const buracosProf = buracos(problema, a, (x: Alocacao) => `p${x.professorId}`);
const buracosAluno = buracos(problema, a, (x: Alocacao) => `t${x.periodo}`);
const foraDoTurno = a.filter((x) => {
  const p = problema.periodos.find((q) => q.numero === x.periodo);
  const f = problema.fatias.find(
    (y) => y.disciplinaId === x.disciplinaId && y.professorId === x.professorId,
  );
  return turnoHora.get(x.hora) !== (f?.turno ?? p?.turno);
}).length;

console.log(`\nqualidade:`);
console.log(`  buracos na agenda dos professores: ${buracosProf}`);
console.log(`  buracos na grade das turmas ......: ${buracosAluno}`);
console.log(`  aulas fora do turno ..............: ${foraDoTurno}`);

process.exit(erros.length === 0 && resultado.completo ? 0 : 1);
