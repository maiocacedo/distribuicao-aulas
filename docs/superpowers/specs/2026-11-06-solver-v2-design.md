# Solver v2 (subprojeto 3) — desenho

Status: aprovado pelo usuário em 2026-11-06, no brainstorming sobre a pesquisa
"Otimização de Solver de Grade Horária" (PDF fora do repositório). Branch `solver-v2`, a partir
da `main` em `7f47d7c`. O usuário mescla na `main` por pull request ao fim.

## Problema

O solver atual (`src/solver/solver.ts`, "v1") é guloso na construção e faz uma descida
determinística na melhoria. Conferido no código, a pesquisa acerta em cinco pontos:

1. **B6:** `buracosDoDia` procura a mesma `chave` como período e como professor. Além de misturar
   as duas coisas, as horas de `extras` podem entrar em dobro e a conta sai negativa.
2. **Nota absoluta, não marginal:** `buracosDoDia` devolve o total de buracos do dia *depois* do
   bloco, não a variação. Dentro de um dia a ordem dos candidatos é a mesma; entre dias, a nota
   pune o dia que já tinha buraco — justamente o que o bloco poderia fechar. É por isso que
   corrigir só o B6 piorou o custo médio de 619 para 838.
3. **`pontuar` cego a 3 dos 7 termos do custo:** `excessoContraturno`, `optativaSemTurno` e
   `preferenciaDias`. O `* 0.3` da prioridade 3 não faz nada (só compara candidatos da mesma fatia).
4. **Fase 2 paralisada:** recoloca uma fatia por vez sempre em `candidatos[0]`, aceita só
   `agora <= melhor` e nunca tenta de novo as fatias que ficaram de fora.
5. **Fase 1 sem volta:** `livre()` pega a primeira sala livre e nenhuma fatia já colocada é
   desalojada — daí as 4 fatias de fora no cenário "3 salas + 1 dia indisponível".

E dois pontos que a pesquisa não cobre:

6. **Custo recalculado do zero:** cada rodada da Fase 2 refaz `materializar` + `custoTotal`.
   Provavelmente é a maior parte dos ~1,2 s do benchmark; com variação incremental cabem muito
   mais rodadas no mesmo tempo.
7. **Interface travada:** o gerador roda no fio da interface (`GradeAutomatica.tsx`, com um
   `setTimeout` de 30 ms só para o "Gerando…" aparecer).

A pesquisa erra num ponto: "dias não preferidos (peso 3)" não existe. O peso 3 é
`preferenciaDias` — consecutivos ou intercalados, pesado por `prof.peso` —, que depende de todos
os dias do professor e não de um bloco.

## Decisões do usuário (2026-11-06)

1. **Ao lado do v1.** O v2 é um módulo próprio, `src/solver/v2/`, com a mesma assinatura
   `resolver(problema, opcoes): Resultado`. O v1 não muda. Os dois entram no `bench:solver` e num
   seletor da Grade automática.
2. **Meta de sucesso** (benchmark, sementes 1, 2 e 3):

   | Critério | Meta |
   |---|---|
   | Faltantes em "3 salas + 1 dia indisponível" | 0 — ou o mínimo possível com o motivo certo, se o cenário for inviável |
   | Custo médio na massa real | abaixo de 631 (v1: 652, 620, 620) |
   | Custo nos cenários de 6 e de 3 salas | abaixo da linha de base de cada um |
   | Violações no `conferir` | 0 em todos |
   | Tempo por execução no benchmark | até ~2 s |
   | Determinismo | mesma semente, mesma grade |

3. **Web Worker nesta branch**, com progresso e botão de parar.
4. **Para por rodadas, não por tempo:** a mesma semente dá a mesma grade em qualquer máquina.
   Parar devolve a melhor grade até ali, marcada como interrompida.
5. **Pesos não mudam** até a busca estar confiável: o custo é a mesma régua para v1 e v2. A
   calibração é uma etapa posterior, fora deste plano.
6. **Etapas com benchmark depois de cada uma**, na ordem: esqueleto → Worker → nota marginal →
   custo incremental → Fase 2 (Top-K + LAHC) → troca de sala → IFS + CBS → vizinhanças N2/N4.
