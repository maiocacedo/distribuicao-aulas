# Handoff — subprojeto 2 (refatoração visual), execução em andamento

Data: 2026-10-11 · Branch: `refatoracao-visual` (a partir de `main` @ `eefaf79`) · Sem remoto; nada foi mesclado.

## Prompt para colar na nova sessão

> Vamos continuar a execução do subprojeto 2 (refatoração visual) do app Distribuição de
> Aulas. Leia primeiro `docs/superpowers/handoff/2026-10-11-subprojeto-2-execucao.md`,
> depois o registro local `.superpowers/sdd/progress.md`. O plano está em
> `docs/superpowers/plans/2026-10-11-refatoracao-visual.md` e o spec em
> `docs/superpowers/specs/2026-10-11-refatoracao-visual-design.md`. Siga a skill
> subagent-driven-development a partir do ponto de retomada descrito no handoff, sem
> pausas entre tarefas.

## Onde parou

**Primeiro passo da próxima sessão: revisar a tarefa 9.** Ela está implementada e
commitada (`3a790b8..84cb254`), com os testes verdes segundo o implementador, mas **não
passou pela revisão**: a execução foi pausada a pedido do usuário logo depois de o
implementador terminar.

- Pacote de revisão já gerado: `.superpowers/sdd/review-3a790b8..84cb254.diff`.
- Resumo da tarefa: `.superpowers/sdd/task-9-brief.md`. Relatório do implementador:
  `.superpowers/sdd/task-9-report.md`.
- Pontos que o implementador levantou e que o revisor deve julgar:
  1. O gatilho do `Seletor` tem 28 px e o `<select>` antigo tinha 30 px, o que desloca a
     tela de Regras em 2 a 3 px. Ele ficou com a regra de densidade; na tela piloto o
     campo de busca ficou com 30 px, pela identidade. Decidir um critério só.
  2. Em Períodos, o motivo de "Remover o último" virou texto visível ao lado do botão,
     o que altera a captura. O guia manda `BotaoIcone` com `aria-disabled` e `motivo`.
  3. Cinco correções fora do pedido: validação do número do contraturno, `key` no campo
     para acompanhar o banco ao trocar de curso, campo de padrão novo que só limpa se
     gravou, `useRef` no temporizador do "salvo", botões de Períodos só depois da carga.
  4. Seções com `shadow-[inset…]` em vez de `border`, e `h2` com `font-bold`.
- Depois da revisão (e da correção, se houver): registrar a tarefa 9 como completa em
  `progress.md`, levar ao guia o que a seção "Para o guia" do relatório trouxer, e seguir
  para a tarefa 10.

| Onda | Tarefa | Estado |
|---|---|---|
| 0 · Rede | 1. Auxiliares de e2e | completa |
| | 2. Capturas de referência | completa |
| 1 · Fundação | 3. Tailwind, tema e isolamento do CSS antigo | completa |
| 2 · Interação | 4. Diálogo de confirmação | completa |
| | 5. Casca, toasts, alerta e seletor | completa |
| 3 · Cadastros | 6. Professores (piloto) e o molde de lista e formulário | completa |
| | 7. Salas e a barra de filtros | completa |
| | 8. Tipos de disciplina e Cursos | completa |
| | 9. Períodos e Regras | **implementada, revisão pendente** |
| | 10. Indisponibilidades e o `grade.css` | por fazer |
| | 11. Disciplinas | por fazer |
| 4 · Grade | 12. Histórico de desfazer | por fazer |
| | 13. Grade manual dividida, controles novos e desfazer | por fazer |
| | 14. Arrastar na grade manual | por fazer |
| | 15. Grade automática | por fazer |
| 5 · Fecho | 16. E2E herdados que faltavam | por fazer |
| | 17. Apagar o legado, documentação e verificação final | por fazer |

Depois da tarefa 17: revisão final do branch inteiro (modelo mais capaz, um pacote
`review-package $(git merge-base main HEAD) HEAD`), uma única rodada de correção com
todos os achados, e a skill finishing-a-development-branch.

## Verificação (HEAD em `84cb254`)

