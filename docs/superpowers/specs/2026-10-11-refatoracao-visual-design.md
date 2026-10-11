# Subprojeto 2 — Refatoração visual

Data: 2026-10-11 · Branch: `refatoracao-visual` · Status: decisões de produto e a parte 1
do desenho aprovadas; o usuário autorizou seguir sem pausas até a execução (ver
"Decisões tomadas sem o usuário")

## Objetivo

Trocar a base da interface sem trocar a cara dela. O app continua com a identidade de
`docs/design/` (cores, densidade, as três regras de cor), mas passa a ser montado com
shadcn/ui sobre Tailwind, TanStack Table, dnd-kit, lucide-react e Sonner. O que muda aos
olhos é comportamento: diálogo próprio no lugar do `confirm()`, toasts, filtros, arrastar
na grade manual e desfazer. As heurísticas de Nielsen são o critério de cada mudança.

Não há migração de banco nem mudança no lado Rust.

## Decisões de produto

| Tema | Decisão | Origem |
|---|---|---|
| Identidade visual | **Mantida.** Cores, densidade (13 px, Segoe UI) e as três regras do design viram o tema do shadcn. Cor não identifica disciplina, professor nem sala | brainstorming |
| Arrastar na grade manual | Pendência → célula vazia aloca; aula → célula vazia move; aula → painel de pendências remove. Soltar sobre outra aula não faz nada (sem troca) | brainstorming |
| Durante o arrasto | As células se pintam como hoje (apta ou impedida, com o motivo escrito), pelo `impedimento` do módulo de regras | brainstorming |
| Aula fixada | Não arrasta; é preciso soltar o cadeado antes | brainstorming |
| Clique | Continua valendo: pendência, depois célula | brainstorming |
| Desfazer | Só nas ações da grade, com histórico em memória da sessão: toast, Ctrl+Z e botão nas duas telas de grade | brainstorming |
| Confirmação na grade | Alocar, mover, remover e trocar sala ficam sem confirmação. Limpar período e aplicar a grade gerada mantêm a confirmação e também entram no histórico | brainstorming |
| Cadastros | Continuam com confirmação antes, agora em diálogo próprio; sem desfazer | brainstorming |
| Tabelas | TanStack Table nas cinco listas; busca em todas as colunas de texto; filtros por coluna com chips em Disciplinas e Salas; sem paginação nem colunas ocultáveis | brainstorming |
| Caminho técnico | shadcn tela a tela, com o `App.css` isolado até a última tela ser convertida | brainstorming |
| Tema claro/escuro | Segue o sistema, sem seletor | parte 1 do desenho |
| Fonte | Segoe UI do sistema; nada empacotado | parte 1 do desenho |
| Rede de segurança visual | Capturas de tela no Playwright, com referência no git, rodando só localmente | parte 1 do desenho |
| Quebra de arquivos | `Disciplinas.tsx` e `GradeManual.tsx` são divididas ao serem convertidas; as demais telas só mudam o necessário | parte 1 do desenho |

### Decisões tomadas sem o usuário (revisar)

O usuário aprovou a parte 1 do desenho e pediu para seguir sem pausas. Estas são minhas:

1. **Clicar numa aula deixa de removê-la.** Com o arrasto, um aperto sem movimento sobre
   a aula viraria remoção por engano. A aula ganha dois botões visíveis no pouso do mouse
   e no foco: "Remover aula" e "Fixar"/"Soltar". O botão direito continua fixando, como
   atalho. Na aula fixada o botão de remover fica desabilitado, com a explicação na dica.
2. **Arrasto só com ponteiro.** O teclado usa o caminho do clique: a pendência é um botão
   e a célula vazia passa a ser um `<button>`, alcançável por Tab. O sensor de teclado do
   dnd-kit fica de fora: sem coordenadas próprias ele anda de 25 em 25 px, o que não
   serve numa malha.
3. **Mover leva a sala** quando ela continua válida e está livre no destino; senão vale
   a regra de sempre (`escolherSala`: vizinha, ideal, aceitável). A avaliação do destino
   é feita com a aula de origem fora da ocupação, para ela não conflitar consigo mesma.
4. **Soltar em célula impedida ou fora da malha** não grava nada. Em célula impedida, um
   toast repete o motivo que a célula já mostrava.
