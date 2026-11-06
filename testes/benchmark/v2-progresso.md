# Benchmark do solver v2

Cada tarefa do plano acrescenta uma seção com a saída do benchmark (`npm run bench:solver`) sobre a massa anonimizada.

## Task 1 — esqueleto

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma | fora do turno | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 38 | 3447 |
| atual | massa real | 2 | sim | 0 | 620 | 0 | 0 | 2 | 38 | 2869 |
| atual | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 38 | 2989 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 2423 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 2674 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 6 | 46 | 2360 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 44 | 40 | 1583 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 42 | 38 | 1872 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 42 | 40 | 2764 |
| v2 | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 38 | 3771 |
| v2 | massa real | 2 | sim | 0 | 620 | 0 | 0 | 2 | 38 | 3593 |
| v2 | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 38 | 3589 |
| v2 | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 3217 |
| v2 | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 3318 |
| v2 | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 6 | 46 | 2779 |
| v2 | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 44 | 40 | 2360 |
| v2 | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 42 | 38 | 3016 |
| v2 | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 42 | 40 | 3007 |

Idêntico ao v1 em custo, faltantes e violações. Os tempos desta máquina (~3 s também no v1) estão acima dos ~1,2 s da linha de base de outubro: a meta de tempo compara com o v1 medido na mesma execução.

## Task 2 — execução em passos

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma | fora do turno | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 38 | 2775 |
| atual | massa real | 2 | sim | 0 | 620 | 0 | 0 | 2 | 38 | 2878 |
| atual | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 38 | 2654 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 2617 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 3020 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 6 | 46 | 3077 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 44 | 40 | 1837 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 42 | 38 | 1853 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 42 | 40 | 1839 |
| v2 | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 38 | 3238 |
| v2 | massa real | 2 | sim | 0 | 620 | 0 | 0 | 2 | 38 | 3011 |
| v2 | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 38 | 3435 |
| v2 | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 3174 |
| v2 | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 3616 |
| v2 | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 6 | 46 | 3608 |
| v2 | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 44 | 40 | 2407 |
| v2 | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 42 | 38 | 2358 |
| v2 | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 42 | 40 | 2270 |

Idêntico ao v1 em custo, faltantes e violações: `resolver` agora só esgota `resolverEmPassos`, sem mudar a ordem do sorteio.

## Task 4 — nota marginal

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma | fora do turno | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 38 | 3669 |
| atual | massa real | 2 | sim | 0 | 620 | 0 | 0 | 2 | 38 | 4278 |
| atual | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 38 | 3241 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 3898 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 46 | 3906 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 6 | 46 | 3757 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 44 | 40 | 3188 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 42 | 38 | 3180 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 42 | 40 | 3385 |
| v2 | massa real | 1 | sim | 0 | 690 | 0 | 0 | 14 | 37 | 4102 |
| v2 | massa real | 2 | sim | 0 | 870 | 0 | 0 | 18 | 41 | 4345 |
| v2 | massa real | 3 | sim | 0 | 886 | 0 | 0 | 18 | 41 | 4095 |
| v2 | 6 salas + 1 dia indisponível | 1 | sim | 0 | 840 | 0 | 8 | 7 | 40 | 4221 |
| v2 | 6 salas + 1 dia indisponível | 2 | sim | 0 | 832 | 0 | 7 | 7 | 40 | 3767 |
| v2 | 6 salas + 1 dia indisponível | 3 | sim | 0 | 856 | 0 | 10 | 9 | 40 | 3558 |
| v2 | 3 salas + 1 dia indisponível | 1 | não | 5 | 1500 | 0 | 30 | 30 | 35 | 2961 |
| v2 | 3 salas + 1 dia indisponível | 2 | não | 5 | 1500 | 0 | 30 | 30 | 35 | 3065 |
| v2 | 3 salas + 1 dia indisponível | 3 | não | 5 | 1500 | 0 | 30 | 30 | 35 | 2831 |

Custo médio (sementes 1 a 3), v1 → v2: massa real 630,7 → 815,3 (pior); 6 salas 917,3 → 842,7 (melhor); 3 salas 1514,7 → 1500,0 (melhor, mas com 5 faltantes em vez de 4). Violações: 0 em todos. Tempos inflados por outro agente rodando testes na máquina.

Leitura: a nota marginal sozinha piorou a massa real (a meta é ficar abaixo de 631) e deixou uma fatia a mais de fora no cenário de 3 salas; o plano aceita isso. Na massa real os buracos do professor foram a 0, mas os da turma subiram de 0–2 para 14–18: a nota agora cobra a variação de buracos pelo peso inteiro, e o guloso corre atrás de fechar buracos do professor e de evitar o contraturno sem enxergar o efeito nos buracos da turma (que a descida da Fase 2, sempre em `candidatos[0]` e só aceitando `<=`, não consegue desfazer). Os ganhos nos cenários de 6 e 3 salas vêm de menos fora do turno (46 → 40, 40 → 35) e de mais folga para a turma. A busca em si (Fase 2, Top-K + LAHC) é quem deve recuperar a massa real; esta tarefa só alinha a régua.
