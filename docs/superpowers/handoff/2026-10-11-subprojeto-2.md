# Handoff — início do subprojeto 2 (refatoração visual)

Data: 2026-10-11 · Branch base: `main` @ `eefaf79` · Subprojetos 0 e 1 concluídos e mesclados.

## Prompt para colar na nova sessão

> Vamos iniciar o subprojeto 2 (refatoração visual) do app Distribuição de Aulas.
> Leia primeiro `docs/superpowers/handoff/2026-10-11-subprojeto-2.md`, depois
> `docs/regras.md` e o spec do subprojeto 1 em `docs/superpowers/specs/`.
> Siga o fluxo brainstorming → spec → plano → execução por subagentes, como nos
> subprojetos 0 e 1. Comece pelo brainstorming: há decisões de produto e de desenho
> em aberto listadas no handoff. Crie um branch antes de mexer em código.

## Contexto do projeto

App desktop (Tauri v2 + React 19/TS 5.8 + SQLite via `tauri-plugin-sql`) para montar a
grade horária de cursos sem conflitos. O lado Rust é fino: migrações
(`scripts/migracoes/NNN_*.sql`, registradas em `src-tauri/src/lib.rs`) e o comando
`transacao` (escritas atômicas com FK). As regras duras de célula moram em
`src/regras/` (TS puro), usadas pelo gerador (`src/solver/`) e pela grade manual.
`src/solver/conferir.ts` é auditor independente e não importa `src/regras/`.
Regras do domínio: `docs/regras.md`.

## Plano geral (aprovado)

| # | Subprojeto | Estado |
|---|---|---|
| 0 | Fundação: testes e CI | **concluído** (`7d7c81d`) |
| 1 | Regras e integridade | **concluído** (`main` @ `eefaf79`) |
| 2 | Refatoração visual (shadcn/ui + TanStack Table + dnd-kit + lucide-react + Sonner; heurísticas de Nielsen) | **próximo** |
| 3 | Solver v2 (LNS + Simulated Annealing em Web Worker), **ao lado** do atual, com seletor para comparar | por último |

Cada subprojeto: brainstorming → spec em `docs/superpowers/specs/` → plano em
`docs/superpowers/plans/` → execução por subagentes com revisão por tarefa e revisão
final → merge.

## Estado do repositório

- `main` e `regras-integridade` apontam para `eefaf79` (avanço rápido). O branch
  `regras-integridade` pode ser apagado: `git branch -d regras-integridade`.
- `package-lock.json` está modificado e não commitado (`source-map-js` 1.2.1 → 1.2.2).
  Não veio do subprojeto 1; decidir se entra num commit ou se é descartado.
- Verificação em `eefaf79`: typecheck verde; Vitest 140/140 (~7 s); Playwright 45/45
  (~15 s); `cargo fmt --check` e `clippy -D warnings` limpos. O smoke (3/3) passou em
  `c3fbc28` e não foi rodado de novo depois da onda final.
- **O banco real continua na versão 9.** A migração 010 roda na primeira abertura do
  app com este código. Ela apaga dado noturno e limpa o turno forçado das optativas;
  vale guardar uma cópia de
  `%APPDATA%\br.edu.utfpr.distribuicaoaulas\distribuicao.db` antes.
- Não há remoto git. O CI (`.github/workflows/ci.yml`) nunca rodou.

## O que o subprojeto 1 entregou (use, não refaça)

- `src/regras/` — `impedimento`, `impedimentoDeHorario`, `salasPossiveis`,
  `escolherSala`, `violacoesDaAula`, `avisosDaFatia`, `reatribuirSalas`, `descrever`
  (texto do motivo), `Ocupacao`, `carregarContexto`. **A interface não decide regra:
  pergunta ao módulo e mostra o motivo.**
- Grade manual: aulas de todos os cursos no contexto, sala automática (vizinha → ideal
  → aceitável) com troca por `<select>` na célula, avisos na pendência, e a lista
  "N aula(s) deste curso violam regra dura" num `<details>`.
- Cadastros que invalidam aulas: confirmam e apagam; sala inválida é **reatribuída**
  (Disciplinas e mudança de tipo em Salas); tirar turno em uso e baixar o máximo de
  dias abaixo do uso são **recusados** com explicação.
- `disciplinas.ofertada`, preferência de sala ideal/aceitável (`RequisitoSala`).
- Testes: `criarBanco({ massa, antes })`, ponte IPC com registro de chamadas
  (`chamadas` nos fixtures do Playwright).

## O que existe hoje na interface

| Item | Hoje | Alvo combinado |
|---|---|---|
| Estilo | `src/App.css`, 1 829 linhas à mão, 42 variáveis, tema escuro por `prefers-color-scheme` | shadcn/ui |
| Componentes próprios | `src/componentes/ui.tsx`: `Modal`, `Campo`, `Ordenavel`/`comparar`/`CabecalhoLista`, `BotaoIcone`, `Vazio`, `Erro` | shadcn/ui |
| Tabelas | 9 `<table>`, ordenação feita à mão | TanStack Table |
| Ícones | `Lapis` e `Lixeira` em SVG inline | lucide-react |
| Confirmações | `confirm()` nativo, 12 chamadas em 8 páginas | diálogo próprio |
| Erros e avisos | `<Erro>` inline, 11 usos | Sonner (a definir o que fica inline) |
| Grade manual | clicar na pendência, depois na célula | dnd-kit |
| Indisponibilidades | pintar arrastando (`onMouseDown`/`onMouseEnter`) | manter ou refazer |
| Seletores | 19 `<select>` nativos | shadcn `Select` |

