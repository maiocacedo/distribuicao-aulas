-- Abreviação da disciplina, para a célula da grade.
--
-- "Arquitetura e Organização de Computadores" não cabe numa célula de 44px de
-- altura por ~150 de largura. Cortar por CSS produz reticências em lugar
-- arbitrário e duas disciplinas parecidas viram a mesma coisa na tela.
--
-- Quem cadastra sabe qual é a forma curta que a coordenação usa — "Arq. e Org.
-- de Computadores", "AOC". Vazio = usa o nome completo, com corte em 2 linhas.

ALTER TABLE disciplinas ADD COLUMN abreviacao TEXT;
