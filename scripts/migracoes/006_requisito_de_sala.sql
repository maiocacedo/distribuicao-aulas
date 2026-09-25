-- Requisito de sala por TIPO, e não só por lista.
--
-- "Esta disciplina precisa de laboratório, tanto faz qual" é diferente de
-- "esta disciplina aceita L4, L6 e L8". A lista é um retrato: cadastre um
-- laboratório novo e ela não passa a aceitá-lo. O tipo acompanha.
--
-- O requisito de sala de uma disciplina é, então, um entre quatro:
--
--   exige_sala = 0                          não ocupa sala (remota)
--   tipo_sala IS NULL  e sem disciplina_salas   qualquer sala serve
--   tipo_sala = 'Laboratório'               qualquer sala daquele tipo
--   linhas em disciplina_salas              exatamente aquelas salas
--
-- Os dois últimos são alternativas: preencher `tipo_sala` limpa a lista e
-- vice-versa. Quem garante isso é a interface, não o esquema — o SQLite não
-- expressa essa exclusão sem gatilho, e um gatilho aqui seria pior que a
-- doença.

ALTER TABLE disciplinas      ADD COLUMN tipo_sala TEXT;
ALTER TABLE tipos_disciplina ADD COLUMN tipo_sala TEXT;
