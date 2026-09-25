-- A unidade de medida é a AULA, não a hora.
--
-- Uma disciplina de "4" tem quatro aulas por semana. Quanto tempo cada aula
-- dura é outra coisa: 50 minutos de dia, 45 à noite (`horarios.duracao_min`),
-- e isso não entra em cálculo nenhum — é informação de apoio.
--
-- Os nomes `ch_semanal` e `ch` diziam carga horária e portanto mentiam.

DROP VIEW ch_conferencia;
DROP VIEW alocacao_conferencia;

ALTER TABLE disciplinas             RENAME COLUMN ch_semanal TO aulas_semanais;
ALTER TABLE disciplina_professores  RENAME COLUMN ch         TO aulas;
ALTER TABLE padroes_blocos          RENAME COLUMN ch         TO aulas;

-- Fatias dos professores contra o total da disciplina; deve vir vazia.
CREATE VIEW aulas_conferencia AS
SELECT d.id, d.nome, d.aulas_semanais,
       COALESCE((SELECT SUM(aulas) FROM disciplina_professores dp
                 WHERE dp.disciplina_id = d.id), 0) AS aulas_distribuidas
FROM   disciplinas d
WHERE  d.aulas_semanais <> aulas_distribuidas;

-- Aulas alocadas na grade contra a fatia contratada de cada professor.
CREATE VIEW alocacao_conferencia AS
SELECT dp.disciplina_id, d.nome, dp.professor_id, p.nome AS professor,
       dp.aulas AS previsto,
       (SELECT COUNT(*) FROM alocacoes a
        WHERE a.disciplina_id = dp.disciplina_id
          AND a.professor_id  = dp.professor_id) AS alocado
FROM   disciplina_professores dp
JOIN   disciplinas  d ON d.id = dp.disciplina_id
JOIN   professores  p ON p.id = dp.professor_id
WHERE  previsto <> alocado;