5. **Toast com "Desfazer" só em remover, limpar período e aplicar a grade gerada.**
   Alocar, mover, trocar sala e fixar entram no histórico em silêncio, porque o
   resultado já está na tela e um toast por aula alocada vira ruído.
6. **Fixar e soltar também entram no histórico**, para Ctrl+Z valer para toda mudança na
   grade, sem exceção a decorar.
7. **O histórico guarda a grade inteira do curso** antes de cada ação e restaura
   apagando e reinserindo. É mais simples que guardar o inverso de cada ação e não tem
   como ficar incoerente. Limite de 50 entradas.
8. **O histórico zera** quando qualquer escrita que não seja da grade acontece (cadastro,
   indisponibilidade, regras), quando o curso selecionado muda e quando o app fecha. Uma
   restauração que falhe (chave estrangeira, por exemplo) avisa em toast e zera o
   histórico.
9. **Sem "Refazer".** Ctrl+Z desfaz; não há Ctrl+Y.
10. **Regra única de mensagem:**
    - validação de formulário: junto do campo, até ser corrigida;
    - recusa com explicação (lista de choques, turno em uso): alerta dentro do diálogo
      ou da página, porque é texto para ler;
    - falha de gravação numa ação sem formulário (grade, remover em lista): toast de
      erro, que fica até ser fechado;
    - falha de carga da página: alerta na página;
    - sucesso com efeito que não se vê (aulas reatribuídas, grade aplicada): toast.
11. **Diálogo de formulário não fecha no clique fora.** Esc e Cancelar fecham; se houver
    alteração não salva, pedem confirmação de descarte. Hoje um clique fora perde o que
    foi digitado.
12. **A confirmação troca em todas as 12 chamadas de uma vez**, antes de qualquer tela
    ser convertida: o diálogo novo é desenhado fora do contêiner antigo e funciona igual
    sobre tela nova ou antiga. Os textos das confirmações não mudam.
13. **Todos os 19 seletores viram o `Select` do shadcn**, atrás de um componente `Seletor`
    que cuida do rótulo acessível e da conversão de valor (número, nulo). Tela a tela.
14. **A troca de sala na célula** vira um `Seletor` direto no nome da sala (um clique abre
    a lista), em vez de botão que se transforma em `<select>`.
15. **A malha da grade manual e a de Indisponibilidades continuam CSS à mão**
    (`src/estilos/grade.css`), sobre os mesmos tokens. São seis estados de célula com
    listras, tracejado e cadeado, que nenhum componente pronto cobre.
16. **Indisponibilidades mantém o gesto de pintar arrastando.** Só troca o estilo e o
    seletor de professor.
17. **Filtros de Disciplinas:** período (substitui o `<select>` de hoje), tipo de
    disciplina, optativa, ofertada e turno forçado. **De Salas:** tipo. Os filtros
    voltam ao padrão ao sair da tela, como a busca de hoje.
18. **Cursos e Tipos ordenam, mas não ganham busca**: são listas de poucas linhas.
19. **Ordenação igual à de hoje**: texto começa crescente, número começa decrescente,
    desempate estável pelo nome, comparação em `pt-BR`.
20. **Ações de linha continuam aparecendo no pouso do mouse e no foco**, como ícone com
    dica e `aria-label`.
21. **Capturas de tela ficam fora do `npm run test:e2e` e do CI.** A renderização de
    fonte muda entre sistemas, e o CI roda em Linux.
