-- Segundo curso dos dados de exemplo (Dados › Carregar dados de exemplo).
--
-- Roda DEPOIS de todas as migrações, sobre a massa já no esquema de hoje: ao
-- contrário da massa, este arquivo é escrito à mão e segue o esquema atual.
-- Uma migração que mude estas tabelas tem de atualizá-lo junto (o teste de
-- `src/banco/arquivo.test.ts` acusa).
--
-- Existe para experimentar o que só aparece com mais de um curso: trocar de
-- curso, Gerenciar cursos, e professores e salas da instituição disputados pelos
-- dois. Os professores são os da massa — alguns com pouca carga, outros já
-- cheios na Engenharia —, e a grade começa vazia, para a grade automática ter
-- o que gerar.

INSERT INTO cursos (id, nome, horas_por_aula_semanal, observacao, turnos)
VALUES (2, 'Sistemas de Informação', 15, 'Curso de exemplo, para testar vários cursos.', 'manha,tarde');

INSERT INTO periodos (curso_id, numero, turno, max_disciplinas_contraturno) VALUES
  (2, 1, 'manha', 0),
  (2, 2, 'tarde', 0),
  (2, 3, 'manha', 0),
  (2, 4, 'tarde', 1);

-- Tipo 4 = Regular, 5 = Optativa (os da massa).
INSERT INTO disciplinas (id, curso_id, nome, tipo_id, periodo, aulas_semanais, optativa, tipo_sala, abreviacao) VALUES
  (101, 2, 'Introdução a Sistemas de Informação', 4, 1, 4, 0, NULL, 'ISI'),
  (102, 2, 'Algoritmos e Programação', 4, 1, 6, 0, 'Laboratório', 'ALG'),
  (103, 2, 'Matemática Discreta', 4, 1, 4, 0, NULL, 'MD'),
  (104, 2, 'Comunicação e Expressão', 4, 1, 2, 0, NULL, 'CE'),
  (105, 2, 'Estruturas de Dados', 4, 2, 4, 0, 'Laboratório', 'ED'),
  (106, 2, 'Fundamentos de Administração', 4, 2, 4, 0, NULL, 'ADM'),
  (107, 2, 'Cálculo Aplicado', 4, 2, 4, 0, NULL, 'CALC'),
  (108, 2, 'Inglês Instrumental', 4, 2, 2, 0, NULL, 'ING'),
  (109, 2, 'Banco de Dados', 4, 3, 4, 0, 'Laboratório', 'BD'),
  (110, 2, 'Engenharia de Software', 4, 3, 4, 0, NULL, 'ES'),
  (111, 2, 'Contabilidade Gerencial', 4, 3, 4, 0, NULL, 'CONT'),
  (112, 2, 'Estatística', 4, 3, 4, 0, NULL, 'EST'),
  (113, 2, 'Desenvolvimento Web', 4, 4, 4, 0, 'Laboratório', 'WEB'),
  (114, 2, 'Gestão de Projetos', 4, 4, 4, 0, NULL, 'GP'),
  (115, 2, 'Sistemas Operacionais', 4, 4, 4, 0, NULL, 'SO'),
  (116, 2, 'Empreendedorismo', 5, 4, 2, 1, NULL, 'EMP');

INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES
  (101, 8, 4),
  (102, 28, 6),
  (103, 24, 4),
  (104, 10, 2),
  (105, 28, 4),
  (106, 14, 4),
  (107, 1, 4),
  (108, 23, 2),
  (109, 17, 4),
  (110, 29, 4),
  (111, 14, 4),
  (112, 21, 4),
  (113, 8, 4),
  (114, 23, 4),
  (115, 2, 4),
  (116, 10, 2);
