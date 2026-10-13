# Notas para converter uma tela

Estado do molde depois do subprojeto 2. O exemplo vivo é `src/paginas/Professores.tsx`: na dúvida, copie de lá. Restrições e receita em `restricoes.md`.

## Componentes

**`CabecalhoPagina`** (`@/componentes/cabecalho-pagina`)
`{ titulo: string; escopo?: string; sub?: string; contagem?: string; busca?: string; aoBuscar?: (v: string) => void; children?: ReactNode }`
Com `aoBuscar` ou `contagem` é o desenho de lista (uma linha, 12 px até o conteúdo); sem eles, o de página (16 px, `sub` opcional). Os filhos são as ações. Não passe classes.
```tsx
<CabecalhoPagina titulo="Professores" escopo="Instituição · comuns a todos os cursos"
  contagem={`${tabela.getRowModel().rows.length} de ${linhas.length}`} busca={busca} aoBuscar={setBusca}>
  <Button onClick={() => abrir(vazio())}>Novo professor</Button>
</CabecalhoPagina>
```
**`useTabela` / `TabelaDados`** (`@/componentes/tabela-dados`)
`useTabela<T>({ dados: T[]; colunas: ColumnDef<T, any>[]; ordemInicial: SortingState; desempate: (l: T) => string; busca?: string; textoDeBusca?: (l: T) => string; filtros?: ColumnFiltersState; ocultas?: string[] }): Table<T>`
`TabelaDados<T>({ tabela: Table<T>; vazio: ReactNode })`
Também exporta `normalizar(texto)`, `compararValores(x, y)`, `ordenarPorDesempate(dados, desempate)` (a pré-ordenação do `useTabela`: cópia em ordem de `desempate`, pt-BR, estável) e `pertence(linha, coluna, valores)` (a `filterFn` de filtro facetado: lista vazia passa tudo). `meta: { numerico: true }` alinha à direita em fonte fixa; `meta: { centro: true }` centra; os dois juntos servem a coluna numérica centrada. `ocultas` são colunas só para filtrar: o filtro vale com a coluna escondida; passe constante de módulo ou `useMemo`.
```tsx
const colunas = useMemo<ColumnDef<Linha, any>[]>(() => [
  { accessorKey: "nome", header: "Nome", cell: ({ row }) => <span className="font-semibold">{row.original.nome}</span> },
  { accessorKey: "aulas_total", header: "Aulas", meta: { numerico: true }, sortDescFirst: true,
    cell: ({ row }) => contagem(row.original.aulas_total) },
  { id: "preferencia", header: "Preferência de dias", enableSorting: false, cell: … },
  // Coluna de ações: sempre este `id`, sem ordenação, cabeçalho só para leitor de tela.
  { id: "acoes", enableSorting: false, header: () => <span className="sr-only">Ações</span>,
    cell: ({ row }) => (<>
      <BotaoIcone rotulo="Editar" icone={Pencil} aoClicar={() => abrir(row.original)} />
      <BotaoIcone rotulo="Remover" icone={Trash2} perigo aoClicar={() => void remover(row.original)} />
    </>) },
], [abrir, remover]);
const tabela = useTabela({ dados: linhas, colunas, ordemInicial: [{ id: "nome", desc: false }],
  desempate: (l) => l.nome, busca, textoDeBusca: (l) => l.nome });
{carregando ? null : <TabelaDados tabela={tabela} vazio={<EstadoVazio>…</EstadoVazio>} />}
```
**`EstadoVazio`** (`@/componentes/estado-vazio`): `{ children: ReactNode }`. `TabelaDados` mostra o `vazio` também quando a busca não acha nada, então são dois textos, e o da busca oferece limpá-la:
`<EstadoVazio>{linhas.length === 0 ? "Nenhum professor cadastrado ainda." : <>Nenhum professor encontrado. <Button variant="link" onClick={() => setBusca("")}>Limpar busca</Button></>}</EstadoVazio>`

