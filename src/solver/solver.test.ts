import { beforeAll, describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../testes/suporte/banco";
import { comSalas, indisponivelUmDia } from "../../testes/suporte/cenarios";
import { aula, fatia, indisponivelExceto, problemaMinimo } from "../../testes/suporte/problema";
import type { AulaOcupada } from "../regras/tipos";
import { carregarProblema } from "./carregar";
import { conferir } from "./conferir";
import { resolver } from "./solver";
import type { Problema, Resultado } from "./tipos";

const problemaDaMassa = () => carregarProblema(1, lerDe(criarBanco()));
const total = (p: { fatias: { aulas: number }[] }) => p.fatias.reduce((s, f) => s + f.aulas, 0);

describe("solver atual — massa real", () => {
  it("fecha a grade sem violar regra dura", async () => {
    const p = await problemaDaMassa();
    const r = resolver(p, { rodadasDeMelhoria: 300 });
    expect(r.completo).toBe(true);
    expect(r.alocacoes).toHaveLength(total(p));
    expect(conferir(p, r.alocacoes)).toEqual([]);
  });

  it("dá a mesma grade para a mesma semente", async () => {
    const p = await problemaDaMassa();
    const a = resolver(p, { rodadasDeMelhoria: 200, semente: 7 });
    const b = resolver(p, { rodadasDeMelhoria: 200, semente: 7 });
    expect(b.alocacoes).toEqual(a.alocacoes);
  });

  it.each([1, 2, 3])("não viola regra dura sob estresse (semente %i)", async (semente) => {
    const p = indisponivelUmDia(comSalas(await problemaDaMassa(), 6), semente);
    const r = resolver(p, { rodadasDeMelhoria: 100, semente });
    expect(conferir(p, r.alocacoes)).toEqual([]);
  });

  it("B7: rodada de melhoria que falha não consome o orçamento da busca", async () => {
    const p = await problemaDaMassa();
    const base = resolver(p, { rodadasDeMelhoria: 0 });
    // Teto logo acima do que a construção gastou: toda recolocação estoura e
    // falha. Sem a correção, os passos da rodada falha ficavam somados.
    const r = resolver(p, { rodadasDeMelhoria: 50, maxPassos: base.passos + 50 });
    expect(r.passos).toBe(base.passos);
  });
});

describe("solver atual — cenários mínimos", () => {
  it("preserva as aulas fixadas", () => {
    const fixada = aula(2, 3);
    const p = problemaMinimo({ fatias: [fatia()], fixadas: [fixada] });
    const r = resolver(p);
    expect(r.alocacoes).toContainEqual(fixada);
    expect(r.alocacoes).toHaveLength(2);
    expect(conferir(p, r.alocacoes)).toEqual([]);
  });

  it("respeita a indisponibilidade", () => {
    const p = problemaMinimo({ fatias: [fatia()], indisponiveis: indisponivelExceto(1, 6, [[3, 0], [3, 1]]) });
    const r = resolver(p);
    expect(r.alocacoes).toEqual(expect.arrayContaining([aula(3, 0), aula(3, 1)]));
    expect(r.alocacoes).toHaveLength(2);
  });

  it("põe a disciplina numa sala do tipo exigido", () => {
    const p = problemaMinimo({
      salas: [
        { id: 1, tipo: "Sala de Aula" },
        { id: 2, tipo: "Laboratório" },
      ],
      fatias: [fatia({ exigeSala: true, tipoSala: "Laboratório" })],
    });
    expect(resolver(p).alocacoes.map((a) => a.salaId)).toEqual([2, 2]);
  });

  it("põe a disciplina numa das salas da lista", () => {
    const p = problemaMinimo({
      salas: [1, 2, 3].map((id) => ({ id, tipo: "Sala de Aula" })),
      fatias: [fatia({ exigeSala: true, salas: [{ id: 3, preferencia: 1 }] })],
    });
    expect(resolver(p).alocacoes.map((a) => a.salaId)).toEqual([3, 3]);
  });

  it("só usa o sábado de manhã", () => {
    const livresNoSabado: [number, number][] = Array.from({ length: 12 }, (_, h) => [5, h]);
    const p = problemaMinimo({
      fatias: [fatia({ permiteSabado: true })],
      indisponiveis: indisponivelExceto(1, 6, livresNoSabado),
    });
    const r = resolver(p);
    expect(r.alocacoes).toHaveLength(2);
    expect(r.alocacoes.every((a) => a.dia === 5 && a.hora <= 5)).toBe(true);
  });

  it("não forma bloco atravessando a troca de turno", () => {
    const livres: [number, number][] = [];
    for (let d = 0; d < 6; d++) livres.push([d, 5], [d, 6]);
    const p = problemaMinimo({
      padroes: { 2: [{ partes: [2], custo: 0 }] },
      fatias: [fatia()],
      indisponiveis: indisponivelExceto(1, 6, livres),
    });
    const r = resolver(p);
    expect(r.completo).toBe(false);
    expect(r.alocacoes).toEqual([]);
  });

  it("turno forçado é regra: nunca sai dele", () => {
    const p = problemaMinimo({ fatias: [fatia({ turno: "tarde" })] });
    const r = resolver(p);
    expect(r.alocacoes).toHaveLength(2);
    expect(r.alocacoes.every((a) => a.hora >= 6)).toBe(true);
  });

  it("turno forçado sem horário livre fica de fora em vez de ir ao outro turno", () => {
    const manha: [number, number][] = [];
    for (let d = 0; d < 6; d++) for (let h = 0; h < 6; h++) manha.push([d, h]);
    const p = problemaMinimo({ fatias: [fatia({ turno: "tarde" })], indisponiveis: indisponivelExceto(1, 6, manha) });
    const r = resolver(p);
    expect(r.completo).toBe(false);
    expect(r.alocacoes).toEqual([]);
  });

  it("D13: o curso só de manhã não aloca na tarde, nem que o professor só esteja livre nela", () => {
    const tarde: [number, number][] = [];
    for (let d = 0; d < 6; d++) for (let h = 6; h < 12; h++) tarde.push([d, h]);
    const p = problemaMinimo({
      turnosDoCurso: ["manha"],
      fatias: [fatia()],
      indisponiveis: indisponivelExceto(1, 6, tarde),
    });
    const r = resolver(p);
    expect(r.completo).toBe(false);
    expect(r.alocacoes).toEqual([]);
  });

  it("D13: o curso só de manhã aloca todas as aulas na manhã", () => {
    const p = problemaMinimo({ turnosDoCurso: ["manha"], fatias: [fatia()] });
    const r = resolver(p);
    expect(r.alocacoes).toHaveLength(2);
    expect(r.alocacoes.every((a) => a.hora < 6)).toBe(true);
  });

  it("vai para a sala ideal antes da aceitável", () => {
    const p = problemaMinimo({
      salas: [1, 2].map((id) => ({ id, tipo: "Sala de Aula" })),
      fatias: [
        fatia({
          exigeSala: true,
          salas: [
            { id: 1, preferencia: 2 },
            { id: 2, preferencia: 1 },
          ],
        }),
      ],
    });
    expect(resolver(p).alocacoes.map((a) => a.salaId)).toEqual([2, 2]);
  });

  it("não usa sala ocupada por outro curso", () => {
    const externas: AulaOcupada[] = [];
    for (let d = 0; d < 6; d++)
      for (let h = 0; h < 12; h++)
        if (!(d === 3 && h < 2)) externas.push({ cursoId: 2, periodo: 1, dia: d, hora: h, disciplinaId: 9, professorId: 9, salaId: 1 });
    const p = problemaMinimo({
      salas: [{ id: 1, tipo: "Sala de Aula" }],
      professores: [
        { id: 1, prefDias: "indiferente", peso: 0, maxDias: null },
        { id: 9, prefDias: "indiferente", peso: 0, maxDias: null },
      ],
      fatias: [fatia({ exigeSala: true })],
      externas,
    });
    const r = resolver(p);
    expect(r.alocacoes).toEqual([aula(3, 0, { salaId: 1 }), aula(3, 1, { salaId: 1 })]);
  });

  it("max_dias_semana: a segunda disciplina reaproveita os dias da primeira", () => {
    const p = problemaMinimo({
      professores: [{ id: 1, prefDias: "indiferente", peso: 0, maxDias: 2 }],
      fatias: [fatia({ aulas: 4 }), fatia({ disciplinaId: 2, aulas: 2 })],
    });
    const r = resolver(p);
    expect(r.completo).toBe(true);
    expect(new Set(r.alocacoes.map((a) => a.dia)).size).toBeLessThanOrEqual(2);
  });
});

describe("bugs corrigidos no subprojeto 1", () => {
  // O preparo roda em `beforeAll` e as pré-condições são `it` próprios: se o
  // cenário deixar de existir, o teste do bug não passa em branco.

  describe("B1 — só aloca nos turnos do curso", () => {
    let p: Problema;
    let r: Resultado;
    let turnosDoCurso: string[];
    beforeAll(async () => {
      const { turnos } = criarBanco().prepare("SELECT turnos FROM cursos WHERE id = 1").get() as { turnos: string };
      turnosDoCurso = turnos.split(",");
      p = indisponivelUmDia(comSalas(await problemaDaMassa(), 3), 77);
      r = resolver(p, { rodadasDeMelhoria: 300 });
    });

    it("pré-condição: há aulas alocadas e o curso é de manhã e tarde", () => {
      expect(r.alocacoes.length).toBeGreaterThan(0);
      expect(turnosDoCurso).toEqual(["manha", "tarde"]);
    });

    // A migração 010 tirou os horários da noite, então esta massa já não exercita
    // a D13 sozinha; os testes dos turnos do curso estão nos cenários mínimos.
    it("B1: não aloca fora dos turnos do curso", () => {
      const turno = new Map(p.horarios.map((h) => [h.indice, h.turno]));
      expect(r.alocacoes.filter((a) => !turnosDoCurso.includes(turno.get(a.hora)!))).toEqual([]);
    });
  });

  describe("B4 — max_dias_semana é regra dura", () => {
    let p: Problema;
    let r: Resultado;
    beforeAll(async () => {
      p = await problemaDaMassa();
      p.professores.forEach((x) => (x.maxDias = 2));
      r = resolver(p, { rodadasDeMelhoria: 300 });
    });

    it("pré-condição: todo professor tem máximo de 2 dias e há aulas alocadas", () => {
      expect(p.professores.length).toBeGreaterThan(0);
      expect(p.professores.every((x) => x.maxDias === 2)).toBe(true);
      expect(r.alocacoes.length).toBeGreaterThan(0);
    });

    it("B4: max_dias_semana limita os dias do professor", () => {
      const dias = new Map<number, Set<number>>();
      for (const a of r.alocacoes) dias.set(a.professorId, (dias.get(a.professorId) ?? new Set()).add(a.dia));
      expect([...dias.entries()].filter(([, s]) => s.size > 2)).toEqual([]);
    });
  });

  describe("I1 — respeita as aulas dos outros cursos", () => {
    let r: Resultado;
    let P: number;
    let S: number;
    let ocupadas: number;
    beforeAll(async () => {
      const db = criarBanco();
      P = (
        db
          .prepare(
            `SELECT dp.professor_id AS id FROM disciplina_professores dp
               JOIN disciplinas d ON d.id = dp.disciplina_id
              WHERE d.curso_id = 1 GROUP BY dp.professor_id ORDER BY SUM(dp.aulas) DESC LIMIT 1`,
          )
          .get() as { id: number }
      ).id;
      S = (db.prepare("SELECT id FROM salas ORDER BY id LIMIT 1").get() as { id: number }).id;
      db.exec(`
        INSERT INTO cursos (id, nome) VALUES (2, 'Outro curso');
        INSERT INTO periodos (curso_id, numero, turno) VALUES (2, 1, 'manha');
        INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (9001, 2, 'Ocupação', 1, 60);
      `);
      db.prepare("INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (9001, ?, 60)").run(P);
      const inserir = db.prepare(
        "INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (2, 1, ?, ?, 9001, ?, ?)",
      );
      for (let d = 0; d < 5; d++) for (let h = 0; h < 12; h++) inserir.run(d, h, P, S);
      ocupadas = Number(
        (db.prepare("SELECT COUNT(*) AS n FROM alocacoes WHERE curso_id = 2").get() as { n: number }).n,
      );

      r = resolver(await carregarProblema(1, lerDe(db)), { rodadasDeMelhoria: 100 });
    });

    it("pré-condição: as 60 aulas do outro curso existem e há aulas alocadas", () => {
      expect(ocupadas).toBe(60);
      expect(r.alocacoes.length).toBeGreaterThan(0);
    });

    it("I1: não usa professor nem sala ocupados por outro curso", () => {
      const conflitos = r.alocacoes.filter((a) => a.dia < 5 && a.hora < 12 && (a.professorId === P || a.salaId === S));
      expect(conflitos).toEqual([]);
    });
  });
});
