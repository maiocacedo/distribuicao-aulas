# Subprojeto 0 — Fundação: testes e CI

Data: 2026-09-28 · Branch: `fundacao-testes-ci` · Status: aprovado em conversa, aguardando revisão do documento

## Por que primeiro

É o primeiro de quatro subprojetos (0 fundação → 1 regras e integridade → 2 visual →
3 solver v2). Os três seguintes refatoram um sistema que hoje não tem teste nenhum; este
entrega a rede de segurança e transforma os bugs já encontrados em testes executáveis,
que servem de critério de aceite do subprojeto 1.

## Decisões

| Tema | Decisão |
|---|---|
| Massa de teste | Cópia anonimizada da massa real, gerada por script |
| O que anonimizar | Nomes de professores, `observacao` de todas as tabelas, `motivo` de indisponibilidade. Nomes de disciplinas, salas e curso ficam: são currículo público, não dado pessoal |
| Plataforma de CI | GitHub Actions (o remoto ainda não existe; o workflow fica pronto) |
| Teste de interface | Playwright no Chromium, com o IPC do Tauri ligado a um SQLite real no processo Node |
| Smoke no binário | WebdriverIO + tauri-driver, Windows, em PR para `main` e sob demanda |
| Bugs conhecidos | Testes de falha esperada (`it.fails` / `test.fail`), com o id do bug |

## Organização

```
testes/
  massa/engenharia_v9.sql   massa anonimizada, só dados, gravada no esquema v9
  suporte/banco.ts          criarBanco() — usado por Vitest, Playwright e benchmark
  suporte/ponte.ts          simulação do IPC do Tauri sobre node:sqlite
  e2e/                      Playwright: fixtures.ts, paginas.ts, *.spec.ts
  smoke/                    WebdriverIO: wdio.conf.ts, *.spec.ts
  benchmark/linha-de-base.md
src/solver/*.test.ts        testes do solver, ao lado do código
scripts/anonimizar_massa.py
scripts/bench_solver.ts
```

## Massa de teste

`scripts/anonimizar_massa.py <banco.db> [-o testes/massa/engenharia_v9.sql]` lê o banco
real local (fora do git) e grava INSERTs apenas de dados, na ordem das dependências:
`periodos`, `professores`, `salas`, `tipos_disciplina`, `disciplinas`,
`disciplina_professores`, `disciplina_salas`, `indisponibilidades`, `alocacoes`,
e — como upsert, porque as migrações já semeiam valores — `cursos` (a 005 cria o
curso 1), `configuracao` e `padroes_blocos`. `horarios` fica de fora: é fixo desde a
migração 008.

- Professores viram `Professor 01`…`Professor NN`, na ordem do id. IDs são preservados.
- O cabeçalho do arquivo registra a versão do esquema: a maior migração existente em
  `scripts/migracoes/` no momento da geração (hoje, 9). O banco de origem precisa estar
  nessa versão — o `migrar.py` sempre produz bancos na mais recente.
- O script termina conferindo que nenhum nome de professor do banco de origem aparece
  no arquivo gerado; se aparecer, falha sem gravar.

`criarBanco({ massa?: boolean })` em `testes/suporte/banco.ts` devolve um
`DatabaseSync` (`node:sqlite`) novo:

1. aplica as migrações reais de `scripts/migracoes/` até a versão da massa;
2. insere a massa (se pedida);
3. aplica as migrações restantes.

Assim toda migração futura é exercida contra um banco já populado — o caso do usuário
real. Sem massa, o banco sai igual à primeira abertura do app.

## Camada 1 — solver (Vitest)

**Mudanças de produção**

- `carregarProblema(cursoId, ler = consultar)`: a função de leitura vira parâmetro, com o
  padrão atual (Tauri). Testes e benchmark passam uma leitura sobre `node:sqlite`, e o
  problema passa a ser montado pelo mesmo SQL que o app usa.
- `src/solver/conferir.ts` (novo): `conferir(problema, alocacoes): Violacao[]`, auditor
  independente das regras duras — período, professor e sala sem sobreposição;
  indisponibilidade; sábado só com permissão e só nos `turnosSabado`; requisito de sala
  (nenhuma / tipo / lista); fatia com 0 aulas ou com todas; blocos da fatia em dias
  distintos, formando um padrão cadastrado (ou qualquer um, se `blocosLivres`); bloco
  sem atravessar troca de turno.

