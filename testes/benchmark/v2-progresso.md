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

A partir daqui as colunas `buracos turma` e `fora do turno` contam só as obrigatórias, como o custo: antes contavam as optativas também, que o custo isenta de propósito (as seções anteriores e a `linha-de-base.md` estão na contagem antiga).

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma (obrig.) | fora do turno (obrig.) | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 18 | 3801 |
| atual | massa real | 2 | sim | 0 | 620 | 0 | 0 | 0 | 18 | 3577 |
| atual | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 18 | 3765 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 24 | 3228 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 24 | 3160 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 2 | 24 | 2988 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 30 | 32 | 2325 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 29 | 32 | 2095 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 30 | 32 | 2157 |
| v2 | massa real | 1 | sim | 0 | 690 | 0 | 0 | 0 | 21 | 3263 |
| v2 | massa real | 2 | sim | 0 | 870 | 0 | 0 | 0 | 27 | 3091 |
| v2 | massa real | 3 | sim | 0 | 886 | 0 | 0 | 2 | 27 | 3269 |
| v2 | 6 salas + 1 dia indisponível | 1 | sim | 0 | 840 | 0 | 8 | 2 | 24 | 2816 |
| v2 | 6 salas + 1 dia indisponível | 2 | sim | 0 | 832 | 0 | 7 | 2 | 24 | 2905 |
| v2 | 6 salas + 1 dia indisponível | 3 | sim | 0 | 856 | 0 | 10 | 2 | 24 | 3088 |
| v2 | 3 salas + 1 dia indisponível | 1 | não | 5 | 1500 | 0 | 30 | 15 | 34 | 2517 |
| v2 | 3 salas + 1 dia indisponível | 2 | não | 5 | 1500 | 0 | 30 | 15 | 34 | 2570 |
| v2 | 3 salas + 1 dia indisponível | 3 | não | 5 | 1500 | 0 | 30 | 15 | 34 | 2434 |

Custo médio (sementes 1 a 3), v1 → v2: massa real 630,7 → 815,3 (pior); 6 salas 917,3 → 842,7 (melhor); 3 salas 1514,7 → 1500,0, mas com 5 faltantes em vez de 4. Violações: 0 em todos.

Leitura (conferida pela revisão): a nota está exata — em 2.914 candidatos da construção na massa real, a nota de cada obrigatória bate com o Δ real de `custoTotal` em todas as parcelas. A piora na massa real vem do **contraturno**: 18 aulas obrigatórias fora do turno no v1 contra 21–27 no v2 (e `excessoContraturno` de 40 para 60), compensado só em parte por `optativaSemTurno` de 40 para 0. Buraco de turma das obrigatórias fica no mesmo nível (0–2). Com a nota exata, o contraturno a mais é miopia do guloso — hipótese ainda não confirmada: com as optativas agora preferindo o turno, as horas do turno faltam para as obrigatórias que vêm depois. A Fase 2 (Task 6) é quem deve recuperar; esta tarefa só alinha a régua.

## Task 5 — custo incremental

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma (obrig.) | fora do turno (obrig.) | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 18 | 8902 |
| atual | massa real | 2 | sim | 0 | 620 | 0 | 0 | 0 | 18 | 8428 |
| atual | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 18 | 7726 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 24 | 6856 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 24 | 7284 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 2 | 24 | 9418 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 30 | 32 | 4678 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 29 | 32 | 5202 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 30 | 32 | 4712 |
| v2 | massa real | 1 | sim | 0 | 690 | 0 | 0 | 0 | 21 | 4486 |
| v2 | massa real | 2 | sim | 0 | 870 | 0 | 0 | 0 | 27 | 4301 |
| v2 | massa real | 3 | sim | 0 | 886 | 0 | 0 | 2 | 27 | 4168 |
| v2 | 6 salas + 1 dia indisponível | 1 | sim | 0 | 840 | 0 | 8 | 2 | 24 | 3424 |
| v2 | 6 salas + 1 dia indisponível | 2 | sim | 0 | 832 | 0 | 7 | 2 | 24 | 3627 |
| v2 | 6 salas + 1 dia indisponível | 3 | sim | 0 | 856 | 0 | 10 | 2 | 24 | 3693 |
| v2 | 3 salas + 1 dia indisponível | 1 | não | 5 | 1500 | 0 | 30 | 15 | 34 | 2477 |
| v2 | 3 salas + 1 dia indisponível | 2 | não | 5 | 1500 | 0 | 30 | 15 | 34 | 2401 |
| v2 | 3 salas + 1 dia indisponível | 3 | não | 5 | 1500 | 0 | 30 | 15 | 34 | 2341 |

Custo, faltantes, violações e as demais colunas idênticos aos da Task 4 em todas as linhas: a troca é só de desempenho. A máquina estava carregada nesta rodada (o v1 levou 2,2× o tempo da Task 4), então o tempo vale na comparação dentro da mesma execução: o v2 passou de 86% para cerca de 52% do tempo do v1 na massa real (4,3 s contra 8,4 s).

