# Linha de base do solver

Gerada por `npm run bench:solver -- --salvar` em 2026-10-10, sobre a massa anonimizada. É a referência "antes" para comparar o solver v2.

- Commit: f93a79f
- Node: v22.15.1
- Sementes: 1, 2, 3

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma | fora do turno | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 692 | 0 | 3 | 1 | 24 | 1056 |
| atual | massa real | 2 | sim | 0 | 660 | 0 | 0 | 2 | 24 | 996 |
| atual | massa real | 3 | sim | 0 | 660 | 0 | 0 | 0 | 24 | 997 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 968 | 0 | 10 | 6 | 32 | 877 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 968 | 0 | 10 | 6 | 32 | 886 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 936 | 0 | 10 | 6 | 32 | 893 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 5 | 1494 | 0 | 23 | 42 | 37 | 657 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 5 | 1574 | 0 | 35 | 36 | 37 | 647 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 5 | 1494 | 0 | 27 | 38 | 37 | 709 |
