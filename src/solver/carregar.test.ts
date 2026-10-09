import { describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../testes/suporte/banco";
import { carregarProblema } from "./carregar";

describe("carregarProblema", () => {
  it("traz os turnos do curso e nenhum horário noturno", async () => {
    const p = await carregarProblema(1, lerDe(criarBanco()));
    expect(p.cursoId).toBe(1);
    expect(p.turnosDoCurso).toEqual(["manha", "tarde"]);
    expect(p.horarios).toHaveLength(12);
    expect(p.externas).toEqual([]);
  });

  it("deixa de fora a disciplina não ofertada", async () => {
    const db = criarBanco();
    const { id } = db.prepare("SELECT id FROM disciplinas WHERE curso_id = 1 ORDER BY id LIMIT 1").get() as { id: number };
    db.prepare("UPDATE disciplinas SET ofertada = 0 WHERE id = ?").run(id);
    const p = await carregarProblema(1, lerDe(db));
    expect(p.fatias.some((f) => f.disciplinaId === id)).toBe(false);
    expect(p.fatias.every((f) => f.ofertada)).toBe(true);
  });

  it("traz as aulas dos outros cursos e a preferência de sala", async () => {
    const db = criarBanco();
    const { id: d } = db.prepare("SELECT id FROM disciplinas WHERE curso_id = 1 AND exige_sala = 1 ORDER BY id LIMIT 1").get() as {
      id: number;
    };
    db.exec(`
      INSERT INTO cursos (id, nome) VALUES (2, 'Outro');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (2, 1, 'manha');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (9001, 2, 'X', 1, 1);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (9001, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (2, 1, 0, 0, 9001, 1);
    `);
    db.prepare("INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (?, 1, 2)").run(d);
    const p = await carregarProblema(1, lerDe(db));
    expect(p.externas).toEqual([
      { cursoId: 2, periodo: 1, dia: 0, hora: 0, disciplinaId: 9001, professorId: 1, salaId: null },
    ]);
    expect(p.fatias.find((f) => f.disciplinaId === d)?.salas).toEqual([{ id: 1, preferencia: 2 }]);
  });
});
