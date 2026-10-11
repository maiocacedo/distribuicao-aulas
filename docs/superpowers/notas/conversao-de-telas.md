# Notas para converter uma tela

Estado do molde depois da tarefa 9. O exemplo vivo é `src/paginas/Professores.tsx`: na dúvida, copie de lá. Restrições e receita em `restricoes.md`.

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
`useTabela<T>({ dados: T[]; colunas: ColumnDef<T, any>[]; ordemInicial: SortingState; desempate: (l: T) => string; busca?: string; textoDeBusca?: (l: T) => string; filtros?: ColumnFiltersState }): Table<T>`
`TabelaDados<T>({ tabela: Table<T>; vazio: ReactNode })`
Também exporta `normalizar(texto)`, `compararValores(x, y)`, `ordenarPorDesempate(dados, desempate)` (a pré-ordenação do `useTabela`: cópia em ordem de `desempate`, pt-BR, estável) e `pertence(linha, coluna, valores)` (a `filterFn` de filtro facetado: lista vazia passa tudo). `meta: { numerico: true }` alinha à direita em fonte fixa; `meta: { centro: true }` centra.
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
**`EstadoVazio`** (`@/componentes/estado-vazio`): `{ children: ReactNode }`. `TabelaDados` mostra o `vazio` também quando a busca não acha nada, então são dois textos:
`<EstadoVazio>{linhas.length === 0 ? "Nenhum professor cadastrado ainda." : "Nenhum professor com esse nome."}</EstadoVazio>`

**`DialogoFormulario` / `useAlterado`** (`@/componentes/dialogo-formulario`)
`useAlterado<T>(valor: T | null): boolean`
`DialogoFormulario({ titulo: string; alterado: boolean; salvando?: boolean; erro?: ReactNode; rotuloSalvar?: string; largo?: boolean; aoFechar: () => void; aoSalvar: () => void; children: ReactNode })`
Faz sozinho: o `<form>` tem `noValidate` (nenhuma bolha nativa; ver "Validação" abaixo); não fecha no clique fora; Esc, Cancelar e "×" pedem "Descartar?" se `alterado`; nada fecha nem reenvia com `salvando` (Cancelar fica desabilitado, o "×" só não age); ao fechar devolve o foco a quem abriu; depois de uma tentativa de salvar foca o primeiro campo com `aria-invalid`.
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
**`Seletor`** (`@/componentes/seletor`): `Seletor<V extends string | number | null>({ valor: V; opcoes: Opcao<V>[]; aoMudar: (v: V) => void; rotulo?: string; exibir?: ReactNode; desabilitado?: boolean; className?: string; id?; "aria-describedby"?; "aria-invalid"? })`, com `Opcao<V> = { valor: V; rotulo: string; desabilitada?: boolean }`. O gatilho tem o desenho do `Input`.
```tsx
<Campo rotulo="Preferência de distribuição dos dias" dica="…">
  {(a) => <Seletor {...a} className="w-full" valor={edicao.pref_dias} opcoes={PREFERENCIAS}
    aoMudar={(pref_dias) => setEdicao({ ...edicao, pref_dias })} />}
</Campo>
```
**`BotaoIcone`** (`@/componentes/botao-icone`): `{ rotulo: string; icone: LucideIcon; aoClicar: () => void; perigo?: boolean; desabilitado?: boolean; motivo?: string; className?: string }`. `rotulo` é o nome acessível e a dica. `desabilitado` é `aria-disabled`: o botão continua alcançável, o clique não age e a dica mostra o `motivo`. Desabilitou, diga o motivo. Com `perigo`, habilitado, é sempre da cor de negativo (como na interface antiga); desabilitado fica rebaixado. Pendência: um e2e que confirme clique, Enter e Espaço inertes e a dica com o motivo quando alguma tela usar `desabilitado`:
`<BotaoIcone rotulo="Remover" icone={Trash2} perigo desabilitado={impedido} motivo="…por que não pode…" aoClicar={…} />`

- **`Alerta`** (`@/componentes/alerta`): `{ tom: "erro" | "aviso" | "sucesso"; children: ReactNode; className?: string }`. Sem filhos não desenha nada: `<Alerta tom="erro">{erro}</Alerta>` fica sempre no JSX.
- **`Secao`** (`@/componentes/secao`): `{ titulo?: string; children: ReactNode }`. O painel de seção (contorno de 1 px em sombra interna, `mb-3`) com o `h2` em caixa alta e peso 700 (o preflight o zera). Sem `titulo`, só o painel. Não passe classes. `Explica` (parágrafo justificado de explicação) só a página Regras usa e fica lá.
```tsx
<Secao titulo="Dias letivos"> … </Secao>
```
- **`useSinalDeSalvo`** (`@/componentes/use-sinal-de-salvo`): `useSinalDeSalvo(): [salvo: boolean, piscar: () => void]`. O "salvo" de tela sem botão de salvar: `piscar()` acende por 1,5 s; o relógio é guardado, então um sinal não apaga o seguinte nem dispara depois de a tela sair. `piscar` é estável.
```tsx
const [salvo, piscar] = useSinalDeSalvo();
<CabecalhoPagina titulo="Períodos">{salvo && <span className="text-xs text-primary">salvo</span>}</CabecalhoPagina>
// depois de gravar e recarregar: piscar();
```
- **`avisar`** (`@/componentes/toasts`): `avisar.sucesso(texto, descricao?)`, `avisar.erro(texto)` (fica até fechar), `avisar.aviso(texto)`, `avisar.desfazer(texto, aoDesfazer)`.
- **`useConfirmar`** (`@/componentes/confirmacao`): `confirmar({ titulo: string; descricao?: string; itens?: string[]; confirmar: string; perigo?: boolean }): Promise<boolean>`. Ao fechar devolve o foco a quem pediu. Uso: `if (!(await confirmar({ titulo: `Remover ${l.nome}?`, confirmar: "Remover professor", perigo: true }))) return;`

