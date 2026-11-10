-- Marca disciplinas cujas aulas são combinadas fora da distribuição automática.
ALTER TABLE disciplinas ADD COLUMN fora_do_gerador INTEGER NOT NULL DEFAULT 0;