**`DialogoFormulario` / `useAlterado`** (`@/componentes/dialogo-formulario`)
`useAlterado<T>(valor: T | null): boolean`
`DialogoFormulario({ titulo: string; alterado: boolean; salvando?: boolean; erro?: ReactNode; largo?: boolean; aoFechar: () => void; aoSalvar: () => void; children: ReactNode })`
Faz sozinho: o `<form>` tem `noValidate` (nenhuma bolha nativa; ver "Validação" abaixo); não fecha no clique fora; Esc, Cancelar e "×" pedem "Descartar?" se `alterado`; nada fecha nem reenvia com `salvando` (Cancelar fica desabilitado, o "×" só não age); ao fechar devolve o foco a quem abriu; depois de uma tentativa de salvar foca o primeiro elemento com `aria-invalid="true"` ou `data-acusado` (ordem do documento) e, se não há nenhum, traz o alerta do formulário (`role="alert"`) para a vista: formulário mais alto que a janela tem o "Salvar" no fim e o alerta no topo. `data-acusado` é o marcador para o que a recusa aponta e não é campo (botão, grupo): `aria-invalid` não é estado de botão e lhe daria a borda de erro.
```tsx
const alterado = useAlterado(edicao);
{edicao && (
  <DialogoFormulario titulo={edicao.id ? "Editar professor" : "Novo professor"} alterado={alterado}
    salvando={salvando} erro={erroDoFormulario} aoFechar={() => setEdicao(null)} aoSalvar={() => void salvar(edicao)}>
    …`Campo`s soltos, sem margem…
  </DialogoFormulario>
)}
```
**`Campo`** (`@/componentes/campo`): `{ rotulo: string; dica?: string; erro?: string; className?: string; children: (a: AtributosDoCampo) => ReactNode }`. Espalhe `a` (`id`, `aria-describedby`, `aria-invalid`) no controle. Com `erro`, a mensagem toma o lugar da dica.
```tsx
<Campo rotulo="Nome" erro={errosDeCampo.nome}>
  {(a) => <Input {...a} autoFocus value={edicao.nome} onChange={(e) => {
    setEdicao({ ...edicao, nome: e.target.value });
    setErrosDeCampo((erros) => ({ ...erros, nome: undefined }));   // digitou, a mensagem sai
  }} />}
</Campo>
```
**`Seletor`** (`@/componentes/seletor`): `Seletor<V extends string | number | null>({ valor: V; opcoes: Opcao<V>[]; aoMudar: (v: V) => void; rotulo?: string; exibir?: ReactNode; desabilitado?: boolean; className?: string; id?; "aria-describedby"?; "aria-invalid"? })`, com `Opcao<V> = { valor: V; rotulo: string; desabilitada?: boolean }`. O gatilho tem o desenho do `Input`. Opção desabilitada diz o motivo no rótulo (`${p.nome} — já tem fatia`); o gatilho da opção escolhida mostra só o nome.
```tsx
<Campo rotulo="Preferência de distribuição dos dias" dica="…">
  {(a) => <Seletor {...a} className="w-full" valor={edicao.pref_dias} opcoes={PREFERENCIAS}
    aoMudar={(pref_dias) => setEdicao({ ...edicao, pref_dias })} />}
</Campo>
```
**`BotaoIcone`** (`@/componentes/botao-icone`): `{ rotulo: string; icone: LucideIcon; aoClicar: () => void; perigo?: boolean; desabilitado?: boolean; motivo?: string; className?: string }`. `rotulo` é o nome acessível e a dica. `desabilitado` é `aria-disabled`: o botão continua alcançável, o clique não age e a dica mostra o `motivo`. Desabilitou, diga o motivo. Com `perigo`, habilitado, é sempre da cor de negativo; desabilitado fica rebaixado. E2E do desabilitado: `desfazer.spec.ts` (aula fixada) confirma clique, Enter e Espaço inertes e a dica com o motivo; afirme também que a recusa que o clique acenderia (toast) NÃO aparece, senão o teste passa com o botão quebrado se a ação tiver guarda. A classe do desabilitado é `ESTILO_DESABILITADO`, exportada de `botao-icone.tsx`: botão próprio com `aria-disabled` a importa em vez de copiar:
`<BotaoIcone rotulo="Remover" icone={Trash2} perigo desabilitado={impedido} motivo="…por que não pode…" aoClicar={…} />`

- **`Marcador`** (`@/componentes/marcador`): `{ rotulo: string; descricao?: ReactNode; marcado: boolean; aoMudar: (marcado: boolean) => void }`. `Checkbox` com o rótulo e, embaixo, a frase que diz o que ele faz. O `<label>` envolve tudo (o clique vale na linha); o nome acessível é só o rótulo, a frase é a descrição. Não passe classes.
```tsx
<Marcador rotulo="Pode ir ao sábado" descricao="sem isto, o sábado nem entra nas possibilidades"
  marcado={!!edicao.permite_sabado} aoMudar={() => setEdicao({ ...edicao, permite_sabado: edicao.permite_sabado ? 0 : 1 })} />
```
- **`Alerta`** (`@/componentes/alerta`): `{ tom: "erro" | "aviso" | "sucesso"; children: ReactNode; className?: string }`. Sem filhos não desenha nada: `<Alerta tom="erro">{erro}</Alerta>` fica sempre no JSX.
- **`Secao`** (`@/componentes/secao`): `{ titulo?: string; children: ReactNode }`. O painel de seção (contorno de 1 px em sombra interna, `mb-3`) com o `h2` em caixa alta e peso 700 (o preflight o zera). Sem `titulo`, só o painel. Não passe classes. `Explica` (parágrafo justificado de explicação) só a página Regras usa e fica lá.
```tsx
<Secao titulo="Dias letivos"> … </Secao>
```
- **`useSinalDeSalvo`** (`@/componentes/use-sinal-de-salvo`): `useSinalDeSalvo(): [salvo: boolean, piscar: () => void]`. O "salvo" de tela sem botão de salvar: `piscar()` acende por 1,5 s; o relógio é guardado, então um sinal não apaga o seguinte nem dispara depois de a tela sair. `piscar` é estável.
```tsx
const [salvo, piscar] = useSinalDeSalvo();
// A região `status` existe sempre; o texto entra e sai dentro dela, e é essa mudança que o leitor de tela anuncia.
<CabecalhoPagina titulo="Períodos"><span role="status" className="text-xs text-primary">{salvo ? "salvo" : ""}</span></CabecalhoPagina>
// depois de gravar e recarregar: piscar();
```
- **`avisar`** (`@/componentes/toasts`): `avisar.sucesso(texto, descricao?)`, `avisar.erro(texto)` (fica até fechar), `avisar.aviso(texto)`, `avisar.desfazer(texto, aoDesfazer)`.
- **`useConfirmar`** (`@/componentes/confirmacao`): `confirmar({ titulo: string; descricao?: string; itens?: string[]; confirmar: string; perigo?: boolean }): Promise<boolean>`. Ao fechar devolve o foco a quem pediu. Uso: `if (!(await confirmar({ titulo: `Remover ${l.nome}?`, confirmar: "Remover professor", perigo: true }))) return;`

