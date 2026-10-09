# Handoff — início do subprojeto 1 (regras e integridade)

Data: 2026-10-09 · Branch base: `main` @ `7d7c81d` · Subprojeto 0 concluído e mesclado.

## Prompt para colar na nova sessão

> Vamos iniciar o subprojeto 1 (regras e integridade) do app Distribuição de Aulas.
> Leia primeiro `docs/superpowers/handoff/2026-10-09-subprojeto-1.md`, depois
> `docs/regras.md` e o spec do subprojeto 0 em `docs/superpowers/specs/`.
> Siga o fluxo brainstorming → spec → plano → execução por subagentes, como no
> subprojeto 0. Comece pelo brainstorming: há decisões de produto em aberto
> (modelo de optativa) listadas no handoff. Crie um branch antes de mexer em código.

## Contexto do projeto

App desktop (Tauri v2 + React 19/TS + SQLite via `tauri-plugin-sql`) para montar a
grade horária de cursos sem conflitos. O lado Rust é fino: migrações
(`scripts/migracoes/NNN_*.sql`, registradas em `src-tauri/src/lib.rs`) e o comando
`transacao` (escritas atômicas com FK). O gerador automático é TS puro em
`src/solver/` (guloso com backtracking por fatia + melhoria por retirar/recolocar
uma fatia). Regras do domínio: `docs/regras.md`.

## Plano geral (aprovado)

| # | Subprojeto | Estado |
|---|---|---|
| 0 | Fundação: testes e CI | **concluído** (`main` @ `7d7c81d`) |
| 1 | Regras e integridade | **próximo** |
| 2 | Refatoração visual (shadcn/ui + TanStack Table + dnd-kit + lucide-react + Sonner; heurísticas de Nielsen) | depois |
| 3 | Solver v2 (LNS + Simulated Annealing em Web Worker), **ao lado** do atual, com seletor para comparar | por último |

Cada subprojeto: brainstorming → spec em `docs/superpowers/specs/` → plano em
`docs/superpowers/plans/` → execução por subagentes com revisão por tarefa e revisão
final → merge.

## Decisões de produto já tomadas

- Turno da **noite sai do escopo** (esquema, UI e solver).
- **Conflito de professor e de sala entre cursos é regra dura.** Hoje nem o solver
  nem a grade manual olham outros cursos.
- `max_dias_semana` do professor é **regra dura**.
- Máximo de disciplinas no contraturno continua **custo**.
- **Optativa** é uma modalidade específica de disciplina e precisa ser integrada no
  sistema todo — **o modelo ainda não foi definido** (é a primeira pergunta do
  brainstorming).
- Preferência de sala ideal/aceitável (`disciplina_salas.preferencia`) — **implementar**
  (hoje não é editável nem usada).
- **A grade manual deve bloquear a violação e explicar qual regra impediu**, usando o
  mesmo conjunto de regras duras do solver (hoje cada um tem sua cópia).
- Textos desatualizados devem ser corrigidos (ver abaixo).

## O que o subprojeto 0 entregou (use, não refaça)

- `testes/massa/engenharia_v9.sql` — massa anonimizada (esquema 9). Regenerar:
  `python scripts/anonimizar_massa.py distribuicao.db`.
- `testes/suporte/banco.ts` — `criarBanco({ massa })`: migrações até a versão da massa
  → massa → migrações restantes. **Toda migração nova roda contra banco populado.**
- `testes/suporte/ponte.ts` — IPC do Tauri simulado sobre `node:sqlite` (Playwright).
- `src/solver/conferir.ts` — auditor independente das regras duras.
- `scripts/bench_solver.ts` + `testes/benchmark/linha-de-base.md` — benchmark.
- Comandos: `npm run typecheck`, `npm test` (Vitest, ~4 s), `npm run test:e2e`
  (Playwright, ~35 s), `npm run test:smoke` (Windows; exige
  `npm run tauri build -- --debug --no-bundle`), `npm run bench:solver`.
- `DISTRIBUICAO_BANCO` (só debug) isola o banco do smoke; seu banco real fica em
  `%APPDATA%\br.edu.utfpr.distribuicaoaulas\distribuicao.db`.
- CI em `.github/workflows/ci.yml` — **nunca rodou** (não há remoto).

## Critério de aceite pronto: os testes de falha esperada

Cada bug abaixo tem um teste que descreve o comportamento correto e hoje "falha como
esperado". Ao corrigir, o teste passa a passar, a ferramenta acusa, e **a marcação
`it.fails` / `test.fail(...)` deve ser removida**. Ajuste a asserção se a correção
escolhida for legitimamente diferente da que o teste supõe (anotado na coluna Nota).

