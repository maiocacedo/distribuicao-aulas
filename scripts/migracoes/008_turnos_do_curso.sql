-- Os horários do dia são da instituição e são fixos.
--
-- Editá-los caso a caso era liberdade que ninguém usa e que só produzia
-- estados inconsistentes — um horário chamado "T4" marcado como manhã, às
-- 13:00. A grade da instituição é sempre a mesma:
--
--   M1..M6   7:30  8:20  9:10  10:20 11:10 12:00   (50 min)
--   T1..T6  13:00 13:50 14:40  15:50 16:40 17:30   (50 min)
--   N1..N5  19:00 19:45 20:30  21:25 22:10         (45 min)
--
-- O que varia de curso para curso é OUTRA coisa: quais turnos ele ocupa —
-- só manhã, manhã e tarde, tarde e noite, e assim por diante. Isso passa a
-- ser campo do curso.

ALTER TABLE cursos ADD COLUMN turnos TEXT NOT NULL DEFAULT 'manha,tarde';

-- Cada curso herda os turnos que os períodos dele já usam.
UPDATE cursos SET turnos = COALESCE(
  (SELECT GROUP_CONCAT(t, ',') FROM (
     SELECT DISTINCT p.turno AS t FROM periodos p
      WHERE p.curso_id = cursos.id
      ORDER BY CASE p.turno WHEN 'manha' THEN 1 WHEN 'tarde' THEN 2 ELSE 3 END)),
  'manha,tarde');

-- Normaliza os horários para a grade institucional, sem apagar linha nenhuma:
-- `alocacoes.hora` e `indisponibilidades.hora` apontam para `indice`, e um
-- DELETE deixaria referências órfãs.
INSERT INTO horarios (indice, codigo, rotulo, turno, duracao_min) VALUES
    (0,  'M1',  '7:30', 'manha', 50),
    (1,  'M2',  '8:20', 'manha', 50),
    (2,  'M3',  '9:10', 'manha', 50),
    (3,  'M4', '10:20', 'manha', 50),
    (4,  'M5', '11:10', 'manha', 50),
    (5,  'M6', '12:00', 'manha', 50),
    (6,  'T1', '13:00', 'tarde', 50),
    (7,  'T2', '13:50', 'tarde', 50),
    (8,  'T3', '14:40', 'tarde', 50),
    (9,  'T4', '15:50', 'tarde', 50),
    (10, 'T5', '16:40', 'tarde', 50),
    (11, 'T6', '17:30', 'tarde', 50),
    (12, 'N1', '19:00', 'noite', 45),
    (13, 'N2', '19:45', 'noite', 45),
    (14, 'N3', '20:30', 'noite', 45),
    (15, 'N4', '21:25', 'noite', 45),
    (16, 'N5', '22:10', 'noite', 45)
ON CONFLICT(indice) DO UPDATE SET
    codigo      = excluded.codigo,
    rotulo      = excluded.rotulo,
    turno       = excluded.turno,
    duracao_min = excluded.duracao_min;

-- Se algum banco tiver horários além dos 17, tira só os que ninguém usa.
DELETE FROM horarios
 WHERE indice > 16
   AND indice NOT IN (SELECT hora FROM alocacoes)
   AND indice NOT IN (SELECT hora FROM indisponibilidades);