## Filtros

**`BarraDeFiltros` / `DefinicaoDeFiltro`** (`@/componentes/barra-de-filtros`)
`DefinicaoDeFiltro = { id: string; titulo: string; opcoes: { valor: string | number | boolean; rotulo: string }[] }`
`BarraDeFiltros({ definicoes: DefinicaoDeFiltro[]; valor: ColumnFiltersState; aoMudar: (v: ColumnFiltersState) => void })`
Um botão-popover por definição ("Filtrar por <título>", nome acessível fixo; a contagem visível é `aria-hidden` e, com filtro ativo, a descrição do botão diz "N marcado(s)"; o popover leva o mesmo nome do botão), um chip por valor marcado e "Limpar filtros" quando há chip. Remover chip ou limpar devolve o foco ao botão do filtro (ao primeiro, no "Limpar filtros"). O `id` da definição é o `id` da coluna, que usa `filterFn: pertence`.
```tsx
const DEFINICOES_DE_FILTRO: DefinicaoDeFiltro[] = [        // constante de módulo
  { id: "tipo", titulo: "Tipo", opcoes: TIPOS_SALA.map((t) => ({ valor: t, rotulo: t })) },
];
const [filtros, setFiltros] = useState<ColumnFiltersState>([]);   // estado: o `useTabela` compara por referência
{ accessorKey: "tipo", header: "Tipo", filterFn: pertence },       // coluna filtrada
const tabela = useTabela({ …, busca, textoDeBusca: (l) => `${l.nome} ${l.tipo}`, filtros });
{linhas.length > 0 && <BarraDeFiltros definicoes={DEFINICOES_DE_FILTRO} valor={filtros} aoMudar={setFiltros} />}
```
**Estado vazio, três casos** (o `TabelaDados` mostra o `vazio` também quando busca ou filtro não acham nada):
```tsx
<EstadoVazio>
  {linhas.length === 0 ? "Nenhuma sala cadastrada. …" : (          // 1. nada cadastrado: sem botão
    <>Nenhuma sala encontrada.{" "}                                   // 2. busca ou filtro sem resultado
      <Button variant="link" onClick={() => { setFiltros([]); setBusca(""); }}>Limpar busca e filtros</Button></>
  )}
</EstadoVazio>                                                       // 3. lista normal: a tabela
```
O botão do caso 2 tem nome diferente do "Limpar filtros" da barra (os dois aparecem juntos). Esconda a barra quando nada está cadastrado (`linhas.length > 0`), não quando o resultado é vazio.
- Coluna só com `accessorKey` (sem `cell`) mostra o valor puro.
- **Coluna só de filtro:** `{ accessorKey, filterFn: pertence, enableSorting: false }` e o `id` na lista `ocultas` do `useTabela` (constante de módulo).
- **Opções de filtro que vêm de cadastro** (períodos, tipos): `useMemo` sobre os cadastros e `.filter((d) => d.opcoes.length > 0)` para esconder o filtro sem opção.
- Valor da lista que não está nas `opcoes` não dá para filtrar; inclua os tipos distintos se importar.
- **Validação.** Toda restrição de campo (`required`, `min`, `max`, `step`, `type="number"` que aceita vazio ou decimal) precisa de validação em JavaScript em `salvar`, com mensagem no `Campo`; o `noValidate` do diálogo deixa o navegador de fora. `min`/`max` podem ficar nos atributos (ajudam as setas), `required` sai. Número inteiro: `Number.isInteger`; campo numérico vazio vira `null` ou 0 conforme a tela, como antes.
- **Campo numérico gravado no `onBlur`, fora de formulário** (Períodos): o navegador não valida e o `min` só ajuda as setas. Valide o texto (`trim`, vazio, `Number.isInteger`, `>= 0`) ANTES de compará-lo ao gravado: vazio dá `Number("") === 0` e passaria por "sem mudança" com a caixa vazia. Guarde `const caixa = e.target` antes de qualquer `await`; sempre que não gravar (recusa ou falha de gravação) faça `caixa.value = String(gravado)`. A tela que grava devolve se gravou (`tentar` → boolean). `defaultValue` pede `key` com o escopo e o valor gravado (`${cursoId}-${numero}-${valor}`), senão a caixa não acompanha o banco.
- Validar vários campos juntos: monte um objeto de erros e chame `setErrosDeCampo` uma vez; o diálogo foca o primeiro `aria-invalid`.
- Gravação que muda outras coisas (aulas trocadas de sala): devolva um plano (instruções + contagens) em vez de só a lista, e conte ao usuário depois de salvar com `avisar.sucesso`, também quando a mesma gravação apagou outras (a confirmação já foi dada).
- Lista sem busca (poucos registros: Tipos, Cursos): `useTabela` sem `busca`/`textoDeBusca` e `CabecalhoPagina` só com `contagem`; o estado vazio tem um texto só. Enquanto `carregando`, a contagem é `""` (vazia, e não ausente): é ela que faz deste um cabeçalho de lista, e sem ela ele trocaria de desenho quando a lista chegasse.
- Grupo de caixas (turnos): `fieldset` + `legend` com `Checkbox`; dica e erro ligados ao grupo por `aria-describedby`, `aria-invalid` nas caixas (o diálogo foca a primeira). Não cabe no `Campo`.
- Grupo de controles com recusa própria (lista de fatias): a validação devolve `{ mensagem, controle, posicoes }`. A mensagem fica dentro do `fieldset`, com `role="alert"` (anunciada, e o que o diálogo traz para a vista quando não há controle a focar) e `id`; o controle acusado leva `aria-describedby` para ela e, se é campo (seletor, caixa), `aria-invalid`; se é botão, `data-acusado`. Qualquer mudança no grupo limpa a recusa dele.
- `fieldset` + `legend` em Tailwind: `min-w-0 rounded-lg px-3.5 pt-3 pb-3.5 shadow-[inset_0_0_0_1px_var(--line)]`, `legend` com `px-1.5 text-xs font-semibold text-tx2`, e o conteúdo numa `div` com `flex flex-col gap-4` (último filho sem margem).
- Controle de linha de formulário ao lado de campos: `BotaoIcone` com contorno e da altura dos vizinhos (`className="size-7 border-input bg-panel"`); `Seletor` embutido ao lado de uma caixa com largura fixa (o gatilho `w-fit` muda de largura com a opção) e `shrink-0`, na altura do componente (28 px).
- Coluna de texto derivado (etiquetas, rótulo composto): `accessorFn` que devolve o texto mostrado, para ordenar pelo que o usuário lê.
- Dado da lista inteira de que a ação de linha precisa (total de registros): leve na própria linha (`n_cursos`), para as colunas não dependerem de `linhas` e continuarem estáveis.
- Para as grades: a confirmação de aulas apagadas e o toast de troca de sala já têm texto e padrão em `Salas` e em `disciplinas/index.tsx`; `motivosParaMostrar` (`disciplinas/salvar.ts`) é pura, se a grade precisar descrever motivos.
- Arquivos em CRLF no disco: script que edita por substituição lê com `newline=""` e normaliza. Ao medir um diálogo, espere a animação de entrada (~600 ms).
- CLI do shadcn importa `cn` do pacote npm `cn`: troque o import por `@/lib/utils`, `git checkout package.json package-lock.json`, confira `tema.css` e `components.json`.

