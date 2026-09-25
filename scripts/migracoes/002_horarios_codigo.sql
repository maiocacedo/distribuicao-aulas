-- Código e duração dos horários.
--
-- Rotular um horário só pela hora de início dá a entender que todos duram o
-- mesmo, e não duram: à noite as aulas são mais curtas (45 min contra 50).
-- Separando as duas coisas, a grade passa a ser identificada pelo código
-- (M1, T3, N2...) e a hora vira informação de apoio.

ALTER TABLE horarios ADD COLUMN codigo TEXT NOT NULL DEFAULT '';
ALTER TABLE horarios ADD COLUMN duracao_min INTEGER NOT NULL DEFAULT 50;

-- Códigos para o que já existe: a inicial do turno mais a posição dentro dele.
UPDATE horarios
   SET codigo = (
       SELECT CASE h.turno WHEN 'manha' THEN 'M'
                           WHEN 'tarde' THEN 'T'
                           ELSE 'N' END || h.n
         FROM (SELECT indice, turno,
                      ROW_NUMBER() OVER (PARTITION BY turno ORDER BY indice) AS n
                 FROM horarios) h
        WHERE h.indice = horarios.indice)
 WHERE codigo = '';

UPDATE horarios SET duracao_min = 45 WHERE turno = 'noite';

CREATE UNIQUE INDEX idx_horarios_codigo ON horarios(codigo);
