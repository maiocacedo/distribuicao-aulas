-- Regras e integridade (subprojeto 1).
--
-- Nenhuma tabela é recriada. Dentro da transação da migração a chave
-- estrangeira está ligada, e DROP TABLE disciplinas faria um DELETE implícito
-- que dispara ON DELETE CASCADE em disciplina_professores, disciplina_salas e
-- alocacoes — o dado se perderia. Por isso a cascata do curso é um gatilho, e
-- os CHECK que ainda citam 'noite' ficam como estão: sem nenhum horário
-- noturno, nada consegue usá-los.

-- ---------------------------------------------------------------- noite

DELETE FROM alocacoes
 WHERE hora IN (SELECT indice FROM horarios WHERE turno = 'noite');
DELETE FROM indisponibilidades
 WHERE hora IN (SELECT indice FROM horarios WHERE turno = 'noite');
DELETE FROM horarios WHERE turno = 'noite';

UPDATE disciplinas SET turno = NULL    WHERE turno = 'noite';
UPDATE periodos    SET turno = 'tarde' WHERE turno = 'noite';

-- 'manha,tarde,noite' → 'manha,tarde'; um curso que só tinha noite volta ao padrão.
UPDATE cursos SET turnos = COALESCE(
    NULLIF(TRIM(REPLACE(',' || turnos || ',', ',noite,', ','), ','), ''),
    'manha,tarde');
UPDATE configuracao SET valor = COALESCE(
    NULLIF(TRIM(REPLACE(',' || valor || ',', ',noite,', ','), ','), ''),
    'manha')
 WHERE chave = 'turnos_sabado';

-- ---------------------------------------------------------------- views
--
-- Nenhuma tela as lê. Os choques entre cursos passam a ser regra dura, e o
-- diagnóstico das aulas antigas que já os violam vem do módulo de regras.

DROP VIEW IF EXISTS ocupacao_professor;
DROP VIEW IF EXISTS ocupacao_sala;
DROP VIEW IF EXISTS aulas_conferencia;
DROP VIEW IF EXISTS alocacao_conferencia;
DROP VIEW IF EXISTS conflitos;

-- ---------------------------------------------------------------- contraturno
--
-- permite_contraturno era derivado de max > 0 e nada o lia.
ALTER TABLE periodos DROP COLUMN permite_contraturno;

-- O máximo passa a contar só as obrigatórias: as optativas vão ao contraturno
-- quando o gerador achar melhor. O valor antigo incluía as optativas — era o
-- "uma no turno, o resto no contraturno" escrito à mão.
UPDATE periodos SET max_disciplinas_contraturno = MAX(0,
    max_disciplinas_contraturno - (
        SELECT COUNT(*) FROM disciplinas d
         WHERE d.curso_id = periodos.curso_id
           AND d.periodo  = periodos.numero
           AND d.optativa = 1));

-- ---------------------------------------------------------------- oferta

ALTER TABLE disciplinas ADD COLUMN ofertada INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------- cascata
--
-- disciplinas não tem FK para cursos. Os períodos já caem pela FK; as
-- disciplinas (e com elas fatias, salas e aulas) caem por aqui, antes.
CREATE TRIGGER cursos_cascata BEFORE DELETE ON cursos
BEGIN
    DELETE FROM alocacoes   WHERE curso_id = OLD.id;
    DELETE FROM disciplinas WHERE curso_id = OLD.id;
END;

-- ---------------------------------------------------------------- versão

-- A versão real do esquema é a do _sqlx_migrations; esta chave parou na 1.
DELETE FROM configuracao WHERE chave = 'versao_schema';