**Testes**

- Massa real: grade completa, `conferir` vazio, mesma semente → mesma grade.
- Cenários mínimos construídos à mão: fixadas preservadas, indisponibilidade,
  sala por tipo e por lista, sábado só de manhã, bloco não atravessa turno.
- Unidade: `particoes`, `blocoCabeNoDia`, `buracos`, contraturno, `conferir` (cada
  violação detectada por um caso próprio).
- Estresse: 3 sementes com salas escassas e indisponibilidades, rodadas de melhoria
  reduzidas.
- Conflito entre cursos (I1): banco com a massa mais um segundo curso cujas alocações
  ocupam um professor e uma sala do curso 1 num horário; o problema do curso 1 é
  montado por `carregarProblema` e resolvido; nenhuma alocação pode usar aquele
  professor ou aquela sala naquele horário.
- Meta: suíte inteira abaixo de 20 s.

**Benchmark** — `npm run bench:solver [-- --banco <arquivo.db>]`, via `vite-node`.
Recebe uma lista `{ nome, resolver }[]` (hoje só o atual; o v2 do subprojeto 3 entra
nela), roda cenários × sementes e imprime por linha: completo, faltantes, custo,
violações (`conferir`), buracos de professor e de turma, aulas fora do turno, ms. A
primeira execução é salva em `testes/benchmark/linha-de-base.md`.

`scripts/testar_solver.ts` e `scripts/exportar_problema.py` são removidos: os testes e o
benchmark os substituem, e a duplicação do SQL de carga deixa de existir.

## Camada 2 — interface (Playwright)

**Execução** — `playwright.config.ts` sobe `npm run dev` (Vite, porta 1420) e roda só
Chromium. O WebView2 do app também é Chromium, então o motor é praticamente o mesmo.
Trace e screenshot na falha.

**Fixture** (`testes/e2e/fixtures.ts`) — cada teste recebe um banco próprio
(`criarBanco`). Antes de o app carregar, expõe `window.__ipc` e define
`window.__TAURI_INTERNALS__` com `invoke` delegando a ele. Erros voltam ao app como
string pura, como vêm do Rust.

**Ponte** (`testes/suporte/ponte.ts`) — simula apenas:

| Comando | Comportamento |
|---|---|
| `banco` | devolve `"sqlite:distribuicao.db"` (ver camada 3) |
| `plugin:sql\|load` | devolve o próprio `db` |
| `plugin:sql\|select` | `prepare(query).all(values)` |
| `transacao` | `foreign_keys = ON`, BEGIN, cada instrução, COMMIT ou ROLLBACK; conversão de parâmetros igual ao `amarrar` do Rust (booleano → 0/1, array/objeto → texto JSON); devolve `{ rowsAffected, lastInsertId }` |

Qualquer outro comando é rejeitado com `comando não simulado: <nome>`. A ponte aceita
injeção de falha por padrão de SQL, para provar que a tela exibe erros. Ela mesma tem
testes no Vitest (erro de FK, rollback, conversão de booleano).

**Seletores** — por papel e nome acessível. As células das grades (grade manual e
indisponibilidades) ganham `aria-label` no formato `"Segunda, M1"`: melhora a
acessibilidade e dá seletores estáveis para a refatoração visual. Helpers finos em
`testes/e2e/paginas.ts` (`irPara`, `celula`, `aceitarConfirmacoes`). O Playwright
recusa `confirm()` por padrão; testes que precisam confirmar chamam
`aceitarConfirmacoes()`.

**Cenários que passam hoje**

1. Banco vazio: cadastrar período, professor, sala e disciplina com dois professores;
   alocar na grade manual até as pendências fecharem.
2. Massa: gerar → aplicar → `conferir` sobre as alocações gravadas no banco = 0.
3. Fixar aula (botão direito) → gerar → aplicar → a aula fixada continua no lugar.
4. Indisponibilidade por arrasto: fica gravada, e a grade gerada a respeita.
5. Disciplina que exige laboratório recebe laboratório, na manual e no gerador.
6. Célula impedida na grade manual exibe o motivo (professor ocupado, indisponível,
   sábado).

Meta: suíte inteira abaixo de 2 min.

## Camada 3 — smoke no binário real (WebdriverIO)