## Filtros

**`BarraDeFiltros` / `DefinicaoDeFiltro`** (`@/componentes/barra-de-filtros`)
`DefinicaoDeFiltro = { id: string; titulo: string; opcoes: { valor: string | number | boolean; rotulo: string }[] }`
`BarraDeFiltros({ definicoes: DefinicaoDeFiltro[]; valor: ColumnFiltersState; aoMudar: (v: ColumnFiltersState) => void })`
Um botão-popover por definição ("Filtrar por <título>", nome acessível fixo; a contagem visível é `aria-hidden`), um chip por valor marcado e "Limpar filtros" quando há chip. Remover chip ou limpar devolve o foco ao botão do filtro (ao primeiro, no "Limpar filtros"). O `id` da definição é o `id` da coluna, que usa `filterFn: pertence`.
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
- Valor da lista que não está nas `opcoes` não dá para filtrar; inclua os tipos distintos se importar.
- **Validação.** Toda restrição de campo (`required`, `min`, `max`, `step`, `type="number"` que aceita vazio ou decimal) precisa de validação em JavaScript em `salvar`, com mensagem no `Campo`; o `noValidate` do diálogo deixa o navegador de fora. `min`/`max` podem ficar nos atributos (ajudam as setas), `required` sai. Número inteiro: `Number.isInteger`; campo numérico vazio vira `null` ou 0 conforme a tela, como antes.
- **Campo numérico gravado no `onBlur`, fora de formulário** (Períodos): o navegador não valida e o `min` só ajuda as setas. Valide o texto (`trim`, vazio, `Number.isInteger`, `>= 0`) ANTES de compará-lo ao gravado: vazio dá `Number("") === 0` e passaria por "sem mudança" com a caixa vazia. Guarde `const caixa = e.target` antes de qualquer `await`; sempre que não gravar (recusa ou falha de gravação) faça `caixa.value = String(gravado)`. A tela que grava devolve se gravou (`tentar` → boolean). `defaultValue` pede `key` com o escopo e o valor gravado (`${cursoId}-${numero}-${valor}`), senão a caixa não acompanha o banco.
- Validar vários campos juntos: monte um objeto de erros e chame `setErrosDeCampo` uma vez; o diálogo foca o primeiro `aria-invalid`.
- Gravação que muda outras coisas (aulas trocadas de sala): devolva um plano (instruções + contagens) em vez de só a lista, e conte ao usuário depois de salvar com `avisar.sucesso`, também quando a mesma gravação apagou outras (a confirmação já foi dada).
- Lista sem busca (poucos registros: Tipos, Cursos): `useTabela` sem `busca`/`textoDeBusca` e `CabecalhoPagina` só com `contagem`; o estado vazio tem um texto só.
- Grupo de caixas (turnos): `fieldset` + `legend` com `Checkbox`; dica e erro ligados ao grupo por `aria-describedby`, `aria-invalid` nas caixas (o diálogo foca a primeira). Não cabe no `Campo`.
- Coluna de texto derivado (etiquetas, rótulo composto): `accessorFn` que devolve o texto mostrado, para ordenar pelo que o usuário lê.
- Dado da lista inteira de que a ação de linha precisa (total de registros): leve na própria linha (`n_cursos`), para as colunas não dependerem de `linhas` e continuarem estáveis.
- Ilha `.legado` num diálogo novo (componente ainda antigo): `<div className="legado -mb-3">`; o `-mb-3` desfaz a margem de 12 px do último bloco antigo, que o item de flex não colapsa.
- Arquivos em CRLF no disco: script que edita por substituição lê com `newline=""` e normaliza. Ao medir um diálogo, espere a animação de entrada (~600 ms).
- CLI do shadcn importa `cn` do pacote npm `cn`: troque o import por `@/lib/utils`, `git checkout package.json package-lock.json`, confira `tema.css` e `components.json`.

## Padrão de página

Estados: `linhas`, `edicao` (rascunho ou `null`), `erro` (carga), `erroDoFormulario`, `errosDeCampo`, `salvando`, `carregando`, `busca`.

