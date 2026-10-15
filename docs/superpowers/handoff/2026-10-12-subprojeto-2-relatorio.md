# Relatório — subprojeto 2 (refatoração visual), estado final

Atualizado em 2026-10-13. Branch `refatoracao-visual`, 54 commits sobre a `main`, HEAD em
`1774966`. Sem remoto. **Nada foi mesclado na `main`: o merge é decisão sua.**

O registro por tarefa está em `.superpowers/sdd/progress.md` (local, fora do git). O handoff de
2026-10-11, na mesma pasta, traz o ciclo usado em cada tarefa.

## Resumo

As 17 tarefas do plano estão implementadas. Cada uma passou por revisão independente e, quando
a revisão pediu, por correção e rerrevisão. Depois veio a revisão final do branch inteiro, em
três frentes (molde e cadastros; grade; testes e documentação), que não achou nada Crítico, e
uma rodada única de correção com o que ela achou e com as suas decisões de 2026-10-13.

| Onda | Tarefas | Estado |
|---|---|---|
| 0 a 2 · rede, fundação, interação | 1 a 5 | completas |
| 3 · cadastros | 6 a 11 | completas |
| 4 · grade | 12 a 15 | completas |
| 5 · fecho | 16, 17 | completas |
| revisão final e rodada de correção | — | feitas |

## O que está conferido

Rodado pelo orquestrador em `1774966`, depois da rodada final:

| Comando | Resultado |
|---|---|
| `npm run typecheck` | limpo |
| `npm test` | 215 testes, 19 arquivos, 7 s |
| `npm run test:e2e` | 210 testes, 1,7 min |
| `npm run test:visual` | 28 capturas, 30 s |
| `npm run build` | verde (só o aviso de chunk grande, que já existia) |
| critérios de fim do spec | `App.css`, `legado.css` e `legado.tsx` não existem; nenhum `confirm(`, `<select` ou `legado` em `src/`; nenhum `waitForTimeout` nos testes |

**Não conferido, e fica com você:**

1. **O smoke não foi executado.** `npm run test:smoke` foi negado ao agente pelas permissões do
   ambiente. Os seletores do spec do smoke foram trocados sem execução (as classes antigas não
   existem mais); um revisor os conferiu um a um por leitura. O smoke usa um banco numa pasta
   temporária e agora recusa um binário de debug mais antigo que `src-tauri/src/lib.rs`.
2. **Arrasto, botão direito e Ctrl+Z nunca rodaram na janela do Tauri (WebView2)**, só no
   Chromium do Playwright. Ver o roteiro abaixo.
3. `cargo fmt` e `clippy` não foram rodados; nada mudou em `src-tauri/`.

## Como conferir

```bash
npm run typecheck
npm test
npm run test:e2e
npm run test:visual
npm run build
npm run test:smoke
```

O Playwright reaproveita o que estiver na porta 1420: se um teste falhar sem motivo, confira se
não há um `npm run dev` antigo aberto. Rodar o e2e logo depois de outra rodada pode dar
`ERR_CONNECTION_REFUSED` no primeiro teste; rode de novo.

**Antes de abrir o app sobre o banco real**, guarde uma cópia de
`%APPDATA%\br.edu.utfpr.distribuicaoaulas\distribuicao.db`. Isso vale também para
`npm run tauri dev`: o build de debug usa esse mesmo arquivo, a menos que a variável
`DISTRIBUICAO_BANCO` aponte para outro (é o que o smoke faz). O banco real já está na versão
10 do esquema (a cópia de segurança feita em 2026-10-12 tem a migração 010 registrada), então
este código não aplica migração nova nele.

### Roteiro na janela do Tauri

O que mais pode se comportar diferente no WebView2, em ordem de importância:

1. **Os três arrastos:** pendência → célula apta (aloca); aula → outra célula (move, mantém a
   sala, abre o aviso "… movida para …" com Desfazer); aula → painel de pendências (remove).
   **Se todo arrasto morrer ao começar**, o suspeito é a defesa de perda de foco em
   `src/paginas/grade-manual/index.tsx` (o ouvinte de `blur` de `window` registrado ao começar a
   arrastar): o WebView2 estaria disparando `blur` no início do arrasto.
