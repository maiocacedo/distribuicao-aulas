# Handoff — restrições e diagnóstico da grade

Data: 2026-10-30. Para começar numa sessão nova. Spec aprovado:
`docs/superpowers/specs/2026-10-30-restricoes-e-diagnostico-design.md`.

## Prompt para colar na sessão nova

> Vamos executar o trabalho "restrições e diagnóstico da grade" do app Distribuição de Aulas.
> Leia primeiro `docs/superpowers/handoff/2026-10-30-restricoes-e-diagnostico.md` (este
> arquivo) e o spec `docs/superpowers/specs/2026-10-30-restricoes-e-diagnostico-design.md`.
> O spec já está aprovado: não refaça o brainstorming. Escreva o plano com a skill
> writing-plans (em `docs/superpowers/plans/2026-10-30-restricoes-e-diagnostico.md`) e execute
> com a skill subagent-driven-development, sem pausas entre tarefas, no branch
> `versao-navegador`. Decisões técnicas você toma e registra; decisões de produto você me traz em
> texto, com opções numeradas e a recomendada primeiro.

## O que é, em uma linha

Trocar o aviso "N aula(s) deste curso violam regra dura" — uma lista crua, aula por aula — por
um painel que agrupa por causa, explica em linguagem direta, oferece a correção em um clique,
marca as células e as abas da grade, e mostra primeiro o período atual. Junto: o vocabulário
passa a ser **restrições** (o que a grade não pode quebrar) e **preferências** (o que o gerador
tenta), e o **turno forçado deixa de valer no sábado**.

## Decisões do usuário (2026-10-30)

| Decisão | Escolha |
|---|---|
| Nome | **Restrições** e **Preferências** |
| Onde trocar o nome | só no que o usuário lê: interface, README, `docs/regras.md`, guia; código e comentários ficam |
| Turno forçado e sábado | **vale só nos dias úteis**; no sábado a disciplina segue os turnos do sábado ("é o que mais condiz com a realidade") |
| Escopo do diagnóstico | as quatro partes: agrupar com ações, marcar na grade, período atual primeiro, dizer a origem |
| Branch | continuar em `versao-navegador`; o usuário mescla na `main` por pull request |

O caso real que motivou tudo, presente na massa de exemplo (`testes/massa/engenharia_v9.sql`) e
no banco real do usuário: os três Projetos Integradores estão como "Não ocupa sala", mas as
aulas estão nas salas "Remota PI1/PI2/PI3" (29 avisos); e o PI3, forçado à tarde, tem 6 aulas
no sábado de manhã, que só tem manhã (6 avisos). A massa NÃO deve ser corrigida: ela é a
vitrine das ações novas ("Usar Remota PI1 como sala da disciplina").

## Estado do repositório

