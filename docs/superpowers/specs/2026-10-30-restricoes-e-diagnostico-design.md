# Restrições e diagnóstico da grade — desenho

Status: aprovado pelo usuário em 2026-10-30 ("nome 1, troca 1, B1" e as quatro partes da
proposta). A executar na próxima sessão, no branch `versao-navegador` (o usuário mescla na
`main` por pull request ao fim).

## Problema

A grade manual mostra um aviso "35 aula(s) deste curso violam regra dura" com uma linha por
aula. Na massa de exemplo, e no banco real de que ela saiu, aparecem duas causas:

1. Os três Projetos Integradores estão como "Não ocupa sala" (`exige_sala = 0`), mas as aulas
   deles estão nas salas "Remota PI1", "Remota PI2" e "Remota PI3" — 29 aulas aparecem como
   "Sala Remota PIx fora do requisito". As salas remotas são anteriores ao requisito de sala
   (migração 006), e a conversão deixou os PIs sem sala.
2. O Projeto Integrador 3 tem turno forçado "tarde", 12 aulas e permite sábado, mas o sábado
   só tem manhã: 6 aulas no sábado de manhã aparecem como "Disciplina só à tarde". O cadastro
   é contraditório pela regra atual; na realidade do curso, o PI3 é à tarde nos dias úteis e
   ocupa o sábado de manhã.

E o aviso é difícil de usar: diz o quê, mas não por quê nem como resolver; repete a mesma causa
em dezenas de linhas; mistura períodos (estando no 1º, só lista aulas do 3º, 5º e 7º); e não
aparece onde o problema está (a célula e a aba do período não mostram nada). O nome "regra dura"
é jargão de otimização.

## Decisões do usuário (2026-10-30)

1. **Vocabulário (nome 1):** o que a grade não pode quebrar passa a se chamar **restrições**; o
   que o gerador tenta respeitar e pesa no custo passa a se chamar **preferências**.
2. **Onde trocar (troca 1):** só no que o usuário lê — interface, `README.md`, `docs/regras.md`,
   o guia `docs/superpowers/notas/conversao-de-telas.md` e este spec. Os nomes internos do
   código (`src/regras/`, `violacoesDaAula`, `Motivo`, códigos D1…D16) e os comentários ficam.
3. **Turno forçado e sábado (B1):** o turno forçado vale nos dias úteis. No sábado, a
   disciplina que permite sábado segue os turnos do sábado (configuração `turnos_sabado`),
   seja qual for o turno forçado. Foi a opção que "mais condiz com a realidade".
4. **As quatro partes do diagnóstico novo:** agrupar por causa, com explicação e ações; marcar
   na grade; separar o período atual do resto do curso; dizer de onde vêm esses problemas.

## Parte A — vocabulário

- Texto do aviso: de "N aula(s) deste curso violam regra dura" para o painel novo da Parte C.
- `docs/regras.md`: "regra dura" → "restrição"; "custo"/"penalidade", quando for o conceito
  para o usuário, → "preferência" (os nomes dos pesos no código ficam). Uma frase no começo do
  documento define os dois termos.
- `README.md`: a linha da tabela "Estrutura" sobre `src/regras/` diz "Restrições de célula,
  compartilhadas pelo gerador e pela grade manual."
- Guia das conversões: uma linha no vocabulário.
- Conferir com `grep -rni "regra dura\|regras duras" src/paginas src/componentes README.md docs/regras.md`
  que nenhum texto visível ao usuário sobrou (comentários de código podem ficar).

## Parte B — turno forçado não vale no sábado

Onde a regra mora hoje, e o que muda:

| Lugar | Hoje | Depois |
|---|---|---|
| `src/regras/impedimentos.ts`, checagem D14 | recusa qualquer hora fora do turno forçado | só nos dias úteis (`dia !== SABADO`); o sábado continua com D5 (permite sábado) e D5-turno (turnos do sábado) |
| `src/solver/conferir.ts` (auditor independente; não importa `src/regras/`) | `turno-forcado` em qualquer dia | só nos dias úteis — a mesma mudança, escrita de novo, para o auditor continuar independente |
| `src/solver/custo.ts`, `contraturno` | aula de disciplina com turno forçado fora desse turno conta como contraturno | no sábado, aula de disciplina com turno forçado não conta como contraturno (o sábado é "liberado") |
| `src/solver/custo.ts`, `excessoDeContraturno` | conta disciplinas obrigatórias que escapam do turno do período | decidir na implementação se uma disciplina de turno forçado que só "escapa" no sábado conta; o padrão recomendado é não contar, pelo mesmo motivo |
| `src/solver/solver.ts`, `pontuar` | sábado de manhã custa contraturno para disciplina forçada à tarde | o mesmo critério do `contraturno`, para a ordenação de candidatos não fugir do sábado |
| Editor de Disciplinas, campo "Turno forçado" | — | dica: "Vale nos dias úteis. No sábado, a disciplina segue os turnos do sábado." |
| `docs/regras.md`, D14 | — | a regra nova, com o exemplo do PI3 |

