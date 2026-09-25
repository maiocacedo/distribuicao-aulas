-- Sábado só tem aula de manhã.
--
-- Não é preferência nem contraturno: sábado à tarde e sábado à noite não
-- existem na instituição. Sem isto, tanto a grade manual quanto o gerador
-- ofereciam 12 posições no sábado que ninguém pode usar.
--
-- Fica em configuração e não no código porque é regra da instituição, do mesmo
-- tipo que os horários do dia: outra instituição pode ter sábado à tarde.
INSERT INTO configuracao (chave, valor) VALUES ('turnos_sabado', 'manha')
    ON CONFLICT(chave) DO NOTHING;

-- Domingo nunca é dia letivo; se algum banco ficou com 7, volta para 6.
UPDATE configuracao SET valor = '6' WHERE chave = 'dias_letivos' AND valor = '7';