## Task 6 — Fase 2 com Top-K e LAHC

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma (obrig.) | fora do turno (obrig.) | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 18 | 2586 |
| atual | massa real | 2 | sim | 0 | 620 | 0 | 0 | 0 | 18 | 4718 |
| atual | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 18 | 4376 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 24 | 3650 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 24 | 3782 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 2 | 24 | 3810 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 30 | 32 | 2542 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 29 | 32 | 2519 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 30 | 32 | 2413 |
| v2 | massa real | 1 | sim | 0 | 700 | 0 | 10 | 5 | 18 | 5322 |
| v2 | massa real | 2 | sim | 0 | 544 | 0 | 10 | 8 | 12 | 5126 |
| v2 | massa real | 3 | sim | 0 | 708 | 0 | 11 | 5 | 18 | 5346 |
| v2 | 6 salas + 1 dia indisponível | 1 | sim | 0 | 808 | 0 | 5 | 1 | 24 | 4525 |
| v2 | 6 salas + 1 dia indisponível | 2 | sim | 0 | 800 | 0 | 4 | 1 | 24 | 4208 |
| v2 | 6 salas + 1 dia indisponível | 3 | sim | 0 | 808 | 0 | 6 | 0 | 24 | 4270 |
| v2 | 3 salas + 1 dia indisponível | 1 | não | 5 | 1500 | 0 | 31 | 14 | 34 | 3072 |
| v2 | 3 salas + 1 dia indisponível | 2 | não | 5 | 1500 | 0 | 31 | 14 | 34 | 3210 |
| v2 | 3 salas + 1 dia indisponível | 3 | não | 5 | 1500 | 0 | 31 | 14 | 34 | 2956 |

Fase 2 com uma fatia por rodada e 8000 rodadas (padrão do v2). Custo médio (sementes 1 a 3), v1 → v2: massa real 630,7 → 650,7; 6 salas 917,3 → 805,3; 3 salas 1514,7 → 1500,0, com 5 faltantes em vez de 4 (o v2 não recoloca nenhuma faltante nesse cenário). Violações: 0 em todos. Tempo do v2 em relação ao v1 na mesma execução: massa real 1,35×, 6 salas 1,07×, 3 salas 1,24×. A meta do spec (massa real < 631) segue não atingida na média, mas a semente 2 chegou a 544. O par de fatias do mesmo período foi testado e fica adiado para a Task 9 (vizinhança N2): a tempo igual perdeu na massa real, 688,7 contra 620,7 (sementes 1 a 6, par com 4000 rodadas contra uma fatia com 8000). Contra o par, esta versão perde no cenário de 3 salas, onde o par chegava a 2 faltantes.


## Task 6b — N1 + N2 sorteados

| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma (obrig.) | fora do turno (obrig.) | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| atual | massa real | 1 | sim | 0 | 652 | 0 | 3 | 1 | 18 | 2088 |
| atual | massa real | 2 | sim | 0 | 620 | 0 | 0 | 0 | 18 | 4607 |
| atual | massa real | 3 | sim | 0 | 620 | 0 | 0 | 0 | 18 | 4105 |
| atual | 6 salas + 1 dia indisponível | 1 | sim | 0 | 928 | 0 | 10 | 6 | 24 | 3629 |
| atual | 6 salas + 1 dia indisponível | 2 | sim | 0 | 928 | 0 | 10 | 6 | 24 | 3566 |
| atual | 6 salas + 1 dia indisponível | 3 | sim | 0 | 896 | 0 | 10 | 2 | 24 | 3611 |
| atual | 3 salas + 1 dia indisponível | 1 | não | 4 | 1536 | 0 | 27 | 30 | 32 | 2612 |
| atual | 3 salas + 1 dia indisponível | 2 | não | 4 | 1504 | 0 | 24 | 29 | 32 | 2504 |
| atual | 3 salas + 1 dia indisponível | 3 | não | 4 | 1504 | 0 | 23 | 30 | 32 | 2515 |
| v2 | massa real | 1 | sim | 0 | 694 | 0 | 16 | 7 | 15 | 5695 |
| v2 | massa real | 2 | sim | 0 | 694 | 0 | 15 | 8 | 15 | 5225 |
| v2 | massa real | 3 | sim | 0 | 576 | 0 | 13 | 9 | 12 | 4843 |
| v2 | 6 salas + 1 dia indisponível | 1 | sim | 0 | 614 | 0 | 15 | 3 | 13 | 4301 |
| v2 | 6 salas + 1 dia indisponível | 2 | sim | 0 | 608 | 0 | 11 | 10 | 12 | 4250 |
| v2 | 6 salas + 1 dia indisponível | 3 | sim | 0 | 672 | 0 | 6 | 8 | 16 | 4219 |
| v2 | 3 salas + 1 dia indisponível | 1 | não | 2 | 1254 | 0 | 13 | 15 | 31 | 2781 |
| v2 | 3 salas + 1 dia indisponível | 2 | não | 2 | 1050 | 0 | 15 | 10 | 25 | 2851 |
| v2 | 3 salas + 1 dia indisponível | 3 | não | 2 | 1208 | 0 | 24 | 12 | 28 | 2877 |

