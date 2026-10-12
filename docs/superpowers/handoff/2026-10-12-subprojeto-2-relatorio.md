# Relatório — subprojeto 2 (refatoração visual), sessão de 2026-10-11/12

Branch: `refatoracao-visual` · sem remoto, nada mesclado na `main` · código em `559cec8`.

Este arquivo substitui, como ponto de retomada, o `2026-10-11-subprojeto-2-execucao.md`. O
registro por tarefa continua em `.superpowers/sdd/progress.md` (local, fora do git).

## Resumo

Das 17 tarefas do plano, **14 estão implementadas**. Nesta sessão foram fechadas as tarefas
9 a 13 (implementadas, revisadas e corrigidas) e a 14 foi implementada e **está em revisão**.
Faltam as tarefas 15, 16 e 17 e a revisão final do branch.

| Onda | Tarefa | Estado |
|---|---|---|
| 0 a 2 | 1 a 5 | completas (sessão anterior) |
| 3 · Cadastros | 6, 7, 8 | completas (sessão anterior) |
| | 9. Períodos e Regras | completa |
| | 10. Indisponibilidades e o `grade.css` | completa |
| | 11. Disciplinas | completa |
| 4 · Grade | 12. Histórico de desfazer | completa |
| | 13. Grade manual: controles novos e desfazer | completa |
| | 14. Arrastar na grade manual | **implementada; a revisão pediu uma correção, pendente** |
| | 15. Grade automática | por fazer |
| 5 · Fecho | 16. E2E herdados que faltavam | testes commitados (`0455907`), sem revisão |
| | 17. Apagar o legado, documentação e verificação final | por fazer |

As decisões A1, B1 e D1 de Disciplinas (ver "Decisões de produto") entraram em `559cec8`,
com teste, sem revisão própria: a revisão final cobre.

## O que confiar e o que conferir

- **Conferido pelo orquestrador:** em `84cb254` (início da sessão), typecheck verde, Vitest
  150 e e2e 78.
- **Relatado pelos implementadores, com revisão independente do código mas sem nova execução
  pelo orquestrador:** todos os números depois disso. A última contagem relatada, em
  `559cec8`: typecheck limpo, **Vitest 199, e2e 162, 28 capturas, build verde**.
- **Não feito nesta sessão:** `cargo fmt`, `clippy` e o smoke (nada mudou em `src-tauri/`);
  e **nenhum teste na janela real do Tauri** — o arrasto só rodou no Chromium do Playwright.

## Como conferir

### 1. A suíte (uns 5 minutos)

```bash
npm run typecheck
npm test
npm run test:e2e
npm run test:visual
npm run build
```

Esperado: tudo verde, com as contagens acima.

Dois ruídos conhecidos, que não são defeito:

- `test:visual`: "claro › Automática" (e, mais raro, "claro › Salas") falha por 1 ou 2 pixels
  num ícone da barra lateral (x=21, y=175). Passa ao repetir. Ficou mais frequente no fim da
  sessão (4 de 6 rodadas numa bateria); está na lista para a revisão final resolver.
- `test:e2e` logo depois de outra rodada: o primeiro teste pode dar `ERR_CONNECTION_REFUSED`
  ou timeout de clique (servidor de dev sob estresse). Rodar de novo.

O Playwright reaproveita o que estiver na porta 1420. Se um teste falhar sem motivo, confira
se não há um `npm run dev` antigo aberto servindo código velho.

### 2. À mão, no app (`npm run tauri dev`)

**Antes de abrir o app de produção sobre o banco real**, guarde uma cópia de
`%APPDATA%\br.edu.utfpr.distribuicaoaulas\distribuicao.db`: a migração 010 roda na primeira
abertura com este código.

Roteiro sugerido, na ordem em que as telas foram convertidas:

| Tela | O que olhar |
|---|---|
| Períodos | o motivo de "Remover o último" aparece em texto ao lado do botão; no contraturno, digitar vazio, negativo ou decimal é recusado e a caixa volta ao valor gravado |
| Regras | a semana só muda depois de gravar; adicionar um padrão de bloco com texto inválido não apaga o que foi digitado |
| Indisponibilidades | pintar por arrasto (uma gravação por arrasto), "Limpar tudo", o professor ativo na lista; rodapé com o plural certo |
| Disciplinas | filtros por coluna com chips (inclusive "Sem tipo" e "Segue o período"), a etiqueta "só <tipo de sala>" na coluna Marcas de quem exige um tipo de sala, busca por nome de professor, "Nova disciplina" já propõe o período filtrado; no editor, salvar com as fatias sem fechar mostra a recusa no grupo; professor já usado aparece como "— já tem fatia"; mudar o requisito de sala de uma disciplina com aulas mostra o toast "N aula(s) mudaram de sala"; trocar de curso limpa busca e filtros |
| Tipos | o formulário não tem mais pedaço com o desenho antigo |
| Grade manual | clicar na aula **não remove mais**; os botões "Remover aula" e cadeado aparecem no pouso e no foco; aula fixada não deixa remover e diz por quê; a sala troca pelo seletor na própria célula; "Desfazer" no cabeçalho e Ctrl+Z; o toast de remover e de limpar traz "Desfazer"; editar um cadastro zera o desfazer; Tab chega às células e Enter aloca |
| Grade manual, arrasto | arrastar pendência para um horário aloca; arrastar aula move e leva a sala (ou troca, se estiver ocupada lá); arrastar aula para o painel de pendências remove; célula impedida mostra o motivo durante o arrasto e não grava; aula fixada não arrasta; Esc cancela; clique simples continua clique. **Vale testar na janela do Tauri**, que não foi exercitada. |