Testes (teste primeiro, vendo falhar):
- `src/regras/impedimentos.test.ts`: disciplina forçada à tarde, sábado de manhã com sábado
  permitido → sem impedimento; dia útil de manhã → D14; sábado com sábado desmarcado → D5.
- `src/solver/conferir.test.ts`: a mesma tabela, do lado do auditor.
- `src/solver/custo.test.ts`: aula forçada à tarde no sábado de manhã não soma contraturno.
- Cenário do solver (`src/solver/solver.test.ts` ou cenários mínimos): disciplina de 12 aulas,
  forçada à tarde, permite sábado, num curso em que a tarde dos dias úteis tem 6 horários → o
  gerador coloca todas, com zero violações no auditor.
- E2E da grade manual: alocar a disciplina forçada à tarde no sábado de manhã é aceito.
- O diagnóstico da massa perde as 6 linhas "Disciplina só à tarde" do PI3.
- **Benchmark:** `testes/benchmark/linha-de-base.md` é a base de tempo do subprojeto 3 (solver
  v2). A mudança de regra muda o problema da massa (o PI3 passa a caber): rodar
  `npm run bench:solver`, registrar a linha de base nova no mesmo arquivo, com data e o motivo,
  sem apagar a antiga.

## Parte C — painel "Problemas com as restrições"

Substitui o `Diagnostico.tsx` atual. Um módulo puro, testável, monta os grupos; o componente só
desenha.

**`src/paginas/grade-manual/problemas.ts`** (Vitest em `problemas.test.ts`):
- Entrada: as violações que `usarGrade` já calcula (aula + `Motivo[]` de `violacoesDaAula`, mais
  a aula órfã), o contexto e os nomes. Hoje `usarGrade` devolve os motivos já em texto
  (`descrever`); passa a devolver os `Motivo` crus, e o texto curto continua para a célula.
- Agrupa por **causa**: uma chave por (disciplina, tipo de motivo, detalhe que muda a correção).
  Exemplos: `sala-invalida` + sala X; `sala-invalida` sem sala; D14 + turno; D16; D5; D5-turno;
  D13; D4 + professor; D15 + professor; D2/D3/D1 (choques: um grupo por par de aulas); órfã.
- Para cada grupo: título (disciplina e período), uma frase em linguagem direta que diz a causa
  com os nomes do cadastro, as aulas (período, dia, código), e a lista de ações possíveis.
- Textos (exemplos; o padrão é dizer o que está errado, onde está configurado, e o caminho):
  - sala com disciplina "Não ocupa sala": "12 aulas estão na sala Remota PI1, mas a disciplina
    está como "Não ocupa sala"."
  - sala fora do requisito (tipo ou lista): "12 aulas estão na sala E10, que não é do tipo que a
    disciplina exige (Sala de Aula)." / "… que não está entre as salas da disciplina."
  - aula sem sala em disciplina que exige sala: "N aulas estão sem sala, e a disciplina exige
    sala."
  - D14: "N aulas estão de manhã, e a disciplina só pode ter aula à tarde nos dias úteis."
  - D16: "A disciplina não está sendo ofertada, mas tem N aulas na grade."
  - D4: "<Professor> marcou estes horários como indisponíveis."
  - D15: "<Professor> pode vir no máximo N dias, e as aulas dele ocupam M."
  - choques (D1, D2, D3): "<A> e <B> estão no mesmo horário com o mesmo professor/sala/turma."
  - órfã: "<Professor> não leciona mais <disciplina>, mas as aulas continuam na grade."

**Ações** (as que resolvem sem o usuário ter de descobrir onde ir):

