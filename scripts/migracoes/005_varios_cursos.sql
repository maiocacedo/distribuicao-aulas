-- Vários cursos no mesmo banco.
--
-- O que é do CURSO: períodos, disciplinas, a grade, a conversão currículo→aulas.
-- O que é da INSTITUIÇÃO e fica compartilhado: professores, salas, os horários
-- do dia, os padrões de bloco, os tipos de disciplina, os dias letivos.
--
-- Compartilhar professores e salas é o ponto todo: um professor que dá aula em
-- dois cursos não pode estar em dois lugares no mesmo horário, e a sala é a
-- mesma para todos. Um banco por curso esconderia exatamente os conflitos que
-- este sistema existe para achar.

CREATE TABLE cursos (
    id                     INTEGER PRIMARY KEY,
    nome                   TEXT    NOT NULL UNIQUE,
    -- Quantas horas de currículo equivalem a 1 aula por semana. Por curso,
    -- porque currículos diferentes contam diferente.
    horas_por_aula_semanal INTEGER NOT NULL DEFAULT 15,
    observacao             TEXT
);

-- O curso que já existia vira o curso 1, com o nome e a conversão que estavam
-- na configuração global.
INSERT INTO cursos (id, nome, horas_por_aula_semanal)
SELECT 1,
       COALESCE((SELECT valor FROM configuracao WHERE chave = 'nome_curso'), 'Curso'),
       COALESCE((SELECT CAST(valor AS INTEGER) FROM configuracao
                  WHERE chave = 'horas_por_aula_semanal'), 15);

DELETE FROM configuracao WHERE chave IN ('nome_curso', 'horas_por_aula_semanal');

-- ---------------------------------------------------------------- períodos

DROP VIEW aulas_conferencia;
DROP VIEW alocacao_conferencia;
DROP VIEW ocupacao_professor;
DROP VIEW ocupacao_sala;

CREATE TABLE periodos_novo (
    curso_id                    INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
    numero                      INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 20),
    turno                       TEXT    NOT NULL CHECK (turno IN ('manha','tarde','noite')),
    permite_contraturno         INTEGER NOT NULL DEFAULT 0,
    max_disciplinas_contraturno INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (curso_id, numero)
);
INSERT INTO periodos_novo (curso_id, numero, turno, permite_contraturno,
                           max_disciplinas_contraturno)
SELECT 1, numero, turno, permite_contraturno, max_disciplinas_contraturno FROM periodos;

-- ---------------------------------------------------------------- disciplinas

CREATE TABLE disciplinas_novo (
    id             INTEGER PRIMARY KEY,
    curso_id       INTEGER NOT NULL,
    nome           TEXT    NOT NULL,
    tipo_id        INTEGER REFERENCES tipos_disciplina(id) ON DELETE SET NULL,
    periodo        INTEGER NOT NULL,
    aulas_semanais INTEGER NOT NULL CHECK (aulas_semanais > 0),
    permite_sabado INTEGER NOT NULL DEFAULT 0,
    turno          TEXT    CHECK (turno IN ('manha','tarde','noite')),
    optativa       INTEGER NOT NULL DEFAULT 0,
    exige_sala     INTEGER NOT NULL DEFAULT 1,
    blocos_livres  INTEGER NOT NULL DEFAULT 0,
    prioridade     INTEGER NOT NULL DEFAULT 2 CHECK (prioridade BETWEEN 1 AND 3),
    observacao     TEXT,
    FOREIGN KEY (curso_id, periodo) REFERENCES periodos_novo(curso_id, numero)
);
INSERT INTO disciplinas_novo (id, curso_id, nome, tipo_id, periodo, aulas_semanais,
                              permite_sabado, turno, optativa, exige_sala,
                              blocos_livres, prioridade, observacao)
SELECT id, 1, nome, tipo_id, periodo, aulas_semanais, permite_sabado, turno,
       optativa, exige_sala, blocos_livres, prioridade, observacao FROM disciplinas;

-- ---------------------------------------------------------------- alocações