| Id | Bug | Teste | Nota |
|---|---|---|---|
| B1 | Solver aloca fora dos turnos do curso (16 aulas à noite com 3 salas) | `src/solver/solver.test.ts` | some com a remoção da noite; o teste lê `cursos.turnos` |
| B2 | Excluir curso com disciplinas falha por FK (confirm promete cascata) | `testes/e2e/bugs-conhecidos.spec.ts` | supõe cascata; se optar por bloquear com mensagem melhor, ajuste |
| B3 | Mudar período da disciplina deixa as aulas no período antigo | idem | exige as aulas no período novo (não aceita apagar) |
| B4 | `max_dias_semana` não limita (solver e grade manual) | solver.test.ts + bugs-conhecidos | regex `/máx\|dias/i` na célula |
| B5 | Erro ao carregar a Grade Automática deixa a tela em branco | bugs-conhecidos | `GradeAutomatica.tsx`: `return null` antes do `<Erro>` |
| B8 | "Limpar período" apaga aulas fixadas sem avisar | bugs-conhecidos | supõe preservar fixadas |
| I1 | Conflito de professor/sala entre cursos não é barrado | solver.test.ts + bugs-conhecidos (2) | regex de célula `/A01\|Beta\|ocupad/i` e `/A\. Souza\|Beta/` |
| I2 | Mudar dias letivos 6→5 com aula no sábado não avisa | bugs-conhecidos | espera texto `/aulas? no sábado/i`; se virar diálogo, troque a asserção |

Bugs do relatório inicial **sem teste ainda** (criar junto da correção):
- **B6** `buracosDoDia` em `src/solver/solver.ts:95` mistura chaves de professor e de
  período. Atenção: corrigir isoladamente **piorou** o custo médio (619 → 838) — a nota
  local está desalinhada do objetivo; a correção de verdade é do solver v2. Avaliar se
  corrige agora ou deixa para o subprojeto 3.
- **B7** Orçamento de passos vaza na fase de melhoria (`solver.ts:268`).
- **B9** Aviso "sem padrão de bloco" checa o total da disciplina, mas o solver usa
  padrões **por fatia** (`Disciplinas.tsx:450`).
- **B10** `persistir()` dentro do updater de `setMarcados` (`Indisponibilidades.tsx:128`).

## Incoerências e código a tratar no subprojeto 1

- Remover noite: horários N1–N5, opção "noite" em turnos de curso/período/disciplina,
  e o domínio do solver (filtrar por `cursos.turnos`).
- Migração nova para a cascata de curso exige **recriar tabelas** (`disciplinas` não tem
  FK para `cursos`). Dentro da transação da migração a FK está ligada e `DROP TABLE`
  dispara cascatas — o `criarBanco` vai pegar isso nos testes.
- `periodos.permite_contraturno` é derivado de `max > 0` e o solver não lê: remover ou usar.
- Grade manual: não valida padrões de bloco nem turno forçado; não deixa escolher/trocar
  sala (pega a primeira livre; aulas seguidas podem trocar de sala).
- Mudar dias letivos ou turnos do curso esconde aulas existentes sem aviso.
- Textos desatualizados: "cadastre os padrões na página Curso" (estão em **Regras**),
  "Ajuste em Horários › Regras" (horários fixos desde a 008), `src/tipos.ts` cita
  `scripts/schema.sql` (não existe; o esquema mora em `scripts/migracoes/`),
  `src/solver/blocos.ts` cita "curso do Evandro" (nome próprio; regra de ouro do README).
- Código sem uso: `sql:allow-execute` na capability (remover fecha escrita fora de
  `transacao`), `tauri-plugin-opener` (Rust, npm e capability), `componente?` opcional e
  botão "ainda não construída" em `App.tsx`, `Pesos.padraoForaDoIdeal`, `Fatia.optativa`
  no solver, views `ocupacao_*`/`*_conferencia`/`conflitos` (a `conflitos` pode virar
  diagnóstico útil), `versao_schema` parada, sobras de template (`vite.svg` como favicon,
  `react.svg`, `tauri.svg`, Cargo `description`/`authors`, versão 0.1.0 vs 1.0.0).
- Quando B1/B4/I1 virarem regras duras, **o `conferir` precisa aprendê-las também**,
  senão o auditor e a coluna "violações" do benchmark não pegam regressões.

## Pendências menores herdadas do subprojeto 0 (podem esperar)

Lista completa e triada em `.superpowers/sdd/progress.md` (pasta local, fora do git).
As que pesam antes do solver v2: endurecer o `conferir` (sala inexistente, dia/hora fora
de faixa, isenção de mesmo dia para fatia com fixada), e antes de criar o remoto do CI:
nada pendente (já fixado `--rev`, timeouts, permissões).
Antes de regenerar a massa depois de uma tabela nova: a lista `ORDEM` do
`anonimizar_massa.py` é fixa — conferir contra `sqlite_master`; o nome `_v9` é fixo.

## Observações de processo

- O usuário fala pt-BR informal, conhece algoritmo genético para escala; prefere
  trabalhar em paralelo e cruzar achados antes de planejar.
- Commits: trailer `Co-Authored-By` com o modelo que de fato escreveu.
- Não há remoto git; nada de push até o usuário criar um.