| Causa | Ações |
|---|---|
| sala X em disciplina "Não ocupa sala" | **Usar X como sala da disciplina** (requisito vira "Salas específicas" com X como ideal; é escrita de cadastro, pelo mesmo caminho de gravação de Disciplinas — confirmação e reatribuição como no editor) · **Tirar a sala dessas N aulas** (escrita da grade, pelo histórico: desfazível) |
| sala fora do requisito (tipo/lista) | **Editar a disciplina** · **Trocar a sala dessas N aulas** (pela regra de sempre, `reatribuirSalas`; as que não acham sala ficam como estão e o aviso diz quantas) |
| aula sem sala, disciplina exige sala | **Escolher sala para essas N aulas** (mesma regra) · **Editar a disciplina** |
| D14, D5, D5-turno, D13 | **Editar a disciplina** (ou a configuração do curso, no D13) · **Ir para as aulas** |
| D16 | **Editar a disciplina** · **Tirar essas N aulas da grade** |
| D4 | **Abrir as indisponibilidades de <professor>** · **Ir para as aulas** |
| D15 | **Editar <professor>** · **Ir para as aulas** |
| choques | **Ir para as aulas** |
| órfã | **Tirar essas N aulas da grade** · **Editar a disciplina** |

- Ações em lote na grade passam por `historico.executarNaGrade` (desfazíveis, com o toast de
  desfazer), com confirmação (`useConfirmar`) dizendo quantas aulas. Ação que grava cadastro
  zera o histórico, como toda escrita de cadastro, e a confirmação diz isso.
- **Editar a disciplina / o professor** navega para a tela certa e abre o editor daquele
  registro. Hoje `aoNavegar(id)` só troca de página: ganha um segundo argumento opcional (por
  exemplo `{ editar: <id> }`), lido pela tela de destino uma vez.
- **Ir para as aulas** troca para o período do grupo e destaca as células (Parte D).
- Texto fixo no topo do painel (Parte F): "São aulas que já estão na grade e não seguem as
  restrições de hoje — gravadas antes de uma restrição existir, ou o cadastro mudou depois. O
  aplicativo não as muda sozinho."

## Parte D — marcar na grade

- A célula de aula com problema ganha um ícone (`TriangleAlert`, o do aviso de fatias) e um
  contorno próprio — nunca só cor —, e o texto curto do motivo (`descrever`) como descrição
  acessível (`aria-describedby`) e na dica. O `aria-label` "Segunda, M1" não muda (contrato dos
  e2e).
- A aba de cada período com problema mostra a contagem: "3º · 2", com nome acessível
  "3º período, 2 problemas". O `aria-pressed` das abas continua.
- "Ir para as aulas" destaca as células do grupo até a próxima ação (mesmo desenho, mais forte,
  ou foco na primeira).
- As capturas da grade manual mudam (a massa tem problemas): regerar e descrever cada diferença.

## Parte E — período atual primeiro

- O painel mostra, abertos, os grupos com aulas no período escolhido.
- Os de outros períodos ficam resumidos numa linha: "Mais 2 problemas em outros períodos: 3º
  (1), 5º (1)", cada período como atalho que troca a aba.
- Sem problemas no período atual e com problemas em outros, o painel mostra só a linha resumida.
- Sem problema nenhum, o painel não aparece.

## Parte F — de onde vêm esses problemas

O banco não guarda quando nem por que uma aula ficou inválida (não há histórico de cadastro), então
não dá para dizer, aula a aula, "gravada antes desta regra". Decisão: o painel diz a origem em
geral (texto fixo da Parte C), e cada frase de grupo aponta o cadastro que está em conflito
("a disciplina está como…"), que é o que importa para corrigir.

## Fora do escopo

- Renomear código, arquivos ou códigos D1…D16.
- Corrigir a massa de exemplo: ela fica como está — é o caso real, e serve de vitrine para as
  ações ("Usar Remota PI1 como sala da disciplina").
- Diagnóstico na grade automática e nas telas de cadastro.
- A tarefa de teclado e leitor de tela nas malhas (C1 + E1, já anotada).

## Tarefas sugeridas para o plano

1. **Vocabulário e turno forçado no sábado** (Partes A e B): regras, auditor, custo, solver,
   editor, docs, testes, benchmark.
2. **Grupos de problemas** (`problemas.ts` e os textos), com Vitest; `usarGrade` devolvendo os
   motivos crus.
3. **Painel novo e ações** (Partes C, E e F): componente, ações em lote pelo histórico, ações
   de cadastro, navegação com alvo (`aoNavegar` com o segundo argumento), e2e.
4. **Marcar na grade** (Parte D): célula, abas, destaque, capturas.
5. Revisão final, documentação, verificação.