Tema escuro: repita uma passada rápida; as capturas cobrem as 14 telas nos dois temas.

### 3. O código

- `git log --oneline main..refatoracao-visual` — um commit (ou poucos) por tarefa.
- `git diff main...refatoracao-visual --stat` — o tamanho da mudança.
- Relatórios de cada implementador e revisor: `.superpowers/sdd/task-N-report.md`.
- Guia vivo das conversões: `docs/superpowers/notas/conversao-de-telas.md`.

## O que foi feito, por tarefa

Commits desta sessão (`84cb254..559cec8`):

| Commit | Tarefa | O que é |
|---|---|---|
| `5bca9db` | 9 | Correções da revisão: `Secao` e `useSinalDeSalvo` no molde; contraturno validado antes de comparar; `carregando` na troca de curso |
| `5cb1e0d` | 10 | Indisponibilidades convertida; nasce `src/estilos/grade.css` |
| `7dabb2b` | 10 | Correção: e2e da falha depois de gravar; ponte de teste com `falharAPartirDe` |
| `c259a18` | 11 | Disciplinas dividida em quatro arquivos, movimento puro |
| `43cabfb` | 11 | Disciplinas convertida: filtros, busca por professor, toast de reatribuição; `RequisitoSala` e `PropriedadesDisciplina` convertidos |
| `3864375` | 11 | Correções: troca de curso limpa busca e filtros; `data-acusado` no diálogo |
| `8a0b494` | 12 | Histórico de desfazer, literal do plano |
| `b950313` | 12 | Correção de concorrência: fila interna e época |
| `1b71610` | 13 | Grade manual dividida em seis arquivos, movimento puro |
| `2712495` | 13 | Grade manual convertida: botões de remover e fixar, sala pelo seletor, desfazer |
| `36e0097` | 13 | Correções: um toast de desfazer por vez, foco devolvido, guardas de corrida |
| `d67597d` | 14 | Base: a trava de célula conhece o período e dura até a tela mostrar a ação |
| `d71d8af` | 14 | Arrastar para alocar, mover e remover |
| `559cec8` | — | Decisões A1, B1 e D1 em Disciplinas |

Números: `legado.css` caiu de 1 404 para 308 linhas (só a grade automática ainda o usa);
`grade.css` tem 730; e2e foi de 78 para 162; Vitest de 150 para 199; capturas de 26 para 28.

Cada tarefa passou por revisão independente (aderência ao plano e qualidade). Nenhuma
revisão deixou Crítico em aberto. Dois achados Importantes apareceram e foram corrigidos:

- **Tarefa 10:** a mudança no tratamento de falha de Indisponibilidades não tinha teste.
- **Tarefa 12:** o histórico, como estava no plano, se corrompia com chamadas cruzadas
  (duplo Ctrl+Z descartava uma ação sem desfazê-la; duas ações em voo guardavam um "antes"
  velho; cadastro no meio de uma ação deixava registro velho na pilha).

## Decisões tomadas sem você (técnicas)

Vão para a seção "Decisões tomadas sem o usuário" do spec na tarefa 17. As de 1 a 14 estão
no handoff anterior. Novas:

15. **Altura de controle é a do componente (28 px).** Só a busca do cabeçalho tem 30 px, e
    controle em linha de tabela ou célula usa o que couber. Nunca igualar o pixel de um
    campo nativo antigo.