Tamanho das telas: `Disciplinas.tsx` 950 linhas, `GradeManual.tsx` 651, `Salas.tsx`
374, as demais entre 200 e 310. Navegação em `App.tsx`: seletor de curso e quatro
grupos (curso, instituição, horários, grade de horários). Janela 1400×900, mínimo
1024×700. Não há Tailwind, nem alias `@/` no Vite ou no `tsconfig`.

## Decisões em aberto (brainstorming)

1. **Tailwind.** O shadcn/ui exige Tailwind e o alias `@/`. Converter tela a tela, com
   `App.css` convivendo até o fim, ou trocar tudo de uma vez?
2. **Identidade visual.** Tema claro e escuro (seguir o sistema ou ter seletor),
   densidade, e como colorir a grade (por disciplina, por tipo, por professor).
3. **Arrastar na grade manual.** O que arrasta (pendência → célula, aula → outra
   célula, troca entre duas aulas), o que a célula inválida mostra durante o arrasto
   (o motivo vem de `impedimento`), e se o clique continua valendo para teclado.
4. **Desfazer.** Nielsen pede controle e liberdade. Quais ações ganham "Desfazer" no
   toast (apagar aula, limpar período, aplicar a grade gerada) e quais continuam com
   confirmação antes.
5. **Erro inline ou toast.** Erro de validação de formulário perto do campo; falha de
   gravação em toast? Definir a regra uma vez.
6. **Tabelas.** O que o TanStack Table traz além da ordenação: busca, filtro por
   coluna, colunas ocultáveis.
7. **Escopo de código.** Quebrar `Disciplinas.tsx` e `GradeManual.tsx` em componentes
   faz parte deste subprojeto ou só o necessário para a troca visual?
8. **Rede de segurança visual.** Entram capturas de tela comparadas no Playwright, ou
   a revisão visual é manual?
9. **Fontes.** O app roda sem internet: qualquer fonte nova precisa ir empacotada.

## Impacto nos testes (planejar antes de trocar componente)

Os 45 e2e são a rede. A maioria usa papel e rótulo (77 `getByRole`, 19 `getByLabel`,
23 `getByText`), mas a troca de componentes quebra estes pontos:

- **`confirm()` nativo → diálogo próprio.** `aceitarConfirmacoes` em
  `testes/e2e/paginas.ts` e mais 11 usos de `page.on("dialog")` em
  `bugs-conhecidos`, `cadastros`, `disciplinas` e `salas`. Vários leem o texto do
  diálogo (lista de aulas a apagar). Centralizar num auxiliar antes de trocar.
- **`<select>` nativo → `Select` do shadcn.** 17 `selectOption` e um
  `option:checked` (`grade-manual.spec.ts:69`) deixam de funcionar.
- **Seletores por classe ou marcação:** `.modal select` (2), `.linha-fatia
  input[type=number]` (1), `locator("tr", …)` (2).
- **Células das grades** são achadas pelo `aria-label` "Segunda, M1"
  (`celula()` em `paginas.ts`), e a navegação por
  `getByRole("navigation").getByRole("button")`. Manter esses contratos.
- O smoke (`testes/smoke/app.spec.ts`) não toca na interface.
- Rodar o e2e completo logo depois de uma rodada parcial pode dar
  `ERR_CONNECTION_REFUSED` no primeiro teste (servidor reaproveitado). Rodar de novo.

## Pendências herdadas do subprojeto 1

Para este subprojeto:
- `label` envolvendo o grupo de caixas de turnos (acessibilidade).
- Aula sem sala em disciplina que exige sala não tem controle de troca na célula.
- Aula fixada troca de sala sem aviso quando o cadastro é editado.
- Aula órfã (sem fatia correspondente) fica fora da lista de diagnóstico.
- Motivo de sala aparece redundante ao lado de outro motivo no diálogo de Disciplinas.
- Faltam e2e: opção "Sem sala", sala vizinha preferida, botão Limpar desabilitado,
  cancelar a remoção de turno em Cursos, recusa por disciplina com turno forçado.

Para o subprojeto 3 (não mexer agora):
- B6 (`buracosDoDia` mistura chaves de professor e de período), deixado de propósito
  com comentário no código.
- Chaves em texto no laço quente da `Ocupacao`; pré-filtro de D13 nos passos.
- Calibração de pesos; aulas fora do turno subiram de 24 para 38 na massa.
- Base de tempo: `testes/benchmark/linha-de-base.md` de `e14c066`. O cenário
  "3 salas + 1 dia indisponível" fica com 4 fatias de fora (antes fechava usando a
  noite).

Lista completa por tarefa em `.superpowers/sdd/progress.md` (pasta local, fora do git).

## Restrições que continuam valendo

- Textos, comentários e commits em pt-BR. Nada depende de nome: nenhum nome próprio em
  código, comentário ou teste.
- Migração publicada não se edita; mudança de esquema é migração nova (011 em diante).
  Este subprojeto, em princípio, não precisa de migração.
- Não substituir `src/solver/` nem mexer em `src/regras/` além do que a interface pedir.
- Ao corrigir um bug com teste de falha esperada, remover a marcação (hoje não há
  nenhuma).
- Commits com trailer `Co-Authored-By` do modelo que de fato escreveu. Sem `git push`
  até existir remoto.

## Observações de processo

- O usuário fala pt-BR informal e delega execuções longas ("faça tudo"). Decisões
  técnicas: tomar e registrar no spec, numa seção "Decisões tomadas sem o usuário".
  Decisões de produto: em texto, com opções numeradas e a recomendada primeiro; ele
  responde em uma linha. Formulário de pergunta no fim de sessão longa foi recusado.
- Quando ele pedir pausa: parar de despachar trabalho novo e anotar o ponto de retomada.
- O roteiro `task-brief` da skill de subagentes procura títulos "Task N". Os planos
  daqui usam "Tarefa N", então os resumos por tarefa saem com um `awk` próprio.