2. **Soltar fora da janela:** arrastar até a borda, soltar o botão lá fora e voltar. A carga não
   pode continuar na mão, e o clique seguinte não pode gravar nada.
3. **Alt+Tab no meio do arrasto:** na volta, a tela responde a cliques e o Ctrl+Z funciona.
4. **Esc com o botão apertado:** cancela; a pendência escolhida antes continua escolhida.
5. **Botão direito:** fixa e solta a aula sem abrir o menu do WebView2; sobre a lista de salas
   aberta, não fixa.
6. **Ctrl+Z nas duas telas de grade:** com a tecla presa desfaz uma ação só; com uma confirmação
   aberta é ignorado.
7. **Seletor de sala na célula:** um clique abre; escolher não começa arrasto.
8. **Escala do Windows em 125% e 150%:** o cartão segue o ponteiro e o destino é a célula sob ele.
9. **Automática → "Aplicar esta grade" → "Abrir a grade manual" → Ctrl+Z:** tudo volta, cadeados
   inclusive.
10. **Indisponibilidades:** pintar arrastando e soltar fora da janela.

### Passada pelas telas

| Tela | O que mudou e vale olhar |
|---|---|
| Períodos | motivo de "Remover o último" em texto; contraturno vazio, negativo ou decimal é recusado e a caixa volta ao valor gravado |
| Regras | falha de gravação agora em toast; "Adicionar padrão" desabilitado diz "Digite a divisão do padrão"; formato inválido aparece junto do campo |
| Indisponibilidades | pintar por arrasto, "Limpar tudo", professor ativo, plural do rodapé |
| Professores, Salas, Tipos, Cursos | em Professores, a busca sem resultado traz "Limpar busca" (Salas já tinha "Limpar busca e filtros"); remover um tipo diz quantas disciplinas ficam sem tipo |
| Disciplinas | filtros com chips (inclusive "Sem tipo" e "Segue o período"); etiqueta "só <tipo de sala>" em Marcas; busca por professor; tirar da disciplina um professor que ainda tem aula na grade é recusado com instrução; a confirmação diz "ficam sem sala" quando é o caso |
| Grade manual | clicar na aula não remove; botões "Remover aula" e cadeado no pouso e no foco; sala pelo seletor da célula; Desfazer no cabeçalho, Ctrl+Z e toast; o rodapé das pendências ensina a remover por arrasto |
| Grade automática | comparativo com "melhor", "pior" ou "igual" em texto; gerar de novo mantém o resultado anterior à vista; "Aplicar" é desfazível e oferece "Abrir a grade manual" |

Uma coisa que nenhuma captura mostra: a etiqueta "só <tipo de sala>" (a massa de teste não tem
disciplina com tipo de sala). Vale olhar com os seus dados.

## Decisões

Todas estão no spec (`docs/superpowers/specs/2026-10-11-refatoracao-visual-design.md`): as
técnicas em "Decisões tomadas sem o usuário", as suas na tabela "Decisões de produto".

Suas, nesta execução:

| Data | Decisão |
|---|---|
| 2026-10-11 | "Remover" do último curso continua avisando por toast; barra de rolagem escura no tema escuro aprovada |
| 2026-10-12 | A1 etiqueta "só <tipo de sala>" desenhada em Marcas; B1 filtros "Sem tipo" e "Segue o período"; D1 a confirmação diz "ficam sem sala"; **C1 + E1: teclado e leitor de tela nas duas malhas (Indisponibilidades e grade manual) numa tarefa própria, depois deste subprojeto, tratando as duas juntas** |
| 2026-10-13 | F2 comparativo em palavras, sem setas; G1 gerar de novo mantém o resultado anterior; H1 "Aplicar" com 0 aulas continua habilitado; I2 erro de gravação de Regras em toast; J2 "Adicionar padrão" desabilitado diz o motivo; K2 mover abre toast com Desfazer; L1 o rodapé das pendências ensina a remover por arrasto; M1 foco depois de arrastar fica para a tarefa de teclado; N1 cartão arrastado onde está; O2 ao mover, a aula mantém a própria sala |

Não há decisão de produto pendente.

Escolhas da rodada final que diferem do que foi pedido, para você saber:

