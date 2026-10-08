# Linha de base do solver

Gerada por `npm run bench:solver -- --salvar` em 2026-10-08, sobre a massa anonimizada. É a referência "antes" para comparar o solver v2.

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma | fora do turno | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 754 | 0 | 6 | 2 | 21 | 1389 |
| atual | massa real | 2 | sim | 0 | 754 | 0 | 6 | 2 | 21 | 1354 |
| atual | massa real | 3 | sim | 0 | 574 | 0 | 6 | 2 | 15 | 1393 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 910 | 0 | 4 | 1 | 27 | 1137 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 902 | 0 | 3 | 1 | 27 | 1126 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 910 | 0 | 4 | 1 | 27 | 1214 |
| atual | 3 salas + 1 dia indisponível | 1 | sim | 0 | 1982 | 0 | 28 | 26 | 45 | 1357 |
| atual | 3 salas + 1 dia indisponível | 2 | sim | 0 | 1982 | 0 | 28 | 26 | 45 | 1370 |
| atual | 3 salas + 1 dia indisponível | 3 | sim | 0 | 1950 | 0 | 25 | 25 | 45 | 1412 |