## Padrão de página

Estados: `linhas`, `edicao` (rascunho ou `null`), `erro` (carga), `erroDoFormulario`, `errosDeCampo`, `salvando`, `carregando`, `busca`.

| Mensagem | Onde aparece |
|---|---|
| falha de carga ou de recarga | `erro` → `<Alerta tom="erro">` logo depois do cabeçalho |
| validação de um campo (obrigatório, formato) | `errosDeCampo.x` → `erro` do `Campo` |
| recusa de regra ou falha ao gravar o formulário | `erroDoFormulario` → `erro` do `DialogoFormulario` |
| recusa ou falha de ação sem formulário (remover; toda gravação de Períodos e de Regras) | `avisar.erro(mensagemErro(e, "O professor"))` |
| recusa de digitação num controle solto (número inválido numa caixa de Períodos) | `avisar.aviso(…)`: informa e some |

```tsx
type ErrosDeCampo = Partial<Record<"nome", string>>;   // uma chave por campo validado
const SEM_ERROS: ErrosDeCampo = {};                   // constante de módulo: referência estável
const recarregar = useCallback(() => carregar().catch((e) => setErro(String(e))), [carregar]);  // `carregar` termina com setErro("")
const abrir = useCallback((p) => { setErroDoFormulario(""); setErrosDeCampo(SEM_ERROS); setEdicao(p); }, []);
async function salvar(p) {
  setErroDoFormulario(""); setErrosDeCampo(SEM_ERROS);   // cada tentativa começa limpa
  if (!p.nome.trim()) return setErrosDeCampo({ nome: "O nome é obrigatório." });
  setSalvando(true);
  try { /* consultas de recusa (return setErroDoFormulario(…)) e a gravação */ }
  catch (e) { return setErroDoFormulario(mensagemErro(e, "O professor")); }
  finally { setSalvando(false); }
  setEdicao(null);      // só chega aqui o que foi gravado
  await recarregar();   // fora do `try`: a falha é da lista e aparece na página
}
```
Todo controle validado também limpa o próprio erro ao mudar (ver `Campo`). `remover` segue o mesmo: `try` só em volta do `DELETE`, `recarregar()` depois.

