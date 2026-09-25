-- Esquema do Distribuição de Aulas
--
-- Nada aqui é fixo em 8 períodos, 12 horários ou 6 dias: a grade é definida
-- pelas linhas de `periodos` e `horarios` e pela configuração `dias_letivos`.
-- Uma aula é identificada por (periodo, dia, hora) — sem índice de slot
-- calculado, que era o que amarrava o modelo antigo em 12 horários por dia.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- configuração

CREATE TABLE configuracao (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

-- Os horários do dia, em ordem. `turno` define onde estão as fronteiras:
-- um bloco de aulas seguidas nunca atravessa uma troca de turno, então é isto
-- que impede um bloco de pular o intervalo do almoço.
CREATE TABLE horarios (
    indice INTEGER PRIMARY KEY,        -- 0, 1, 2, ... na ordem do dia
    rotulo TEXT    NOT NULL,           -- '7:30'
    turno  TEXT    NOT NULL CHECK (turno IN ('manha','tarde','noite'))
);

CREATE TABLE periodos (
    numero                      INTEGER PRIMARY KEY CHECK (numero BETWEEN 1 AND 20),
    turno                       TEXT    NOT NULL CHECK (turno IN ('manha','tarde','noite')),
    permite_contraturno         INTEGER NOT NULL DEFAULT 0,
    max_disciplinas_contraturno INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------- cadastros

CREATE TABLE professores (
    id              INTEGER PRIMARY KEY,
    nome            TEXT    NOT NULL UNIQUE,
    -- como o professor prefere que os dias de aula dele fiquem distribuídos
    pref_dias       TEXT    NOT NULL DEFAULT 'indiferente'
                            CHECK (pref_dias IN ('consecutivos','intercalados','indiferente')),
    pref_dias_peso  INTEGER NOT NULL DEFAULT 2 CHECK (pref_dias_peso BETWEEN 0 AND 3),
    max_dias_semana INTEGER,          -- NULL = sem limite
    observacao      TEXT
);

CREATE TABLE salas (
    id         INTEGER PRIMARY KEY,
    nome       TEXT    NOT NULL UNIQUE,
    tipo       TEXT    NOT NULL,      -- 'Sala de Aula' | 'Laboratório'
    capacidade INTEGER NOT NULL
);

-- Molde de cadastro: um conjunto de propriedades que se repete em várias
-- disciplinas. Serve para preencher o formulário de uma disciplina nova de uma
-- vez — "esta é do tipo tal" — em vez de marcar campo por campo.
--
-- É SÓ UM MOLDE. Os valores que valem são sempre os de `disciplinas`; o solver
-- nunca lê esta tabela, e a disciplina pode divergir do seu tipo à vontade.
-- Os nomes dos tipos são livres: cada curso chama os seus como quiser.
CREATE TABLE tipos_disciplina (
    id             INTEGER PRIMARY KEY,
    nome           TEXT    NOT NULL UNIQUE,
    exige_sala     INTEGER NOT NULL DEFAULT 1,
    blocos_livres  INTEGER NOT NULL DEFAULT 0,
    prioridade     INTEGER NOT NULL DEFAULT 2 CHECK (prioridade BETWEEN 1 AND 3),
    permite_sabado INTEGER NOT NULL DEFAULT 0,
    optativa       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE disciplinas (
    id             INTEGER PRIMARY KEY,
    nome           TEXT    NOT NULL,
    tipo_id        INTEGER REFERENCES tipos_disciplina(id) ON DELETE SET NULL,
    periodo        INTEGER NOT NULL REFERENCES periodos(numero),
    ch_semanal     INTEGER NOT NULL CHECK (ch_semanal > 0),
    permite_sabado INTEGER NOT NULL DEFAULT 0,
    -- NULL = segue o turno do período; preenchido = força este turno
    turno          TEXT    CHECK (turno IN ('manha','tarde','noite')),
    optativa       INTEGER NOT NULL DEFAULT 0,

    -- 0 = não ocupa sala nenhuma (remota). O solver deixa `sala_id` nulo e a
    -- disciplina não disputa sala com ninguém.
    exige_sala     INTEGER NOT NULL DEFAULT 1,

    -- 1 = qualquer partição da carga horária vale; `padroes_blocos` é ignorado.
    blocos_livres  INTEGER NOT NULL DEFAULT 0,

    -- Ordem em que o solver aloca: 1 primeiro, 3 por último, no que sobrar.
    -- Prioridade 3 também tem os custos brandos atenuados — a disciplina se
    -- encaixa nas folgas em vez de disputar horário com as demais.
    prioridade     INTEGER NOT NULL DEFAULT 2 CHECK (prioridade BETWEEN 1 AND 3),

    observacao     TEXT
);

-- Uma disciplina pode ser dividida entre vários professores, cada um com sua
-- fatia da carga horária. A soma das fatias tem de fechar com
-- `disciplinas.ch_semanal` (view `ch_conferencia`).
-- Cada fatia é planejada em blocos independentes, como se fosse uma disciplina.
CREATE TABLE disciplina_professores (
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    professor_id  INTEGER NOT NULL REFERENCES professores(id),
    ch            INTEGER NOT NULL CHECK (ch > 0),
    PRIMARY KEY (disciplina_id, professor_id)
);

-- Salas aceitáveis para a disciplina. Sem nenhuma linha = qualquer sala serve.
CREATE TABLE disciplina_salas (
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    sala_id       INTEGER NOT NULL REFERENCES salas(id)       ON DELETE CASCADE,
    preferencia   INTEGER NOT NULL DEFAULT 1,   -- 1 = ideal, 2 = aceitável
    PRIMARY KEY (disciplina_id, sala_id)
);

-- Indisponibilidade declarada pelo professor.
CREATE TABLE indisponibilidades (
    professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    dia          INTEGER NOT NULL CHECK (dia BETWEEN 0 AND 6),
    hora         INTEGER NOT NULL REFERENCES horarios(indice),
    motivo       TEXT,
    PRIMARY KEY (professor_id, dia, hora)
);

-- ---------------------------------------------------------------- a grade

CREATE TABLE alocacoes (
    periodo       INTEGER NOT NULL REFERENCES periodos(numero),
    dia           INTEGER NOT NULL CHECK (dia BETWEEN 0 AND 6),
    hora          INTEGER NOT NULL REFERENCES horarios(indice),
    disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    professor_id  INTEGER NOT NULL REFERENCES professores(id),
    sala_id       INTEGER          REFERENCES salas(id),
    fixada        INTEGER NOT NULL DEFAULT 0,  -- 1 = o gerador não pode mexer
    PRIMARY KEY (periodo, dia, hora),
    FOREIGN KEY (disciplina_id, professor_id)
        REFERENCES disciplina_professores(disciplina_id, professor_id)
);

-- Como uma carga horária pode ser quebrada em blocos de aulas seguidas.
-- Vale para a fatia de cada professor, não para a CH total da disciplina.
-- Padrão ausente desta tabela = proibido. custo 0 = ideal, maior = evitar.
CREATE TABLE padroes_blocos (
    ch     INTEGER NOT NULL,
    padrao TEXT    NOT NULL,   -- ex.: '2+2'
    custo  INTEGER NOT NULL,
    PRIMARY KEY (ch, padrao)
);

-- ---------------------------------------------------------------- índices

CREATE INDEX idx_disciplinas_periodo  ON disciplinas(periodo);
CREATE INDEX idx_dp_professor         ON disciplina_professores(professor_id);
CREATE INDEX idx_alocacoes_disciplina ON alocacoes(disciplina_id);
CREATE INDEX idx_alocacoes_professor  ON alocacoes(professor_id, dia, hora);
CREATE INDEX idx_alocacoes_sala       ON alocacoes(sala_id, dia, hora);

-- ---------------------------------------------------------------- views

-- Substituem as 38 tabelas <nome>_restricoes do banco antigo.
CREATE VIEW ocupacao_professor AS
SELECT professor_id, dia, hora, periodo, disciplina_id FROM alocacoes;

CREATE VIEW ocupacao_sala AS
SELECT sala_id, dia, hora, periodo, disciplina_id
FROM   alocacoes WHERE sala_id IS NOT NULL;

-- Fatias dos professores contra a CH da disciplina; deve vir vazia.
CREATE VIEW ch_conferencia AS
SELECT d.id, d.nome, d.ch_semanal,
       COALESCE((SELECT SUM(ch) FROM disciplina_professores dp
                 WHERE dp.disciplina_id = d.id), 0) AS ch_distribuida
FROM   disciplinas d
WHERE  d.ch_semanal <> ch_distribuida;

-- Aulas alocadas contra a fatia contratada de cada professor.
CREATE VIEW alocacao_conferencia AS
SELECT dp.disciplina_id, d.nome, dp.professor_id, p.nome AS professor,
       dp.ch AS previsto,
       (SELECT COUNT(*) FROM alocacoes a
        WHERE a.disciplina_id = dp.disciplina_id
          AND a.professor_id  = dp.professor_id) AS alocado
FROM   disciplina_professores dp
JOIN   disciplinas  d ON d.id = dp.disciplina_id
JOIN   professores  p ON p.id = dp.professor_id
WHERE  previsto <> alocado;

-- ---------------------------------------------------------------- semente

INSERT INTO configuracao (chave, valor) VALUES
    ('nome_curso',    'Curso'),
    ('dias_letivos',  '6'),          -- Segunda a Sábado
    ('versao_schema', '1');

INSERT INTO horarios (indice, rotulo, turno) VALUES
    (0,'7:30','manha'),  (1,'8:20','manha'),  (2,'9:10','manha'),
    (3,'10:20','manha'), (4,'11:10','manha'), (5,'12:00','manha'),
    (6,'13:00','tarde'), (7,'13:50','tarde'), (8,'14:40','tarde'),
    (9,'15:50','tarde'), (10,'16:40','tarde'), (11,'17:30','tarde');

INSERT INTO padroes_blocos (ch, padrao, custo) VALUES
    (1,'1',0),
    (2,'2',0),     (2,'1+1',5),
    (3,'3',0),     (3,'2+1',1),
    (4,'2+2',0),   (4,'3+1',1),     (4,'4',6),
    (5,'3+2',0),   (5,'2+2+1',2),
    (6,'3+3',0),   (6,'2+2+2',1),   (6,'4+2',6);