7. **Fase 2 mistura N1 e N2 (decidido em 2026-11-06, durante a Task 6):** uma fatia por rodada perdia
   nos cenários apertados e o par em toda rodada perdia na massa real; ficou o sorteio, com **32% de par e
   6060 rodadas**, escolhido por intervalos cada vez menores (25–50%, depois 30/35/40%, depois 27/32%).
   Método e tabela em `testes/benchmark/v2-progresso.md`, Task 6c.
8. **Execução por SDD**, delegando ao agy (Argon) as tarefas de contrato fechado e a subagentes
   Claude as de algoritmo.

## Desenho

### Módulo

- `src/solver/v2/solver.ts`: `resolver` (síncrono, roda tudo) e `resolverEmPassos` (gerador).
  Importa de `../tipos`, `../custo`, `../blocos`, `../contexto` e de `src/regras/` como o v1.
- `src/solver/v2/custoIncremental.ts`: o custo mantido por adições e remoções de aulas, sempre
  igual a `custoTotal` sobre o mesmo conjunto.
- `src/solver/tipos.ts` ganha só `Resultado.interrompido?: boolean`.

### Execução em passos

```ts
export interface Progresso {
  fase: "construcao" | "melhoria";
  rodada: number;      // 0 na construção
  rodadas: number;     // total previsto de rodadas de melhoria
  melhorCusto: number;
}
export type Comando = "parar" | undefined;
export function resolverEmPassos(problema: Problema, opcoes?: Opcoes): Generator<Progresso, Resultado, Comando>;
```

Cede o controle uma vez ao fim da construção e a cada 100 rodadas de melhoria. Receber
`"parar"` encerra a melhoria e devolve a melhor grade vista, com `interrompido: true`.
`resolver` é só esgotar o gerador sem comandos — o resultado é idêntico.

### Worker

- `src/solver/trabalhador.ts`: recebe `{ tipo: "gerar", id, versao: "v1" | "v2", problema, semente? }`
  e `{ tipo: "parar", id }`. Para o v2, avança o gerador e, entre um passo e outro, devolve o
  controle ao laço de eventos (`setTimeout(0)`) para receber o "parar". O v1 roda de uma vez.
  Responde `{ tipo: "progresso", id, progresso }`, `{ tipo: "fim", id, resultado }` ou
  `{ tipo: "erro", id, erro }`.
- `src/solver/gerador.ts`: o lado da página. `gerarGrade(problema, versao, aoProgredir)` devolve
  `{ resultado: Promise<Resultado>, parar(): void }`.
- `GradeAutomatica.tsx`: seletor "Gerador" (v1 padrão até o v2 bater a meta), texto de progresso
  ("Melhorando: rodada X de Y, custo Z") e botão "Parar" enquanto gera. O `setTimeout` de 30 ms sai.

### Algoritmo (v2)

- **Nota marginal:** `buracosNoDiaPeriodo` e `buracosNoDiaProfessor` separados, sem horas
  repetidas; a nota é a variação de buracos causada pelo bloco. `pontuar` inclui contraturno,
  excesso de contraturno, optativa sem turno (pelo turno dos blocos já postos da fatia) e sala
  aceitável; sai o `* 0.3`. `preferenciaDias` fica de fora da nota de bloco (depende dos dias
  todos) e é cobrada pelo custo incremental na Fase 2.
- **Fase 2:** sorteio entre os K = 5 melhores candidatos (fora a posição anterior), aceitação
  LAHC com histórico `L = max(50, min(250, ⌊rodadas/8⌋))`, guarda da melhor grade, e cada
  rodada tem chance de tentar de novo uma fatia faltante.
- **Fase 1, troca de sala:** se o horário serve mas as salas da fatia estão ocupadas, tenta mudar
  o bloco que ocupa a sala para outra sala livre dele no mesmo horário (caminho aumentante de
  profundidade 1).
- **Fase 1, IFS + CBS:** fatia sem lugar desaloja o conjunto mínimo de fatias conflitantes
  (nunca fixadas nem externas), escolhido por `1000 × (1 + cbs) × (4 − prioridade)` + nota; as
  desalojadas voltam à fila. Teto de `12 × fatias` iterações; guarda o estado de maior cobertura.
- **N2 / N4:** troca de duas fatias do mesmo período ou professor; destruir e refazer 2–3 fatias
  de um período ou professor. Ficam só se o benchmark mostrar ganho.

## Fora do escopo

- Calibração dos pesos.
- Trocar o v1 pelo v2 como padrão — decisão do usuário depois de ver o benchmark.
- Solvers externos (MIP, MaxSAT).