CREATE TABLE alocacoes_novo (
    curso_id      INTEGER NOT NULL,
    periodo       INTEGER NOT NULL,
    dia           INTEGER NOT NULL CHECK (dia BETWEEN 0 AND 6),
    hora          INTEGER NOT NULL REFERENCES horarios(indice),
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas_novo(id) ON DELETE CASCADE,
    professor_id  INTEGER NOT NULL REFERENCES professores(id),
    sala_id       INTEGER          REFERENCES salas(id),
    fixada        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (curso_id, periodo, dia, hora),
    FOREIGN KEY (curso_id, periodo) REFERENCES periodos_novo(curso_id, numero),
    FOREIGN KEY (disciplina_id, professor_id)
        REFERENCES disciplina_professores(disciplina_id, professor_id)
);
INSERT INTO alocacoes_novo (curso_id, periodo, dia, hora, disciplina_id,
                            professor_id, sala_id, fixada)
SELECT 1, periodo, dia, hora, disciplina_id, professor_id, sala_id, fixada
  FROM alocacoes;

DROP TABLE alocacoes;
DROP TABLE disciplinas;
DROP TABLE periodos;
ALTER TABLE periodos_novo    RENAME TO periodos;
ALTER TABLE disciplinas_novo RENAME TO disciplinas;
ALTER TABLE alocacoes_novo   RENAME TO alocacoes;

-- ---------------------------------------------------------------- índices

CREATE INDEX idx_disciplinas_curso    ON disciplinas(curso_id, periodo);
CREATE INDEX idx_alocacoes_disciplina ON alocacoes(disciplina_id);
CREATE INDEX idx_alocacoes_professor  ON alocacoes(professor_id, dia, hora);
CREATE INDEX idx_alocacoes_sala       ON alocacoes(sala_id, dia, hora);

-- ---------------------------------------------------------------- views
--
-- Estas duas atravessam cursos de propósito: é assim que se vê que o mesmo
-- professor, ou a mesma sala, foi parar em dois cursos no mesmo horário.

CREATE VIEW ocupacao_professor AS
SELECT professor_id, dia, hora, curso_id, periodo, disciplina_id FROM alocacoes;

CREATE VIEW ocupacao_sala AS
SELECT sala_id, dia, hora, curso_id, periodo, disciplina_id
FROM   alocacoes WHERE sala_id IS NOT NULL;

CREATE VIEW aulas_conferencia AS
SELECT d.id, d.curso_id, d.nome, d.aulas_semanais,
       COALESCE((SELECT SUM(aulas) FROM disciplina_professores dp
                 WHERE dp.disciplina_id = d.id), 0) AS aulas_distribuidas
FROM   disciplinas d
WHERE  d.aulas_semanais <> aulas_distribuidas;

CREATE VIEW alocacao_conferencia AS
SELECT dp.disciplina_id, d.curso_id, d.nome, dp.professor_id, p.nome AS professor,
       dp.aulas AS previsto,
       (SELECT COUNT(*) FROM alocacoes a
        WHERE a.disciplina_id = dp.disciplina_id
          AND a.professor_id  = dp.professor_id) AS alocado
FROM   disciplina_professores dp
JOIN   disciplinas  d ON d.id = dp.disciplina_id
JOIN   professores  p ON p.id = dp.professor_id
WHERE  previsto <> alocado;

-- Conflitos entre cursos: mesmo professor ou mesma sala em dois lugares.
CREATE VIEW conflitos AS
SELECT 'professor' AS tipo, p.nome AS quem, a.dia, a.hora, COUNT(*) AS quantas
  FROM alocacoes a JOIN professores p ON p.id = a.professor_id
 GROUP BY a.professor_id, a.dia, a.hora HAVING COUNT(*) > 1
UNION ALL
SELECT 'sala', s.nome, a.dia, a.hora, COUNT(*)
  FROM alocacoes a JOIN salas s ON s.id = a.sala_id
 GROUP BY a.sala_id, a.dia, a.hora HAVING COUNT(*) > 1;