## Armadilhas

- **Referência estável.** `dados`, `colunas` e `filtros` de `useTabela`: estado, `useMemo` ou constante de módulo; ações usadas nas colunas, com `useCallback`. Lista montada na chamada (`filtros: []`, `dados: linhas.filter(…)`) refaz filtro e ordenação a cada desenho; coluna recriada remonta as células e o botão focado deixa de existir.
- **`desempate` e `textoDeBusca` dependem só da linha.** O resultado é guardado; um estado da tela usado ali fica com o valor antigo.
- **A busca só age se alguma coluna tiver `accessorKey` ou `accessorFn`.** Numa tabela só de colunas de desenho (`id` + `cell`), o TanStack a ignora calado.
- **`sortDescFirst: true` é o que faz a coluna numérica começar do maior.** `meta.numerico` é só desenho; sem a opção, a coluna começa crescente.
- **`id` único na lista.** A linha é o `id` do registro; lista de junção com `id` repetido dá chave duplicada.
- **`useAlterado` compara o JSON do rascunho.** `Set` e `Map` não contam como alteração: guarde lista. O ponto de partida só é esquecido quando o valor volta a `null`. Todo `setEdicao` depois de abrir conta, inclusive o que a tela faz sozinha: monte o rascunho inteiro antes de abrir.
- **Peso de fonte e altura de linha.** Nunca `font-medium`: nesta fonte sai como semi-negrito. Era normal, `font-normal`; era 600, `font-semibold`. Nada de `leading-[razão]`; o tema já usa a natural da fonte. Botão `inline-flex` dentro de `th` pede `align-top`, senão a linha ganha 1 px.
- **A célula de ações devolve só os `BotaoIcone`**, num fragmento. O embrulho que os esconde até o pouso mora em `TabelaDados`; um segundo muda a largura da coluna e desloca as outras.
- **Borda conta na largura.** O contorno antigo era sombra interna; preenchimento copiado do CSS antigo perde 1 px (8 vira `px-[7px]`, 12 vira `px-[11px]`). Em painel, `shadow-[inset_0_0_0_1px_var(--line)]` em vez de `border`.
- **`getByLabel` é por substring e sem diferenciar maiúsculas.** Um `aria-label` que contém o rótulo de outro controle da mesma tela ("…contraturno do 1º período" contém "turno do 1º período") faz o teste do outro falhar por modo estrito. Rótulos de controles vizinhos não podem conter um ao outro.
- **Troca de escopo recarrega com `carregando` e começa limpa.** Página que depende de um id do shell (`cursoId`) não é remontada ao trocá-lo. No início do efeito de carga: `setCarregando(true)`, `setBusca("")` e `setFiltros([])`. Sem o primeiro ficam à mostra as linhas do escopo anterior e o que se calcula sobre elas (próximo número, botões); sem os outros, um filtro ou uma busca do escopo velho esconde linhas do novo, com um chip que ele nem tem. Enquanto `carregando`, omita `escopo` e `contagem` do `CabecalhoPagina` (são números do escopo anterior; a altura vem da busca e não muda). O que usa o valor de um filtro para outra coisa (propor o período em "Nova…") confere que ele existe no escopo atual.
- **E2E que afirma ausência de toast.** `toHaveCount(0)` tenta de novo até o toast sumir sozinho (5 s) e passa: falso verde. Espere um marco que vem depois do ponto em que o toast sairia (a lista recarregada) e afirme `expect(await locator.count()).toBe(0)` (ver "sem toast ao deixar de ocupar sala" em `disciplinas.spec.ts`). Plante o defeito para ver o teste falhar.
- **E2E de popover em sequência.** O popover tem animação de saída: depois do `Escape` o conteúdo ainda existe por um instante, e abrir outro em seguida acha as opções dos dois. Espere a opção marcada sumir (`toHaveCount(0)`) antes de abrir o próximo.
- **E2E de recusa que o usuário precisa ver.** `toBeVisible()` passa com o elemento fora da vista (formulário mais alto que a janela); use `toBeInViewport()`.
- **Foco.** Não use `ref` para focar o campo com erro nem para devolver o foco: o diálogo e a confirmação já fazem. Depois de remover com sucesso o foco vai para o `body`; se a remoção falha, volta ao botão "Remover". Colunas recriadas a cada desenho, ou linha que troca de chave, fazem a origem do foco sumir e ele cai no `body` também depois de editar. Depois de uma edição que reordena a lista o foco pode cair no `body` (o navegador o perde quando o React move o elemento focado).

