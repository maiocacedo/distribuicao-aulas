import { beforeAll, describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../testes/suporte/banco";
import { comSalas, indisponivelUmDia } from "../../testes/suporte/cenarios";
import { aula, fatia, indisponivelExceto, problemaMinimo } from "../../testes/suporte/problema";
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
      fatias: [fatia({ exigeSala: true, salas: [3] })],
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
});

describe("bugs conhecidos (falha esperada até o subprojeto 1)", () => {
  // O preparo roda fora de `it.fails`: um erro aqui derruba a suíte em vez de
  // passar como "falha esperada". Cada `it` normal prova que o cenário existe;
  // só a asserção do bug fica dentro de `it.fails`.

  describe("B1 — o domínio inclui horários de turnos que o curso não ocupa", () => {
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

    it.fails("B1: não aloca fora dos turnos do curso", () => {
      const turno = new Map(p.horarios.map((h) => [h.indice, h.turno]));
      expect(r.alocacoes.filter((a) => !turnosDoCurso.includes(turno.get(a.hora)!))).toEqual([]);
    });
  });

  describe("B4 — max_dias_semana é só custo; decidido que é regra dura", () => {
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

    it.fails("B4: max_dias_semana limita os dias do professor", () => {
      const dias = new Map<number, Set<number>>();
      for (const a of r.alocacoes) dias.set(a.professorId, (dias.get(a.professorId) ?? new Set()).add(a.dia));
      expect([...dias.entries()].filter(([, s]) => s.size > 2)).toEqual([]);
    });
  });

  describe("I1 — o solver não enxerga as aulas dos outros cursos", () => {
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

    it.fails("I1: não usa professor nem sala ocupados por outro curso", () => {
      const conflitos = r.alocacoes.filter((a) => a.dia < 5 && a.hora < 12 && (a.professorId === P || a.salaId === S));
      expect(conflitos).toEqual([]);
    });
  });
});
