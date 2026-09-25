-- Conversão entre a carga horária do currículo e as aulas semanais da grade.
--
-- O currículo do curso expressa a disciplina em horas totais no semestre;
-- a grade trabalha em aulas por semana. A regra de conversão é do curso, não
-- do sistema, então mora na configuração: 15 horas de currículo equivalem a
-- 1 aula por semana (60h → 4 aulas).
--
-- É só apoio ao cadastro. O que a grade e o gerador usam é sempre
-- `disciplinas.aulas_semanais`.

INSERT INTO configuracao (chave, valor) VALUES ('horas_por_aula_semanal', '15')
    ON CONFLICT(chave) DO NOTHING;
