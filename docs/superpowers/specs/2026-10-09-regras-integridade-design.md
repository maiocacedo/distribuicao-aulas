# Subprojeto 1 — Regras e integridade

Data: 2026-10-09 · Branch: `regras-integridade` · Status: desenho aprovado em partes; o
usuário autorizou seguir até a execução sem revisão intermediária (ver "Decisões tomadas
sem o usuário")

## Objetivo

Uma regra dura vale igual em todo lugar: o gerador não a viola, a grade manual não deixa
violar e explica qual regra impediu, e o auditor (`conferir`) acusa quem violar. Hoje
cada um tem sua cópia e elas divergem. Junto vêm as decisões de produto pendentes:
optativa, oferta, preferência de sala, conflito entre cursos, noite fora. Também entram
os bugs com teste de falha esperada (B1–B5, B7–B10, I1, I2) e a limpeza de textos e
código morto listada no handoff.

## Decisões de produto

| Tema | Decisão | Origem |
|---|---|---|
| Turno da noite | Sai do escopo: esquema, interface e solver | handoff |
| Professor/sala entre cursos | Regra dura | handoff |
| `max_dias_semana` | Regra dura, contando os dias em **todos** os cursos | handoff |
| Máx. disciplinas no contraturno | Continua custo | handoff |
| Optativas de um período | **Exclusivas**: cada uma ocupa horário próprio do período (como hoje) | brainstorming |
| Quem põe optativa no contraturno | **O solver.** Aula de optativa no contraturno não paga custo, mas há custo se nenhuma optativa do período ficar inteira no turno | brainstorming |
| `disciplinas.turno` (forçar turno) | Vira **regra dura** | brainstorming |
| `max_disciplinas_contraturno` | Passa a contar só não optativas; a migração desconta as optativas com turno forçado, que eram as que o valor antigo contava | brainstorming; desconto corrigido na revisão final |
| Oferta | Campo novo `disciplinas.ofertada`; a não ofertada sai do solver, das pendências e da grade | brainstorming |
| Sala na grade manual | Escolha automática (vizinha → ideal → aceitável) e troca manual entre salas válidas e livres | brainstorming |
| Mudança de cadastro que invalida aulas | Confirmar mostrando quantas e quais; se confirmar, apaga na mesma transação | brainstorming |
| Preferência de sala ideal/aceitável | Editável no cadastro; o solver tenta a ideal primeiro, e a aceitável paga custo baixo | handoff |
| Sala inválida após editar disciplina | Reatribui (ou tira a sala); só apaga, com confirmação, se não houver sala livre | usuário, na execução |
| Turno forçado das optativas | A migração 010 o limpa: forçar o turno era o jeito antigo de mandar optativa ao contraturno, e como regra dura travaria a escolha que agora é do gerador. Quem quiser travar uma optativa preenche o turno de novo | usuário, na revisão final |
| Mudar o tipo de uma sala | Reatribui as aulas atingidas, em todos os cursos, pela mesma regra da edição de disciplina; só apaga, com confirmação, as que não acharem sala | usuário, na revisão final |
| Arquitetura das regras | Módulo `src/regras/` compartilhado por solver e grade manual; `conferir` continua independente | brainstorming (abordagem A) |

### Decisões tomadas sem o usuário (revisar)

O usuário pediu para seguir sozinho a partir da seção 1 do desenho. Estas decisões são
minhas:

1. **Sem recriar tabelas na migração 010.** Com a FK ligada dentro da transação, um
   `DROP TABLE disciplinas` dispara `ON DELETE CASCADE` em `disciplina_professores`,
   `disciplina_salas` e `alocacoes`, e o dado se perde. Por isso:
   - a cascata do curso vira um **gatilho** `BEFORE DELETE ON cursos`;
   - os `CHECK (turno IN (... 'noite'))` de `horarios`, `periodos` e `disciplinas`
     ficam no esquema, mas sem efeito: a migração apaga os horários N1–N5, e nem a
     interface nem os tipos TS oferecem mais "noite";
   - `permite_contraturno` sai com `ALTER TABLE ... DROP COLUMN`.
2. **A view `conflitos` também sai.** O diagnóstico de choques passa a vir do módulo de
   regras, numa lista "Aulas que violam regra dura" na grade manual. Ela cobre os
   choques entre cursos que já existiam antes de a regra ficar dura, e também qualquer
   outra regra.
3. **Buraco na grade do aluno conta só obrigatórias.** Sem isso, a optativa isenta no
   contraturno continuaria cara pelo buraco que abre na turma. E o aluno que não cursa
   aquela optativa não tem buraco nenhum.
4. **A optativa conta como "no turno"** quando todas as aulas dela estão no turno do
   período. O custo `optativaSemTurno` é por período, quando nenhuma optativa ofertada
   do período está no turno.
5. **Obrigatória com turno forçado para o contraturno** continua contando no
   `max_disciplinas_contraturno`: o limite é sobre o aluno ir e voltar, e o aluno vai e
   volta de qualquer jeito.
6. **A migração não marca nada como não ofertado.** Libras 1 e 2 continuam ofertadas
   até o usuário desmarcar. Deduzir isso por "não tem aula" seria heurística sobre dado
   incompleto.
7. **Mudar o período da disciplina (B3)** leva as aulas para os mesmos (dia, hora, sala)
   no período novo. Se algum horário do período novo estiver ocupado, a mudança é
   **recusada** com a lista de horários em choque. Apagar contraria o teste B3, e
   reposicionar por conta própria esconderia uma decisão do usuário.
8. **Reduzir `max_dias_semana`** abaixo dos dias que o professor já usa é recusado com
   explicação, sem confirmar e apagar: não há como escolher sozinho qual dia sai.
9. **Excluir um período** com disciplinas continua recusado (o botão já fica
   desabilitado com dica). A cascata vale só para o curso inteiro, que já pede
   confirmação com as contagens.
10. **B6 fica para o subprojeto 3.** Corrigir isolado piorou o custo médio (619 → 838)
    porque a nota local está desalinhada do objetivo. O v2 reescreve a busca. O código
    ganha um comentário apontando o problema.
11. **B7 é corrigido agora.** Uma rodada de melhoria que falha não devolve o orçamento,
    e as rodadas seguintes falham em cascata. É defeito de contabilidade, não de
    calibração.
12. **Os diálogos de confirmação continuam com `confirm()` nativo**, como o resto do
    app. A troca por diálogo próprio é do subprojeto 2.
13. **A massa continua `engenharia_v9.sql`.** O caminho v9 + migração 010 é justamente o
    que exercita a migração sobre dado real.
14. **Pesos novos iniciais:** `optativaSemTurno = 40` por período e `salaAceitavel = 2`
    por aula. A calibração fina é do subprojeto 3.

## Regras duras (nova tabela do `docs/regras.md`)

| # | Regra | Novo? |
|---|---|---|
| D1 | Um período não tem duas aulas no mesmo (dia, hora) | — |
| D2 | Um professor não está em dois lugares no mesmo (dia, hora), **em qualquer curso** | ampliada (I1) |
| D3 | Uma sala não recebe duas turmas no mesmo (dia, hora), **em qualquer curso** | ampliada (I1) |
| D4 | Professor não é alocado onde declarou indisponibilidade | — |
| D5 | Sábado só com `permite_sabado = 1` e só nos `turnos_sabado` | — |
| D6–D8 | Requisito de sala: nenhuma / tipo / lista | — |
| D9 | As aulas de cada fatia somam as `aulas` dela | — |
| D10 | Padrão de blocos cadastrado, salvo `blocos_livres` | — |
| D11 | Fixada não é movida pelo gerador | — |
| D12 | Bloco não atravessa troca de turno | — |
| D13 | Aula só nos turnos do curso (`cursos.turnos`) | novo (B1) |
| D14 | Disciplina com `turno` preenchido só tem aula naquele turno | novo (era custo) |
| D15 | Professor aparece em no máximo `max_dias_semana` dias distintos, somando todos os cursos | novo (B4) |
| D16 | Disciplina com `ofertada = 0` não tem aula | novo |

As regras **de célula** (D1–D8, D13–D16) moram no módulo `src/regras/` e valem para o
solver e para a grade manual. As regras **de fatia completa** (D9, D10, D12) e D11 são
estruturais do solver. Na grade manual, D9 e D10 aparecem como **aviso na pendência**
("padrão 3+1 não cadastrado", "dois blocos no mesmo dia"), não como bloqueio, porque
durante a montagem à mão a fatia está sempre incompleta. O `conferir` cobre todas, de
forma independente.

## Esquema — migração `010_regras_e_integridade.sql`

Registrada em `src-tauri/src/lib.rs` como versão 10. O `criarBanco` a roda sobre a massa
v9.

1. **Noite.** Apaga `alocacoes` e `indisponibilidades` em horários de turno `noite`,
   depois os próprios horários. `disciplinas.turno = 'noite'` vira `NULL`, e `'noite'`
   sai de `cursos.turnos` (um curso que ficaria vazio recebe `'manha,tarde'`). Depois
   disso, `periodos.turno = 'noite'` vira `'tarde'` se o curso ocupa a tarde, senão
   `'manha'` — nunca um turno que o curso não tem. `'noite'` sai também de
   `configuracao['turnos_sabado']` (vazio vira `'manha'`).
2. **Views.** `DROP VIEW` em `ocupacao_professor`, `ocupacao_sala`, `aulas_conferencia`,
   `alocacao_conferencia` e `conflitos`. Vem antes do passo 3, porque a SQLite recusa
   `DROP COLUMN` de coluna citada em view.
3. **`periodos.permite_contraturno`**: `ALTER TABLE periodos DROP COLUMN
   permite_contraturno`.
4. **`max_disciplinas_contraturno`** passa a contar só não optativas. O valor antigo
   era o número de disciplinas com turno forçado, então a migração desconta as
   optativas com turno forçado: `max(0, valor − nº de optativas do período com turno
   preenchido)`. Na massa fica 3→0, 3→1 e 1→1.
5. **Turno forçado das optativas.** Depois do passo 4, que as conta: `disciplinas.turno`
   vira `NULL` nas optativas em que ele difere do turno do período. As obrigatórias
   com turno forçado ficam como estão.
6. **`disciplinas.ofertada INTEGER NOT NULL DEFAULT 1`.**
7. **Cascata do curso**:
   ```sql
   CREATE TRIGGER cursos_cascata BEFORE DELETE ON cursos BEGIN
     DELETE FROM alocacoes   WHERE curso_id = OLD.id;
     DELETE FROM disciplinas WHERE curso_id = OLD.id;
   END;
   ```
   Os `periodos` já caem pela FK `ON DELETE CASCADE`. `disciplina_professores` e
   `disciplina_salas` caem pela FK das disciplinas.
8. **`configuracao['versao_schema']`** sai. Ninguém lê, e a versão real é a do
   `_sqlx_migrations`.

`disciplina_salas.preferencia` já existe (1 ideal, 2 aceitável) e não muda no esquema.

## Módulo `src/regras/`

TS puro, sem React e sem banco, exceto o `carregar.ts`, que recebe o `Leitor`.

```
src/regras/
  tipos.ts        Contexto, FatiaRegras, AulaOcupada, Motivo, Turno ('manha' | 'tarde')
  ocupacao.ts     class Ocupacao — índice incremental de período/professor/sala/dias
  impedimentos.ts impedimento(), salasPossiveis(), escolherSala(), violacoesDaAula()
  descrever.ts    descrever(motivo, nomes) → texto para a tela
  carregar.ts     carregarContexto(cursoId, ler) — o SQL do contexto, único
  *.test.ts
```

**`Contexto`** (o que não muda durante a montagem): `dias`, `horarios` (índice, turno),
`turnosDoCurso`, `turnosSabado`, `indisponiveis` (Set `prof:dia:hora`), `maxDias`
(Map professor → limite), `salas` (id, tipo).

**`FatiaRegras`**: `disciplinaId`, `professorId`, `periodo`, `permiteSabado`, `turno`
forçado, `exigeSala`, `tipoSala`, `salas: { id, preferencia }[]`, `ofertada`. A `Fatia`
do solver estende esse tipo.

**`Ocupacao`**: `colocar(aula)`, `retirar(aula)` e as consultas `noPeriodo(p, d, h)`,
`doProfessor(pr, d, h)`, `daSala(s, d, h)` (cada uma devolve a `AulaOcupada` que ocupa,
com `cursoId`, ou `undefined`) e `diasDoProfessor(pr)` (Map dia → nº de aulas). Aulas de
outros cursos entram com o próprio `cursoId`. A ocupação de período considera só o curso
corrente: período 1 de Alfa e período 1 de Beta são turmas diferentes.

**`Motivo`**: união discriminada por `regra`, carregando os dados para o texto:

| `regra` | Dados | Texto típico |
|---|---|---|
| `D1` | aula que ocupa | "Já há aula neste horário" |
| `D2` | aula do professor (curso, período) | "A. Souza no 3º período" / "A. Souza em Beta (1º)" |
| `D3` | aula na sala (curso, período), sala | "Sala A01 ocupada (Beta, 1º)" |
| `D3-sem-sala` | — | "Nenhuma sala aceitável livre" |
| `D4` | professor | "A. Souza indisponível" |
| `D5` / `D5-turno` | — | "Sábado desmarcado no cadastro" / "Sábado só tem aula de manhã" |
| `D13` | turno | "Fora dos turnos do curso" |
| `D14` | turno forçado | "Disciplina só à tarde" |
| `D15` | limite, dias em uso | "A. Souza no máx. de 2 dias" |
| `D16` | — | "Disciplina não ofertada" |

**Funções**

- `impedimento(ctx, oc, fatia, dia, hora): Motivo | null` devolve o primeiro motivo, na
  ordem da tabela acima. D15 bloqueia só quando o dia ainda não está em uso pelo
  professor e ele já atingiu o limite.
- `salasPossiveis(ctx, fatia)` aplica D6–D8 e ordena: ideais, depois aceitáveis (por
  lista); por tipo ou "qualquer", na ordem do cadastro.
- `escolherSala(ctx, oc, fatia, dia, hora, preferida?)` devolve a primeira possível e
  livre, começando pela `preferida`. `null` significa que a fatia não usa sala;
  `undefined` significa que nenhuma serve.
- `violacoesDaAula(ctx, oc, fatia, aula): Motivo[]` audita uma aula **já existente**
  contra a ocupação sem ela mesma. Serve ao diagnóstico da grade manual e à revalidação
  ao editar uma disciplina.

**Desempenho.** A `Ocupacao` usa `Map` com chave string, a mesma estrutura dos `Set`s de
hoje no solver. O benchmark confirma que não houve regressão de tempo (tolerância de
+20% na mediana).

## Solver (`src/solver/`)

- **`carregarProblema`** usa `carregarContexto` e acrescenta ao `Problema`:
  `turnosDoCurso`, `externas: AulaOcupada[]` (todas as aulas dos outros cursos) e
  `Fatia.salas` com preferência. Lê só as disciplinas `ofertada = 1`. `maxDias` passa a
  ser regra (o custo ×3 de `preferenciaDeDias` sai).
- **`resolver`** monta uma `Ocupacao` com externas + fixadas. O `livre()` passa a usar
  `impedimento` + `escolherSala`, e a sala ideal é tentada primeiro.
- **Custos (`custo.ts`)**
  - `contraturno`: aula de optativa não conta. Turno forçado deixou de ser exceção
    branda, porque agora é regra.
  - `excessoDeContraturno`: conta só as não optativas.
  - `optativaSemTurno` (novo): por período com optativa ofertada, quando nenhuma está
    inteira no turno.
  - `salaAceitavel` (novo): por aula em sala de preferência 2.
  - `buracos` do aluno: ignora optativas.
  - `Pesos.padraoForaDoIdeal` sai: nunca foi somado, e o padrão já ordena as tentativas
    pelo custo da tabela.
  - O `pontuar()` local espelha as isenções de optativa.
- **B7**: em `resolver`, a fase de melhoria restaura `passos` também na rodada que
  falha (o restore passa para um `finally`).
- **B6**: não corrigido; comentário em `buracosDoDia` com o achado e o número do
  benchmark.

## Auditor (`conferir`)

Ganha, independente do módulo de regras (reimplementa, não importa):

- D2 e D3 contra `problema.externas`.
- D13 (turnos do curso).
- D14 (turno forçado).
- D15 (dias por professor somando externas).
- Sala inexistente, dia fora de `0..dias-1` e hora fora dos horários.
- Isenção de "mesmo dia" só para a fatia com fixada **naquele dia**: hoje a isenção vale
  para a fatia inteira.

Tipos novos de `TipoViolacao`: `turno-curso`, `turno-forcado`, `max-dias`, `faixa`.

## Grade manual (`GradeManual.tsx`)

- Carrega o contexto por `carregarContexto` e as aulas de **todos os cursos**, com os
  nomes de curso, professor e sala. Monta uma `Ocupacao`.
- A célula impedida mostra `descrever(impedimento(...))`. Não há mais checagem local.
- Ao alocar: `escolherSala` com `preferida` igual à sala da aula vizinha (hora anterior
  ou seguinte, mesmo dia) da mesma fatia.
- **Trocar sala**: o nome da sala na célula ocupada vira um botão (`aria-label="Trocar
  sala de …"`) que abre um `<select>` com as salas possíveis e livres naquele horário,
  marcadas "(ideal)"/"(aceitável)". O clique não propaga para o "remover" da célula.
- **Pendências** ganham avisos de padrão (D10, já com o B9 corrigido, por fatia) e de
  "dois blocos no mesmo dia". Só mostram disciplinas ofertadas.
- **Limpar período (B8)** apaga só as não fixadas. A confirmação diz quantas fixadas
  ficam.
- **Diagnóstico**: no topo, "N aula(s) deste curso violam regra dura", expansível, com
  período, dia, horário, disciplina e motivo, via `violacoesDaAula`.
- Faixa de turno: "fora do turno · tolerado" passa a dizer "contraturno". O turno que não
  é do curso nem aparece (D13).

## Cadastros

| Página | Mudança |
|---|---|
| Cursos | Remover: o confirm já promete cascata, e o gatilho a cumpre (B2). Turnos: sem "noite". Desmarcar um turno: recusa se algum período ou disciplina usa o turno; senão, se há aulas nele, confirma e apaga |
| Períodos | Sem `permite_contraturno`. Rótulo "Máx. de **obrigatórias** no contraturno", com dica explicando que optativas não contam. Remover o último período com disciplinas já é impedido (botão desabilitado com dica) |
| Disciplinas | Checkbox **Ofertada** e marca "não ofertada" na lista. Preferência por sala na lista específica (ideal/aceitável). Mudar o período leva as aulas (B3, decisão 7). Salvar revalida as aulas da disciplina com `violacoesDaAula` (sábado, turno forçado, sala, oferta). Aula com sala inválida não é apagada: se a disciplina não exige mais sala, fica sem sala; se exige, recebe uma sala válida e livre (preferindo a da aula vizinha do mesmo professor); só sem sala livre entra na confirmação de apagar. As demais inválidas confirmam e apagam, e o diálogo lista quais aulas (dia, horário, motivo). B9: o aviso de padrão olha cada fatia. Turno forçado: só os turnos do curso |
| Regras (`Instituicao.tsx`) | Dias letivos 6→5 com aula no sábado: confirma "N aulas no sábado serão apagadas" (I2); cancelar volta o seletor. (`turnos_sabado` não é editável na interface; nada a fazer) |
| Indisponibilidades | B10: `persistir` sai do updater (o arrasto grava uma vez só). Marcar sobre aula já é impedido hoje (a célula com aula não pinta), então nada muda aí |
| Professores | Reduzir `max_dias_semana` abaixo dos dias em uso: recusa com explicação (decisão 8) |
| Salas | Mudar o tipo de uma sala com aulas: as aulas cuja disciplina exige um tipo diferente do novo (D7) recebem outra sala válida e livre no mesmo horário, em todos os cursos, pela mesma função da edição de disciplina (`src/regras/reatribuir.ts`). As que não acharem sala entram num confirm que as lista (curso, período, dia, horário, disciplina); cancelar não grava nada; só reatribuições = sem diálogo. Tudo na transação do `UPDATE` da sala |
| Grade Automática | B5: o `<Erro>` aparece mesmo sem problema carregado. Resumo mostra "N aulas de outros cursos respeitadas" |
| Tipos | Optativa: dica atualizada ("o gerador põe no contraturno quando convém") |

## Limpeza

**Textos**
- "cadastre os padrões na página Curso" → **Regras**.
- "Ajuste em Horários › Regras": o aviso deixa de existir, porque os horários são fixos.
- `src/tipos.ts` cita `scripts/schema.sql` → `scripts/migracoes/`.
- `src/solver/blocos.ts`: tirar o nome próprio.
- `docs/regras.md` reescrito nas seções Cursos, Modelo de tempo, Restrições duras,
  Turnos, Salas e Custos.

**Código morto**
- `sql:allow-execute` e `opener:default` na capability.
- `tauri-plugin-opener` no Cargo, no npm e no `lib.rs`.
- `componente?` opcional e o ramo "ainda não construída" em `App.tsx`.
- `Pesos.padraoForaDoIdeal`.
- `vite.svg` como favicon (trocar pelo ícone do app); `react.svg` e `tauri.svg`.
- Cargo `description`/`authors` reais e `version = "1.0.0"`, igual ao `package.json` e
  ao `tauri.conf.json`.

`Fatia.optativa` deixa de ser código morto: o custo passa a lê-lo.

## Testes e critérios de aceite

**Falha esperada → passa** (remover `it.fails`/`test.fail`): B1, B4 e I1 no Vitest; B2,
B3, B5, B8, I1 (×2), B4 e I2 no Playwright. A asserção do I2 passa a capturar o texto
do `confirm`.

**Novos (Vitest)**
- `src/regras/*.test.ts`: um caso por motivo, `escolherSala` (vizinha, ideal antes de
  aceitável, nenhuma), `Ocupacao` (colocar/retirar, outro curso não ocupa período),
  `violacoesDaAula` (a aula não conflita consigo mesma).
- Solver:
  - turno forçado nunca descumprido;
  - não ofertada fica fora;
  - optativa no contraturno sem custo e `optativaSemTurno` cobrando;
  - sala ideal preferida;
  - B7: com `maxPassos` pequeno, a melhoria ainda melhora depois de uma rodada que
    falha.
- `conferir`: um caso por violação nova.
- Migração (`testes/suporte/banco.test.ts`): sobre a massa,
  - nenhum horário noturno;
  - `permite_contraturno` não existe;
  - `max_disciplinas_contraturno` 0/1/1 nos períodos 2, 7 e 8;
  - nenhuma optativa com turno forçado diferente do turno do período;
  - com dado semeado antes da 010 (`criarBanco({ antes })`): noite em aulas,
    indisponibilidades, disciplinas, períodos, cursos e sábado, e o `MAX(0, …)`;
  - toda disciplina `ofertada = 1`;
  - nenhuma view;
  - excluir o curso 1 zera disciplinas, períodos e alocações sem erro;
  - `disciplina_professores` e `alocacoes` intactos após a migração (contagem igual à
    da v9).

**Novos (Playwright)**
- Desmarcar "Ofertada" com aulas: confirma e apaga; some das pendências.
- Trocar sala pela célula.
- Célula com turno forçado mostra o motivo.
- Diagnóstico lista um choque entre cursos semeado.
- B9: aviso de padrão por fatia.
- B10: arrasto grava uma vez só.
- Indisponibilidade sobre aula pede confirmação.

**Gerais**
- `npm run typecheck`, `npm test` (< 20 s) e `npm run test:e2e` (< 2 min) verdes.
- `cargo fmt --check` e `cargo clippy -- -D warnings` verdes.
- `npm run test:smoke` verde se houver build de debug disponível na máquina.
- `npm run bench:solver` sem violações; nova `linha-de-base.md` gravada com
  `--salvar`, já que as regras mudaram. A mediana de tempo não pode piorar mais de 20%
  em relação à base anterior, e se piorar, isso é anotado.

## Fora de escopo

- B6 e a calibração de pesos (subprojeto 3).
- Diálogos próprios, toasts e o visual da troca de sala (subprojeto 2).
- Recriar tabelas para tirar `'noite'` dos `CHECK`.
- Regenerar a massa.