22. **Pendências herdadas do subprojeto 1 entram todas** (lista em "Pendências
    herdadas"). A aula órfã é a única que toca `src/regras/`: ganha um texto em
    `descrever.ts`, sem regra nova.
23. **"Grade aplicada" ganha o botão "Abrir a grade manual"**, no lugar da instrução
    escrita. O `App` passa a navegação para a página.
24. **O `package-lock.json` pendente** (`source-map-js` 1.2.2) entrou num commit próprio
    no início do branch.
25. **O spec não passou por revisão do usuário antes do plano**, a pedido dele.

## As três regras do design

Vêm de `docs/design/` e hoje vivem num comentário do `App.css`. Passam a valer como
restrição deste subprojeto e ficam registradas no arquivo de tema:

1. **Identidade nunca é cor.** Disciplina, professor e sala são sempre texto. A cor
   carrega três significados fixos: acento (apto, seleção, ação), negativo (impedimento,
   remoção) e âmbar (tolerado). Não entra uma quarta sem significado novo.
2. **Nenhum estado depende só de cor.** Tracejado, listras, cadeado e rebaixo carregam o
   significado junto.
3. **Desabilitado rebaixa texto e borda**, nunca `opacity` no bloco inteiro: isso embaça
   também o texto que explica por que está desabilitado.

Os componentes do shadcn são ajustados onde contrariam essas regras (o padrão dele usa
`opacity-50` em desabilitado).

## Fundação

**Dependências novas:** `tailwindcss` e `@tailwindcss/vite` (v4), `radix-ui`,
`class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react`,
`sonner`, `@tanstack/react-table`, `@dnd-kit/core`. Tudo empacotado; nada vem de rede em
tempo de execução. O `next-themes`, que o shadcn sugere junto do Sonner, não entra: o tema
segue o sistema.

**Alias `@/` → `src/`** no `vite.config.ts`, no `tsconfig.json`, no `testes/tsconfig.json`
e na configuração do Vitest.

**`components.json`** aponta `ui` para `@/componentes/ui` e `utils` para `@/lib/utils`.

### Pastas

| Caminho | Conteúdo |
|---|---|
| `src/estilos/tema.css` | entrada do CSS: ordem das camadas, Tailwind, tokens claro/escuro, mapeamento para o shadcn, as três regras em comentário |
| `src/estilos/legado.css` | o `App.css` de hoje, restrito ao contêiner `.legado`; apagado na última onda |
| `src/estilos/grade.css` | malha da grade manual e de Indisponibilidades |
| `src/componentes/ui/` | componentes do shadcn, ajustados ao tema |
| `src/componentes/` | compostos do app (lista em "Componentes do app") |
| `src/componentes/legado.tsx` | o `ui.tsx` de hoje, renomeado; encolhe a cada tela e some no fim |
| `src/lib/utils.ts` | `cn` |
| `src/grade/historico.ts` | histórico de desfazer |
| `src/paginas/disciplinas/`, `src/paginas/grade-manual/` | as duas telas divididas |

### Tema

Os papéis de cor de hoje continuam sendo a fonte da verdade, com os mesmos valores no
claro e no escuro. Os nomes do shadcn apontam para eles:

| Token do shadcn | Papel atual |
|---|---|
| `background` / `foreground` | `--bg` / `--tx` |
| `card`, `popover` | `--card` |
| `primary` / `primary-foreground` | `--acc` / `--onAcc` |
| `secondary`, `muted` | `--inset` |
| `accent` | `--hover` |
| `muted-foreground` | `--tx2` |
| `destructive` | `--neg` |
| `border` | `--line` |
| `input` | `--lineC` |
| `ring` | `--acc` |

Os papéis sem par no shadcn (`--panel`, `--lineS`, `--tx3`, `--accBg`, `--accLine`,
`--off`, `--warnDot`, `--stripe`, `--shadow`) também viram cores do tema, para poderem
ser usados como utilitário.

- **Escuro por `prefers-color-scheme`.** A variante `dark:` do Tailwind fica no padrão
  (consulta de mídia); a variante por classe `.dark` que o shadcn gera é removida.
  `color-scheme: light dark` na raiz, para barras de rolagem e controles nativos.
- **Densidade.** Base de 13 px. A escala de texto e as alturas de controle do tema são
  fixadas nos valores de hoje; o padrão do shadcn é mais folgado e não é adotado.
- **Raios:** `--r` (4 px) em controles e `--rp` (6 px) em painéis, como hoje.
- **Anel de foco** só com teclado (`:focus-visible`), afastado da borda, como hoje.

### Isolamento do CSS antigo

```css
@layer theme, base, legado, components, utilities;
@import "tailwindcss";
@import "./legado.css" layer(legado);
```

- Todas as regras do `legado.css` ficam aninhadas em `.legado`. Tela ainda não
  convertida é desenhada dentro de `<div class="legado">`; tela convertida, fora.
- Dentro de `.legado`, o reset do Tailwind é desfeito (`all: revert` com especificidade
  zero, antes das regras antigas), para as telas antigas continuarem contando com os
  padrões do navegador.
- Utilitários do Tailwind vencem o legado por ordem de camada, então um componente novo
  usado dentro de tela antiga (o diálogo de confirmação, o toast) não é afetado.
- Diálogos, seletores e toasts novos são desenhados em portal, fora do contêiner.

**Critério da tarefa de fundação:** as capturas de todas as telas, no claro e no escuro,
saem idênticas às tiradas antes dela.

## Componentes do app

Em `src/componentes/`, cada um com uma responsabilidade:

| Componente | O que faz | Substitui |
|---|---|---|
| `confirmacao.tsx` | `ProvedorDeConfirmacao` e `useConfirmar()`, que devolve `Promise<boolean>`. Opções: `titulo`, `descricao`, `itens` (lista rolável), `confirmar` (rótulo do botão, com o verbo da ação) e `perigo`. Sobre `AlertDialog`. Em ação destrutiva o foco inicial fica em Cancelar | `confirm()` |
| `dialogo-formulario.tsx` | diálogo de edição: título, corpo, rodapé com Cancelar e a ação principal, estado "Salvando…", aviso de descarte com alteração pendente | `Modal` |
| `campo.tsx` | rótulo, dica e erro de um campo, ligados por `aria-describedby` | `Campo` |
| `seletor.tsx` | `Select` do shadcn com rótulo acessível e valores `number`, `string` ou `null` | `<select>` |
| `tabela-dados.tsx` | tabela sobre TanStack Table: ordenação com `aria-sort`, busca global, filtros por coluna, coluna de ações, estado vazio | `<table className="lista">`, `Ordenavel`, `comparar` |
| `filtro-facetado.tsx` | botão que abre a lista de valores de uma coluna com caixas de marcar; os filtros ativos aparecem como chips removíveis, com "Limpar filtros" | — |
| `cabecalho-pagina.tsx` | título, escopo ("deste curso" ou "da instituição"), contagem, busca e ações | `CabecalhoLista`, `.cabecalho-pagina` |
| `alerta.tsx` | mensagem na página ou no diálogo, em três tons (erro, aviso, sucesso) | `Erro`, `.aviso`, `.alerta` |
| `botao-icone.tsx` | botão só com ícone, com dica e `aria-label` | `BotaoIcone`, `Lapis`, `Lixeira` |
| `estado-vazio.tsx` | texto de lista vazia, com o próximo passo quando houver | `Vazio` |
| `toasts.ts` | `avisar.sucesso`, `avisar.erro` e `avisar.desfazer` sobre o Sonner; `mensagemErro` continua traduzindo o erro do SQLite | — |

Toasts no canto inferior direito. Sucesso some em 5 s; com "Desfazer", em 10 s; erro fica
até ser fechado.

## Casca

`App.tsx` mantém a estrutura: marca, seletor de curso, "Gerenciar cursos" e os quatro
grupos. Muda:

- cada item ganha um ícone do lucide e `aria-current="page"` quando ativo;
- o seletor de curso vira `Seletor`;
- o `App` monta `ProvedorDeConfirmacao`, o `Toaster` e o provedor de dicas;
- a página recebe `aoNavegar`, usado pelo botão "Abrir a grade manual";
- a barreira de erro e a falha global do `main.tsx` passam a usar o `Alerta` e o tema.

**Contratos que os testes usam e ficam:** a barra é `navigation`, cada item é um
`button` com o rótulo de hoje.

## Telas de cadastro

Todas trocam `Modal`, `Campo`, `<select>`, `Erro`, tabela e ícones pelos componentes
acima e aplicam a regra única de mensagem. O que cada uma tem de próprio:

| Tela | Próprio dela |
|---|---|
| Professores | lista com busca; recusa de `max_dias_semana` como alerta no diálogo |
| Salas | lista com busca e filtro por tipo; ao mudar o tipo, toast com as aulas que mudaram de sala |
| Tipos de disciplina | lista ordenável |
| Cursos | lista ordenável; caixas de turno num `fieldset` com `legend` e um `label` por caixa |
| Períodos | quadro pequeno, sem TanStack; seletores embutidos na linha |
| Regras | quadro de padrões de bloco e dias letivos; sem TanStack |
| Indisponibilidades | malha em `grade.css`; gesto de pintar mantido |
| Disciplinas | dividida (abaixo); filtros; toast de reatribuição de sala |

### Disciplinas

`src/paginas/disciplinas/`:

| Arquivo | Responsabilidade |
|---|---|
| `index.tsx` | carga, lista, filtros e abertura do editor |
| `colunas.tsx` | definição das colunas e das marcas |
| `EditorDisciplina.tsx` | o formulário, no `dialogo-formulario` |
| `salvar.ts` | `prepararAulas` e a montagem das instruções de gravação, sem JSX |

- A busca olha nome, abreviação e professores.
- "Nova disciplina" continua propondo o período filtrado, quando há exatamente um.
- No diálogo de aulas atingidas, o motivo de sala some quando a aula já tem outro motivo.
- Depois de salvar com reatribuição de sala, um toast diz quantas aulas mudaram de sala e
  quantas delas eram fixadas.

## Grade manual

`src/paginas/grade-manual/`:

| Arquivo | Responsabilidade |
|---|---|
| `index.tsx` | página: cabeçalho, abas de período, diagnóstico, os dois painéis, contexto do arrasto |
| `usarGrade.ts` | carga e os derivados (`Ocupacao`, alocadas, aulas do período, violações) |
| `acoes.ts` | monta as instruções de alocar, mover, remover, trocar sala, fixar e limpar; sem JSX |
| `Pendencias.tsx` | painel de pendências, origem e destino de arrasto |
| `Malha.tsx` | a malha, as faixas de turno e a legenda |
| `Celula.tsx` | os estados da célula e os controles da aula |
| `Diagnostico.tsx` | lista de aulas que violam regra dura |

### Modelo de interação

Há uma **fatia em mãos**, definida de dois jeitos: clicando numa pendência (como hoje) ou
começando um arrasto. Enquanto há fatia em mãos, cada célula vazia mostra se é apta ou
impedida, com o motivo de `impedimento` descrito por `descrever`. Esc solta a fatia e
cancela o arrasto.

| Gesto | Efeito |
|---|---|
| Arrastar pendência incompleta → célula apta | aloca |
| Clicar pendência, depois célula apta | aloca |
| Arrastar aula não fixada → célula apta | move |
| Arrastar aula não fixada → painel de pendências | remove |
| Soltar em célula impedida | nada; toast com o motivo |
| Soltar sobre outra aula, na origem ou fora da malha | nada |
| Botão "Remover aula" | remove |
| Botão "Fixar"/"Soltar", ou botão direito na aula | alterna a fixação |
| Nome da sala na aula | abre o `Seletor` de sala |

- O arrasto só começa depois de 6 px de movimento, para o clique continuar sendo clique.
- Os controles dentro da aula não iniciam arrasto.
- Durante o arrasto, uma cópia do cartão acompanha o ponteiro e a origem fica marcada.
- A legenda ganha a frase: "Arraste uma pendência para um horário, ou clique nela e
  depois no horário."
- Aula sem sala em disciplina que exige sala mostra "sem sala" como `Seletor`, para dar
  onde corrigir.

**Contrato que os testes usam e fica:** toda célula tem `aria-label` "Segunda, M1". A
célula vazia é um `<button>` com esse rótulo; a ocupada é um grupo com esse rótulo, e os
botões ficam dentro dele.

## Histórico de desfazer

`src/grade/historico.ts`, sem React:

```ts
executarNaGrade(cursoId, rotulo, instrucoes): Promise<ResultadoEscrita>
desfazer(): Promise<void>
limpar(): void
assinar(ouvinte): () => void     // para useSyncExternalStore
estado(): { podeDesfazer: boolean; rotulo: string | null; versao: number }
```

- `executarNaGrade` lê as aulas do curso, grava as instruções e empilha
  `{ rotulo, cursoId, antes }`.
- `desfazer` desempilha e, numa transação, apaga as aulas do curso e reinsere `antes`
  (todas as colunas, `fixada` inclusive). Incrementa `versao`, e as telas de grade
  recarregam ao vê-la mudar.
- `src/db.ts` passa a avisar toda escrita a quem assinar, com a origem. `transacao`
  ganha um segundo parâmetro opcional `{ origem: "grade" }`; o comando Rust não muda. O
  histórico assina e zera em qualquer escrita de outra origem.

**Na interface:** botão "Desfazer" no cabeçalho da Grade manual e da Grade automática,
desabilitado com o histórico vazio, com a dica "Desfazer: <rótulo> (Ctrl+Z)". Ctrl+Z vale
nessas duas telas quando o foco não está num campo de texto. Depois de desfazer, um toast
diz o que foi desfeito.

**Rótulos:** "Alocar <disciplina>", "Mover <disciplina>", "Remover <disciplina>", "Trocar
a sala de <disciplina>", "Fixar <disciplina>", "Soltar <disciplina>", "Limpar o Nº
período", "Aplicar a grade gerada".

## Grade automática

- A confirmação de aplicar vira `useConfirmar`, com o mesmo texto.
- A aplicação passa por `executarNaGrade`; o toast "Grade aplicada" traz "Desfazer".
- O aviso de sucesso vira `Alerta` com o botão "Abrir a grade manual".
- O comparativo e a lista de fatias de fora são quadros pequenos, sem TanStack.
- O gerador continua rodando no fio da interface; o Web Worker é do subprojeto 3.

## Heurísticas de Nielsen

| # | Heurística | O que entra |
|---|---|---|
| 1 | Visibilidade do estado | toast em efeito que não se vê; "Salvando…" e "Gerando…"; contagem "12 de 55" com filtro |
| 2 | Linguagem do usuário | vocabulário do domínio mantido; botão com o verbo da ação ("Apagar 3 aulas") |
| 3 | Controle e liberdade | desfazer na grade; Esc e Cancelar em todo diálogo; confirmação de descarte |
| 4 | Consistência | um componente por papel; regra única de mensagem |
| 5 | Prevenção de erro | remover por botão, não por clique na aula; formulário não fecha no clique fora; motivo visível antes de soltar |
| 6 | Reconhecer em vez de lembrar | cadeado como botão visível; chips de filtro; legenda; dica em todo botão de ícone |
| 7 | Flexibilidade e eficiência | arrastar, Ctrl+Z, botão direito, Enter no formulário, busca |
| 8 | Estética minimalista | identidade mantida; ações de linha só no pouso e no foco |
| 9 | Recuperar de erros | `mensagemErro`; motivo por extenso; lista de choques na recusa |
| 10 | Ajuda | dica de campo; legenda da grade; estado vazio com o próximo passo |

## Pendências herdadas do subprojeto 1

- `label` envolvendo o grupo de caixas de turnos (Cursos): `fieldset` e `legend`.
- Aula sem sala em disciplina que exige sala ganha o `Seletor` na célula.
- Aula fixada que troca de sala por edição de cadastro: o toast de reatribuição conta as
  fixadas.
- Aula órfã (sem fatia correspondente) entra no diagnóstico, com texto próprio em
  `src/regras/descrever.ts`.
- Motivo de sala redundante no diálogo de Disciplinas: omitido quando há outro motivo.
- e2e que faltavam: opção "Sem sala", sala vizinha preferida, "Limpar período"
  desabilitado, cancelar a remoção de turno em Cursos, recusa por disciplina com turno
  forçado.

## Testes e critérios de aceite

### Antes de trocar qualquer componente

- `testes/e2e/paginas.ts` ganha `confirmando(page, acao, { aceitar })`, que devolve o
  texto da confirmação, e `escolher(alvo, rotulo, opcao)` / `escolhida(alvo, rotulo)`.
  Os 11 usos de `page.on("dialog")`, o `aceitarConfirmacoes`, os 17 `selectOption` e o
  `option:checked` passam por eles, ainda sobre os controles nativos.
- `escolher` reconhece os dois tipos de seletor (nativo e do shadcn) enquanto as telas
  convivem; o ramo nativo sai na última onda.
- Os seletores por classe (`.modal select`, `.linha-fatia input[type=number]`,
  `locator("tr", …)`) viram seletores por papel e rótulo.
- Projeto Playwright `visual` (`testes/visual/`, `npm run test:visual`): uma captura por
  tela, no claro e no escuro, mais dois estados (editor de disciplina aberto, grade com
  pendência escolhida). Massa fixa, animações desligadas, janela de 1400×900.
  Referências no git. A captura do diálogo de confirmação entra na onda 2, quando ele
  deixa de ser o `confirm()` nativo, que não aparece em captura.

### Por tarefa

- Os e2e existentes continuam verdes ao fim de cada tarefa que mexe em tela.
- Ao converter uma tela, a referência visual dela é regerada de propósito e o par
  antes/depois vai no relatório da tarefa. As telas não tocadas continuam idênticas.

### Novos (Vitest)

- `historico`: empilha e desfaz; restaura `fixada`; zera em escrita de outra origem;
  zera ao trocar de curso; limite de 50; falha na restauração zera e propaga.
- `acoes` da grade manual: mover leva a sala válida e livre; mover troca a sala quando
  a de origem está ocupada no destino; a aula de origem não conflita consigo mesma.
- Ordenação e filtro da `tabela-dados` nas funções puras (desempate estável, `pt-BR`).

### Novos (Playwright)

- Arrastar pendência para célula apta aloca; para célula impedida não grava.
- Arrastar aula para outra célula move e mantém a sala; aula fixada não arrasta.
- Arrastar aula para o painel de pendências remove.
- Clicar na aula não a remove; o botão "Remover aula" remove.
- Desfazer pelo toast, por Ctrl+Z e pelo botão; aplicar a grade gerada e desfazer pela
  Grade manual; o botão desabilita depois de uma alteração de cadastro.
- Confirmação: foco inicial em Cancelar; Esc cancela; a lista de aulas aparece.
- Formulário com alteração: Esc pede confirmação de descarte.
- Filtros de Disciplinas e de Salas: chip aparece, contagem muda, "Limpar filtros" volta.
- Busca de Disciplinas acha pelo nome do professor.
- Toast de reatribuição de sala em Disciplinas e em Salas.
- Os cinco e2e herdados.

### Gerais

- `npm run typecheck`, `npm test` (< 20 s) e `npm run test:e2e` (< 3 min) verdes.
- `npm run build` verde ao fim de cada onda.
- `npm run test:smoke` verde no fim, se houver build de debug disponível na máquina.
- No fim: `src/App.css`, `src/estilos/legado.css` e `src/componentes/legado.tsx` não
  existem; nenhum `confirm(` e nenhum `<select` em `src/`; nenhuma classe `.legado`.
- `README.md` e `docs/regras.md` atualizados onde descrevem a interface (remoção por
  clique, troca de sala na célula).

## Ordem das ondas

| Onda | Conteúdo |
|---|---|
| 0 · Rede | auxiliares de e2e; projeto visual e referências |
| 1 · Fundação | Tailwind, alias, shadcn, tema, isolamento do legado |
| 2 · Interação | confirmação nas 12 chamadas; toasts; componentes do app; casca |
| 3 · Cadastros | Professores, Salas, Tipos, Cursos, Períodos, Regras, Indisponibilidades, Disciplinas |
| 4 · Grade | histórico; grade manual dividida e com os controles novos; arrastar; grade automática |
| 5 · Fecho | pendências herdadas; apagar o legado; documentação; verificação final |

## Riscos

- **O reset do Tailwind sobre as telas antigas.** É o ponto frágil da convivência. A
  tarefa de fundação só termina com as capturas idênticas.
- **`Select` do Radix dentro de cartão arrastável.** O ponteiro precisa parar no seletor;
  coberto por e2e de troca de sala depois de o arrasto existir.
- **WebView2 e Chromium do Playwright** são o mesmo motor, mas não a mesma versão. O
  smoke no fim roda o app de verdade.
- **Banco real.** O app de produção ainda está na versão 9 do banco e a migração 010
  roda na primeira abertura. Este subprojeto não precisa abrir o banco real; quem abrir
  guarda uma cópia antes.

## Fora de escopo

- Troca entre duas aulas por arrasto.
- Desfazer em cadastros; refazer.
- Seletor de tema; fonte empacotada.
- Paginação, colunas ocultáveis, filtros lembrados entre visitas.
- Navegação por setas nas malhas; arrasto por teclado.
- Web Worker para o gerador, B6 e calibração de pesos (subprojeto 3).
- Regra nova em `src/regras/`; qualquer migração de banco.
- Subir o Vitest para a versão 5.