## Classes que igualaram a captura antiga

- **Cabeçalho:** nenhuma; o `CabecalhoPagina` escolhe. Botão principal `<Button>`, secundário `variant="outline"`.
- **Tabela:** `.forte` vira `<span className="font-semibold">`; `.fraco`, `text-tx3`; etiqueta pequena, `rounded-[3px] bg-poco px-[5px] text-[10px] text-tx2 tabular-nums`. Número fora da tabela: `font-mono text-[12px] tabular-nums`. Quadro pequeno dentro de seção: `Table` de `@/componentes/ui/table` direto, sem painel, linha de 32 px com `[&_td]:h-8`.
- **Diálogo:** o `DialogoFormulario` já dá 16 px entre os filhos e 20 px até o rodapé. `largo` leva a 720 px.
- **Altura de controle:** a de um controle é a do componente, 28 px (`h-7`). Só dois desvios: a busca do cabeçalho de lista tem 30 px (define a altura do cabeçalho e está sozinha na linha); controle embutido em linha de tabela de 32 px usa `h-6` ou `h-5`. Nunca `h-[30px]` para igualar o pixel de um `<select>`/`<input>` nativo antigo: 2 a 3 px de deslocamento por causa do componente novo são diferença aceita.
- **Botão desabilitado:** de ícone, `BotaoIcone` com `desabilitado` e `motivo`; de texto, `<Button disabled>` com o motivo em texto visível ao lado, ligado por `aria-describedby` (o `disabled` não recebe foco nem pouso, então uma dica não seria alcançada). Exemplos vivos: "Remover o último" em `Periodos.tsx` e "Adicionar padrão" em `Instituicao.tsx`.
- **Quadro de células centradas** (Períodos): `Table` com `className="table-fixed [&_td]:h-8 [&_td]:text-center [&_th]:text-center"`; números em `font-mono text-[12px] tabular-nums`, cabeçalho de coluna numérica em `font-mono`. `Seletor` centrado na célula: `className="mx-auto h-6 w-[150px] *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:justify-center"`; `Input` embutido: `mx-auto block h-5 w-16 px-1 text-center font-mono`.
- **Chip-botão com contorno** (padrões de bloco): `border` + `py-px pl-1.5 pr-[3px]` iguala o chip antigo (`padding: 2px 4px 2px 7px` com sombra interna); `group` no botão e `group-hover:`/`group-focus-visible:` nos filhos para o "×" e o filete que mudam no pouso; reserve a largura do "×" (`w-[7px]`, `opacity-0`) para o chip não crescer.
- **Campos:** `Seletor` em `Campo` com `className="w-full"` (o gatilho nasce `w-fit`); `Textarea` com `rows`; `<input type="range" className="w-full accent-primary">` nativo; `Input type="number"`.

## Malhas e o `grade.css`

Tabela com desenho próprio (Indisponibilidades e a grade manual) mora em `src/estilos/grade.css`, na camada `components`.
- **O reset do Tailwind já dá:** `padding: 0`, `border: 0 solid`, `background: transparent`, `font: inherit`, `color: inherit` em botão; centro de `th` é o padrão do navegador. Não declare de novo (o `padding: 0` de `td` vem do reset, não do Chromium).
- **O que é preciso declarar:** `border-collapse: separate` e `border-spacing` (o reset põe `collapse`; malha com vão entre células precisa de `separate`), `font-weight` de `th` (o navegador dá negrito), `font-style: normal` em `em`, `cursor: pointer` e `border-radius` de botão.
- **Descubra por ablação, não por lista:** tire uma declaração por vez do `grade.css` e compare a medida (`getBoundingClientRect` + `getComputedStyle`, claro e escuro, seletores por estrutura para valer antes e depois). O que não muda a medida sai.
- **A captura tem de ver o que vai ser mexido.** A de Indisponibilidades não mostrava a malha (nenhum professor escolhido); foi preciso uma captura com professor escolhido, gerada com o código antigo ANTES de converter.
- `.sub` virou o `sub` do `CabecalhoPagina` e `.acoes-secao`, `mt-3 flex items-center gap-2`. `.painel-duplo` virou `grid grid-cols-[264px_1fr] items-stretch gap-[14px]` na grade manual.
- **Medir botão do shadcn:** o `transition-colors` faz a cor sair intermediária se a medida vier logo depois de o botão deixar de ser `disabled`. Espere uns 500 ms.
- **Item ativo de lista de seleção:** `<button aria-pressed>` com `bg-acc-bg font-semibold text-primary`, sem variante de hover no ativo; fundo, cor e peso, então não depende só de cor.
- **Dois erros de carga, cada um limpo pela sua carga** (`erro` da lista e das contagens, `erroDoProfessor` da malha): limpar um no fim da carga do outro esconde um erro ainda verdadeiro. Gravação que passa e recarga que falha depois é erro de página, não toast de gravação: `try` só em volta da gravação.
- Teste de recarga que falha só depois da gravação: `falharConsultas(page, "trecho do SQL")`, de `testes/e2e/paginas.ts`, chamado com a tela já carregada. O `falharAPartirDe` da ponte conta execuções e não serve para isto: em desenvolvimento o `StrictMode` roda a carga duas vezes, e a "2ª vez" já é da própria carga (o alerta aparece antes de qualquer gravação e o teste passa por acaso).