16. **Botão de texto desabilitado diz o motivo em texto visível ao lado** ("Remover o
    último", "Nova disciplina", "Limpar período"); botão de ícone, na dica, continuando
    alcançável pelo teclado.
17. **Período do contraturno vazio é recusado** (antes valia 0).
18. **Indisponibilidades separa falha de gravação (toast) de falha de recarga (erro na
    página).**
19. **"Salvar" do editor de Disciplinas não fica mais desabilitado** quando as fatias não
    fecham: a recusa aparece ao salvar, no grupo, com foco. Duas mensagens de validação
    novas substituem o que o navegador barrava.
20. **O diálogo de formulário traz o erro para a vista** quando o formulário é mais alto que
    a janela.
21. **Histórico com fila e época.** `executarNaGrade` e `desfazer` rodam um por vez; ação
    que cruza com cadastro ou troca de curso fica gravada, mas não é desfazível.
22. **Só o toast mais recente oferece "Desfazer".** O anterior fecha quando o histórico muda.
23. **Ctrl+Z é ignorado com diálogo aberto, com a tecla presa e durante um arrasto.**
24. **O foco volta à célula** depois de alocar ou remover pelo teclado.
25. **Ação repetida na mesma célula é ignorada** enquanto a anterior não terminou.
26. **Na grade manual, "Remover aula" vem antes do cadeado**, e os controles aparecem no
    pouso e no foco de teclado.
27. **Opção "(atual, fora do requisito)" entra na lista de salas** quando a sala atual não
    serve mais, para o seletor não ficar vazio.

Se discordar de alguma, é reversível; diga qual.

## Decisões de produto (suas)

Respondidas em 2026-10-12:

| | Decisão | Estado |
|---|---|---|
| A1 | Desenhar a etiqueta "só <tipo de sala>" na coluna Marcas de Disciplinas | feito em `559cec8`. A massa de teste não tem disciplina com tipo de sala, então **nenhuma captura mostra a etiqueta**; a largura foi conferida com um cenário temporário (Marcas passa de 250 para 311 px, nenhuma linha cresce) |
| B1 | Filtros "Sem tipo" (Tipo) e "Segue o período" (Turno forçado) | feito em `559cec8` |
| D1 | A confirmação diz "Outras N aula(s) ficam sem sala." quando as aulas só perdem a sala | feito em `559cec8` |
| C1 + E1 | **Tarefa própria, depois deste subprojeto, tratando as duas juntas:** teclado e leitor de tela nas malhas — Indisponibilidades (células sem foco nem teclado; "×" e "•" não chegam ao leitor de tela) e grade manual (setas em vez de 72 paradas de Tab) | anotada; fora do subprojeto 2 |

Do handoff anterior: "Remover" do último curso continua avisando por toast; barra de rolagem
escura no tema escuro aprovada.

Ainda sem resposta, sem bloquear: "Adicionar padrão" (Regras) fica desabilitado com o campo
vazio, sem dizer o motivo.

## Onde parou (pausa em 2026-10-12, por limite de uso)

- **Tarefa 14 (arrastar): revisada, precisa de correção, ainda não despachada.** Defeito
  Importante, achado por leitura e não reproduzido: um arrasto que começa e não termina
  (clique com escorregão que cruza os 6 px no último instante) deixa os painéis sem responder
  ao mouse, o Ctrl+Z morto e o Esc engolindo cliques, até trocar de página. A correção e os
  Menores que vão junto estão descritos em `.superpowers/sdd/progress.md`.
- **Tarefa 16: os três e2e estão commitados (`0455907`)**, sem revisão. A investigação da
  captura instável foi interrompida no meio: há uma mudança **não commitada** em
  `testes/visual/telas.spec.ts`, que é experimento; descarte com
  `git checkout testes/visual/telas.spec.ts` ou retome a investigação.
- Faltam: correção e rerrevisão da 14, a captura instável, as tarefas 15 e 17, a revisão final.
- Escolhas de produto abertas sobre o arrasto (o comportamento atual fica até você decidir):
  mover não abre toast; só a frase "Solte aqui para remover" ensina que arrastar para o painel
  remove; depois de arrastar o foco vai para o início da página; o cartão fica 12 px abaixo e à
  direita do ponteiro.

## Como retomar

1. Ler este arquivo e `.superpowers/sdd/progress.md`.
2. **Tarefa 14:** conferir se a revisão terminou (o pacote é
   `.superpowers/sdd/review-36e0097..d71d8af.diff`; o relatório do implementador,
   `task-14-report.md`). Se não houver veredito registrado em `progress.md`, despachar a
   revisão de novo; corrigir o que ela achar; registrar.
3. **Rodada A1/B1/D1:** feita (`559cec8`); relatório em
   `.superpowers/sdd/decisoes-abd-report.md`. Vale acrescentar à massa de teste uma disciplina
   com tipo de sala, para a captura de Disciplinas mostrar a etiqueta (regerar a captura).
4. **Tarefa 15** (grade automática), **16** (três e2e) e **17** (apagar o legado,
   documentação, verificação final e smoke). Resumos em `.superpowers/sdd/task-N-brief.md`.
   Para a 15: `BotaoDesfazer` trata `[role="dialog"]` como modal, o que também casa com
   popover; "Aplicar" grava por `historico.executarNaGrade`.
5. **Revisão final do branch inteiro** com o modelo mais capaz
   (`review-package $(git merge-base main HEAD) HEAD`), apontando a lista de Menores de
   `progress.md`; uma única rodada de correção; e a skill finishing-a-development-branch.

O ciclo por tarefa, os modelos usados e os avisos (CLI do shadcn, Playwright, `font-medium`)
continuam os do handoff anterior.

## Pendências para a revisão final triar

A lista completa está em `progress.md`, seção "Menores". As que mais pesam:

- a captura instável da barra lateral (acima);
- o arrasto não foi testado no WebView2;
- depois de mover ou remover por arrasto o foco cai no início da página;
- lacunas de cobertura e2e em Disciplinas (filtro "Tipo", busca por abreviação, falha de
  gravação no editor) e na grade manual (troca de curso com ação em voo);
- classes repetidas de `fieldset` e de parágrafo de explicação em quatro arquivos;
- `stopPropagation` do Esc em `confirmacao.tsx` e o ramo nativo de `escolher`/`escolhida`,
  que saem na tarefa 17.