- Conferido por mim em `3a790b8` (fim da tarefa 8): typecheck verde; Vitest 150; e2e 78;
  capturas 26/26 sem regerar; `npm run build` verde.
- Em `84cb254` (tarefa 9), **relatado pelo implementador e ainda não conferido por
  revisão**: typecheck verde; Vitest 150; e2e 78; capturas 26 (as quatro de Períodos e
  Regras regeradas de propósito); build verde. Ele viu, em rodadas diferentes, falhas de
  1 pixel em duas capturas de telas não tocadas (Automática e Salas, claro), que passaram
  ao repetir.
- `cargo fmt`, `clippy` e o smoke não foram rodados neste subprojeto (nada mudou em
  `src-tauri/`). O smoke fica para a tarefa 17.
- `src/estilos/legado.css` está com 1 404 linhas (eram 1 829).

## O que já existe (use, não refaça)

- **Rede de testes.** `testes/e2e/paginas.ts`: `irPara`, `celula`, `contar`, `linhaCom`,
  `escolher(campo, opcao)`, `escolhida(campo)`, `responderConfirmacoes(page, resposta)`
  (no máximo uma vez por teste; responde o diálogo novo por um observador na página).
  Projeto Playwright `visual` (`npm run test:visual`): 26 capturas, claro e escuro, com
  `maxDiffPixels: 0` e `threshold: 0.01`; o spec estaciona o ponteiro antes de fotografar.
- **Fundação.** Tailwind v4 só varre `src/`. `src/estilos/tema.css` tem os tokens (mesmos
  valores de antes), o mapeamento do shadcn, `line-height: normal` na base e `--font-mono`.
  `src/estilos/legado.css` vale só dentro de `.legado`, numa camada abaixo dos
  utilitários; o isolamento é de mão única (leia o comentário de abertura dele).
- **Casca.** `src/App.tsx`: cada página tem `legado: boolean`; a antiga é desenhada dentro
  de `<div className="legado">`. Hoje estão fora do legado: Professores, Salas, Tipos e
  Cursos, e também Períodos e Regras (tarefa 9, ainda sem revisão). Continuam antigas: Disciplinas, Indisponibilidades, Grade manual e Grade automática.
- **Molde.** `src/componentes/`: `confirmacao` (`useConfirmar`), `toasts` (`avisar`),
  `alerta`, `seletor`, `campo`, `botao-icone`, `estado-vazio`, `cabecalho-pagina`,
  `dialogo-formulario` (`DialogoFormulario`, `useAlterado`), `tabela-dados` (`useTabela`,
  `TabelaDados`, `pertence`, `normalizar`, `compararValores`, `ordenarPorDesempate`),
  `barra-de-filtros`. Componentes do shadcn em `src/componentes/ui/`.
- **Guia das conversões:** `docs/superpowers/notas/conversao-de-telas.md` (cópia do
  `.superpowers/sdd/notas-telas.md`). Assinaturas reais, padrão de página, armadilhas e
  as classes que igualam a captura antiga. Todo implementador de tela lê isto antes.

## Como retomar a execução

Arquivos locais, fora do git (`.superpowers/sdd/`, ignorada):

| Arquivo | Para quê |
|---|---|
| `progress.md` | registro por tarefa (commits, decisões) e a lista de "Menores" para a revisão final triar |
| `task-N-brief.md` | resumo de cada tarefa, extraído do plano e já com as correções de nomenclatura |
| `restricoes.md` | restrições globais e a receita de conversão de tela |
| `notas-telas.md` | o guia das conversões (original; a cópia no git é a de `docs/superpowers/notas/`) |
| `task-N-report.md` | relatório de cada implementador, com as seções de correção |

Se a pasta sumir, tudo se refaz a partir do plano: os resumos saem com o `awk` abaixo (o
roteiro `task-brief` da skill procura "Task N" e o plano usa "Tarefa N"); o registro se
reconstrói com `git log` e com a tabela deste handoff.

```bash
awk -v n="$N" '
  /^```/ { cerca = !cerca }
  !cerca && /^## Onda/ { natarefa = 0 }
  !cerca && /^###[ \t]+Tarefa[ \t]+[0-9]+/ { natarefa = ($0 ~ ("^###[ \t]+Tarefa[ \t]+" n "([^0-9]|$)")) }
  natarefa { print }