- Remoto: `https://github.com/maiocacedo/distribuicao-aulas` (público). `main` em `308e70a`
  (PRs #1 e #2 mesclaram `versao-navegador`, que já continha o subprojeto 2). O branch
  `versao-navegador` foi avançado até a `main` e é onde este trabalho acontece.
- Este handoff e o spec estão no commit seguinte a `308e70a` em `versao-navegador`.
- CI (`.github/workflows/ci.yml`): typecheck, Vitest e e2e (chromium) em push na `main` e em
  pull request; smoke em PR para a `main` (job próprio). O projeto `visual` e o `navegador` não
  rodam no CI.
- Pages (`.github/workflows/pages.yml`): publica `npm run build:web` (pasta `dist-web/`) a cada
  push na `main`. O usuário precisa ter escolhido Settings → Pages → Source: GitHub Actions. O
  endereço esperado é `https://maiocacedo.github.io/distribuicao-aulas/`.
- Última verificação completa feita pelo orquestrador (em `4f7a1e7`, antes dos últimos commits,
  que só mexeram em build, smoke e documentação): typecheck limpo, Vitest 251, e2e 211,
  navegador 17, visual 28, build verde.

## Pendências fora deste trabalho (do usuário)

1. **Smoke** (`npm run test:smoke`): ainda não passou nenhuma vez.
   - O driver foi atualizado pelo usuário (`msedgedriver-tool`, WebView2 156).
   - A checagem do banco temporário foi trocada: o Tauri 2.11 recusa `invoke` vindo de
     `browser.execute` ("Origin header is not a valid URL"); agora o smoke confere que o app
     criou o arquivo temporário (`30a6f29`).
   - Na rodada seguinte, a barra lateral não apareceu em 5 s. O smoke passou a esperar 20 s e,
     se falhar, salva `%TEMP%\smoke-sem-barra.png` e põe a URL e o texto da janela no erro
     (`76c2636`). **O usuário ainda não rodou de novo**: peça a saída (dá para ler o terminal
     com a ferramenta de terminal) antes de mexer no smoke.
   - O `.exe` de debug (`src-tauri/target/debug/distribuicao-aulas.exe`) é de 2026-10-15 16:18.
     **Nunca abra esse `.exe` sem `DISTRIBUICAO_BANCO` apontando para um arquivo temporário:**
     sem a variável, o build de debug usa o banco real do usuário. O mesmo vale para
     `npm run tauri dev`.
2. **Roteiro na janela do Tauri** (arrasto, botão direito, Ctrl+Z nunca rodaram no WebView2):
   em `docs/superpowers/handoff/2026-10-12-subprojeto-2-relatorio.md`.
3. **Banco real** (`%APPDATA%\br.edu.utfpr.distribuicaoaulas\distribuicao.db`): já na versão
   10 do esquema. Última modificação em 2026-10-15 16:27, nove minutos depois de o `.exe` de
   debug ser recompilado; não se sabe se foi o usuário. Nada do que este trabalho faz toca nele.

## Como trabalhar (o que deu certo nos subprojetos anteriores)

- **Registro local:** `.superpowers/sdd/progress.md` (pasta ignorada pelo git). Os arquivos do
  subprojeto 2 e da versão de navegador foram arquivados em `.superpowers/sdd/sp2/`; comece um
  `progress.md` novo. As restrições globais continuam em `.superpowers/sdd/restricoes.md` (a
  "receita de conversão de tela" ali é histórica: todas as telas já foram convertidas).
- **Ciclo por tarefa:** resumo da tarefa extraído do plano para `.superpowers/sdd/task-N-brief.md`
  → implementador com o resumo, as restrições, o guia e o caminho do relatório
  (`task-N-report.md`) → `review-package BASE HEAD` (script da skill) → revisor com resumo,
  relatório e pacote, pedindo veredito sobre cada desvio declarado → uma rodada de correção para
  Críticos e Importantes, com rerrevisão (retomar o mesmo revisor por SendMessage é mais barato)
  → registrar em `progress.md`.
- **Modelos:** `opus` para o que mexe em regra, solver, concorrência ou estado da grade (tarefas
  1 e 3 do spec); `sonnet` para o resto e para revisões pequenas; `opus` para a revisão final.
- **Divisão de arquivo grande:** quando uma tarefa começa por mover código, um despacho só para
  isso (movimento puro, testes verdes) e outro para a mudança.
- **Revisão final:** se o diff do branch passar de ~300 KB, dividir em frentes (por exemplo
  regras/solver, interface, testes/docs), só de leitura, em paralelo, e juntar os achados numa
  lista única para UMA rodada de correção.
- **Decisões:** técnicas, você toma e registra (no spec, seção "Decisões tomadas na execução");
  de produto, ao usuário, em texto, com opções numeradas e a recomendada primeiro. Ele responde
  em uma linha ("A1 B2").

## Avisos que valem para este trabalho

- **`src/regras/` é a fonte única das restrições de célula**, usada pelo solver e pela grade
  manual. **`src/solver/conferir.ts` é auditor independente e não importa `src/regras/`**: a
  mudança do sábado tem de ser feita nos dois lugares, de propósito.
- **Solver v1 não é substituído** (o v2 é o subprojeto 3). A mudança do sábado é mudança de
  regra pedida pelo usuário, não otimização: mexa no mínimo no solver (custo e ordenação de
  candidatos) e **atualize a linha de base** em `testes/benchmark/linha-de-base.md` sem apagar a
  antiga (`npm run bench:solver`).
- **Migração publicada nunca é editada.** Este trabalho não precisa de migração.
- **Toda escrita da grade passa por `historico.executarNaGrade`** (nunca `transacao` direto,
  nunca `{ origem: "grade" }` na mão). Escrita de cadastro zera o histórico; a confirmação da
  ação diz isso.
- **Contratos dos e2e:** célula com `aria-label` "Segunda, M1"; abas de período com
  `aria-pressed`; botão direito fixa; barra lateral é `navigation` com `button`s.
- **Três regras do design:** identidade nunca é cor; nenhum estado só por cor; desabilitado sem
  `opacity`. Nunca `font-medium` nem `leading-[razão]`. Altura de controle é a do componente
  (28 px).
- **Capturas visuais:** as da grade manual vão mudar (a massa tem problemas). Guardar as antigas
  fora do repositório, regerar só as afetadas, abrir uma contra a outra e descrever cada
  diferença. A captura usa um contorno (repinta a barra lateral antes da foto) por uma oscilação
  de 1 pixel cuja causa não foi isolada.
- **Playwright:** reaproveita o servidor da porta 1420; se um teste falhar sem motivo, procure
  um `vite` antigo. Rodar logo depois de outra rodada pode dar `ERR_CONNECTION_REFUSED` no
  primeiro teste.
- **CLI do shadcn**, se precisar de componente novo: ele importa `cn` do pacote npm `cn`;
  troque por `@/lib/utils` e desfaça `package.json`/`package-lock.json`.
- **Textos, comentários e commits em pt-BR**, com o trailer `Co-Authored-By` do modelo que de
  fato escreveu. Nenhum nome próprio em código, comentário ou teste além dos genéricos da massa.
- **Comandos:** `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run test:visual`,
  `npm run test:navegador`, `npm run build`, `npm run build:web`, `npm run bench:solver`.

## Arquivos que o trabalho toca (ponto de partida)

| Parte | Arquivos |
|---|---|
| Vocabulário | `src/paginas/grade-manual/Diagnostico.tsx` (texto), `README.md`, `docs/regras.md`, `docs/superpowers/notas/conversao-de-telas.md` |
| Sábado | `src/regras/impedimentos.ts` (checagem D14), `src/solver/conferir.ts` (`turno-forcado`), `src/solver/custo.ts` (`contraturno`, `excessoDeContraturno`), `src/solver/solver.ts` (`pontuar`), `src/paginas/disciplinas/EditorDisciplina.tsx` (dica do turno forçado), `docs/regras.md` (D14), `testes/benchmark/linha-de-base.md` |
| Grupos | `src/paginas/grade-manual/usarGrade.ts` (`violacoes` passa a devolver `Motivo` cru), novo `problemas.ts` + `problemas.test.ts`, `src/regras/descrever.ts` (texto curto, continua para a célula) |
| Painel e ações | `Diagnostico.tsx` (vira o painel), `src/paginas/grade-manual/index.tsx`, `acoes.ts`, `src/regras/reatribuir.ts` (`reatribuirSalas`, só usar), `src/App.tsx` (`aoNavegar` com alvo), `src/paginas/disciplinas/index.tsx` e `src/paginas/Professores.tsx` (abrir o editor pelo alvo), `src/paginas/disciplinas/salvar.ts` (gravar o requisito de sala pelo caminho de sempre) |
| Marcar na grade | `Celula.tsx`, `Malha.tsx`, as abas em `grade-manual/index.tsx`, `src/estilos/grade.css`, capturas em `testes/visual/` |