**Mudança de produção** — em build de debug (`cfg(debug_assertions)`), o Rust lê
`DISTRIBUICAO_BANCO`; se definida, usa esse caminho absoluto como URL do banco, tanto em
`add_migrations` quanto num comando novo `banco()`. O `db.ts` obtém o nome por esse
comando antes do `Database.load`. Em release a variável é ignorada e o banco continua
`sqlite:distribuicao.db` em `app_config_dir`. Sem isso, rodar o smoke na máquina do
desenvolvedor gravaria no banco de verdade.

**Execução** — `tauri build --debug --no-bundle`; `tauri-driver`; `msedgedriver`
compatível com o WebView2 instalado (via `msedgedriver-tool`). Cada execução usa uma
pasta temporária para o banco.

**Testes**

1. Banco vazio abre e as migrações rodaram pelo sqlx: o curso padrão aparece.
2. Gravação pelo `transacao` (Rust) volta na leitura pelo plugin: criar professor →
   aparece na lista.
3. FK real: alocar uma aula, trocar o professor da disciplina → mensagem "está em uso".

## Bugs conhecidos como falha esperada

Cada teste leva o id no nome e um comentário com o subprojeto que corrige. Quando o bug
for corrigido, o teste passa, a ferramenta acusa "passou inesperadamente" e a marcação
tem de ser removida.

| Id | Bug | Onde é testado |
|---|---|---|
| B1 | Solver aloca fora dos turnos do curso | Vitest |
| B2 | Excluir curso com disciplinas falha por FK | Playwright |
| B3 | Mudar o período de uma disciplina deixa as aulas no período antigo | Playwright |
| B4 | `max_dias_semana` não limita (solver e grade manual) | Vitest, Playwright |
| B5 | Erro de carga na Grade Automática deixa a tela em branco | Playwright |
| B8 | "Limpar período" apaga aulas fixadas sem avisar | Playwright |
| I1 | Conflito de professor/sala entre cursos não é barrado | Vitest, Playwright |
| I2 | Mudar dias letivos de 6 para 5 com aula no sábado não avisa | Playwright |

B6, B7, B9 e B10 do relatório de análise não ganham teste aqui: B6 e B7 mudam com o
solver v2; B9 e B10 são corrigidos no subprojeto 1 junto com seus testes.

## CI — `.github/workflows/ci.yml`

| Job | Runner | Gatilho | Passos |
|---|---|---|---|
| `verificacao` | ubuntu-latest | todo push e PR | `npm ci` → `typecheck` → `test` → instalar Chromium → `test:e2e`; relatório do Playwright como artefato na falha |
| `rust` | ubuntu-latest | todo push e PR | dependências de sistema do Tauri; `cargo fmt --check`; `cargo clippy -- -D warnings`; `rust-cache` |
| `smoke` | windows-latest | PR para `main` e `workflow_dispatch` | Node + Rust + caches; `tauri-driver` e `msedgedriver-tool`; build debug; `test:smoke` |

`concurrency` por ref, cancelando a execução anterior. Node fixado em 22 (`.nvmrc`;
`engines.node >= 22.13`, primeira versão com `node:sqlite` sem flag).

## Scripts (`package.json`)

`typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`),
`test:smoke` (`wdio run testes/smoke/wdio.conf.ts`), `bench:solver`.

## Arrumação

- `.gitattributes` com `* text=auto eol=lf` (binários marcados) e renormalização: hoje
  há LF e CRLF misturados, e o CI roda em Linux.
- README ganha a seção "Testes": comandos, como regenerar a massa, o que é um teste de
  falha esperada e quando removê-lo.
- O comentário de `src/solver/carregar.ts` que cita `exportar_problema.py` passa a
  citar os testes e o benchmark.

## Fora de escopo

- ESLint/Prettier.
- Build de instalador no CI.
- Correção de qualquer bug listado — é o subprojeto 1.

## Critérios de aceite

- `typecheck`, `test` e `test:e2e` verdes localmente e no job `verificacao`; `rust`
  verde; `test:smoke` verde no Windows.
- Vitest abaixo de 20 s; Playwright abaixo de 2 min.
- `testes/massa/engenharia_v9.sql` commitado, sem nenhum nome de professor real.
- `testes/benchmark/linha-de-base.md` commitado.
- O app não muda de comportamento. Mudanças de produção permitidas: `carregarProblema`
  com leitura injetável, `aria-label` nas células, `DISTRIBUICAO_BANCO` + comando
  `banco()` em debug, e o novo `src/solver/conferir.ts` (ainda não usado pelo app).