' docs/superpowers/plans/2026-10-11-refatoracao-visual.md > .superpowers/sdd/task-$N-brief.md
```

Ciclo usado em cada tarefa, e que funcionou:

1. Anotar o commit de base. Despachar o implementador com: o resumo, `restricoes.md`, o
   guia (para conversões de tela), o que o resumo não sabe das tarefas anteriores, e o
   caminho do relatório. Modelo: `sonnet` para conversão de tela; `opus` para as tarefas
   delicadas (foram a 3 e a 6; a 13 e a 14 devem ser também).
2. `review-package BASE HEAD` (roteiro da skill) e despachar o revisor com resumo,
   relatório, pacote e as restrições que pesam na tarefa. Pedir veredito sobre cada
   desvio que o implementador declarou.
3. Corrigir Críticos e Importantes num despacho só; rerrevisar. Menores que seriam
   copiados pelas telas seguintes também entram na hora; os demais vão para a lista de
   `progress.md`.
4. Registrar a tarefa em `progress.md` e, se a tela ensinou algo novo, atualizar o guia.

Todo despacho de tela diz ao implementador para guardar cópias das capturas antigas fora
do repositório antes de regerar, comparar abrindo as imagens e listar no relatório cada
diferença que restou.

## Decisões tomadas durante a execução

Ainda não estão no spec; a tarefa 17 manda acrescentá-las à seção "Decisões tomadas sem
o usuário".

1. **Capturas com tolerância mínima de cor** (`threshold: 0.01`): com zero, um ícone da
   barra oscilava um ou dois níveis no antisserrilhamento entre execuções. Uma troca de
   16 níveis num token derruba as 13 capturas do tema.
2. **O Tailwind varre só `src/`.** Lia os planos em Markdown e gerava ~150 utilitários.
3. **A cor do poço no tema é `bg-poco`.** `bg-inset` colidia com o `ring-inset` nativo.
4. **Botão de perigo com `text-primary-foreground`**, não branco: o negativo do tema
   escuro é claro e o branco dava 2,4:1.
5. **Altura de linha `normal` na base**, como nas telas antigas; o padrão do Tailwind
   (1,5) deixava toda tela convertida mais alta que a referência.
6. **`color-scheme: light dark` na raiz**: no tema escuro a barra de rolagem da janela
   passa a ser escura. As capturas não veem. O usuário viu e aprovou.
7. **`Seletor` no desenho do `Input`** (fundo de poço), como eram `input` e `select` nos
   formulários antigos. O da barra lateral sobrescreve no ponto de uso.
8. **O foco volta ao elemento de origem** ao fechar diálogo de formulário e confirmação.
   A linha da tabela é identificada pelo `id` do registro, para o foco não cair no botão
   de outra linha depois de uma remoção.
9. **`BotaoIcone` desabilitado usa `aria-disabled` e `motivo`**: continua focável e a
   dica explica por quê. Com `perigo`, é sempre da cor de negativo, como era.
10. **Formulários com `noValidate`**: a bolha nativa do navegador passava na frente da
    mensagem do campo. Toda restrição de campo tem validação própria.
11. **Estado vazio de busca ou filtro:** "Nenhuma <coisa> encontrada." com o botão
    "Limpar busca e filtros" (o da barra de filtros chama-se "Limpar filtros").
12. **Toast de reatribuição de sala sempre que há aula reatribuída**, também quando a
    mesma gravação apagou outras.
13. **Campo de busca com 30 px de altura**, não 28: é a altura da tela antiga, e a
    identidade prevaleceu sobre a regra de densidade.
14. **Ilha `.legado` no formulário de Tipos**: o requisito de sala e as propriedades da
    disciplina são compartilhados com a tela de Disciplinas e só são convertidos na
    tarefa 11.

## Avisos para as tarefas que faltam

- **Tarefa 10 (Indisponibilidades).** Ao tirar regras de `.legado` para o `grade.css`,
  elas perdem o `revert`: o que a tabela herdava do navegador precisa ser declarado.
- **Tarefa 11 (Disciplinas).** Além do `RequisitoSala`, converter também
  `PropriedadesDisciplina` (compartilhado com Tipos) e tirar a ilha `.legado` de
  `src/paginas/Tipos.tsx`. O resumo cita só o `RequisitoSala`. O e2e de Tipos
  (`testes/e2e/tipos.spec.ts`) cobre o formulário e acusa regressão.
- **Tarefa 13 (Grade manual).** É o primeiro uso real do `BotaoIcone` desabilitado
  ("Remover aula" em aula fixada): trazer o e2e que confirma clique, Enter e Espaço
  inertes e a dica com o motivo. O spec visual acha a pendência incompleta pelo texto de
  progresso "n/m" e espera o texto "N de M posições ocupadas": manter os dois.
- **Tarefa 17.** Tirar o `stopPropagation` do Esc em `confirmacao.tsx` (só protege o
  `Modal` antigo) e o ramo nativo de `escolher`/`escolhida`.
- **CLI do shadcn.** Em toda execução ele gerou `import { cn } from "cn"` e pôs o pacote
  `cn` no `package.json`. Trocar por `@/lib/utils` e desfazer `package.json` e
  `package-lock.json`. Conferir que `tema.css` e `components.json` não mudaram.
- **Playwright.** Rodar logo depois de outra rodada pode dar `ERR_CONNECTION_REFUSED` ou
  timeout de clique no primeiro teste (servidor de dev sob estresse). Rodar de novo antes
  de concluir que é defeito.
- **Nunca `font-medium`** (nesta fonte sai como semi-negrito) **nem `leading-[razão]`**
  (1 ou 2 px de diferença se acertam no preenchimento).

## Decisões de produto do usuário (2026-10-11)

As duas que estavam em aberto foram respondidas. Entram no spec, na tabela "Decisões de
produto", junto com as decisões da execução (tarefa 17).

1. **"Remover" do último curso: manter por enquanto.** Continua clicável e avisa por
   toast, como antes. Desabilitar com o motivo na dica fica para depois, se ele pedir.
2. **Barra de rolagem escura no tema escuro: agrada.** Fica como está (decisão 6 acima).

## Restrições que continuam valendo

- Textos, comentários e commits em pt-BR. Nenhum nome próprio em código, comentário ou
  teste (só os nomes genéricos que os testes já usam).
- As três regras do design (identidade nunca é cor; nenhum estado só por cor;
  desabilitado sem `opacity`) e identidade visual mantida.
- Não mexer em `src/solver/` nem em `src/regras/` além do que a tarefa pedir. Nenhuma
  migração; nada em `src-tauri/`.
- `@tanstack/react-table` na versão 8.
- Commits com trailer `Co-Authored-By` do modelo que de fato escreveu. Sem `git push`.
- O banco real continua na versão 9; a migração 010 roda na primeira abertura do app com
  este código. Guardar cópia de `%APPDATA%\br.edu.utfpr.distribuicaoaulas\distribuicao.db`
  antes de abrir o app de produção.

## Menores acumulados (para a revisão final triar)

Cópia da lista de `.superpowers/sdd/progress.md` na data deste handoff.

- T1 · testes/e2e/paginas.ts, ramo nativo de `escolher`: lê as opções uma vez, sem esperar (some na tarefa 17, quando o ramo nativo sai).
- T1 · localizador do Período do diálogo repetido em bugs-conhecidos.spec.ts e disciplinas.spec.ts.
- T2 · testes/visual/telas.spec.ts:30-31 e :53: comentários longos ou na mesma linha da entrada; :77-83 `allInnerTexts()` só é seguro por causa do gate anterior (falta comentário ligando os dois).
- T3 · tema.css: `color-scheme: light dark` no :root escurece a barra de rolagem da janela no tema escuro (fora de .legado). Aprovado pelo usuário em 2026-10-11; só falta registrar no spec.
- T3 · ilhas `.legado` dentro de diálogo novo (tarefa 8, RequisitoSala em Tipos) herdam text-align/font-weight/letter-spacing do ancestral Tailwind; avaliar `:where(.legado) { all: initial; display: block; }` no contêiner.
- T3 · `npm run typecheck` não cobre vite.config.ts nem vitest.config.ts (lacuna anterior ao subprojeto).
- T4 · src/paginas/Instituicao.tsx: `removerPadrao` ficou entre o JSDoc de `partes` e a função (corrigir na tarefa 9, que converte a tela).
- T4 · confirmacao.tsx: `stopPropagation` do Esc sem teste de regressão; remover quando não houver mais Modal antigo (tarefa 17).
- T4 · paginas.ts `responderConfirmacoes`: o texto devolvido inclui os rótulos dos botões.
- T4 · alert-dialog.tsx: cabeçalho centraliza abaixo de 640 px (corrigir na tarefa 5); sobras do CLI não usadas (AlertDialogMedia, size sm, Trigger).
- T4 · telas.spec.ts: a captura "Confirmação" depende de um professor da massa sem disciplina, citado pelo nome genérico da massa.
- T5 · App.tsx:218 e :231: `leading-[1.4286]` e `leading-[1.3333]` recompõem calibração antiga da barra; melhor em px ou reajustando o preenchimento. Não copiar como padrão.
- T5 · tema.css: as linhas `--text-*--line-height: normal` do @theme não têm comentário próprio.
- T5 · casca.spec.ts: `expect(await escolhida(...))` sem nova tentativa; `toHaveCount(3)` supõe 1 curso na massa.
- T5 · seletor.tsx: comentário de borda impreciso quando há `exibir`.
- T5 · playwright.config.ts: comentário do threshold diz "qualquer troca de cor"; a causa da oscilação do ícone não foi identificada.
- T5 · select.tsx:79: `h-[var(--radix-select-trigger-height)]` sem efeito (o Radix põe flex inline).
- T5 · alerta.tsx: aviso e sucesso compartilham role=status (o tom só se distingue pelo texto para leitor de tela).
- T5 · sonner.tsx: botão de fechar do toast de erro sem estilo próprio; conferir no tema escuro quando `avisar.erro` passar a ser usado (tarefa 6).
- Infra · bateria de 10 execuções do visual teve 2 falhas não visuais (timeout de clique, ERR_CONNECTION_REFUSED): servidor de dev sob estresse.
- T6 · tabela-dados.tsx: unicidade do id depende só de documentação (sem `idDaLinha` opcional nem aviso de id repetido).
- T6 · sem teste permanente: BotaoIcone desabilitado (o primeiro uso real traz o e2e — tarefa 13) e o laço do autoResetPageIndex.
- T6 · foco depois de renomear pode cair no body quando a lista reordena.
- T6 · tamanhos fora da escala por identidade (estado-vazio 12 px, table 10 px); placeholder em tx3 (2,6:1 no claro); `peer-disabled` do Label sem efeito dentro de Campo; "×" e alerta rolam junto em formulário longo; campo de busca perdeu o "por nome".
- T6 · button.tsx `size: sm` com px-2 sem a compensação da borda.
- T7 · sala com tipo fora de TIPOS_SALA não é filtrável (opções fixas); em Disciplinas, derivar opções dos valores existentes quando fizer sentido.
- T7 · barra-de-filtros.tsx: `String(valor)` como chave faz true e "true" colidirem (improvável).
- T7 · o teste das fixadas em salas.spec.ts já passava antes (só fixa o comportamento).
- T8 · sem e2e para as validações novas de inteiro (máximo de dias em Professores, capacidade em Salas, conversão decimal em Cursos).
- T8 · Cursos.tsx: `aoMudarLista()` não é aguardado nem tratado dentro de `carregar` (já era assim).
- T8 · "Remover" do último curso: decidido pelo usuário em 2026-10-11, manter o toast por enquanto. Nada a fazer.
- T9 · test:visual teve falhas de 1 pixel em telas não tocadas (Automática claro, Salas claro), em rodadas diferentes; passou ao repetir. Com maxDiffPixels 0 a rede fica sujeita a esse ruído: avaliar uma folga mínima de pixels.