Varredura da chance de par (p) e das rodadas, a tempo comparável (N2 custa cerca de 2× o N1, então rodadas ≈ 8000 / (1 + p)). Custo médio / faltantes médias / tempo relativo ao v1 na mesma execução; massa real com sementes 1 a 6 (v1: 695,0), os outros dois com sementes 1 a 3 (v1: 917,3 e 1514,7 com 4 faltantes).

| p | rodadas | massa real | 6 salas | 3 salas |
|---|---|---|---|---|
| 0 (só N1) | 8000 | 620,7 / 0 / 1,21× | 802,7 / 0 / 1,25× | 1500,0 / 5,0 / 1,18× |
| 0,25 | 6400 | 600,7 / 0 / 1,19× | 660,0 / 0 / 1,07× | 1201,3 / 2,3 / 1,30× |
| 0,35 | 5900 | 627,0 / 0 / 1,18× | 631,3 / 0 / 1,26× | 1170,7 / 2,0 / 1,16× |
| 0,4 | 5700 | 659,0 / 0 / 1,16× | 704,7 / 0 / 1,21× | 1294,0 / 2,0 / 1,12× |
| 0,5 | 5333 | 642,7 / 0 / 1,24× | 637,3 / 0 / 1,11× | 1250,7 / 2,0 / 1,18× |
| 0,75 | 4571 | 647,3 / 0 / 1,25× | 643,3 / 0 / 1,15× | 1297,3 / 2,3 / 1,21× |

Padrão do v2: N1 com probabilidade 0,65 e N2 com 0,35, 5900 rodadas. Custo médio (sementes 1 a 3), v1 → v2: massa real 630,7 → 654,7 (com as sementes 1 a 6 da varredura, 695,0 → 627,0); 6 salas 917,3 → 631,3; 3 salas 1514,7 → 1170,7, com 2 faltantes em vez de 4. Violações: 0 em todos. Tempo do v2 em relação ao v1 na mesma execução: massa real 1,46× (a semente 1 do v1 foi atípica, 2,1 s), 6 salas 1,18×, 3 salas 1,12×. Por que p = 0,35 e 5900 rodadas: faltantes primeiro, o 3 salas fica em 2 faltantes a partir de p = 0,35 (com 0,25 sobra 2,3); entre os que chegam a 2, 0,35 tem o menor custo nesse cenário e no de 6 salas, e na massa real empata com uma fatia só (627,0 contra 620,7, diferença dentro do ruído entre sementes, que passa de 100). Acima disso a massa real e o 6 salas pioram, o que sugere que muitos pares tiram rodadas demais da exploração de uma fatia. A varredura é ruidosa (poucas sementes); 0,25 e 0,5 ficam muito próximos.

## Task 6c — chance do par (N2): 32%, por intervalos cada vez menores

Decisão do usuário (2026-11-06): **32% de chance de par por rodada, com 6060 rodadas** (8000 / 1,32, para
gastar o mesmo tempo de 8000 rodadas de uma fatia só, já que o par custa cerca do dobro).

Como foi decidido: busca por intervalos cada vez menores, sempre a tempo igual e nas mesmas sementes.

1. Primeiro intervalo, 25% a 50% (Task 6b, sementes 1–6 na massa real e 1–3 nos outros): o ponto bom
   ficou perto de 35%; abaixo de ~30% sobravam mais faltantes no cenário de 3 salas, acima de ~40% a massa
   real e o de 6 salas pioravam.
2. Estreitando em volta de 35%: 30%, 35% e 40%, sementes 1–6 nos três cenários. 40% perdeu em tudo; 30%
   ganhou na massa real e 35% nos cenários apertados.
3. Estreitando em volta de 30%: 27% e 32%. O pico ficou entre 30% e 32%; 32% foi o mais equilibrado.

Custo médio, sementes 1–6 (faltantes médios entre parênteses):

| Cenário | v1 | 27% | 30% | **32%** | 35% | 40% |
|---|---|---|---|---|---|---|
| Massa real | 695,0 | 622,7 | 594,3 | **607,7** | 627,0 | 659,0 |
| 6 salas + 1 dia | 906,7 | 681,3 | 656,0 | **632,3** | 640,7 | 689,3 |
| 3 salas + 1 dia | 1514,7 (4,0) | 1223,3 (2,3) | 1260,7 (2,2) | **1244,7 (2,0)** | 1181,7 (2,0) | 1284,0 (2,0) |
| Massa real, sementes 1–3 (meta < 631) | 630,7 | 640,0 | 603,3 | **605,3** | 654,7 | 650,0 |

Por que 32%: melhor no cenário de 6 salas, segundo na massa real (dentro do ruído do 30%) cumprindo a meta
nas sementes 1–3, e 2,0 faltantes no cenário de 3 salas (o 30% fica com 2,2). A curva não é lisa (27% saiu
pior que 30%): com 6 sementes, diferenças de ~15 pontos ainda são ruído.