## Grades: histórico, desfazer e células (tarefa 13)

Telegráfico; o exemplo vivo é `src/paginas/grade-manual/`.
- **Toda escrita da grade por `historico.executarNaGrade`** (um caminho único, `gravar` em `index.tsx`: histórico, recarga sempre, toast de erro). Remover, mover e limpar o período passam o texto do aviso; alocar, fixar e trocar a sala não avisam. Sem linha tocada (`rowsAffected` 0: a aula já não era a que a tela mostrava) não há aviso. Toast com "Desfazer" só se `historico.estado().podeDesfazer`: a ação que cruza com escrita de cadastro grava sem entrar no histórico, e o botão não teria o que desfazer.
- **Só o toast mais recente oferece "Desfazer".** O botão do toast desfaz o topo da pilha, que pode já ser outra ação. `avisar.desfazer` guarda o toast aberto e fecha o anterior ao abrir; `desfazer.ts` assina `historico.assinar` e chama `avisar.fecharDesfazer()` a cada mudança de estado (outra ação, desfazer, histórico zerado). Ordem em `gravar`: grava, o histórico publica (o antigo fecha), SÓ ENTÃO o novo abre. E2E: `toHaveCount(0, { timeout: 3_000 })`, menor que os 10 s do toast, ou passa por ele ter vencido.
- **Atalho global (Ctrl+Z):** ignora campo de texto, `e.repeat` (tecla presa desfaria a pilha) e diálogo aberto (`[role="alertdialog"], [role="dialog"]`): sem isto age por trás da confirmação.
- **Ouvinte de Esc em `window`** começa com `if (e.defaultPrevented) return;`. O Radix marca o Esc que consome (lista do `Seletor`, diálogo, confirmação, dica); o Esc que fechou uma camada não solta o modo da tela.
- **Guarda na ação, não só no botão desabilitado.** Quem chama a ação por outro caminho (arrastar) não passa pelo botão: `removerAula` recusa aula fixada com `avisar.aviso`.
- **Ação em voo por célula.** Um `Set` em `ref` (chave dia-hora), da ordem até a recarga: a segunda ação na mesma célula é ignorada (duplo "Alocar" dá `UNIQUE`; duplo "Remover" empilharia dois registros iguais e o desfazer não devolveria a aula). Células diferentes seguem livres. Alocar trava também a fatia: a contagem "N de N aulas" é a da tela, e a mesma fatia em outra célula antes da recarga passaria por ela. A ação devolve `Promise<boolean>` (gravou).
- **Devolver o foco à célula depois de uma ação que troca o elemento** (vazia é `button`, ocupada é `div role="group" tabIndex={-1}`): na hora da ação, `raiz.contains(document.activeElement)` marca o pedido; `useLayoutEffect` sobre "está ocupada" foca o elemento novo, e só se o foco caiu no `body`. Ação que não gravou desfaz o pedido. Foco em outro lugar (mouse) não é roubado.
- **Carga com geração na troca de escopo.** `carregar` numera a carga e confere depois de cada leitura (a `consultar` da carga lança ao ser superada, antes de qualquer `set`); a de outro escopo (ação em voo durante a troca de curso) não faz nada. `carregando` volta a falso só pela carga mais recente: trocar de escopo zera "carregado" no próprio desenho (`setState` durante a renderização), senão A, B, A mostra o que sobrou de B.
- **`Seletor` com valor fora das opções mostra o `exibir`** (o Radix ignora os filhos do valor e mostra o `placeholder`; o `Seletor` passa `exibir` nos dois). Sem `exibir` o gatilho fica vazio. A lista continua sem a situação atual: inclua-a como opção, "Sem sala (atual, fora do requisito)".
- **Controles que só aparecem no pouso ou no foco:** `:hover` e `:has(:focus-visible)`, não `:focus-within` (depois de escolher com o mouse o Radix devolve o foco ao gatilho e os botões ficariam à mostra). `opacity`, não `visibility`, para continuarem na ordem do Tab. O que fica no mesmo canto (ponto de "fora do turno") leva `pointer-events: none` e sai da frente deles nos mesmos estados.
- **Descrição de botão que não faz nada:** `aria-describedby` para um `sr-only` ("Escolha uma pendência para alocar"); com motivo visível, o próprio texto é a descrição. O nome fica no horário.
- **Menu de contexto do WebView:** o botão direito que erra o alvo abre o menu do navegador; `onContextMenu` com `preventDefault` na célula vazia. Na ocupada, confira `currentTarget.contains(e.target)`: os eventos da lista do `Seletor` (portal) sobem pela árvore do React.
- **Motivo de botão desabilitado no cabeçalho:** `span` ANTES dos botões, `inline-flex h-7 items-center` (o cabeçalho de página alinha pelo topo e `self-center` o centra na altura do título); assim, aparecendo, ele não empurra os botões.
- **Componente do molde dentro de malha:** o `grade.css` (camada `components`) perde para os utilitários do componente; para mudar o desenho dele use `className` no ponto de uso (ícone do `BotaoIcone`: `[&_svg]:size-3`), e no `grade.css` só o que ele não define.
- **`outline` como estado** (tracejado da apta) vence o anel de foco global na camada `components`: repita o anel depois. Anel dentro de caixa com `overflow: hidden`: para dentro (`outline-offset` negativo) ou solte o `overflow` com `:has(:focus-visible)`.
- **Elemento que vira `button`:** declare `text-align` (o navegador centra); `align-items` não precisa.
- **`transition` num filho do `Button`** perde para o `transition-colors` dele: não declare.
- **Medir malha:** altura fracionária acima dela (o `.aviso` de 35,25 px) faz a comparação de pixels acusar a tela inteira; monte um cenário sem ele para provar que a malha não mudou.
- **E2E:** `locator.focus()` depois de um clique não casa `:focus-visible` (chegue com `Shift+Tab` do vizinho); `click({ force: true })` clica num `aria-disabled`; `keyboard.down` repetido sem `up` chega com `repeat: true`; dois cliques no mesmo turno do JavaScript (`el.click(); el.click()` num `evaluate`) simulam o duplo clique sem depender de tempo; `el.click()` do DOM não leva o foco; o marco que vem logo depois de um arrasto não pode ser um clique (o dnd-kit engole o clique por 50 ms): use o botão direito na aula, que fixa pelo `contextmenu`, ou outro arrasto.

