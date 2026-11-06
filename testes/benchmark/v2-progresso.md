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