| Mensagem | Onde aparece |
|---|---|
| falha de carga ou de recarga | `erro` → `<Alerta tom="erro">` logo depois do cabeçalho |
| validação de um campo (obrigatório, formato) | `errosDeCampo.x` → `erro` do `Campo` |
| recusa de regra ou falha ao gravar o formulário | `erroDoFormulario` → `erro` do `DialogoFormulario` |
| recusa ou falha de ação sem formulário (remover) | `avisar.erro(mensagemErro(e, "O professor"))` |

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
- **Troca de escopo recarrega com `carregando`.** Página que depende de um id do shell (`cursoId`) põe `setCarregando(true)` no início do efeito de carga; senão, durante a recarga, ficam à mostra as linhas do escopo anterior e o que se calcula sobre elas (próximo número, botões).
- **Foco.** Não use `ref` para focar o campo com erro nem para devolver o foco: o diálogo e a confirmação já fazem. Depois de remover com sucesso o foco vai para o `body`; se a remoção falha, volta ao botão "Remover". Colunas recriadas a cada desenho, ou linha que troca de chave, fazem a origem do foco sumir e ele cai no `body` também depois de editar. Depois de uma edição que reordena a lista o foco pode cair no `body` (o navegador o perde quando o React move o elemento focado).

## Classes que igualaram a captura antiga

- **Cabeçalho:** nenhuma; o `CabecalhoPagina` escolhe. Botão principal `<Button>`, secundário `variant="outline"`.
- **Tabela:** `.forte` vira `<span className="font-semibold">`; `.fraco`, `text-tx3`; etiqueta pequena, `rounded-[3px] bg-poco px-[5px] text-[10px] text-tx2 tabular-nums`. Número fora da tabela: `font-mono text-[12px] tabular-nums`. Quadro pequeno dentro de seção: `Table` de `@/componentes/ui/table` direto, sem painel, linha de 32 px com `[&_td]:h-8`.
- **Diálogo:** o `DialogoFormulario` já dá 16 px entre os filhos e 20 px até o rodapé. `largo` leva a 720 px.
- **Altura de controle:** a de um controle é a do componente, 28 px (`h-7`). Só dois desvios: a busca do cabeçalho de lista tem 30 px (define a altura do cabeçalho e está sozinha na linha); controle embutido em linha de tabela de 32 px usa `h-6` ou `h-5`. Nunca `h-[30px]` para igualar o pixel de um `<select>`/`<input>` nativo antigo: 2 a 3 px de deslocamento por causa do componente novo são diferença aceita.
- **Botão desabilitado:** de ícone, `BotaoIcone` com `desabilitado` e `motivo`; de texto, `<Button disabled>` com o motivo em texto visível ao lado, ligado por `aria-describedby` (o `disabled` não recebe foco nem pouso, então uma dica não seria alcançada). Exemplo vivo: "Remover o último" em `Periodos.tsx`.
- **Quadro de células centradas** (Períodos): `Table` com `className="table-fixed [&_td]:h-8 [&_td]:text-center [&_th]:text-center"`; números em `font-mono text-[12px] tabular-nums`, cabeçalho de coluna numérica em `font-mono`. `Seletor` centrado na célula: `className="mx-auto h-6 w-[150px] *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:justify-center"`; `Input` embutido: `mx-auto block h-5 w-16 px-1 text-center font-mono`.
- **Chip-botão com contorno** (padrões de bloco): `border` + `py-px pl-1.5 pr-[3px]` iguala o chip antigo (`padding: 2px 4px 2px 7px` com sombra interna); `group` no botão e `group-hover:`/`group-focus-visible:` nos filhos para o "×" e o filete que mudam no pouso; reserve a largura do "×" (`w-[7px]`, `opacity-0`) para o chip não crescer.
- **Campos:** `Seletor` em `Campo` com `className="w-full"` (o gatilho nasce `w-fit`); `Textarea` com `rows`; `<input type="range" className="w-full accent-primary">` nativo; `Input type="number"`.

## Comparar antes e depois

1. Antes de tocar na tela: `npm run test:visual -- -g "<tela>"` passa. Guarde as referências fora do repositório: `git show HEAD:testes/visual/__capturas__/<tela>-claro.png > antes-claro.png` (e a escura).
2. Meça a tela antiga com um spec temporário em `testes/e2e/` (`getBoundingClientRect` e `getComputedStyle` de título, busca, botões, cabeçalhos e duas linhas), gravando um JSON fora do repositório. Converta, meça de novo e compare os números: eles dizem o que está errado; a captura só diz que está.
3. `npm run test:visual -- -g "<tela>" --update-snapshots`, abra as duas imagens novas contra as antigas e anote no relatório cada diferença e o motivo.
4. `npm run test:visual` inteiro: as outras telas passam sem regerar. Se uma diferir, abra o diff e corrija o código. Apague o spec temporário antes do commit.