## Comparar antes e depois

1. Antes de tocar na tela: `npm run test:visual -- -g "<tela>"` passa. Guarde as referências fora do repositório: `git show HEAD:testes/visual/__capturas__/<tela>-claro.png > antes-claro.png` (e a escura).
2. Meça a tela antiga com um spec temporário em `testes/e2e/` (`getBoundingClientRect` e `getComputedStyle` de título, busca, botões, cabeçalhos e duas linhas), gravando um JSON fora do repositório. Converta, meça de novo e compare os números: eles dizem o que está errado; a captura só diz que está.
3. `npm run test:visual -- -g "<tela>" --update-snapshots`, abra as duas imagens novas contra as antigas e anote no relatório cada diferença e o motivo.
4. `npm run test:visual` inteiro: as outras telas passam sem regerar. Se uma diferir, abra o diff e corrija o código. Apague o spec temporário antes do commit.

## Grade automática (tarefa 15)

- **Aplicar pelo histórico.** `historico.executarNaGrade(cursoId, "Aplicar a grade gerada", instrucoes)`; as instruções só tocam `alocacoes` do curso. Toast `avisar.desfazer("Grade aplicada", desfazerEAvisar)` só com `historico.estado().podeDesfazer` (e o curso ainda o mesmo), senão `avisar.sucesso`. O aviso da página, `<Alerta tom="sucesso">Grade aplicada. <Button variant="link">Abrir a grade manual</Button></Alerta>`, sai quando algo recarrega a tela (desfazer, troca de curso).
- **Tela com uma ação só: sem a maquinaria da grade manual.** Basta atrelar o que se leu e o que se gerou ao curso (`{ cursoId, … }`, lido pelo curso da tela): trocar de curso não remonta a página, e o resultado do curso anterior ficava à mostra, aplicável, até a carga do novo terminar. Uma `ref` com o curso de agora e outra com o número da carga descartam o que chega atrasado.
- **Melhor, pior, igual** sem cor sozinha: a palavra, visível, depois do número novo (largura fixa, para os números continuarem alinhados); a cor só acompanha (acento, negativo, neutro). "Melhor" é da medida, não do número: em buracos, o que desce é melhor.
- **Gerar de novo não tira o resultado da tela** (a página encolheria e voltaria a crescer): ele fica até o novo chegar, com "Aplicar esta grade" e "Descartar" desabilitados, e `aplicar` confere `gerando` de novo. A geração ocupa o fio da interface; para testar o que a tela mostra no meio dela, um `MutationObserver` instalado pelo teste anota cada desenho em que o botão diz "Gerando…".
- **Motivo de botão parado** num `span id` antes dos botões do cabeçalho, ligado por `aria-describedby` a todos os que ele explica ("Aplicando a grade…", "Gerando a grade…", "Não há o que distribuir.").
- **Teste de contagem de botões com uma lista de `Seletor` aberta:** o Radix tira o resto da página da árvore de acessibilidade; espere `getByRole("listbox")` sumir antes de contar.
- **Confirmação:** um segundo `confirmar` com o primeiro aberto recusa o primeiro; dois cliques seguidos em "Aplicar esta grade" não aplicam duas vezes.
