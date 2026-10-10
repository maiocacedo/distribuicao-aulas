# Linha de base do solver

Gerada por `npm run bench:solver -- --salvar` em 2026-10-10, sobre a massa anonimizada. É a referência "antes" para comparar o solver v2.

- Commit: 5fa288c
- Node: v22.15.1
- Sementes: 1, 2, 3

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma | fora do turno | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 38 | 1226 |
| atual | massa real | 2 | sim | 0 | 620 | 0 | 0 | 2 | 38 | 1219 |
| atual | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 38 | 1195 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 1098 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 1079 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 6 | 46 | 1049 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 44 | 40 | 760 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 42 | 38 | 755 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 42 | 40 | 773 |