- **F2:** ficou em palavras ("melhor"/"pior"/"igual"), não em diferença com sinal, porque "−2"
  teria a mesma ambiguidade da seta em medidas em que descer é melhor.
- **G1:** o motivo dos botões parados é "Gerando a grade…".
- **L1:** com uma pendência escolhida, a nota do rodapé perdeu o nome da disciplina, para caber
  em duas linhas.
- **Indisponibilidades:** soltar o botão fora da janela encerra o arrasto e grava o que já foi
  pintado.
- **Mover ou remover que não encontra mais a aula** (ela mudou por baixo) só recarrega, sem aviso.
- **Recusa nova em Disciplinas:** "<professor> ainda tem N aula(s) desta disciplina na grade.
  Tire-as na grade antes de tirá-lo da disciplina." ("tirá-lo" tem gênero.)

## Pendências conhecidas

Nenhuma barra o merge. Detalhe em `.superpowers/sdd/progress.md` e
`.superpowers/sdd/rodada-final-report.md`.

- **A captura visual ainda depende de um contorno no teste.** Reservar a altura da caixa do
  curso não bastou: sem o repinte da barra lateral, "claro › Automática" ainda falha por 1 pixel
  na suíte completa. A causa que resta não foi isolada.
- **No smoke, o teste "aplica a chave estrangeira" agora prova a recusa nova de Disciplinas**,
  não a chave estrangeira em si.
- **Um mover ou remover que não toca nenhuma linha ainda entra na pilha do histórico**, como
  ação vazia: um Ctrl+Z a mais sem efeito.
- `grade.css` ainda escreve `Consolas, monospace` seis vezes (o token do tema inclui outra
  fonte, então a troca mudaria o desenho).

Para depois do merge, apontado pela revisão final:

- dividir `src/paginas/grade-manual/index.tsx` (mais de 600 linhas) em `usarArrasto.ts` e
  `usarAcoes.ts`; é movimento puro, e a tarefa de teclado vai mexer nos mesmos arquivos;
- `key={cursoId}` nas páginas que recebem curso e um `setDados` único em `usarGrade`, que
  simplificam a maquinaria de troca de curso e de carga;
- serializar a gravação de Indisponibilidades; carga com geração em Disciplinas e Períodos;
- texto cru do banco ("manha") no editor de Disciplinas;
- as duas alturas de linha fracionárias da barra lateral em pixels (obriga a regerar as 28
  capturas);
- ESLint: o projeto não tem ESLint (os comentários `eslint-disable` que sobravam foram
  removidos); decidir se entra.

## Próximos passos

1. Você: rodar o smoke e fazer o roteiro na janela do Tauri.
2. Decidir o merge de `refatoracao-visual` na `main`.
3. Depois: a tarefa de teclado e leitor de tela nas duas malhas (C1 + E1) e o subprojeto 3
   (solver v2 ao lado do atual, com seletor para comparar).

## Adendo de 2026-10-15: versão de navegador

Pedida pelo usuário antes do merge, no branch `versao-navegador`, criado a partir de
`refatoracao-visual` (11 commits por cima dele; HEAD `4f7a1e7` no fim da implementação). Spec:
`docs/superpowers/specs/2026-10-15-versao-navegador-design.md`.

- `npm run dev` e abrir `http://localhost:1420` num navegador: o app usa um SQLite próprio do
  navegador (WebAssembly, guardado no armazenamento do site). O desktop não muda e não carrega
  nada disso.
- Página "Dados do navegador" (só no navegador): exportar o banco (abre no desktop), importar um
  banco do desktop, carregar os dados de exemplo (a massa anonimizada dos testes), começar vazio.
- Conferido pelo orquestrador em `4f7a1e7`: typecheck limpo, Vitest 251, e2e 211, navegador 17,
  visual 28, build verde. O projeto `navegador` do Playwright roda o app contra o banco do
  navegador de verdade (`npm run test:navegador`).
- Não substitui o roteiro na janela do Tauri: o que ele quer pegar é da janela do desktop.
- Merge: `versao-navegador` contém o `refatoracao-visual` inteiro; mesclar `versao-navegador` na
  `main` leva os dois.
