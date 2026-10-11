# Refatoração visual — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** trocar a base da interface (shadcn/ui sobre Tailwind, TanStack Table, dnd-kit, lucide-react, Sonner) mantendo a identidade visual, e entregar diálogo de confirmação próprio, toasts, filtros, arrastar na grade manual e desfazer.

**Arquitetura:** o CSS antigo é isolado num contêiner `.legado`, numa camada de cascata abaixo dos utilitários do Tailwind, e cada tarefa converte uma tela inteira para fora dele. Componentes do shadcn em `src/componentes/ui/`, compostos do app em `src/componentes/`. As ações da grade passam por um histórico em memória (`src/grade/`) que guarda a grade do curso antes de cada escrita.

**Stack:** Tauri v2, React 19 + TS 5.8, Vite 7, Tailwind 4.3, shadcn (CLI 4.x, sobre `radix-ui`), `@tanstack/react-table` 8.21, `@dnd-kit/core` 6.3, `lucide-react`, `sonner`, Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-refatoracao-visual-design.md` (leia antes de começar qualquer tarefa).

## Restrições globais

- Textos de interface, comentários e mensagens de commit em **português do Brasil**. Comentário explica o *porquê*, no estilo do código vizinho.
- **Nada depende do nome** de disciplina, sala, professor ou curso. Nomes próprios não aparecem em código nem em comentário. Em teste, só os nomes genéricos que os testes atuais já usam.
- **As três regras do design** (spec, seção homônima) valem para todo componente: identidade nunca é cor; nenhum estado depende só de cor; desabilitado rebaixa texto e borda, nunca `opacity` no bloco. O `disabled:opacity-50` que o shadcn gera é trocado por `disabled:text-tx3 disabled:border-line disabled:pointer-events-none`.
- **Identidade mantida:** ao converter uma tela, o resultado deve se parecer com a captura de referência de antes. Diferença aceitável: a que vem do componente novo (seletor, diálogo, ícone). Mudança de espaçamento, cor ou tamanho de texto sem motivo não é.
- **Densidade:** controles com 28 px de altura (`h-7`), texto de controle `text-sm` (12,5 px), texto corrido `text-base` (13 px), metadado `text-xs` (11 px), `h1` com 17 px e peso 700.
- **A interface não decide regra:** pergunta a `src/regras/` e mostra o motivo. Não mexer em `src/regras/` além do que uma tarefa pedir explicitamente. Não mexer em `src/solver/`.
- Nenhuma migração de banco; nada muda em `src-tauri/`.
- `@tanstack/react-table` fica na **versão 8** (`^8.21.3`). A 9 mudou a API e a documentação do shadcn usa a 8.
- Depois de qualquer `npx shadcn@latest add …`, confira com `git diff src/estilos/tema.css` que o CLI não mexeu no tema; se mexeu, desfaça.
- **Contratos que os e2e usam e não mudam:** a barra lateral é `navigation` e cada item é um `button` com o rótulo atual; toda célula de grade tem `aria-label` "Segunda, M1"; o botão principal dos formulários se chama "Salvar"; linhas de lista são `row` e têm os botões "Editar" e "Remover".
- Comandos: `npm run typecheck`, `npm test` (Vitest, < 20 s), `npm run test:e2e` (Playwright, < 3 min), `npm run test:visual` (capturas, só local), `npm run build`.
- Toda tarefa termina com `npm run typecheck`, `npm test`, `npm run test:e2e` e `npm run build` verdes. Rodar o e2e completo logo depois de uma rodada parcial pode dar `ERR_CONNECTION_REFUSED` no primeiro teste (servidor reaproveitado); rode de novo.
- Commits terminam com o trailer `Co-Authored-By: <modelo que de fato escreveu> <noreply@anthropic.com>`. Sem `git push` (não há remoto).
- Node ≥ 22.13. Plataforma: Windows (Git Bash disponível).

## Receita de conversão de tela

Vale para as tarefas 6 a 11, 13 e 15. Cada uma converte uma tela inteira.

| Antigo (`src/componentes/legado.tsx`, classes do `legado.css`) | Novo |
|---|---|
| `<Modal>` + `<form>` + `.rodape-modal` | `<DialogoFormulario>` (`@/componentes/dialogo-formulario`) |
| `<Campo rotulo dica>` com `<input>` | `<Campo rotulo dica erro>{(a) => <Input {...a} … />}</Campo>` |
| `<select>` | `<Seletor>` (`@/componentes/seletor`) |
| `<Erro>{erro}</Erro>` de carga da página | `<Alerta tom="erro">` |
| erro de gravação em ação sem formulário | `avisar.erro(mensagemErro(e, "…"))` |
| erro ou recusa dentro de formulário | prop `erro` do `DialogoFormulario` |
| `.aviso`, `.aviso.sucesso` | `<Alerta tom="aviso">`, `<Alerta tom="sucesso">` |
| `<table className="lista">` com `Ordenavel` e `comparar` | `useTabela` + `<TabelaDados>` (`@/componentes/tabela-dados`) |
| `<table className="lista compacta …">` (quadro pequeno) | `Table` do shadcn (`@/componentes/ui/table`), sem TanStack |
| `<BotaoIcone><Lapis /></BotaoIcone>` | `<BotaoIcone rotulo="Editar" icone={Pencil} />` (lucide: `Pencil`, `Trash2`) |
| `<Vazio>` | `<EstadoVazio>` |
| `CabecalhoLista`, `.cabecalho-pagina` | `<CabecalhoPagina>` |
| `button.primario` / `button` / `button.perigo` | `<Button>` / `<Button variant="outline">` / `<Button variant="outline" className="text-destructive">` |
| `input[type=checkbox]` | `Checkbox` do shadcn com `Label` |
| `textarea` | `Textarea` do shadcn |

Passos fixos de toda conversão:

1. Tire a captura "antes": `npm run test:visual -- -g "<tela>"` tem de passar (referência atual).
2. Converta a tela pela tabela acima e pelo que a tarefa tem de próprio.
3. Em `src/App.tsx`, tire `legado: true` da página.
4. Apague de `src/estilos/legado.css` os blocos que só essa tela usava (procure cada classe com `grep -rn "nome-da-classe" src/`; se ninguém mais usa, sai).
5. Ajuste os e2e que a tarefa lista.
6. Regere a referência visual só dessa tela (`npm run test:visual -- -g "<tela>" --update-snapshots`) e olhe as duas imagens novas (clara e escura) contra as antigas (`git show HEAD:testes/visual/__capturas__/<arquivo>.png > antes.png`). Anote no relatório da tarefa o que mudou e por quê.
7. `npm run test:visual` inteiro: as outras telas continuam idênticas.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `testes/e2e/paginas.ts` | auxiliares: `responderConfirmacoes`, `escolher`, `escolhida`, `linhaCom`, `arrastar` |
| `testes/visual/telas.spec.ts` (novo), `playwright.config.ts` | capturas por tela, claro e escuro |
| `src/estilos/tema.css` (novo) | camadas, Tailwind, tokens, mapeamento do shadcn |
| `src/estilos/legado.css` (ex-`src/App.css`) | CSS antigo sob `.legado`; apagado na tarefa 17 |
| `src/estilos/grade.css` (novo) | malha da grade manual e de Indisponibilidades |
| `src/lib/utils.ts` (novo), `src/lib/erros.ts` (novo) | `cn`; `mensagemErro` |
| `src/componentes/ui/*` (novo) | shadcn: `button`, `alert-dialog`, `dialog`, `input`, `textarea`, `label`, `select`, `checkbox`, `table`, `tooltip`, `popover`, `badge`, `sonner` |
| `src/componentes/legado.tsx` (ex-`ui.tsx`) | componentes antigos; apagado na tarefa 17 |
| `src/componentes/confirmacao.tsx` (novo) | `ProvedorDeConfirmacao`, `useConfirmar` |
| `src/componentes/toasts.ts` (novo) | `avisar` |
| `src/componentes/alerta.tsx`, `seletor.tsx`, `campo.tsx`, `botao-icone.tsx`, `estado-vazio.tsx`, `cabecalho-pagina.tsx`, `dialogo-formulario.tsx` (novos) | compostos do app |
| `src/componentes/tabela-dados.tsx` (novo), `tabela-dados.test.ts` | `useTabela`, `TabelaDados`, funções puras de ordenação e busca |
| `src/componentes/barra-de-filtros.tsx` (novo) | filtros facetados e chips |
| `src/db.ts` | `transacao` avisa as escritas com a origem |
| `src/grade/historico.ts` (novo), `historico.test.ts` | `criarHistorico` |
| `src/grade/index.ts`, `useHistorico.ts`, `BotaoDesfazer.tsx` (novos) | instância do app, gancho e botão com Ctrl+Z |
| `src/paginas/disciplinas/{index.tsx,colunas.tsx,EditorDisciplina.tsx,salvar.ts}` | Disciplinas dividida |
| `src/paginas/grade-manual/{index.tsx,usarGrade.ts,acoes.ts,acoes.test.ts,Pendencias.tsx,Malha.tsx,Celula.tsx,Diagnostico.tsx}` | Grade manual dividida |
| `src/App.tsx`, `src/main.tsx` | casca nova, provedores, marca `legado` por página |

---

## Onda 0 — Rede

### Tarefa 1: Auxiliares de e2e

Os testes deixam de falar direto com `confirm()` e `<select>` nativos. Nesta tarefa os controles continuam nativos; só muda quem fala com eles.

**Arquivos:**
- Modificar: `testes/e2e/paginas.ts`, `testes/e2e/*.spec.ts` (todos menos `fixtures.ts`), `src/componentes/ui.tsx` (`Modal`), `src/paginas/Disciplinas.tsx` (linhas de fatia), `src/paginas/GradeManual.tsx` (botão da pendência)

**Interfaces:**
- Produz: `responderConfirmacoes(page, resposta?): Promise<string[]>`, `escolher(campo, opcao): Promise<void>`, `escolhida(campo): Promise<string>`, `linhaCom(page, texto): Locator`.

- [ ] **Passo 1: três ganchos de acessibilidade no código antigo**

Em `src/componentes/ui.tsx`, no `Modal`, a `div` interna passa a ser um diálogo de verdade:

```tsx
<div className="modal" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.stopPropagation()}>
```

Em `src/paginas/Disciplinas.tsx`, dentro de `.linha-fatia`: o `<select>` do professor ganha `aria-label={`Professor da fatia ${i + 1}`}` e o `<input type="number">` das aulas ganha `aria-label={`Aulas da fatia ${i + 1}`}`.

Em `src/paginas/GradeManual.tsx`, o botão da pendência ganha `aria-pressed={escolhida === idFatia(f)}`.

- [ ] **Passo 2: `testes/e2e/paginas.ts`**

Troque `aceitarConfirmacoes` pelo bloco abaixo e mantenha `irPara`, `celula` e `contar` como estão:

```ts
import type { Locator, Page } from "@playwright/test";

/**
 * Responde a toda confirmação que aparecer daqui em diante e devolve os textos,
 * na ordem. O array é preenchido conforme as confirmações acontecem.
 */
export async function responderConfirmacoes(
  page: Page,
  resposta: "aceitar" | "recusar" = "aceitar",
): Promise<string[]> {
  const mensagens: string[] = [];
  page.on("dialog", (d) => {
    mensagens.push(d.message());
    void (resposta === "aceitar" ? d.accept() : d.dismiss());
  });
  return mensagens;
}

const nativo = async (campo: Locator) => (await campo.evaluate((el) => el.tagName)) === "SELECT";

/** Escolhe uma opção pelo texto que o usuário vê. Serve ao `<select>` nativo e ao seletor novo. */
export async function escolher(campo: Locator, opcao: string | RegExp) {
  if (await nativo(campo)) {
    const textos = (await campo.locator("option").allTextContents()).map((t) => t.trim());
    const i = textos.findIndex((t) => (typeof opcao === "string" ? t === opcao : opcao.test(t)));
    if (i < 0) throw new Error(`opção não encontrada: ${opcao} em [${textos.join(" | ")}]`);
    await campo.selectOption({ index: i });
    return;
  }
  await campo.click();
  await campo.page().getByRole("option", { name: opcao, exact: typeof opcao === "string" }).click();
}

/** O texto da opção escolhida. */
export async function escolhida(campo: Locator): Promise<string> {
  if (await nativo(campo)) return ((await campo.locator("option:checked").textContent()) ?? "").trim();
  return ((await campo.textContent()) ?? "").trim();
}

/** A linha de tabela que contém exatamente este texto numa das células. */
export function linhaCom(page: Page, texto: string): Locator {
  return page.getByRole("row").filter({ has: page.getByText(texto, { exact: true }) });
}
```

- [ ] **Passo 3: trocar os usos nos specs**

Regras de troca, aplicadas a todos os specs:

| Antes | Depois |
|---|---|
| `aceitarConfirmacoes(page);` | `await responderConfirmacoes(page);` |
| `const mensagens: string[] = []; page.on("dialog", (d) => { mensagens.push(d.message()); d.accept(); });` | `const mensagens = await responderConfirmacoes(page);` |
| o mesmo com `d.dismiss()` | `const mensagens = await responderConfirmacoes(page, "recusar");` |
| `page.on("dialog", (d) => d.dismiss());` … `const dialogo = page.waitForEvent("dialog");` … `await dialogo;` | `const mensagens = await responderConfirmacoes(page, "recusar");` … (sem `waitForEvent`) … `await expect.poll(() => mensagens.length).toBe(1);` |
| `page.locator("tr", { has: page.getByText(nome, { exact: true }) })` | `linhaCom(page, nome)` |
| `page.locator(".modal select").first()` | `page.getByRole("dialog").getByLabel("Período", { exact: true })` |
| `page.locator(".linha-fatia input[type=number]").first()` | `page.getByLabel("Aulas da fatia 1")` |
| `expect(pendencia).toHaveClass(/ativo/)` | `expect(pendencia).toHaveAttribute("aria-pressed", "true")` |
| `expect(semana).toHaveValue("6")` / `("5")` | `expect.poll(() => escolhida(semana)).toBe("Segunda a sábado")` / `("Segunda a sexta")` |

`selectOption` por valor vira `escolher` pelo texto visível:

| Arquivo | Antes | Depois |
|---|---|---|
| `bugs-conhecidos`, `cadastros` | `semana.selectOption("5")` / `("6")` | `escolher(semana, "Segunda a sexta")` / `"Segunda a sábado"` |
| `bugs-conhecidos` (B3) | `seletor.selectOption(String(novo))` | `escolher(periodo, new RegExp(`^${novo}º`))` |
| `disciplinas` | `…selectOption("2")` em `.modal select` | `escolher(…, /^2º/)` |
| `disciplinas` | `getByLabel("Preferência por A02").selectOption("2")` | `escolher(page.getByLabel("Preferência por A02"), "aceitável")` |
| `disciplinas` | `getByLabel(/^Requisito/).selectOption("nenhuma")` / `("tipo")` | `escolher(…, "Não ocupa sala")` / `"Qualquer sala de um tipo"` |
| `disciplinas` | `getByLabel(/^Tipo exigido/).selectOption("Laboratório")` | `escolher(…, /^Laboratório/)` |
| `salas` | `getByLabel(/^Tipo/).selectOption(tipo)` | `escolher(page.getByLabel(/^Tipo/), tipo)` |
| `grade-manual` | `…selectOption({ label: "A01 (aceitável)" })` / `{ label: "Lab 1" }` | `escolher(…, "A01 (aceitável)")` / `"Lab 1"` |
| `grade-manual` | `expect(sala.locator("option:checked")).toHaveText("A01 (atual, fora do requisito)")` | `expect.poll(() => escolhida(sala)).toBe("A01 (atual, fora do requisito)")` |

O teste I2 de `bugs-conhecidos` ("avisa, e cancelar não muda nada") fica:

```ts
await irPara(page, "Regras");
const semana = page.getByLabel("Semana");
await expect(semana).toBeVisible();
const mensagens = await responderConfirmacoes(page, "recusar");
await escolher(semana, "Segunda a sexta");
await expect.poll(() => mensagens.join("\n")).toMatch(/aulas? no sábado/i);
await expect.poll(() => escolhida(semana)).toBe("Segunda a sábado");
expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 5")).toBe(1);
expect(contar(banco, "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'")).toBe(6);
```

Atualize os `import` de cada spec.

- [ ] **Passo 4: conferir que nada nativo sobrou nos specs**

Run: `grep -n 'on("dialog"\|once("dialog"\|waitForEvent("dialog"\|selectOption\|option:checked\|toHaveValue\|toHaveClass\|\.locator(' testes/e2e/*.spec.ts`
Esperado: nenhuma linha.

- [ ] **Passo 5: rodar**

Run: `npm run typecheck && npm run test:e2e`
Esperado: 45 testes passam.

- [ ] **Passo 6: commit**

```bash
git add testes/e2e src/componentes/ui.tsx src/paginas/Disciplinas.tsx src/paginas/GradeManual.tsx
git commit -m "Testes e2e: confirmação e seletor atrás de auxiliares"
```

### Tarefa 2: Capturas de referência

**Arquivos:**
- Criar: `testes/visual/telas.spec.ts`, `testes/visual/__capturas__/*.png`
- Modificar: `playwright.config.ts`, `package.json` (scripts), `README.md` (seção de testes)

**Interfaces:**
- Produz: `npm run test:visual`; nomes de captura `<id>-<claro|escuro>.png`.

- [ ] **Passo 1: dois projetos no Playwright**

Em `playwright.config.ts`, troque `testDir` e `projects` por:

```ts
  snapshotPathTemplate: "testes/visual/__capturas__/{arg}{ext}",
  expect: { timeout: 10_000, toHaveScreenshot: { animations: "disabled", maxDiffPixels: 0 } },
  projects: [
    {
      name: "chromium",
      testDir: "testes/e2e",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
    },
    {
      // Só local: a renderização de fonte muda entre sistemas, e as referências são do Windows.
      name: "visual",
      testDir: "testes/visual",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
    },
  ],
```

(O `expect` substitui o `expect: { timeout: 10_000 }` que já existe; tire o `testDir` do topo.)

Em `package.json`:

```json
    "test:e2e": "playwright test --project=chromium",
    "test:visual": "playwright test --project=visual",
```

- [ ] **Passo 2: o spec**

`testes/visual/telas.spec.ts`:

```ts
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../e2e/fixtures";
import { celula, irPara, linhaCom } from "../e2e/paginas";

/** Cada tela, com o que precisa estar visível para ela estar pronta. */
const TELAS: { id: string; rotulo: string; pronta: (p: Page) => Locator }[] = [
  { id: "periodos", rotulo: "Períodos", pronta: (p) => p.getByRole("cell").first() },
  { id: "disciplinas", rotulo: "Disciplinas", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "professores", rotulo: "Professores", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "salas", rotulo: "Salas", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "indisponibilidades", rotulo: "Indisponibilidades", pronta: (p) => p.getByRole("main").getByRole("listitem").first() },
  { id: "tipos", rotulo: "Tipos de disciplina", pronta: (p) => p.getByRole("row").nth(1) },
  { id: "regras", rotulo: "Regras", pronta: (p) => p.getByLabel("Semana") },
  { id: "grade-manual", rotulo: "Manual", pronta: (p) => celula(p, "Segunda", "M1") },
  { id: "grade-automatica", rotulo: "Automática", pronta: (p) => p.getByRole("button", { name: "Gerar grade" }) },
  { id: "cursos", rotulo: "Gerenciar cursos", pronta: (p) => p.getByRole("row").nth(1) },
];

for (const [esquema, sufixo] of [["light", "claro"], ["dark", "escuro"]] as const) {
  test.describe(sufixo, () => {
    test.use({ colorScheme: esquema });

    for (const tela of TELAS) {
      test(tela.rotulo, async ({ page }) => {
        await irPara(page, tela.rotulo);
        await expect(tela.pronta(page)).toBeVisible();
        await expect(page).toHaveScreenshot(`${tela.id}-${sufixo}.png`, { fullPage: true });
      });
    }

    test("Disciplinas, editor aberto", async ({ page }) => {
      await irPara(page, "Disciplinas");
      await page.getByRole("row").nth(1).getByRole("button", { name: "Editar" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page).toHaveScreenshot(`disciplinas-editor-${sufixo}.png`);
    });

    test("Manual, pendência escolhida", async ({ page }) => {
      await irPara(page, "Manual");
      await page.getByRole("main").getByRole("listitem").first().getByRole("button").click();
      await expect(page).toHaveScreenshot(`grade-manual-escolhida-${sufixo}.png`, { fullPage: true });
    });
  });
}
```

`linhaCom` fica importado para as tarefas seguintes usarem; se o typecheck reclamar de import sem uso, tire-o.

Se `getByRole("main")` não achar nada na tela antiga, é porque o `<main>` existe mas a lista de Indisponibilidades ou de pendências não é `listitem` visível: confira no navegador e ajuste só o `pronta` daquela tela.

- [ ] **Passo 3: gerar as referências**

Run: `npm run test:visual -- --update-snapshots`
Esperado: 24 arquivos em `testes/visual/__capturas__/`. Abra quatro deles (Disciplinas e Manual, claro e escuro) e confira que mostram a tela carregada, com dados, e não um estado vazio.

- [ ] **Passo 4: estabilidade**

Run: `npm run test:visual` três vezes seguidas.
Esperado: 24 passam nas três. Se alguma tela oscilar, o `pronta` dela não espera o suficiente: troque por um elemento que só existe depois da carga.

- [ ] **Passo 5: README**

Na seção de testes do `README.md`, acrescente:

```markdown
- `npm run test:visual` — compara cada tela, no claro e no escuro, com as capturas de
  `testes/visual/__capturas__/`. Só roda localmente, no Windows. Mudança visual de
  propósito: `npm run test:visual -- -g "<tela>" --update-snapshots` e confira as imagens.
```

- [ ] **Passo 6: commit**

```bash
git add playwright.config.ts package.json README.md testes/visual
git commit -m "Testes: capturas de referência de cada tela, no claro e no escuro"
```

---

## Onda 1 — Fundação

### Tarefa 3: Tailwind, tema e isolamento do CSS antigo

Ao fim desta tarefa o app tem a mesma aparência, pixel a pixel. Tailwind e o tema estão carregados e nada os usa ainda.

**Arquivos:**
- Criar: `src/estilos/tema.css`, `src/lib/utils.ts`, `components.json`
- Mover: `src/App.css` → `src/estilos/legado.css`; `src/componentes/ui.tsx` → `src/componentes/legado.tsx`
- Modificar: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `testes/tsconfig.json`, `src/main.tsx`, `src/App.tsx`, todo arquivo que importa `../componentes/ui`

**Interfaces:**
- Produz: alias `@/` → `src/`; `cn(...classes)` em `@/lib/utils`; classes de cor do tema (`bg-background`, `text-foreground`, `bg-panel`, `bg-inset`, `border-line`, `border-line-s`, `text-tx2`, `text-tx3`, `bg-acc-bg`, `border-acc-line`, `bg-off`, `bg-warn`, `text-destructive`, `bg-primary`…); contêiner `.legado`.

- [ ] **Passo 1: dependências**

```bash
npm install radix-ui class-variance-authority clsx tailwind-merge lucide-react sonner @tanstack/react-table@^8.21.3 @dnd-kit/core
npm install -D tailwindcss @tailwindcss/vite tw-animate-css
```

- [ ] **Passo 2: alias e plugin**

`vite.config.ts`: acrescente os imports e as duas chaves:

```ts
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
// …
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
```

`vitest.config.ts`: a mesma chave `resolve`, com o mesmo import de `node:url`, no objeto passado a `defineConfig`.

`tsconfig.json`, em `compilerOptions`: `"baseUrl": ".", "paths": { "@/*": ["./src/*"] }`.
`testes/tsconfig.json`, em `compilerOptions`: `"baseUrl": ".", "paths": { "@/*": ["../src/*"] }`.

Se `tsconfig.node.json` reclamar de `node:url`, acrescente `"types": ["node"]` nele.

- [ ] **Passo 3: `src/lib/utils.ts` e `components.json`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes));
}
```

`components.json`, na raiz:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/estilos/tema.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/componentes",
    "utils": "@/lib/utils",
    "ui": "@/componentes/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Passo 4: mover e aninhar o CSS antigo**

```bash
mkdir -p src/estilos
git mv src/App.css src/estilos/legado.css
git mv src/componentes/ui.tsx src/componentes/legado.tsx
```

Troque `"../componentes/ui"` por `"../componentes/legado"` (e `"./ui"` por `"./legado"` em `RequisitoSala.tsx`) em todos os arquivos que importam de lá. Tire o `import "./App.css";` de `src/App.tsx`.

Em `src/estilos/legado.css`:

1. Recorte o comentário de abertura, o bloco `:root { … }`, o bloco `@media (prefers-color-scheme: dark) { :root { … } }` e o bloco `body { … }`. Eles vão para o `tema.css` (passo 5).
2. Envolva **todo o resto** em `.legado { … }` (aninhamento de CSS; o Tailwind achata na compilação).
3. No topo do arquivo, antes do `.legado { … }`, ponha:

```css
/*
 * CSS das telas ainda não convertidas. Vale só dentro de `.legado` e mora numa
 * camada abaixo dos utilitários do Tailwind. Some quando a última tela sair.
 *
 * O reset do Tailwind é desfeito aqui dentro: estas regras foram escritas
 * contando com os padrões do navegador. `:where()` zera a especificidade, para
 * qualquer regra antiga vencer o `revert`.
 */
:where(.legado),
:where(.legado) * {
  all: revert;
}

:where(.legado) *::before,
:where(.legado) *::after {
  all: revert;
}

/* O que as telas antigas herdavam de `:root` e do padrão do navegador. */
.legado {
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  line-height: normal;
  color: var(--tx);
}
```

- [ ] **Passo 5: `src/estilos/tema.css`**

Os valores de cor são os que você recortou do `legado.css`: copie-os sem alterar nenhum.

```css
/*
 * Sistema visual — Distribuição de Aulas
 *
 * Os valores vêm do design em `docs/design/`. Três regras dele que não devem
 * ser desfeitas sem pensar:
 *
 * 1. Identidade nunca é cor. Com 55 disciplinas e 22 professores, matiz vira
 *    ruído: disciplina, professor e sala são sempre texto. A cor carrega três
 *    significados fixos — acento (apto/seleção/ação), negativo (impedimento) e
 *    âmbar (tolerado). Não acrescente uma quarta sem um significado novo.
 * 2. Nenhum estado depende só de cor. Tracejado, listras, cadeado e rebaixo
 *    carregam o significado junto.
 * 3. Desabilitado rebaixa texto e borda; nunca `opacity` no bloco inteiro —
 *    isso embaça também o texto que explica por que está desabilitado.
 *
 * Claro e escuro remapeiam os mesmos papéis. A geometria não muda.
 */

/* A ordem das camadas é o que deixa o CSS antigo conviver: ele vence o reset
   do Tailwind e perde para os utilitários. */
@layer theme, base, legado, components, utilities;

@import "tailwindcss";
@import "tw-animate-css";
@import "./legado.css" layer(legado);

:root {
  color-scheme: light dark;

  /* === os papéis de cor: cole aqui, sem mudar, o conteúdo do `:root` antigo,
         de `--bg` até `--rp`, com os comentários === */

  /* Os nomes do shadcn apontam para os papéis acima. `--card` já existe com
     esse nome e serve aos dois. */
  --background: var(--bg);
  --foreground: var(--tx);
  --card-foreground: var(--tx);
  --popover: var(--card);
  --popover-foreground: var(--tx);
  --primary: var(--acc);
  --primary-foreground: var(--onAcc);
  --secondary: var(--inset);
  --secondary-foreground: var(--tx);
  --muted: var(--inset);
  --muted-foreground: var(--tx2);
  --accent: var(--hover);
  --accent-foreground: var(--tx);
  --destructive: var(--neg);
  --border: var(--line);
  --input: var(--lineC);
  --ring: var(--acc);
}

@media (prefers-color-scheme: dark) {
  :root {
    /* === cole aqui, sem mudar, o conteúdo do `:root` escuro antigo === */
  }
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Papéis sem par no shadcn. */
  --color-panel: var(--panel);
  --color-inset: var(--inset);
  --color-line: var(--line);
  --color-line-s: var(--lineS);
  --color-tx2: var(--tx2);
  --color-tx3: var(--tx3);
  --color-acc-bg: var(--accBg);
  --color-acc-line: var(--accLine);
  --color-off: var(--off);
  --color-warn: var(--warnDot);
  --color-stripe: var(--stripe);
  --color-sombra: var(--shadow);

  --font-sans: "Segoe UI", system-ui, sans-serif;

  /* A densidade do design: 13 px de base, controles com texto de 12,5 px. */
  --text-xs: 11px;
  --text-sm: 12.5px;
  --text-base: 13px;
  --text-lg: 15px;
  --text-xl: 17px;

  --radius-sm: 4px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-xl: 8px;
}

@layer base {
  body {
    background: var(--bg);
    color: var(--tx);
    font-size: 13px;
  }

  /* Anel de foco próprio, afastado da borda e só com teclado — nunca o mesmo
     desenho do hover, senão o teclado e o mouse ficam indistinguíveis. */
  :focus-visible {
    outline: 2px solid var(--acc);
    outline-offset: 2px;
  }
}
```

O `font-family` e o `font-size: 13px` que estavam no `:root` antigo **não** voltam para o `:root`: a raiz fica com os 16 px do navegador, para o `rem` do Tailwind valer 16 px. O legado não usa `rem` (confira: `grep -c '[0-9]rem' src/estilos/legado.css` dá 0).

- [ ] **Passo 6: carregar o tema e envolver o app**

Em `src/main.tsx`: acrescente `import "./estilos/tema.css";` no topo. Envolva a árvore:

```tsx
    <div className="legado">
      <Barreira>
        <App />
      </Barreira>
    </div>
```

Em `mostrarFalhaGlobal`, o HTML injetado ganha o mesmo contêiner: `'<div class="legado"><main class="falha">…</main></div>'`.

- [ ] **Passo 7: a prova — capturas idênticas**

Run: `npm run test:visual`
Esperado: 24 passam, sem atualizar referência nenhuma.

Se alguma falhar, abra o diff em `test-results/` e corrija no `legado.css`/`tema.css`. Culpados prováveis, nesta ordem:
- propriedade herdada que vinha do padrão do navegador e agora vem do reset (`line-height`, `font-feature-settings`, `letter-spacing`): fixe-a no bloco `.legado { … }` do topo;
- seletor que não casa mais depois do aninhamento (algo que mirava `body`, `html` ou `:root`);
- pseudo-elemento (`::placeholder`, `::marker`, `::file-selector-button`) que o reset alcança e o `revert` do topo não: acrescente-o à lista do `revert`.

Não regere referência nesta tarefa. Não aceite "quase igual".

- [ ] **Passo 8: o resto da verificação**

Run: `npm run typecheck && npm test && npm run test:e2e && npm run build`
Esperado: tudo verde. No `dist/`, o CSS gerado contém `.legado` nos seletores antigos (`grep -c "\.legado" dist/assets/*.css` maior que zero).

- [ ] **Passo 9: commit**

```bash
git add -A
git commit -m "Fundação: Tailwind, tema com os tokens atuais e CSS antigo isolado em .legado"
```

---

## Onda 2 — Interação

### Tarefa 4: Diálogo de confirmação

Troca as 12 chamadas de `confirm()` de uma vez. O diálogo novo é desenhado em portal, fora de `.legado`, e funciona sobre tela antiga.

**Arquivos:**
- Criar: `src/componentes/ui/button.tsx`, `src/componentes/ui/alert-dialog.tsx` (pelo CLI), `src/componentes/confirmacao.tsx`
- Modificar: `src/main.tsx`, as 8 páginas com `confirm(`, `testes/e2e/paginas.ts`, `testes/visual/telas.spec.ts`
- Teste: `testes/e2e/confirmacao.spec.ts` (novo)

**Interfaces:**
- Produz:
  ```ts
  interface OpcoesDeConfirmacao { titulo: string; descricao?: string; itens?: string[]; confirmar: string; perigo?: boolean }
  function useConfirmar(): (o: OpcoesDeConfirmacao) => Promise<boolean>
  function ProvedorDeConfirmacao(props: { children: ReactNode }): JSX.Element
  ```
- O diálogo é `role="alertdialog"`; os botões têm `data-slot="alert-dialog-action"` e `data-slot="alert-dialog-cancel"` (é o que o shadcn gera; confira no arquivo gerado).

- [ ] **Passo 1: componentes do shadcn**

```bash
npx shadcn@latest add button alert-dialog
git diff --stat src/estilos/tema.css   # tem de sair vazio
```

Ajuste `src/componentes/ui/button.tsx` à densidade e às regras do design: tamanho padrão `h-7 px-3 text-sm`, `sm` com `h-6 px-2`, `icon` com `size-7`; raio `rounded-md`; em toda variante, troque `disabled:opacity-50` por `disabled:text-tx3 disabled:border-line disabled:bg-inset disabled:pointer-events-none`. A variante `outline` usa `border border-input bg-panel hover:bg-accent`. A variante `destructive` é a de ação destrutiva confirmada: `bg-destructive text-white`.

Em `alert-dialog.tsx`: conteúdo com `bg-panel rounded-xl border border-line shadow-[0_10px_30px_var(--shadow)] max-w-[540px]`, título `text-lg font-bold`, descrição `text-base text-tx2`.

- [ ] **Passo 2: teste que falha**

`testes/e2e/confirmacao.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { contar, irPara } from "./paginas";

test.use({ semMassa: true, semente: "INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');" });

test("a confirmação abre com o foco em Cancelar e Esc cancela", async ({ page, banco }) => {
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Remover" }).click();
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo).toContainText("Remover Ana Souza?");
  await expect(dialogo.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialogo).toHaveCount(0);
  expect(contar(banco, "SELECT COUNT(*) FROM professores")).toBe(1);
});

test("o botão de confirmar diz o que faz e executa", async ({ page, banco }) => {
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Remover" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover professor" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM professores")).toBe(0);
});
```

Run: `npm run test:e2e -- confirmacao`
Esperado: FALHA (não há `alertdialog`; o `confirm()` nativo é recusado pelo Playwright).

- [ ] **Passo 3: `src/componentes/confirmacao.tsx`**

```tsx
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/componentes/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface OpcoesDeConfirmacao {
  titulo: string;
  descricao?: string;
  /** Uma linha por item atingido: a lista rola, o diálogo não cresce. */
  itens?: string[];
  /** Rótulo do botão que confirma, com o verbo da ação. */
  confirmar: string;
  /** Ação destrutiva: o botão ganha a cor de negativo. */
  perigo?: boolean;
}

type Confirmar = (o: OpcoesDeConfirmacao) => Promise<boolean>;

const Contexto = createContext<Confirmar | null>(null);

export function useConfirmar(): Confirmar {
  const confirmar = useContext(Contexto);
  if (!confirmar) throw new Error("useConfirmar fora do ProvedorDeConfirmacao");
  return confirmar;
}

/**
 * Um diálogo só para o app inteiro, aberto por promessa: quem chama escreve
 * `if (!(await confirmar({ … }))) return;`, como fazia com `confirm()`.
 */
export function ProvedorDeConfirmacao({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<OpcoesDeConfirmacao | null>(null);
  const resolver = useRef<((aceito: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>(
    (o) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setPedido(o);
      }),
    [],
  );

  // Aceitar também dispara o fechamento; o segundo chamado acha `resolver` vazio.
  const responder = (aceito: boolean) => {
    resolver.current?.(aceito);
    resolver.current = null;
    setPedido(null);
  };

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      <AlertDialog open={pedido != null} onOpenChange={(aberto) => !aberto && responder(false)}>
        {pedido && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pedido.titulo}</AlertDialogTitle>
              {pedido.descricao && <AlertDialogDescription>{pedido.descricao}</AlertDialogDescription>}
            </AlertDialogHeader>
            {pedido.itens && pedido.itens.length > 0 && (
              <ul className="max-h-48 overflow-auto rounded-md bg-inset px-3 py-2 text-sm">
                {pedido.itens.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className={cn(pedido.perigo && "bg-destructive text-white hover:bg-destructive")}
                onClick={() => responder(true)}
              >
                {pedido.confirmar}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </Contexto.Provider>
  );
}
```

Em `src/main.tsx`, o provedor envolve o app, **fora** do `.legado` não é necessário (o diálogo sai em portal), mas dentro da `Barreira`:

```tsx
<Barreira>
  <ProvedorDeConfirmacao>
    <App />
  </ProvedorDeConfirmacao>
</Barreira>
```

- [ ] **Passo 4: as 12 chamadas**

Em cada página, `const confirmar = useConfirmar();` no componente e a chamada vira `if (!(await confirmar({ … }))) return;`. O texto se divide assim: **título** é a pergunta; **descrição** é a frase explicativa original, inteira e sem mudar as palavras (os e2e casam com ela); **itens** são as linhas da lista original (o array que hoje é juntado com `"\n"`); **botão** é verbo e objeto.

| Onde | Título | Descrição | Itens | Botão | Perigo |
|---|---|---|---|---|---|
| `GradeManual` limpar | `Apagar as aulas do Nº período?` | `As N aula(s) fixadas ficam.` (só se houver) | — | `Limpar período` | sim |
| `Disciplinas` aulas atingidas | `Apagar aulas desta disciplina?` | `N aula(s) desta disciplina serão apagadas, porque deixam de valer com a mudança (K fixada(s)).` e a frase final original, se houver | `quais` | `Salvar e apagar N aula(s)` | sim |
| `Disciplinas` remover | `Remover <nome>?` | `As N aula(s) dela na grade saem junto.` | — | `Remover disciplina` | sim |
| `Professores` remover | `Remover <nome>?` | — | — | `Remover professor` | sim |
| `Tipos` remover | `Remover o tipo "<nome>"?` | — | — | `Remover tipo` | sim |
| `GradeAutomatica` aplicar | `Substituir a grade atual pela gerada?` | `N aula(s) hoje → M aula(s). As K aula(s) fixadas são preservadas.` | — | `Aplicar a grade` | não |
| `Salas` aulas sem sala | `Apagar aulas sem sala?` | `N aula(s) serão apagadas, porque não há outra sala do tipo exigido livre no horário (K fixada(s)).` | `quais` | `Salvar e apagar N aula(s)` | sim |
| `Salas` remover | `Remover a sala <nome>?` | — | — | `Remover sala` | sim |
| `Instituicao` sábado | `Tirar o sábado da semana?` | `N aula(s) no sábado, somando todos os cursos, serão apagadas.` (com o singular/plural de hoje) | — | `Apagar e tirar o sábado` | sim |
| `Instituicao` padrão | `Remover o padrão <padrão> de N aula(s)?` | — | — | `Remover padrão` | sim |
| `Cursos` turno | `Tirar o turno do curso?` | `N aula(s) no turno da <rótulos> serão apagadas.` (com o singular/plural de hoje) | — | `Salvar e apagar` | sim |
| `Cursos` remover | `Remover <nome>?` | `Saem junto N período(s), N disciplina(s) e N aula(s) da grade. Professores e salas não são afetados: pertencem à instituição.` | — | `Remover curso` | sim |

A chamada de `Instituicao` que está dentro de um `onClick` (`confirm(…) && tentar(…)`) vira uma função `async` com `if (!(await confirmar(…))) return;`.

Run: `grep -rn "confirm(" src/` → nenhuma linha.

- [ ] **Passo 5: o auxiliar de e2e passa a falar com o diálogo novo**

Em `testes/e2e/paginas.ts`, substitua `responderConfirmacoes` inteiro:

```ts
/**
 * Responde a toda confirmação que aparecer daqui em diante e devolve os textos,
 * na ordem. Um observador na própria página clica no botão assim que o diálogo
 * aparece: funciona mesmo quando o teste está parado num `expect.poll` sobre o
 * banco, sem tocar na página.
 */
export async function responderConfirmacoes(
  page: Page,
  resposta: "aceitar" | "recusar" = "aceitar",
): Promise<string[]> {
  const mensagens: string[] = [];
  await page.exposeFunction("__confirmacao", (texto: string) => {
    mensagens.push(texto);
  });
  const instalar = (resposta: string) => {
    const responder = () => {
      const abertos = document.querySelectorAll<HTMLElement>('[role="alertdialog"]:not([data-respondido])');
      for (const dialogo of abertos) {
        dialogo.dataset.respondido = "1";
        void (window as unknown as { __confirmacao: (t: string) => void }).__confirmacao(dialogo.innerText);
        const slot = resposta === "aceitar" ? "alert-dialog-action" : "alert-dialog-cancel";
        dialogo.querySelector<HTMLElement>(`[data-slot="${slot}"]`)?.click();
      }
    };
    new MutationObserver(responder).observe(document, { childList: true, subtree: true });
    responder();
  };
  await page.addInitScript(instalar, resposta); // sobrevive a `page.reload()`
  await page.evaluate(instalar, resposta);
  return mensagens;
}
```

Chame-a no máximo uma vez por teste (o `exposeFunction` não aceita o mesmo nome duas vezes).

- [ ] **Passo 6: rodar**

Run: `npm run test:e2e`
Esperado: 47 passam (45 + 2). Os testes que casam o texto da confirmação (`/2 aula\(s\) desta disciplina serão apagadas/`, `/Segunda M1 — Disciplina não ofertada/`, `/1 aula no turno da tarde/`, `/Alfa, 1º período, Segunda M1 — Cálculo/`, `/aulas? no sábado/i`) continuam passando; se algum falhar, a frase foi alterada ou partida em dois elementos — recomponha-a.

- [ ] **Passo 7: captura do diálogo**

Em `testes/visual/telas.spec.ts`, dentro do `describe` de cada esquema:

```ts
    test("Confirmação", async ({ page }) => {
      await irPara(page, "Professores");
      await page.getByRole("row").nth(1).getByRole("button", { name: "Remover" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page).toHaveScreenshot(`confirmacao-${sufixo}.png`);
    });
```

Run: `npm run test:visual -- -g "Confirmação" --update-snapshots` e olhe as duas imagens: o diálogo usa as cores do tema nos dois esquemas, o botão de perigo está na cor de negativo. Depois `npm run test:visual` inteiro: as 24 anteriores continuam idênticas.

- [ ] **Passo 8: commit**

```bash
git add -A
git commit -m "Confirmação em diálogo próprio nas 12 chamadas; some o confirm() nativo"
```

### Tarefa 5: Casca, toasts, alerta e seletor

**Arquivos:**
- Criar: `src/componentes/ui/{select,tooltip,sonner}.tsx`, `src/componentes/{toasts.ts,alerta.tsx,seletor.tsx}`, `src/lib/erros.ts`
- Modificar: `src/App.tsx`, `src/main.tsx`, `src/componentes/legado.tsx`, `src/estilos/legado.css`
- Teste: `testes/e2e/casca.spec.ts` (novo)

**Interfaces:**
- Produz:
  ```ts
  // @/componentes/toasts
  const avisar: {
    sucesso(texto: string, descricao?: string): void;
    erro(texto: string): void;
    aviso(texto: string): void;
    desfazer(texto: string, aoDesfazer: () => void): void;
  }
  // @/componentes/alerta
  function Alerta(p: { tom: "erro" | "aviso" | "sucesso"; children: ReactNode; className?: string }): JSX.Element | null
  // @/componentes/seletor
  interface Opcao<V> { valor: V; rotulo: string; desabilitada?: boolean }
  function Seletor<V extends string | number | null>(p: {
    valor: V; opcoes: Opcao<V>[]; aoMudar: (v: V) => void;
    rotulo?: string;            // vira aria-label; dispensável quando há <Label htmlFor>
    id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean;
    exibir?: ReactNode;         // texto do gatilho, quando difere do rótulo da opção
    desabilitado?: boolean; className?: string;
  }): JSX.Element
  // @/lib/erros
  function mensagemErro(e: unknown, contexto: string): string
  ```
- `App` passa `aoNavegar: (id: string) => void` às páginas e marca cada uma com `legado: boolean`.

- [ ] **Passo 1: componentes do shadcn**

```bash
npx shadcn@latest add select tooltip
git diff --stat src/estilos/tema.css   # vazio
```

`select.tsx`: gatilho com `h-7 px-2 text-sm border border-input bg-panel rounded-md`, sem `opacity` em desabilitado; conteúdo `bg-card border border-line rounded-md shadow-[0_10px_30px_var(--shadow)]`; item `text-sm py-1`, destacado com `bg-accent`.

`src/componentes/ui/sonner.tsx`, escrito à mão (a versão do CLI depende de `next-themes`, que não entra):

```tsx
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Segue o tema do sistema, como o resto do app. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-card !text-foreground !border-line !rounded-lg !text-base",
          description: "!text-tx2",
          actionButton: "!bg-primary !text-primary-foreground",
        },
      }}
      {...props}
    />
  );
}
```

- [ ] **Passo 2: `src/lib/erros.ts`**

Mova `mensagemErro` de `src/componentes/legado.tsx` para cá, com o comentário, e em `legado.tsx` deixe `export { mensagemErro } from "@/lib/erros";` (as telas antigas continuam importando de lá).

- [ ] **Passo 3: `src/componentes/toasts.ts`**

```ts
import { toast } from "sonner";

/**
 * Sucesso some sozinho; erro fica até ser fechado, porque é texto que a pessoa
 * precisa ler; "desfazer" dura o dobro do sucesso.
 */
export const avisar = {
  sucesso(texto: string, descricao?: string) {
    toast.success(texto, { description: descricao, duration: 5_000 });
  },
  erro(texto: string) {
    toast.error(texto, { duration: Infinity, closeButton: true });
  },
  /** Recusa esperada (soltar em célula impedida): informa e some. */
  aviso(texto: string) {
    toast(texto, { duration: 5_000 });
  },
  desfazer(texto: string, aoDesfazer: () => void) {
    toast(texto, { duration: 10_000, action: { label: "Desfazer", onClick: aoDesfazer } });
  },
};
```

- [ ] **Passo 4: `src/componentes/alerta.tsx`**

```tsx
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONS = {
  erro: { icone: CircleAlert, classe: "border-destructive text-destructive", papel: "alert" },
  aviso: { icone: TriangleAlert, classe: "border-warn text-foreground", papel: "status" },
  sucesso: { icone: CircleCheck, classe: "border-acc-line bg-acc-bg text-foreground", papel: "status" },
} as const;

/** Mensagem na página ou no diálogo. O ícone carrega o tom junto com a cor. */
export function Alerta({
  tom,
  children,
  className,
}: {
  tom: keyof typeof TONS;
  children: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  const { icone: Icone, classe, papel } = TONS[tom];
  return (
    <div role={papel} className={cn("mb-3 flex items-start gap-2 rounded-md border bg-panel px-3 py-2 text-base", classe, className)}>
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 whitespace-pre-wrap">{children}</div>
    </div>
  );
}
```

- [ ] **Passo 5: `src/componentes/seletor.tsx`**

```tsx
import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/componentes/ui/select";

export interface Opcao<V> {
  valor: V;
  rotulo: string;
  desabilitada?: boolean;
}

/**
 * O `Select` do shadcn só conhece texto. Aqui o valor é o que a tela usa
 * (número, texto ou nulo) e a posição na lista é o que vai para o Radix.
 */
export function Seletor<V extends string | number | null>({
  valor,
  opcoes,
  aoMudar,
  rotulo,
  exibir,
  desabilitado,
  className,
  ...aria
}: {
  valor: V;
  opcoes: Opcao<V>[];
  aoMudar: (v: V) => void;
  rotulo?: string;
  exibir?: ReactNode;
  desabilitado?: boolean;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const atual = opcoes.findIndex((o) => o.valor === valor);
  return (
    <Select
      value={atual < 0 ? "" : String(atual)}
      onValueChange={(i) => aoMudar(opcoes[Number(i)].valor)}
      disabled={desabilitado}
    >
      <SelectTrigger aria-label={rotulo} className={className} {...aria}>
        <SelectValue>{exibir}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o, i) => (
          <SelectItem key={i} value={String(i)} disabled={o.desabilitada}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

Se `exibir` for `undefined`, o `SelectValue` mostra o texto da opção escolhida (comportamento do Radix quando não recebe filhos): passe `exibir` só quando o gatilho deve mostrar outra coisa.

- [ ] **Passo 6: teste que falha**

`testes/e2e/casca.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { escolher, irPara } from "./paginas";

test.describe("navegação", () => {
  test("o item ativo é marcado para leitor de tela", async ({ page }) => {
    await irPara(page, "Professores");
    const item = page.getByRole("navigation").getByRole("button", { name: "Professores", exact: true });
    await expect(item).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Professores");
  });
});

test.describe("seletor de curso", () => {
  test.use({ semente: "INSERT INTO cursos (id, nome) VALUES (2, 'Zeta');" });

  test("trocar de curso troca o conteúdo", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    await escolher(page.getByRole("navigation").getByRole("combobox", { name: "Curso" }), "Zeta");
    await expect(page.getByRole("row")).toHaveCount(0);
  });
});
```

Se a tela de Disciplinas vazia ainda mostrar a linha de cabeçalho, troque a última asserção por `await expect(page.getByText(/Nenhuma disciplina/)).toBeVisible();`.

Run: `npm run test:e2e -- casca` → FALHA (`aria-current` não existe; o seletor é nativo sem rótulo).

- [ ] **Passo 7: `src/App.tsx`**

Mantenha os imports das páginas, `GRUPOS`, `PAGINA_CURSOS` e a carga de cursos. Mudam o tipo `Pagina`, o JSX e os provedores:

```tsx
import { BookOpen, CalendarCog, CalendarRange, CalendarX, DoorOpen, GraduationCap, Layers, Sparkles, Tags, Users, type LucideIcon } from "lucide-react";
import { Alerta } from "@/componentes/alerta";
import { Seletor } from "@/componentes/seletor";
import { Toaster } from "@/componentes/ui/sonner";
import { TooltipProvider } from "@/componentes/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = { cursoId: number; aoMudarCursos: () => void; aoNavegar: (id: string) => void };

type Pagina = {
  id: string;
  rotulo: string;
  icone: LucideIcon;
  /** Tela ainda não convertida: é desenhada dentro de `.legado`. */
  legado: boolean;
  componente: (p: Props) => React.ReactNode;
};
```

Ícones por página: Períodos `Layers`, Disciplinas `BookOpen`, Professores `Users`, Salas `DoorOpen`, Indisponibilidades `CalendarX`, Tipos de disciplina `Tags`, Regras `CalendarCog`, Manual `CalendarRange`, Automática `Sparkles`, Cursos `GraduationCap`. Todas as páginas começam com `legado: true`.

O JSX principal:

```tsx
  const item = (p: Pagina, extra?: string) => (
    <button
      key={p.id}
      aria-current={p.id === pagina ? "page" : undefined}
      onClick={() => setPagina(p.id)}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-tx2 hover:bg-accent",
        p.id === pagina && "bg-acc-bg font-semibold text-primary",
        extra,
      )}
    >
      <p.icone className="size-3.5 shrink-0" aria-hidden />
      {p.rotulo}
    </button>
  );

  return (
    <TooltipProvider delayDuration={400}>
      <div className="grid min-h-screen grid-cols-[216px_1fr]">
        <nav className="flex flex-col gap-0.5 border-r border-line bg-panel px-2.5 py-3">
          <strong className="px-2 pb-3 text-base">Distribuição de Aulas</strong>

          <div className="mb-1 rounded-md bg-inset p-2">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-tx3">Curso</span>
            <Seletor
              rotulo="Curso"
              className="w-full"
              valor={cursoId}
              opcoes={cursos.map((c) => ({ valor: c.id as number | null, rotulo: c.nome }))}
              aoMudar={(id) => setCursoId(id)}
              desabilitado={cursos.length === 0}
            />
          </div>
          {item(PAGINA_CURSOS)}

          {GRUPOS.map((g) => (
            <div key={g.titulo} className="flex flex-col gap-0.5">
              <div className="px-2 pb-1 pt-4 text-[10px] uppercase tracking-[0.08em] text-tx3">{g.titulo}</div>
              {g.paginas.map((p) => item(p))}
            </div>
          ))}
        </nav>

        <main className="min-w-0 px-5 pb-10 pt-5">
          {semCurso && atual.id !== "cursos" ? (
            <>
              <h1 className="text-xl font-bold">Nenhum curso</h1>
              <p className="mt-2 text-tx2">Crie um curso em "Gerenciar cursos" para começar.</p>
            </>
          ) : atual.legado ? (
            <div className="legado">{conteudo}</div>
          ) : (
            conteudo
          )}
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
```

com `const conteudo = atual.componente({ cursoId: cursoId ?? 0, aoMudarCursos: carregarCursos, aoNavegar: setPagina });` antes do `return`. O rótulo do botão de cursos continua "Gerenciar cursos" (`PAGINA_CURSOS.rotulo` passa a ser `"Gerenciar cursos"`; o `h1` da própria tela não muda). A tela de falha ao abrir o banco vira:

```tsx
      <main className="p-10">
        <h1 className="mb-3 text-xl font-bold">Distribuição de Aulas</h1>
        <Alerta tom="erro">
          <strong>Falha ao abrir o banco</strong>
          <pre className="mt-1 whitespace-pre-wrap text-xs">{erro}</pre>
        </Alerta>
      </main>
```

Use a referência visual da barra lateral para acertar espaçamentos e pesos: o alvo é a barra de hoje, mais os ícones.

- [ ] **Passo 8: `src/main.tsx`**

Tire o `<div className="legado">` em volta do app (agora é por página). A `Barreira` usa o mesmo desenho da falha de banco acima, com o título "A tela quebrou ao ser desenhada", o `pre` com mensagem e pilha, e `<Button variant="outline" onClick={() => location.reload()}>Recarregar</Button>`. Em `mostrarFalhaGlobal`, o HTML injetado usa classes do Tailwind em vez de `.falha`/`.alerta` (o Tailwind enxerga classes em texto do código-fonte):

```ts
  raiz.innerHTML =
    '<main class="p-10"><h1 class="mb-3 text-xl font-bold">Distribuição de Aulas</h1>' +
    '<div role="alert" class="rounded-md border border-destructive bg-panel px-3 py-2 text-destructive">' +
    '<strong>Erro fora da tela</strong><pre class="mt-1 whitespace-pre-wrap text-xs"></pre></div></main>';
```

- [ ] **Passo 9: limpar o legado da casca**

Em `src/estilos/legado.css`, apague os blocos que só a casca usava: `.janela`, `nav` e tudo aninhado nele (`.marca`, `.caixa-curso`, `.seletor-curso`, `.gerenciar-cursos`, `.separador`), `main { … }` e `.falha`. Confira cada classe com `grep -rn` em `src/` antes de apagar.

O `main` antigo tinha `padding: 20px 20px 40px`: o novo `<main>` já aplica o mesmo (`px-5 pt-5 pb-10`), então as telas antigas dentro dele não mudam de posição.

- [ ] **Passo 10: rodar e regerar as capturas**

Run: `npm run test:e2e`
Esperado: 49 passam.

A barra lateral aparece em toda captura, então todas mudam. Run: `npm run test:visual -- --update-snapshots`. Compare três telas com as anteriores (`git show HEAD:testes/visual/__capturas__/professores-claro.png > antes.png`): **só a barra lateral pode ter mudado**. A área de conteúdo, à direita, tem de estar igual. Se o conteúdo se deslocou, o `<main>` novo não tem o mesmo preenchimento do antigo.

- [ ] **Passo 11: commit**

```bash
git add -A
git commit -m "Casca nova: barra lateral com ícones, seletor de curso, toasts e alerta"
```

---

## Onda 3 — Cadastros

### Tarefa 6: Professores (tela piloto) e os componentes de lista e formulário

A primeira tela convertida. Os componentes que ela cria servem a todas as seguintes.

**Arquivos:**
- Criar: `src/componentes/ui/{dialog,input,textarea,label,table}.tsx` (CLI), `src/componentes/{campo.tsx,botao-icone.tsx,estado-vazio.tsx,cabecalho-pagina.tsx,dialogo-formulario.tsx,tabela-dados.tsx,tabela-dados.test.ts}`
- Modificar: `src/paginas/Professores.tsx`, `src/App.tsx`, `src/estilos/legado.css`
- Teste: `testes/e2e/formulario.spec.ts` (novo), `src/componentes/tabela-dados.test.ts`

**Interfaces:**
- Produz:
  ```ts
  // @/componentes/campo
  interface AtributosDoCampo { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }
  function Campo(p: { rotulo: string; dica?: string; erro?: string; className?: string;
                      children: (a: AtributosDoCampo) => ReactNode }): JSX.Element
  // @/componentes/botao-icone
  function BotaoIcone(p: { rotulo: string; icone: LucideIcon; aoClicar: () => void;
                           perigo?: boolean; desabilitado?: boolean; className?: string }): JSX.Element
  // @/componentes/estado-vazio
  function EstadoVazio(p: { children: ReactNode }): JSX.Element
  // @/componentes/cabecalho-pagina
  function CabecalhoPagina(p: { titulo: string; escopo?: string; sub?: string; contagem?: string;
                                busca?: string; aoBuscar?: (v: string) => void;
                                children?: ReactNode /* ações */ }): JSX.Element
  // @/componentes/dialogo-formulario
  function useAlterado<T>(valor: T | null): boolean
  function DialogoFormulario(p: { titulo: string; alterado: boolean; salvando?: boolean; erro?: ReactNode;
                                  rotuloSalvar?: string; largo?: boolean;
                                  aoFechar: () => void; aoSalvar: () => void; children: ReactNode }): JSX.Element
  // @/componentes/tabela-dados
  function normalizar(texto: string): string
  function compararValores(x: unknown, y: unknown): number
  function pertence<T>(linha: Row<T>, coluna: string, valores: unknown[]): boolean   // filterFn de filtro facetado
  function useTabela<T>(o: { dados: T[]; colunas: ColumnDef<T, any>[]; ordemInicial: SortingState;
                             desempate: (l: T) => string; busca?: string; textoDeBusca?: (l: T) => string;
                             filtros?: ColumnFiltersState }): Table<T>
  function TabelaDados<T>(p: { tabela: Table<T>; vazio: ReactNode }): JSX.Element
  ```
- Convenção das colunas: `meta: { numerico?: boolean; centro?: boolean }`; a coluna de ações tem `id: "acoes"` e `enableSorting: false`.

- [ ] **Passo 1: componentes do shadcn**

```bash
npx shadcn@latest add dialog input textarea label table
git diff --stat src/estilos/tema.css   # vazio
```

Ajustes: `input` e `textarea` com `h-7 px-2 text-sm border border-input bg-inset rounded-md` (o `textarea` sem altura fixa), sem `opacity` em desabilitado; `dialog` com o mesmo cartão do `alert-dialog` (`bg-panel rounded-xl border border-line`, `max-w-[540px]`, `max-h-[85vh] overflow-auto`, título `text-lg font-bold`); `label` com `text-xs text-tx2`; `table` com cabeçalho `text-xs text-tx3 font-normal`, célula `text-base py-1.5`, linha com `border-b border-line hover:bg-accent`, última linha sem borda.

- [ ] **Passo 2: testes das funções puras (falham)**

`src/componentes/tabela-dados.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compararValores, normalizar } from "./tabela-dados";

describe("normalizar", () => {
  it("ignora acento e caixa", () => {
    expect(normalizar("Álgebra Linear")).toBe("algebra linear");
    expect(normalizar("LABORATÓRIO")).toBe("laboratorio");
  });
});

describe("compararValores", () => {
  it("compara número como número", () => {
    expect(compararValores(2, 10)).toBeLessThan(0);
  });

  it("compara texto em pt-BR, com acento no lugar", () => {
    expect(["Zoologia", "Álgebra", "Cálculo"].sort(compararValores)).toEqual(["Álgebra", "Cálculo", "Zoologia"]);
  });

  it("trata nulo como texto vazio", () => {
    expect(compararValores(null, "a")).toBeLessThan(0);
  });
});
```

Run: `npm test -- tabela-dados` → FALHA (módulo não existe).

- [ ] **Passo 3: `src/componentes/tabela-dados.tsx`**

```tsx
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type RowData,
  type SortingState,
  type Table as Tabela,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/componentes/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Coluna numérica: alinha à direita e começa ordenando do maior para o menor. */
    numerico?: boolean;
    /** Coluna curta, que fica melhor centrada que encostada na borda. */
    centro?: boolean;
  }
}

/** Sem acento e em minúsculas, para a busca achar "algebra" em "Álgebra". */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Número com número; o resto como texto em pt-BR. */
export function compararValores(x: unknown, y: unknown): number {
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x ?? "").localeCompare(String(y ?? ""), "pt-BR");
}

/** `filterFn` de filtro facetado: a linha passa se o valor dela é um dos marcados. */
export function pertence<T>(linha: Row<T>, coluna: string, valores: unknown[]): boolean {
  return valores.length === 0 || valores.includes(linha.getValue(coluna));
}

export function useTabela<T>({
  dados,
  colunas,
  ordemInicial,
  desempate,
  busca = "",
  textoDeBusca,
  filtros = [],
}: {
  dados: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colunas: ColumnDef<T, any>[];
  ordemInicial: SortingState;
  /** Texto que desempata linhas iguais na coluna ordenada, sempre crescente. */
  desempate: (l: T) => string;
  busca?: string;
  /** Tudo em que a busca procura, numa linha só de texto. */
  textoDeBusca?: (l: T) => string;
  filtros?: ColumnFiltersState;
}): Tabela<T> {
  const [ordem, setOrdem] = useState<SortingState>(ordemInicial);

  // A ordenação do TanStack é estável: com os dados já em ordem de desempate,
  // linhas iguais na coluna ordenada ficam nessa ordem, crescente ou não.
  const ordenados = useMemo(
    () => [...dados].sort((a, b) => desempate(a).localeCompare(desempate(b), "pt-BR")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados],
  );

  return useReactTable({
    data: ordenados,
    columns: colunas,
    state: { sorting: ordem, globalFilter: busca, columnFilters: filtros },
    onSortingChange: setOrdem,
    enableSortingRemoval: false,
    defaultColumn: {
      sortingFn: (a, b, id) => compararValores(a.getValue(id), b.getValue(id)),
    },
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (linha, _coluna, valor: string) =>
      !textoDeBusca || normalizar(textoDeBusca(linha.original)).includes(normalizar(valor)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
}

export function TabelaDados<T>({ tabela, vazio }: { tabela: Tabela<T>; vazio: ReactNode }) {
  const linhas = tabela.getRowModel().rows;
  if (linhas.length === 0) return <>{vazio}</>;

  return (
    <Table>
      <TableHeader>
        {tabela.getHeaderGroups().map((grupo) => (
          <TableRow key={grupo.id}>
            {grupo.headers.map((h) => {
              const meta = h.column.columnDef.meta;
              const sentido = h.column.getIsSorted();
              return (
                <TableHead
                  key={h.id}
                  aria-sort={sentido === "asc" ? "ascending" : sentido === "desc" ? "descending" : undefined}
                  className={cn(meta?.numerico && "text-right", meta?.centro && "text-center")}
                >
                  {h.column.getCanSort() ? (
                    <button
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", sentido && "text-foreground")}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sentido === "asc" && <ChevronUp className="size-3" aria-hidden />}
                      {sentido === "desc" && <ChevronDown className="size-3" aria-hidden />}
                    </button>
                  ) : (
                    flexRender(h.column.columnDef.header, h.getContext())
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {linhas.map((linha) => (
          // `group` deixa as ações da linha aparecerem no pouso do mouse e no foco.
          <TableRow key={linha.id} className="group">
            {linha.getVisibleCells().map((c) => {
              const meta = c.column.columnDef.meta;
              return (
                <TableCell
                  key={c.id}
                  className={cn(meta?.numerico && "text-right tabular-nums", meta?.centro && "text-center")}
                >
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Coluna numérica começa decrescente com `sortDescFirst: true` na definição da coluna (quem define a coluna põe junto de `meta: { numerico: true }`).

Run: `npm test -- tabela-dados` → PASSA.

- [ ] **Passo 4: os compostos pequenos**

`src/componentes/campo.tsx`:

```tsx
import { useId, type ReactNode } from "react";
import { Label } from "@/componentes/ui/label";
import { cn } from "@/lib/utils";

export interface AtributosDoCampo {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/** Rótulo, dica e erro de um controle. O filho recebe os atributos que o ligam a eles. */
export function Campo({
  rotulo,
  dica,
  erro,
  className,
  children,
}: {
  rotulo: string;
  dica?: string;
  erro?: string;
  className?: string;
  children: (a: AtributosDoCampo) => ReactNode;
}) {
  const id = useId();
  const descricao = erro ? `${id}-erro` : dica ? `${id}-dica` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children({ id, "aria-describedby": descricao, "aria-invalid": erro ? true : undefined })}
      {erro ? (
        <span id={`${id}-erro`} className="text-xs text-destructive">
          {erro}
        </span>
      ) : dica ? (
        <span id={`${id}-dica`} className="text-xs text-tx3">
          {dica}
        </span>
      ) : null}
    </div>
  );
}
```

`src/componentes/botao-icone.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import { Button } from "@/componentes/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/componentes/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Ação como ícone. O rótulo vive na dica para quem passa o mouse e no
 * `aria-label` para quem não usa o mouse.
 */
export function BotaoIcone({
  rotulo,
  icone: Icone,
  aoClicar,
  perigo,
  desabilitado,
  className,
}: {
  rotulo: string;
  icone: LucideIcon;
  aoClicar: () => void;
  perigo?: boolean;
  desabilitado?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={rotulo}
          disabled={desabilitado}
          onClick={aoClicar}
          className={cn("size-6 text-tx2", perigo && "hover:text-destructive", className)}
        >
          <Icone className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{rotulo}</TooltipContent>
    </Tooltip>
  );
}
```

`src/componentes/estado-vazio.tsx`:

```tsx
import type { ReactNode } from "react";

export function EstadoVazio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-tx3">{children}</p>;
}
```

`src/componentes/cabecalho-pagina.tsx`:

```tsx
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/componentes/ui/input";

/**
 * Cabeçalho de toda tela. O escopo ao lado do título responde "isto vale só
 * para o curso selecionado ou para a instituição inteira?".
 */
export function CabecalhoPagina({
  titulo,
  escopo,
  sub,
  contagem,
  busca,
  aoBuscar,
  children,
}: {
  titulo: string;
  escopo?: string;
  sub?: string;
  contagem?: string;
  busca?: string;
  aoBuscar?: (v: string) => void;
  children?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold">{titulo}</h1>
          {escopo && <span className="text-xs text-tx3">{escopo}</span>}
        </div>
        {sub && <p className="mt-0.5 text-xs text-tx3">{sub}</p>}
      </div>
      <span className="flex-1" />
      {aoBuscar && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-tx3" aria-hidden />
          <Input
            aria-label="Buscar"
            placeholder="Buscar…"
            className="w-52 pl-7"
            value={busca ?? ""}
            onChange={(e) => aoBuscar(e.target.value)}
          />
        </div>
      )}
      {contagem && <span className="self-center text-xs tabular-nums text-tx3">{contagem}</span>}
      {children}
    </header>
  );
}
```

`src/componentes/dialogo-formulario.tsx`:

```tsx
import { useRef, type ReactNode } from "react";
import { Alerta } from "@/componentes/alerta";
import { useConfirmar } from "@/componentes/confirmacao";
import { Button } from "@/componentes/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/componentes/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * `true` quando o rascunho mudou desde que o formulário abriu. O ponto de
 * partida é o primeiro valor não nulo; voltar a nulo (fechar) o esquece.
 */
export function useAlterado<T>(valor: T | null): boolean {
  const inicial = useRef<string | null>(null);
  if (valor == null) inicial.current = null;
  else if (inicial.current == null) inicial.current = JSON.stringify(valor);
  return valor != null && JSON.stringify(valor) !== inicial.current;
}

/**
 * Diálogo de edição. Não fecha no clique fora: um clique errado perdia o que
 * foi digitado. Esc e Cancelar fecham, e pedem confirmação se houver alteração.
 */
export function DialogoFormulario({
  titulo,
  alterado,
  salvando,
  erro,
  rotuloSalvar = "Salvar",
  largo,
  aoFechar,
  aoSalvar,
  children,
}: {
  titulo: string;
  alterado: boolean;
  salvando?: boolean;
  erro?: ReactNode;
  rotuloSalvar?: string;
  largo?: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
  children: ReactNode;
}) {
  const confirmar = useConfirmar();

  async function fechar() {
    if (
      alterado &&
      !(await confirmar({
        titulo: "Descartar as alterações?",
        descricao: "O que foi alterado neste formulário ainda não foi salvo.",
        confirmar: "Descartar",
        perigo: true,
      }))
    )
      return;
    aoFechar();
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && void fechar()}>
      <DialogContent
        className={cn(largo && "max-w-[720px]")}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            aoSalvar();
          }}
        >
          <Alerta tom="erro" className="mb-0">
            {erro}
          </Alerta>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void fechar()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : rotuloSalvar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

O `DialogContent` do shadcn traz um botão "×" de fechar: ele também passa por `onOpenChange`, logo por `fechar()`. Dê a ele `aria-label="Fechar"` no `dialog.tsx` se o arquivo gerado usar texto em inglês.

- [ ] **Passo 5: teste do formulário (falha)**

`testes/e2e/formulario.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { contar, irPara, responderConfirmacoes } from "./paginas";

test.use({ semMassa: true, semente: "INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');" });

const abrir = async (page: import("@playwright/test").Page) => {
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

test("Esc sem alteração fecha direto", async ({ page }) => {
  await abrir(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("Esc com alteração pede confirmação, e recusar mantém o formulário", async ({ page }) => {
  await abrir(page);
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  await page.keyboard.press("Escape");
  const aviso = page.getByRole("alertdialog");
  await expect(aviso).toContainText("Descartar as alterações?");
  await aviso.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Ana S.");
});

test("descartar não grava", async ({ page, banco }) => {
  const mensagens = await responderConfirmacoes(page);
  await abrir(page);
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(mensagens.join("\n")).toMatch(/Descartar as alterações/);
  expect(contar(banco, "SELECT COUNT(*) FROM professores WHERE nome = 'Ana Souza'")).toBe(1);
});

test("clicar fora não fecha", async ({ page }) => {
  await abrir(page);
  await page.mouse.click(5, 5);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("nome repetido aparece como erro dentro do formulário", async ({ page }) => {
  await abrir(page);
  await page.getByLabel("Nome", { exact: true }).fill("Bruno Lima");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog").getByText("Já existe um registro com esse nome.")).toBeVisible();
});

test("a lista ordena pelo cabeçalho e marca o sentido", async ({ page }) => {
  await irPara(page, "Professores");
  const nome = page.getByRole("columnheader", { name: "Nome" });
  await expect(nome).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("row").nth(1)).toContainText("Ana Souza");
  await nome.getByRole("button").click();
  await expect(nome).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("row").nth(1)).toContainText("Bruno Lima");
});
```

Run: `npm run test:e2e -- formulario` → FALHA.

- [ ] **Passo 6: converter `src/paginas/Professores.tsx`**

Siga a receita. Próprio desta tela:

- Estados: `erro` (carga, vai num `<Alerta tom="erro">` na página), `erroDoFormulario` (vai na prop `erro` do diálogo), `salvando`.
- `const alterado = useAlterado(edicao);`
- A recusa de `max_dias_semana` ("já dá aula em N dias") e as falhas de gravação do formulário vão em `erroDoFormulario`. A falha ao remover vai em `avisar.erro(mensagemErro(e, "O professor"))`.
- Colunas: Nome; Disciplinas (`n_disciplinas`), Aulas (`aulas_total`), Indisponibilidades (`n_indisponibilidades`) com `meta: { numerico: true }` e `sortDescFirst: true`; e a coluna `acoes`:

```tsx
{
  id: "acoes",
  enableSorting: false,
  header: () => <span className="sr-only">Ações</span>,
  cell: ({ row }) => (
    <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
      <BotaoIcone rotulo="Editar" icone={Pencil} aoClicar={() => abrir(row.original)} />
      <BotaoIcone rotulo="Remover" icone={Trash2} perigo aoClicar={() => remover(row.original)} />
    </div>
  ),
}
```

  (A `opacity` aqui esconde as ações da linha sem movê-las, como hoje; não é estado de desabilitado.)
- `useTabela({ dados: linhas, colunas, ordemInicial: [{ id: "nome", desc: false }], desempate: (l) => l.nome, busca, textoDeBusca: (l) => l.nome })`.
- Cabeçalho: `<CabecalhoPagina titulo="Professores" escopo="…o mesmo de hoje…" contagem={`${tabela.getRowModel().rows.length} de ${linhas.length}`} busca={busca} aoBuscar={setBusca}>` com `<Button onClick={…}>Novo professor</Button>`.
- Vazio: `<EstadoVazio>` com o texto de hoje.
- Formulário: `Campo` + `Input` para Nome (com `autoFocus`), `Seletor` para a preferência de dias (`PREFERENCIAS` vira `opcoes`), o controle de peso como está hoje (se for `input type="range"`, mantém com `className="accent-primary"`), `Input type="number"` para "Máximo de dias na semana", `Textarea` para observação. Os rótulos não mudam (os e2e usam "Nome" e "Máximo de dias na semana").

Depois: passos 3 e 4 da receita (`legado: false` em Professores; limpar o `legado.css`).

- [ ] **Passo 7: rodar**

Run: `npm run typecheck && npm test && npm run test:e2e`
Esperado: tudo verde (55 e2e). O teste de `cadastros.spec.ts` "o erro aparece na tela e nada é gravado" continua passando: o erro de consulta aparece dentro do diálogo.

- [ ] **Passo 8: capturas**

Passos 6 e 7 da receita, para "Professores" e "Confirmação" (a confirmação aparece sobre esta tela).

- [ ] **Passo 9: commit**

```bash
git add -A
git commit -m "Professores sobre shadcn e TanStack Table; componentes de lista e de formulário"
```

### Tarefa 7: Salas e a barra de filtros

**Arquivos:**
- Criar: `src/componentes/ui/{popover,checkbox,badge}.tsx` (CLI), `src/componentes/barra-de-filtros.tsx`
- Modificar: `src/paginas/Salas.tsx`, `src/App.tsx`, `src/estilos/legado.css`, `testes/e2e/salas.spec.ts`
- Teste: `testes/e2e/filtros.spec.ts` (novo)

**Interfaces:**
- Consome: tudo da tarefa 6.
- Produz:
  ```ts
  // @/componentes/barra-de-filtros
  interface DefinicaoDeFiltro { id: string; titulo: string; opcoes: { valor: string | number | boolean; rotulo: string }[] }
  function BarraDeFiltros(p: { definicoes: DefinicaoDeFiltro[]; valor: ColumnFiltersState;
                               aoMudar: (v: ColumnFiltersState) => void }): JSX.Element
  ```
  `id` é o `id` da coluna do TanStack; o valor de cada filtro é o array dos valores marcados; a coluna filtrada usa `filterFn: pertence`.

- [ ] **Passo 1: shadcn**

```bash
npx shadcn@latest add popover checkbox badge
git diff --stat src/estilos/tema.css   # vazio
```

`checkbox` com `size-3.5 border-input`, marcado em `bg-primary`; `badge` com `h-5 text-xs rounded-md bg-acc-bg border border-acc-line text-foreground`; `popover` com o mesmo cartão do seletor.

- [ ] **Passo 2: teste que falha**

`testes/e2e/filtros.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { irPara } from "./paginas";

test.describe("Salas", () => {
  test.use({
    semMassa: true,
    semente: `INSERT INTO salas (id, nome, tipo, capacidade) VALUES
      (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40), (3, 'Lab 1', 'Laboratório', 30);`,
  });

  test("filtrar por tipo mostra o chip, muda a contagem e limpa", async ({ page }) => {
    await irPara(page, "Salas");
    await expect(page.getByText("3 de 3")).toBeVisible();
    await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
    await page.getByRole("checkbox", { name: "Laboratório" }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Lab 1/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /A01/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Remover filtro Tipo: Laboratório" }).click();
    await expect(page.getByText("3 de 3")).toBeVisible();
  });

  test("a busca acha a sala pelo tipo", async ({ page }) => {
    await irPara(page, "Salas");
    await page.getByLabel("Buscar").fill("laboratorio");
    await expect(page.getByRole("row", { name: /Lab 1/ })).toBeVisible();
    await expect(page.getByText("1 de 3")).toBeVisible();
  });

  test("filtro sem resultado oferece limpar", async ({ page }) => {
    await irPara(page, "Salas");
    await page.getByRole("button", { name: "Filtrar por Tipo" }).click();
    await page.getByRole("checkbox", { name: "Outro" }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Nenhuma sala com esses filtros.")).toBeVisible();
    await page.getByRole("button", { name: "Limpar filtros" }).first().click();
    await expect(page.getByText("3 de 3")).toBeVisible();
  });
});
```

Run: `npm run test:e2e -- filtros` → FALHA.

- [ ] **Passo 3: `src/componentes/barra-de-filtros.tsx`**

```tsx
import type { ColumnFiltersState } from "@tanstack/react-table";
import { ListFilter, X } from "lucide-react";
import { Badge } from "@/componentes/ui/badge";
import { Button } from "@/componentes/ui/button";
import { Checkbox } from "@/componentes/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/componentes/ui/popover";

type Valor = string | number | boolean;

export interface DefinicaoDeFiltro {
  /** O `id` da coluna filtrada. */
  id: string;
  titulo: string;
  opcoes: { valor: Valor; rotulo: string }[];
}

/**
 * Um botão por coluna filtrável e, embaixo, um chip por valor marcado: o que
 * está filtrando a lista fica à vista, sem abrir menu nenhum.
 */
export function BarraDeFiltros({
  definicoes,
  valor,
  aoMudar,
}: {
  definicoes: DefinicaoDeFiltro[];
  valor: ColumnFiltersState;
  aoMudar: (v: ColumnFiltersState) => void;
}) {
  const marcados = (id: string) => (valor.find((f) => f.id === id)?.value as Valor[] | undefined) ?? [];

  function definir(id: string, valores: Valor[]) {
    const resto = valor.filter((f) => f.id !== id);
    aoMudar(valores.length ? [...resto, { id, value: valores }] : resto);
  }

  const chips = definicoes.flatMap((d) =>
    marcados(d.id).map((v) => ({ d, v, rotulo: d.opcoes.find((o) => o.valor === v)?.rotulo ?? String(v) })),
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {definicoes.map((d) => (
        <Popover key={d.id}>
          <PopoverTrigger asChild>
            {/* O cabeçalho da coluna também é um botão com o título dela: este diz o que faz. */}
            <Button variant="outline" size="sm" aria-label={`Filtrar por ${d.titulo}`}>
              <ListFilter className="size-3" aria-hidden />
              {d.titulo}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-56 flex-col gap-1.5 p-2">
            {d.opcoes.map((o) => {
              const marcado = marcados(d.id).includes(o.valor);
              return (
                <label key={String(o.valor)} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={marcado}
                    onCheckedChange={(v) =>
                      definir(d.id, v ? [...marcados(d.id), o.valor] : marcados(d.id).filter((x) => x !== o.valor))
                    }
                  />
                  {o.rotulo}
                </label>
              );
            })}
          </PopoverContent>
        </Popover>
      ))}

      {chips.map(({ d, v, rotulo }) => (
        <Badge key={`${d.id}:${String(v)}`} className="gap-1 pr-0.5">
          {d.titulo}: {rotulo}
          <button
            aria-label={`Remover filtro ${d.titulo}: ${rotulo}`}
            className="rounded-sm p-0.5 hover:bg-accent"
            onClick={() => definir(d.id, marcados(d.id).filter((x) => x !== v))}
          >
            <X className="size-3" aria-hidden />
          </button>
        </Badge>
      ))}

      {chips.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => aoMudar([])}>
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Passo 4: converter `src/paginas/Salas.tsx`**

Receita, mais:

- `const [filtros, setFiltros] = useState<ColumnFiltersState>([]);`
- Coluna `tipo` com `filterFn: pertence`. Definição do filtro: `{ id: "tipo", titulo: "Tipo", opcoes: TIPOS_SALA.map((t) => ({ valor: t, rotulo: t })) }`.
- `textoDeBusca: (l) => `${l.nome} ${l.tipo}``.
- Vazio: sem sala nenhuma, o texto de hoje; com filtro ou busca sem resultado, `<EstadoVazio>Nenhuma sala com esses filtros. <Button variant="link" onClick={() => { setFiltros([]); setBusca(""); }}>Limpar filtros</Button></EstadoVazio>`.
- Tipo no formulário: `Seletor` com a mesma lista de hoje (`[...new Set([...TIPOS_SALA, edicao.tipo])].filter(Boolean)`), para um valor antigo fora da lista continuar visível.
- **Toast de reatribuição (pendência herdada):** depois de salvar uma mudança de tipo que reatribuiu aulas sem apagar nenhuma, `avisar.sucesso(`${n} aula(s) mudaram de sala`, fixadas ? `${fixadas} delas estavam fixadas.` : undefined)`. `n` e `fixadas` saem do resultado de `reatribuirSalas` que a tela já calcula.

- [ ] **Passo 5: e2e do toast**

Em `testes/e2e/salas.spec.ts`, no teste "as aulas que exigem o tipo antigo vão para a outra sala, sem diálogo", acrescente no fim:

```ts
    await expect(page.getByText("3 aula(s) mudaram de sala")).toBeVisible();
```

(São três: duas de Cálculo e uma de Física.)

- [ ] **Passo 6: rodar, capturas, commit**

Run: `npm run typecheck && npm test && npm run test:e2e` → verde (58 e2e).
Capturas: passos 6 e 7 da receita para "Salas".

```bash
git add -A
git commit -m "Salas convertida; barra de filtros com chips; toast de reatribuição de sala"
```

### Tarefa 8: Tipos de disciplina e Cursos

**Arquivos:**
- Modificar: `src/paginas/Tipos.tsx`, `src/paginas/Cursos.tsx`, `src/App.tsx`, `src/estilos/legado.css`
- Teste: `testes/e2e/cadastros.spec.ts`

**Interfaces:**
- Consome: tarefas 5, 6 e 7.

- [ ] **Passo 1: testes que falham**

Em `testes/e2e/cadastros.spec.ts`, dentro de `describe("turnos do curso")`:

```ts
  test("cancelar a remoção do turno não muda nada", async ({ page, banco }) => {
    const mensagens = await responderConfirmacoes(page, "recusar");
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde", exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => mensagens.length).toBe(1);
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM cursos WHERE turnos = 'manha,tarde'")).toBe(1);
  });

  test("as caixas de turno formam um grupo rotulado", async ({ page }) => {
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    const grupo = page.getByRole("group", { name: "Turnos" });
    await expect(grupo.getByRole("checkbox", { name: "Manhã", exact: true })).toBeChecked();
    await expect(grupo.getByRole("checkbox", { name: "Tarde", exact: true })).toBeChecked();
  });
```

E um `describe` novo, no fim do arquivo:

```ts
test.describe("turno do curso usado por disciplina com turno forçado", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Engenharia' WHERE id = 1;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, turno) VALUES (1, 1, 'Cálculo', 1, 2, 0, 'tarde');`,
  });

  test("tirar o turno é recusado e diz qual disciplina o usa", async ({ page, banco }) => {
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde", exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/Cálculo|disciplina/);
    expect(contar(banco, "SELECT COUNT(*) FROM cursos WHERE turnos = 'manha,tarde'")).toBe(1);
  });
});
```

Abra `src/paginas/Cursos.tsx` e confira o texto exato da recusa por disciplina com turno forçado; se ele não citar o nome da disciplina nem a palavra "disciplina", troque a expressão regular por um trecho do texto real.

Run: `npm run test:e2e -- cadastros` → os três novos FALHAM (não há `group` "Turnos"; a recusa não está num `alert` dentro do diálogo).

- [ ] **Passo 2: converter `Tipos.tsx`**

Receita. Lista ordenável por todas as colunas de texto e número, sem busca (`useTabela` sem `busca`). O `<select>` do formulário vira `Seletor`. O formulário de tipo tem os mesmos campos do requisito de sala de Disciplinas se usar `RequisitoSala`: nesse caso **deixe o `RequisitoSala` como está** e envolva-o num `<div className="legado">` dentro do diálogo; ele é convertido na tarefa 11.

- [ ] **Passo 3: converter `Cursos.tsx`**

Receita. Lista ordenável, sem busca. Próprio:

- Turnos (pendência herdada de acessibilidade):

```tsx
<fieldset className="flex flex-col gap-1.5">
  <legend className="mb-1 text-xs text-tx2">Turnos</legend>
  {TURNOS.map((t) => (
    <label key={t.valor} className="flex items-center gap-2 text-sm">
      <Checkbox checked={marcados.includes(t.valor)} onCheckedChange={(v) => alternar(t.valor, !!v)} />
      {t.rotulo}
    </label>
  ))}
</fieldset>
```

  com os nomes de variável que a tela já usa.
- As recusas ("período(s) 2º…", disciplina com turno forçado) vão na prop `erro` do `DialogoFormulario`.
- `aoMudarLista()` continua sendo chamado depois de criar, renomear ou remover curso, para o seletor da barra lateral acompanhar.

- [ ] **Passo 4: rodar, capturas, commit**

Run: `npm run typecheck && npm test && npm run test:e2e` → verde (61 e2e).
Capturas: receita, para "Tipos de disciplina" e "Gerenciar cursos".

```bash
git add -A
git commit -m "Tipos e Cursos convertidas; turnos do curso como grupo rotulado"
```

### Tarefa 9: Períodos e Regras

**Arquivos:**
- Modificar: `src/paginas/Periodos.tsx`, `src/paginas/Instituicao.tsx`, `src/App.tsx`, `src/estilos/legado.css`

**Interfaces:**
- Consome: tarefas 5 e 6.

- [ ] **Passo 1: converter `Periodos.tsx`**

Receita. Quadro pequeno: `Table` do shadcn direto, sem TanStack, com colunas de largura igual (`table-fixed`) e conteúdo centrado, como hoje. Os `<select>` embutidos na linha viram `Seletor` com `className="h-6"` e `rotulo` (por exemplo `rotulo={`Turno do ${p.numero}º período`}`). O botão "Adicionar Nº período" mantém o rótulo. A célula com "1º" continua sendo uma célula de tabela com esse texto exato (o e2e usa `getByRole("cell", { name: "1º", exact: true })`). Falha de gravação: `avisar.erro(…)`.

- [ ] **Passo 2: converter `Instituicao.tsx` (Regras)**

Receita. Próprio:

- "Semana" é um `Campo rotulo="Semana"` com `Seletor` (opções "Segunda a sexta" e "Segunda a sábado"). **O seletor só muda depois de gravado**, como hoje: o valor exibido vem do estado carregado do banco, não do clique.
- O erro de consulta ou de gravação desta tela **continua na página** (`<Alerta tom="erro">`), não em toast: os testes "o erro aparece na tela…" procuram `falha simulada` no texto da página e exigem que "Erro fora da tela" não apareça. Não mude isso.
- Quadro de padrões de bloco: `Table` do shadcn. O chip de padrão e a nota (0 a 6, em três faixas de cor: acento, neutro, negativo) mantêm o desenho; a classe deles sai do `legado.css` e vira utilitário.
- O seletor de nota do padrão novo vira `Seletor` com `rotulo="Nota do padrão"`.
- As seções (`<section>` com `h2` em caixa alta) viram `<section className="mb-3 rounded-lg border border-line bg-panel px-4 pb-4 pt-3">` com `<h2 className="mb-2 text-[10px] uppercase tracking-[0.08em] text-tx3">`.

- [ ] **Passo 3: rodar, capturas, commit**

Run: `npm run typecheck && npm test && npm run test:e2e` → verde (61 e2e). Atenção aos seis testes de "Semana" em `cadastros.spec.ts` e `bugs-conhecidos.spec.ts`: agora passam pelo ramo novo de `escolher` e `escolhida`.
Capturas: receita, para "Períodos" e "Regras".

```bash
git add -A
git commit -m "Períodos e Regras convertidas"
```

### Tarefa 10: Indisponibilidades e o `grade.css`

**Arquivos:**
- Criar: `src/estilos/grade.css`
- Modificar: `src/estilos/tema.css`, `src/estilos/legado.css`, `src/paginas/Indisponibilidades.tsx`, `src/App.tsx`

**Interfaces:**
- Produz: `src/estilos/grade.css` com as classes `.grade-horarios` (malha de Indisponibilidades) e, a partir da tarefa 13, `.malha`/`.celula` (grade manual). Importado pelo `tema.css` na camada `components`.

- [ ] **Passo 1: nascer o `grade.css`**

Mova de `src/estilos/legado.css` para `src/estilos/grade.css` o bloco "grade de indisponibilidade" inteiro (`table.grade-horarios` e tudo que depende dele, mais `.cabecalho-clicavel` e `.espacador` se só essa tela os usa), **desaninhado** de `.legado`. No topo do arquivo:

```css
/*
 * As malhas: Indisponibilidades e grade manual. Desenho próprio, sobre os
 * tokens do tema — os estados de célula usam listras, tracejado e cadeado, que
 * nenhum componente pronto cobre. Valem as três regras do `tema.css`.
 */
```

Em `src/estilos/tema.css`, depois do import do legado:

```css
@import "./grade.css" layer(components);
```

Como a regra saiu de `.legado`, ela perde o `revert`: defina no próprio `grade.css` o que a tabela herdava do navegador e o reset do Tailwind tira (`border-collapse`, `border-spacing`, alinhamento e peso de `th`). Compare com a captura.

- [ ] **Passo 2: converter `Indisponibilidades.tsx`**

Receita, com estas diferenças:

- **O gesto de pintar não muda**: `onMouseDown`/`onMouseEnter`, uma transação por arrasto (teste B10), `onDragStart` com `preventDefault`. Não troque por dnd-kit.
- A tabela continua `<table className="grade-horarios">` e cada célula mantém `aria-label="Segunda, M1"`.
- A lista de professores continua sendo `<ul>` com `<li><button>`: os e2e clicam no botão pelo nome do professor. O ativo ganha `aria-pressed`.
- "Limpar tudo" vira `<Button variant="outline">`.
- A legenda (`×` indisponível, `•` aula alocada) mantém os símbolos.
- Falha de gravação: `avisar.erro(…)`. Falha de carga: `<Alerta tom="erro">`.

- [ ] **Passo 3: rodar, capturas, commit**

Run: `npm run typecheck && npm test && npm run test:e2e` → verde. Atenção a "B10: um arrasto grava numa transação só" e a "indisponibilidade marcada por arrasto é respeitada pelo gerador".
Capturas: receita, para "Indisponibilidades".

```bash
git add -A
git commit -m "Indisponibilidades convertida; malhas em grade.css"
```

### Tarefa 11: Disciplinas

A maior tela (950 linhas). É dividida, ganha filtros e o toast de reatribuição.

**Arquivos:**
- Criar: `src/paginas/disciplinas/{index.tsx,colunas.tsx,EditorDisciplina.tsx,salvar.ts}`
- Apagar: `src/paginas/Disciplinas.tsx`
- Modificar: `src/componentes/RequisitoSala.tsx`, `src/paginas/Tipos.tsx` (tirar o `.legado` em volta do `RequisitoSala`), `src/App.tsx`, `src/estilos/legado.css`, `testes/e2e/disciplinas.spec.ts`, `testes/e2e/filtros.spec.ts`, `testes/visual/telas.spec.ts`

**Interfaces:**
- Consome: tarefas 5, 6 e 7.
- Produz: `export default function Disciplinas({ cursoId }: { cursoId: number })` em `src/paginas/disciplinas/index.tsx`.

- [ ] **Passo 1: dividir sem mudar comportamento**

Antes de converter, só mova código (um commit à parte, com os e2e verdes):

| Arquivo | Recebe |
|---|---|
| `salvar.ts` | os tipos `Linha` e `Rascunho`, `novo`, `MUDAM_COM_O_CADASTRO`, `prepararAulas` e a montagem das instruções de `salvar` — tudo que não é JSX. `prepararAulas` e a montagem viram funções que recebem o que hoje leem do componente (`cursoId`, contexto, etc.) por parâmetro e **não** chamam `confirm`/`confirmar` nem `setErro`: devolvem o que a tela precisa para perguntar e avisar |
| `colunas.tsx` | `marcasDe` e (no passo 3) a definição das colunas |
| `EditorDisciplina.tsx` | o componente `Editor`, renomeado |
| `index.tsx` | o componente da página: carga, lista, abertura do editor e a conversa com o usuário (confirmação, erro) |

Em `src/App.tsx`: `import Disciplinas from "./paginas/disciplinas";`.

Run: `npm run typecheck && npm run test:e2e` → verde. Commit: `"Disciplinas dividida em quatro arquivos, sem mudar comportamento"`.

- [ ] **Passo 2: testes que falham**

Em `testes/e2e/filtros.spec.ts`:

```ts
test.describe("Disciplinas", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, optativa, ofertada, turno) VALUES
        (1, 1, 'Cálculo', 1, 4, 0, 0, 1, NULL),
        (2, 1, 'Física', 2, 4, 0, 0, 1, 'tarde'),
        (3, 1, 'Libras', 2, 2, 0, 1, 0, NULL);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4), (2, 2, 4), (3, 2, 2);`,
  });

  const marcar = async (page: import("@playwright/test").Page, filtro: string, opcao: string) => {
    await page.getByRole("button", { name: `Filtrar por ${filtro}` }).click();
    await page.getByRole("checkbox", { name: opcao, exact: true }).check();
    await page.keyboard.press("Escape");
  };

  test("a busca acha a disciplina pelo professor", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await page.getByLabel("Buscar").fill("ana");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Cálculo/ })).toBeVisible();
  });

  test("filtra por período", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Período", "2º");
    await expect(page.getByText("2 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Cálculo/ })).toHaveCount(0);
  });

  test("combina optativa e não ofertada", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Optativa", "Sim");
    await marcar(page, "Ofertada", "Não");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Libras/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover filtro Optativa: Sim" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover filtro Ofertada: Não" })).toBeVisible();
  });

  test("filtra por turno forçado", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Turno forçado", "Tarde");
    await expect(page.getByText("1 de 3")).toBeVisible();
    await expect(page.getByRole("row", { name: /Física/ })).toBeVisible();
  });

  test("nova disciplina propõe o período filtrado quando é um só", async ({ page }) => {
    await irPara(page, "Disciplinas");
    await marcar(page, "Período", "2º");
    await page.getByRole("button", { name: "Nova disciplina" }).click();
    await expect(page.getByRole("dialog").getByLabel("Período", { exact: true })).toContainText("2º");
  });
});
```

Confira no esquema (`scripts/migracoes/`) os nomes das colunas `optativa`, `ofertada` e `turno` de `disciplinas` antes de rodar; ajuste a semente se algum for diferente.

Em `testes/e2e/disciplinas.spec.ts`, no teste "passar a exigir laboratório leva as aulas para o laboratório livre", no fim:

```ts
    await expect(page.getByText("2 aula(s) mudaram de sala")).toBeVisible();
```

Run: `npm run test:e2e -- filtros disciplinas` → os novos FALHAM.

- [ ] **Passo 3: converter**

Receita. Próprio desta tela:

**`colunas.tsx`** — colunas: Período (`periodo`, `meta: { numerico: true, centro: true }`, `sortDescFirst: false`, `filterFn: pertence`), Disciplina (`nome`), Aulas (`aulas_semanais`, numérica e centrada), Professores (`professores`), Marcas (`marcas`, o texto de `marcasDe`), ações. Mais quatro colunas **ocultas**, só para filtrar, cada uma com `filterFn: pertence` e `enableSorting: false`: `tipo_id`, `optativa`, `ofertada`, `turno`. Passe `state.columnVisibility` — acrescente a `useTabela` um parâmetro opcional `ocultas?: string[]` que vira `columnVisibility: Object.fromEntries(ocultas.map((id) => [id, false]))` no `state`.

O aviso "fatias não fecham com a CH" na linha continua, como ícone `TriangleAlert` em `text-warn` com dica e `aria-label` com esse texto.

**`index.tsx`** — filtros:

```ts
const definicoes: DefinicaoDeFiltro[] = [
  { id: "periodo", titulo: "Período", opcoes: periodos.map((p) => ({ valor: p.numero, rotulo: `${p.numero}º` })) },
  { id: "tipo_id", titulo: "Tipo", opcoes: tipos.map((t) => ({ valor: t.id, rotulo: t.nome })) },
  { id: "optativa", titulo: "Optativa", opcoes: [{ valor: 1, rotulo: "Sim" }, { valor: 0, rotulo: "Não" }] },
  { id: "ofertada", titulo: "Ofertada", opcoes: [{ valor: 1, rotulo: "Sim" }, { valor: 0, rotulo: "Não" }] },
  { id: "turno", titulo: "Turno forçado", opcoes: [{ valor: "manha", rotulo: "Manhã" }, { valor: "tarde", rotulo: "Tarde" }] },
];
```

Se a tela ainda não carrega os tipos de disciplina, acrescente a consulta (`SELECT id, nome FROM tipos_disciplina ORDER BY nome COLLATE NOCASE`); se a lista vier vazia, o filtro "Tipo" não é mostrado.

- `textoDeBusca: (l) => `${l.nome} ${l.abreviacao ?? ""} ${l.professores ?? ""}``.
- "Nova disciplina" propõe o período do filtro quando há **exatamente um** período marcado; senão o primeiro período. Continua desabilitado sem professores, com a dica "Cadastre um professor antes".
- O `<select>` de período do cabeçalho some: o filtro "Período" o substitui.
- Vazio com filtro: `Nenhuma disciplina com esses filtros.` + "Limpar filtros".
- Confirmações e recusas: a recusa de mudança de período ("2º período já tem aula em Segunda M1") e as falhas de gravação vão na prop `erro` do diálogo. A confirmação de aulas atingidas continua (tarefa 4).
- **Motivo de sala redundante (pendência herdada):** ao montar os `itens` da confirmação, se uma aula tem outro motivo além de `sala-invalida`, o de sala é omitido. Fica numa função pura em `salvar.ts`, com teste em `src/paginas/disciplinas/salvar.test.ts`:

```ts
// salvar.ts
/** A sala inválida é consequência quando há outro motivo: mostrar os dois repete a notícia. */
export function motivosParaMostrar(motivos: Motivo[]): Motivo[] {
  const outros = motivos.filter((m) => m.regra !== "sala-invalida");
  return outros.length > 0 ? outros : motivos;
}
```

```ts
// salvar.test.ts
import { expect, it } from "vitest";
import type { Motivo } from "../../regras/tipos";
import { motivosParaMostrar } from "./salvar";

it("omite o motivo de sala quando a aula tem outro", () => {
  const sala = { regra: "sala-invalida" } as Motivo;
  const oferta = { regra: "D16" } as Motivo;
  expect(motivosParaMostrar([sala, oferta])).toEqual([oferta]);
  expect(motivosParaMostrar([sala])).toEqual([sala]);
  expect(motivosParaMostrar([])).toEqual([]);
});
```
- **Toast de reatribuição (pendência herdada):** depois de salvar com aulas reatribuídas e nenhuma apagada: `avisar.sucesso(`${n} aula(s) mudaram de sala`, fixadas ? `${fixadas} delas estavam fixadas.` : undefined)`. Quando a disciplina deixa de ocupar sala (as aulas ficam sem sala), não há toast.

**`EditorDisciplina.tsx`** — `DialogoFormulario` com `largo`. Mantêm o rótulo exato: "Nome", "Abreviação", "Período", "Aulas por semana", a caixa "Ofertada", "Adicionar professor". Nas fatias: `Seletor` com `rotulo={`Professor da fatia ${i + 1}`}` (opção de professor já usado em outra fatia fica `desabilitada`) e `Input type="number"` com `aria-label={`Aulas da fatia ${i + 1}`}`. O aviso de padrão por fatia (`fatia(s) de 5 aula(s)…`) vira `<Alerta tom="aviso">` com o mesmo texto.

**`RequisitoSala.tsx`** — converta no mesmo passo (é usado aqui e em Tipos): `fieldset`/`legend` "Sala" com classes do Tailwind; `Campo rotulo="Requisito"` com `Seletor` (opções "Não ocupa sala", "Qualquer sala", "Qualquer sala de um tipo", "Salas específicas"); `Campo rotulo="Tipo exigido"` com `Seletor` cujas opções mantêm o texto "Laboratório — 1 sala(s) hoje"; a lista de salas específicas com `Checkbox` e, por sala marcada, `Seletor` com `rotulo={`Preferência por ${s.nome}`}` e opções "ideal"/"aceitável"; os dois `.aviso` viram `<Alerta tom="aviso">`. Depois tire, em `Tipos.tsx`, o `<div className="legado">` que envolvia o `RequisitoSala`.

- [ ] **Passo 4: rodar**

Run: `npm run typecheck && npm test && npm run test:e2e` → verde (66 e2e). Todos os testes de `disciplinas.spec.ts`, o B3 e o B9 passam pelo ramo novo de `escolher`.

- [ ] **Passo 5: capturas e commit**

Capturas: receita, para "Disciplinas", "Disciplinas, editor aberto" e "Tipos de disciplina" (por causa do `RequisitoSala`).

```bash
git add -A
git commit -m "Disciplinas convertida: filtros por coluna, busca por professor, toast de reatribuição"
```

---

## Onda 4 — Grade

### Tarefa 12: Histórico de desfazer

Só o módulo e a origem das escritas. Sem interface.

**Arquivos:**
- Criar: `src/grade/historico.ts`, `src/grade/historico.test.ts`, `src/grade/index.ts`
- Modificar: `src/db.ts`

**Interfaces:**
- Produz:
  ```ts
  // src/db.ts
  type Origem = "grade" | "cadastro";
  function aoEscrever(ouvinte: (origem: Origem) => void): () => void;
  function transacao(instrucoes: Instrucao[], opcoes?: { origem?: Origem }): Promise<ResultadoEscrita>;
  // src/grade/historico.ts
  interface EstadoDoHistorico { podeDesfazer: boolean; rotulo: string | null; versao: number }
  interface Dependencias {
    consultar: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
    transacao: (i: Instrucao[], o?: { origem?: Origem }) => Promise<ResultadoEscrita>;
    aoEscrever: (ouvinte: (origem: Origem) => void) => () => void;
  }
  function criarHistorico(d: Dependencias): {
    executarNaGrade(cursoId: number, rotulo: string, instrucoes: Instrucao[]): Promise<ResultadoEscrita>;
    desfazer(): Promise<string | null>;   // o rótulo do que foi desfeito
    limpar(): void;
    assinar(ouvinte: () => void): () => void;
    estado(): EstadoDoHistorico;          // mesma referência enquanto nada muda
  }
  // src/grade/index.ts
  const historico: ReturnType<typeof criarHistorico>;
  ```

- [ ] **Passo 1: `src/db.ts`**

Substitua `transacao` e acrescente o aviso:

```ts
/** De onde vem uma escrita: a grade tem desfazer; cadastro invalida o histórico. */
export type Origem = "grade" | "cadastro";

const ouvintes = new Set<(origem: Origem) => void>();

/** Avisa a cada escrita concluída. Devolve a função que cancela a assinatura. */
export function aoEscrever(ouvinte: (origem: Origem) => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Tudo ou nada: uma falha no meio desfaz as instruções anteriores. */
export async function transacao(
  instrucoes: Instrucao[],
  opcoes: { origem?: Origem } = {},
): Promise<ResultadoEscrita> {
  const resultado = await invoke<ResultadoEscrita>("transacao", { banco: await banco(), instrucoes });
  ouvintes.forEach((o) => o(opcoes.origem ?? "cadastro"));
  return resultado;
}
```

- [ ] **Passo 2: testes (falham)**

`src/grade/historico.test.ts`:

```ts
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../testes/suporte/banco";
import { criarPonte } from "../../testes/suporte/ponte";
import type { Instrucao, Origem, ResultadoEscrita } from "../db";
import { criarHistorico, type Dependencias } from "./historico";

const SEMENTE = `
  INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
  INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
    VALUES (1, 1, 'Cálculo', 1, 4, 0), (2, 2, 'Física', 1, 2, 0);
  INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4), (2, 1, 2);
  INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, fixada)
    VALUES (1, 1, 0, 0, 1, 1, 1), (1, 1, 0, 1, 1, 1, 0), (2, 1, 1, 0, 2, 1, 0);`;

let banco: DatabaseSync;
let deps: Dependencias;

const aulas = (curso: number) =>
  banco.prepare("SELECT dia, hora, fixada FROM alocacoes WHERE curso_id = ? ORDER BY dia, hora").all(curso).map((l) => ({ ...(l as object) }));

const apagar = (dia: number, hora: number): Instrucao => ({
  sql: "DELETE FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND dia = ? AND hora = ?",
  params: [dia, hora],
});

beforeEach(() => {
  banco = criarBanco({ massa: false });
  banco.exec(SEMENTE);
  const ponte = criarPonte(banco);
  const ouvintes = new Set<(o: Origem) => void>();
  deps = {
    consultar: lerDe(banco),
    transacao: async (instrucoes, opcoes = {}) => {
      const r = ponte("transacao", { instrucoes });
      if (!r.ok) throw new Error(r.erro);
      ouvintes.forEach((o) => o(opcoes.origem ?? "cadastro"));
      return r.valor as ResultadoEscrita;
    },
    aoEscrever: (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
  };
});

describe("histórico da grade", () => {
  it("começa vazio", () => {
    const h = criarHistorico(deps);
    expect(h.estado()).toEqual({ podeDesfazer: false, rotulo: null, versao: 0 });
  });

  it("desfaz a última ação e devolve a grade como estava, com a fixação", async () => {
    const h = criarHistorico(deps);
    const antes = aulas(1);
    await h.executarNaGrade(1, "Limpar o 1º período", [{ sql: "DELETE FROM alocacoes WHERE curso_id = 1" }]);
    expect(aulas(1)).toEqual([]);
    expect(h.estado()).toMatchObject({ podeDesfazer: true, rotulo: "Limpar o 1º período" });

    expect(await h.desfazer()).toBe("Limpar o 1º período");
    expect(aulas(1)).toEqual(antes);
    expect(h.estado().podeDesfazer).toBe(false);
  });

  it("desfaz em ordem, da mais recente para a mais antiga", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    expect(await h.desfazer()).toBe("B");
    expect(aulas(1)).toHaveLength(1);
    expect(await h.desfazer()).toBe("A");
    expect(aulas(1)).toHaveLength(2);
  });

  it("não toca nas aulas de outro curso", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.desfazer();
    expect(aulas(2)).toHaveLength(1);
  });

  it("uma escrita de cadastro zera o histórico", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await deps.transacao([{ sql: "UPDATE professores SET nome = 'Ana S.' WHERE id = 1" }]);
    expect(h.estado().podeDesfazer).toBe(false);
    expect(await h.desfazer()).toBeNull();
  });

  it("a própria ação da grade e o desfazer não zeram o histórico", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    await h.desfazer();
    expect(h.estado()).toMatchObject({ podeDesfazer: true, rotulo: "A" });
  });

  it("uma ação que falha não entra no histórico", async () => {
    const h = criarHistorico(deps);
    await expect(h.executarNaGrade(1, "A", [{ sql: "DELETE FROM tabela_que_nao_existe" }])).rejects.toThrow();
    expect(h.estado().podeDesfazer).toBe(false);
  });

  it("guarda no máximo 50 ações", async () => {
    const h = criarHistorico(deps);
    for (let i = 0; i < 55; i++)
      await h.executarNaGrade(1, `ação ${i}`, [
        { sql: "UPDATE alocacoes SET fixada = 1 - fixada WHERE curso_id = 1 AND dia = 0 AND hora = 1" },
      ]);
    let desfeitas = 0;
    while (await h.desfazer()) desfeitas++;
    expect(desfeitas).toBe(50);
  });

  it("se a restauração falha, zera o histórico e propaga o erro", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    await h.executarNaGrade(1, "B", [apagar(0, 1)]);
    // A disciplina some por fora: reinserir as aulas dela viola a chave estrangeira.
    banco.exec("DELETE FROM alocacoes WHERE disciplina_id = 1; DELETE FROM disciplina_professores WHERE disciplina_id = 1; DELETE FROM disciplinas WHERE id = 1;");
    await expect(h.desfazer()).rejects.toThrow();
    expect(h.estado().podeDesfazer).toBe(false);
  });

  it("avisa quem assina e troca a referência do estado só quando muda", async () => {
    const h = criarHistorico(deps);
    let avisos = 0;
    h.assinar(() => avisos++);
    const inicial = h.estado();
    expect(h.estado()).toBe(inicial);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    expect(avisos).toBe(1);
    expect(h.estado()).not.toBe(inicial);
    const versao = h.estado().versao;
    await h.desfazer();
    expect(h.estado().versao).toBe(versao + 1);
  });

  it("limpar zera", async () => {
    const h = criarHistorico(deps);
    await h.executarNaGrade(1, "A", [apagar(0, 0)]);
    h.limpar();
    expect(h.estado().podeDesfazer).toBe(false);
  });
});
```

Se `criarBanco({ massa: false })` não criar o curso 1, acrescente `INSERT INTO cursos (id, nome) VALUES (1, 'Alfa');` no começo da semente (os e2e com `semMassa` fazem `UPDATE cursos … WHERE id = 1`, o que indica que ele já existe).

Run: `npm test -- historico` → FALHA (módulo não existe).

- [ ] **Passo 3: `src/grade/historico.ts`**

```ts
import type { Instrucao, Origem, ResultadoEscrita } from "../db";

export interface EstadoDoHistorico {
  podeDesfazer: boolean;
  /** O que o próximo "desfazer" desfaz. */
  rotulo: string | null;
  /** Sobe a cada desfazer: as telas de grade recarregam quando muda. */
  versao: number;
}

export interface Dependencias {
  consultar: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  transacao: (instrucoes: Instrucao[], opcoes?: { origem?: Origem }) => Promise<ResultadoEscrita>;
  aoEscrever: (ouvinte: (origem: Origem) => void) => () => void;
}

interface Registro {
  rotulo: string;
  cursoId: number;
  /** A grade inteira do curso antes da ação. */
  antes: Record<string, unknown>[];
}

const LIMITE = 50;

/**
 * Desfazer das ações da grade, em memória.
 *
 * Guarda a grade inteira do curso antes de cada ação e, para desfazer, apaga e
 * reinsere. É mais simples que guardar o inverso de cada ação e não tem como
 * ficar incoerente: o que volta é exatamente o que estava gravado.
 *
 * Qualquer escrita que não seja da grade zera a pilha: restaurar aulas sobre um
 * cadastro que mudou poderia recriar o que o cadastro acabou de invalidar.
 */
export function criarHistorico({ consultar, transacao, aoEscrever }: Dependencias) {
  let pilha: Registro[] = [];
  let versao = 0;
  let atual: EstadoDoHistorico = { podeDesfazer: false, rotulo: null, versao };
  const ouvintes = new Set<() => void>();

  function publicar() {
    const topo = pilha[pilha.length - 1];
    atual = { podeDesfazer: pilha.length > 0, rotulo: topo?.rotulo ?? null, versao };
    ouvintes.forEach((o) => o());
  }

  function limpar() {
    if (pilha.length === 0) return;
    pilha = [];
    publicar();
  }

  aoEscrever((origem) => {
    if (origem !== "grade") limpar();
  });

  async function executarNaGrade(cursoId: number, rotulo: string, instrucoes: Instrucao[]) {
    const antes = await consultar<Record<string, unknown>>("SELECT * FROM alocacoes WHERE curso_id = ?", [cursoId]);
    const resultado = await transacao(instrucoes, { origem: "grade" });
    pilha = [...pilha, { rotulo, cursoId, antes }].slice(-LIMITE);
    publicar();
    return resultado;
  }

  async function desfazer(): Promise<string | null> {
    const registro = pilha[pilha.length - 1];
    if (!registro) return null;
    const instrucoes: Instrucao[] = [
      { sql: "DELETE FROM alocacoes WHERE curso_id = ?", params: [registro.cursoId] },
      ...registro.antes.map((linha) => {
        const colunas = Object.keys(linha);
        return {
          sql: `INSERT INTO alocacoes (${colunas.join(", ")}) VALUES (${colunas.map(() => "?").join(", ")})`,
          params: colunas.map((c) => linha[c]),
        };
      }),
    ];
    try {
      await transacao(instrucoes, { origem: "grade" });
    } catch (e) {
      // O que está guardado não cabe mais no banco; o resto da pilha também não.
      pilha = [];
      publicar();
      throw e;
    }
    pilha = pilha.slice(0, -1);
    versao++;
    publicar();
    return registro.rotulo;
  }

  return {
    executarNaGrade,
    desfazer,
    limpar,
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    estado: () => atual,
  };
}
```

`src/grade/index.ts`:

```ts
import { aoEscrever, consultar, transacao } from "../db";
import { criarHistorico } from "./historico";

/** O histórico do app. Vive enquanto a janela estiver aberta. */
export const historico = criarHistorico({ consultar, transacao, aoEscrever });
```

- [ ] **Passo 4: rodar e commit**

Run: `npm test -- historico` → 11 passam. `npm run typecheck && npm test && npm run test:e2e` → verde.

```bash
git add src/db.ts src/grade
git commit -m "Histórico de desfazer das ações da grade, em memória"
```

### Tarefa 13: Grade manual dividida, controles novos e desfazer

Sem arrasto ainda: a tela é dividida, convertida, ganha os botões da aula e o desfazer.

**Arquivos:**
- Criar: `src/paginas/grade-manual/{index.tsx,usarGrade.ts,acoes.ts,acoes.test.ts,Pendencias.tsx,Malha.tsx,Celula.tsx,Diagnostico.tsx}`, `src/grade/{useHistorico.ts,desfazer.ts,BotaoDesfazer.tsx}`
- Apagar: `src/paginas/GradeManual.tsx`
- Modificar: `src/App.tsx`, `src/estilos/{grade.css,legado.css}`, `src/regras/descrever.ts`, `src/regras/descrever.test.ts`, `testes/e2e/{grade-manual,gerador}.spec.ts`
- Teste: `testes/e2e/desfazer.spec.ts` (novo), `src/paginas/grade-manual/acoes.test.ts`

**Interfaces:**
- Consome: `historico` (tarefa 12); `avisar`, `Alerta`, `Seletor`, `BotaoIcone`, `CabecalhoPagina`, `useConfirmar`.
- Produz:
  ```ts
  // src/grade/useHistorico.ts
  function useHistorico(): EstadoDoHistorico
  // src/grade/desfazer.ts
  function desfazerEAvisar(): Promise<void>
  // src/grade/BotaoDesfazer.tsx
  function BotaoDesfazer(): JSX.Element            // botão + Ctrl+Z
  // src/regras/descrever.ts
  const AULA_ORFA: string
  // src/paginas/grade-manual/usarGrade.ts
  interface Fatia { /* como hoje em GradeManual.tsx */ }
  interface Aula extends AulaOcupada { fixada: number; disciplina: string; professor: string; sala: string | null; curso: string }
  const idFatia: (f: { disciplina_id: number; professor_id: number }) => string
  const idAula: (a: { disciplinaId: number; professorId: number }) => string
  function usarGrade(cursoId: number): { /* estado carregado, derivados e `carregar` */ }
  // src/paginas/grade-manual/acoes.ts
  function alocar(cursoId: number, periodo: number, dia: number, hora: number, f: Fatia, salaId: number | null): Instrucao
  function mover(a: Aula, dia: number, hora: number, salaId: number | null): Instrucao
  function remover(a: Aula): Instrucao
  function trocarSala(a: Aula, salaId: number | null): Instrucao
  function fixar(a: Aula, fixada: boolean): Instrucao
  function limpar(cursoId: number, periodo: number): Instrucao
  function semAOrigem(cursoId: number, aulas: Aula[], origem: Aula): Ocupacao
  function salaAoMover(ctx: Contexto, oc: Ocupacao, regras: FatiaRegras, origem: Aula, dia: number, hora: number, salaVizinha: number | null): number | null
  ```

- [ ] **Passo 1: dividir sem mudar comportamento**

Só mova código, com os e2e verdes ao fim (commit à parte: `"Grade manual dividida em arquivos, sem mudar comportamento"`):

| Arquivo | Recebe |
|---|---|
| `usarGrade.ts` | as interfaces `Fatia` e `Aula`, `idFatia`, `idAula`, `chave`, todos os `useState` de dado carregado, `carregar`, e os `useMemo` derivados (`doCurso`, `oc`, `alocadas`, `daGrade`, `violacoes`, `regrasDe`, `nomes`) |
| `Pendencias.tsx` | o painel `.pendencias` |
| `Malha.tsx` | a `.malha`, as faixas de turno e a `.legenda` |
| `Celula.tsx` | uma célula (vazia ou ocupada) e o `Cadeado` |
| `Diagnostico.tsx` | o `<details>` de violações |
| `index.tsx` | a página: cabeçalho, abas de período, estado `escolhida`, as ações |

Em `src/App.tsx`: `import GradeManual from "./paginas/grade-manual";`.

- [ ] **Passo 2: `acoes.ts` com teste primeiro**

`src/paginas/grade-manual/acoes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { criarContexto } from "../../regras/tipos";
import type { FatiaRegras } from "../../regras/tipos";
import { alocar, fixar, limpar, mover, remover, salaAoMover, semAOrigem, trocarSala } from "./acoes";
import type { Aula, Fatia } from "./usarGrade";

const aula = (dia: number, hora: number, salaId: number | null, extra: Partial<Aula> = {}): Aula => ({
  cursoId: 1, periodo: 1, dia, hora, disciplinaId: 1, professorId: 1, salaId,
  fixada: 0, disciplina: "Cálculo", professor: "Ana Souza", sala: null, curso: "Alfa", ...extra,
});

describe("instruções", () => {
  it("mover troca dia, hora e sala da aula certa", () => {
    expect(mover(aula(0, 0, 1), 2, 3, 4)).toEqual({
      sql: "UPDATE alocacoes SET dia = ?, hora = ?, sala_id = ? WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
      params: [2, 3, 4, 1, 1, 0, 0],
    });
  });

  it("remover, trocar sala e fixar miram a aula pela chave", () => {
    const chave = [1, 1, 0, 0];
    expect(remover(aula(0, 0, 1)).params).toEqual(chave);
    expect(trocarSala(aula(0, 0, 1), null).params).toEqual([null, ...chave]);
    expect(fixar(aula(0, 0, 1), true).params).toEqual([1, ...chave]);
  });

  it("limpar poupa as fixadas", () => {
    expect(limpar(1, 2).sql).toMatch(/fixada = 0/);
    expect(limpar(1, 2).params).toEqual([1, 2]);
  });

  it("alocar insere a fatia no horário", () => {
    const f = { disciplina_id: 7, professor_id: 3 } as Fatia;
    expect(alocar(1, 2, 0, 5, f, null).params).toEqual([1, 2, 0, 5, 7, 3, null]);
  });
});
```

E, no mesmo arquivo, os testes de mover (acrescente `contextoMinimo` e `fatiaRegras` de `../../../testes/suporte/regras` aos imports, e tire o import de `criarContexto`/`FatiaRegras` acima):

```ts
describe("mover", () => {
  const ctx = contextoMinimo({ salas: [{ id: 1, tipo: "Sala de Aula" }, { id: 2, tipo: "Sala de Aula" }] });
  const regras = fatiaRegras({ exigeSala: true });

  it("a aula de origem sai da ocupação", () => {
    const origem = aula(0, 0, 1);
    const oc = semAOrigem(1, [origem], origem);
    expect(oc.daSala(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)).toBeUndefined();
  });

  it("leva a sala quando ela está livre no destino", () => {
    const origem = aula(0, 0, 2);
    const oc = semAOrigem(1, [origem], origem);
    expect(salaAoMover(ctx, oc, regras, origem, 1, 0, null)).toBe(2);
  });

  it("troca de sala quando a de origem está ocupada no destino", () => {
    const origem = aula(0, 0, 1);
    const outra = aula(1, 0, 1, { periodo: 2, disciplinaId: 2, professorId: 2 });
    const oc = semAOrigem(1, [origem, outra], origem);
    expect(salaAoMover(ctx, oc, regras, origem, 1, 0, null)).toBe(2);
  });

  it("troca de sala quando a de origem deixou de servir", () => {
    const origem = aula(0, 0, 1);
    const oc = semAOrigem(1, [origem], origem);
    const soASegunda = fatiaRegras({ exigeSala: true, salas: [{ id: 2, preferencia: 1 }] });
    expect(salaAoMover(ctx, oc, soASegunda, origem, 1, 0, null)).toBe(2);
  });

  it("fica sem sala quando a disciplina não exige", () => {
    const origem = aula(0, 0, null);
    const oc = semAOrigem(1, [origem], origem);
    expect(salaAoMover(ctx, oc, fatiaRegras(), origem, 1, 0, null)).toBeNull();
  });
});
```

Run: `npm test -- acoes` → FALHA.

`src/paginas/grade-manual/acoes.ts`:

```ts
import type { Instrucao } from "../../db";
import { escolherSala, salasPossiveis } from "../../regras/impedimentos";
import { Ocupacao } from "../../regras/ocupacao";
import type { Contexto, FatiaRegras } from "../../regras/tipos";
import type { Aula, Fatia } from "./usarGrade";

/** A chave de uma aula na tabela: (curso, período, dia, hora). */
const ONDE = "WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?";
const chave = (a: Aula) => [a.cursoId, a.periodo, a.dia, a.hora];

export function alocar(cursoId: number, periodo: number, dia: number, hora: number, f: Fatia, salaId: number | null): Instrucao {
  return {
    sql: `INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [cursoId, periodo, dia, hora, f.disciplina_id, f.professor_id, salaId],
  };
}

export function mover(a: Aula, dia: number, hora: number, salaId: number | null): Instrucao {
  return { sql: `UPDATE alocacoes SET dia = ?, hora = ?, sala_id = ? ${ONDE}`, params: [dia, hora, salaId, ...chave(a)] };
}

export function remover(a: Aula): Instrucao {
  return { sql: `DELETE FROM alocacoes ${ONDE}`, params: chave(a) };
}

export function trocarSala(a: Aula, salaId: number | null): Instrucao {
  return { sql: `UPDATE alocacoes SET sala_id = ? ${ONDE}`, params: [salaId, ...chave(a)] };
}

export function fixar(a: Aula, fixada: boolean): Instrucao {
  return { sql: `UPDATE alocacoes SET fixada = ? ${ONDE}`, params: [fixada ? 1 : 0, ...chave(a)] };
}

/** Fixar protege a aula do gerador; limpar à mão também não a leva. */
export function limpar(cursoId: number, periodo: number): Instrucao {
  return { sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND fixada = 0", params: [cursoId, periodo] };
}

/** A ocupação sem a aula que está sendo movida, para ela não conflitar consigo mesma. */
export function semAOrigem(cursoId: number, aulas: Aula[], origem: Aula): Ocupacao {
  return new Ocupacao(cursoId, aulas.filter((a) => a !== origem));
}

/**
 * A sala da aula no destino: a mesma, se continua servindo e está livre lá;
 * senão a regra de sempre (vizinha, ideal, aceitável).
 */
export function salaAoMover(
  ctx: Contexto,
  oc: Ocupacao,
  regras: FatiaRegras,
  origem: Aula,
  dia: number,
  hora: number,
  salaVizinha: number | null,
): number | null {
  const serve = origem.salaId != null && salasPossiveis(ctx, regras).some((s) => s.id === origem.salaId);
  if (serve && !oc.daSala(origem.salaId!, dia, hora)) return origem.salaId;
  return escolherSala(ctx, oc, regras, dia, hora, salaVizinha) ?? null;
}
```

O teste de `mover` espera o SQL numa linha só, com um espaço antes de `WHERE`: o texto acima produz exatamente isso.

Run: `npm test -- acoes` → PASSA.

- [ ] **Passo 3: gancho, toast e botão de desfazer**

`src/grade/useHistorico.ts`:

```ts
import { useSyncExternalStore } from "react";
import { historico } from ".";

export function useHistorico() {
  return useSyncExternalStore(historico.assinar, historico.estado);
}
```

`src/grade/desfazer.ts`:

```ts
import { avisar } from "@/componentes/toasts";
import { mensagemErro } from "@/lib/erros";
import { historico } from ".";

/** O mesmo caminho para o toast, o botão e o Ctrl+Z. */
export async function desfazerEAvisar() {
  try {
    const rotulo = await historico.desfazer();
    if (rotulo) avisar.sucesso(`Desfeito: ${rotulo}`);
  } catch (e) {
    avisar.erro(`Não foi possível desfazer. ${mensagemErro(e, "A grade")}`);
  }
}
```

`src/grade/BotaoDesfazer.tsx`:

```tsx
import { Undo2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/componentes/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/componentes/ui/tooltip";
import { desfazerEAvisar } from "./desfazer";
import { useHistorico } from "./useHistorico";

/** Num campo de texto, Ctrl+Z é do campo. */
const emCampo = (alvo: EventTarget | null) =>
  alvo instanceof HTMLElement && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName));

export function BotaoDesfazer() {
  const { podeDesfazer, rotulo } = useHistorico();

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z" || emCampo(e.target)) return;
      e.preventDefault();
      void desfazerEAvisar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* O span recebe o pouso do mouse quando o botão está desabilitado. */}
        <span>
          <Button variant="outline" disabled={!podeDesfazer} onClick={() => void desfazerEAvisar()}>
            <Undo2 className="size-3.5" aria-hidden />
            Desfazer
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{rotulo ? `Desfazer: ${rotulo} (Ctrl+Z)` : "Nada para desfazer"}</TooltipContent>
    </Tooltip>
  );
}
```

Em `src/App.tsx`, o histórico zera ao trocar de curso:

```tsx
  useEffect(() => {
    historico.limpar();
  }, [cursoId]);
```

- [ ] **Passo 4: aula órfã no diagnóstico (pendência herdada)**

Em `src/regras/descrever.test.ts`, acrescente:

```ts
it("descreve a aula órfã", () => {
  expect(AULA_ORFA).toBe("este professor não leciona mais a disciplina");
});
```

Em `src/regras/descrever.ts`:

```ts
/**
 * Aula cuja fatia (disciplina, professor) saiu do cadastro. Não é regra de
 * célula — não há fatia para perguntar ao `impedimento` —, mas a grade manual
 * precisa de um texto para listá-la no diagnóstico.
 */
export const AULA_ORFA = "este professor não leciona mais a disciplina";
```

Em `usarGrade.ts`, `violacoes` passa a devolver `{ aula, motivos: string[] }` (textos já descritos): aula com fatia continua com `violacoesDaAula(…).map((m) => descrever(m, nomes))`; aula **sem** fatia entra com `motivos: [AULA_ORFA]`.

- [ ] **Passo 5: testes e2e que falham**

`testes/e2e/desfazer.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { celula, contar, irPara, responderConfirmacoes } from "./paginas";

const SEMENTE = `
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
  INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 4, 0);
  INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4);
  INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 0, 1, 1, 1);`;

test.use({ semMassa: true, semente: SEMENTE });

const total = (banco: import("node:sqlite").DatabaseSync) => contar(banco, "SELECT COUNT(*) FROM alocacoes");

test("clicar na aula não a remove; o botão remove e o toast desfaz", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").click();
  await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
  expect(total(banco)).toBe(2);

  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(() => total(banco)).toBe(1);
  await page.getByRole("button", { name: "Desfazer" }).last().click(); // o do toast
  await expect.poll(() => total(banco)).toBe(2);
  await expect(page.getByText("Desfeito: Remover Cálculo")).toBeVisible();
});

test("Ctrl+Z desfaz a alocação", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Terça", "M1").click();
  await expect.poll(() => total(banco)).toBe(3);
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
  await expect(celula(page, "Terça", "M1")).not.toContainText("Cálculo");
});

test("o botão Desfazer começa desabilitado e desfaz em ordem", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const desfazer = page.getByRole("main").getByRole("button", { name: "Desfazer" });
  await expect(desfazer).toBeDisabled();
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await celula(page, "Segunda", "M2").getByRole("button", { name: "Remover aula" }).click();
  await expect.poll(() => total(banco)).toBe(0);
  await desfazer.click();
  await expect.poll(() => total(banco)).toBe(1);
  await desfazer.click();
  await expect.poll(() => total(banco)).toBe(2);
  await expect(desfazer).toBeDisabled();
});

test("limpar período confirma, e desfazer devolve as aulas", async ({ page, banco }) => {
  const mensagens = await responderConfirmacoes(page);
  await irPara(page, "Manual");
  await page.getByRole("button", { name: "Limpar período" }).click();
  await expect.poll(() => total(banco)).toBe(0);
  expect(mensagens.join("\n")).toMatch(/Apagar as aulas do 1º período\?/);
  await page.keyboard.press("Control+z");
  await expect.poll(() => total(banco)).toBe(2);
});

test("fixar pelo botão, e a aula fixada não pode ser removida", async ({ page, banco }) => {
  await irPara(page, "Manual");
  const aula = celula(page, "Segunda", "M1");
  await aula.getByRole("button", { name: "Fixar" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(1);
  await expect(aula.getByRole("button", { name: "Remover aula" })).toBeDisabled();
  await aula.getByRole("button", { name: "Soltar" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE fixada = 1")).toBe(0);
});

test("uma alteração de cadastro zera o histórico", async ({ page }) => {
  await irPara(page, "Manual");
  await celula(page, "Segunda", "M1").getByRole("button", { name: "Remover aula" }).click();
  await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeEnabled();
  await irPara(page, "Professores");
  await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ana S.");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await irPara(page, "Manual");
  await expect(page.getByRole("main").getByRole("button", { name: "Desfazer" })).toBeDisabled();
});

test("as células vazias são alcançáveis pelo teclado", async ({ page, banco }) => {
  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Cálculo/ }).click();
  await celula(page, "Quarta", "M1").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => total(banco)).toBe(3);
});
```

Em `testes/e2e/grade-manual.spec.ts`:

- "a sala se troca pela célula": troque as duas linhas do seletor por
  `await escolher(page.getByRole("combobox", { name: "Trocar sala de Cálculo" }), "A01 (aceitável)");`
- "a troca mostra a sala atual e a leva para o laboratório":

```ts
    const sala = page.getByRole("combobox", { name: "Trocar sala de Química" });
    await sala.click();
    await expect(page.getByRole("option", { name: "A01 (atual, fora do requisito)" })).toHaveAttribute("data-state", "checked");
    await page.getByRole("option", { name: "Lab 1", exact: true }).click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
```

- acrescente dois `describe`:

```ts
test.describe("aula sem sala em disciplina que exige sala", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, NULL);`,
  });

  test("a célula oferece onde corrigir", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const sala = page.getByRole("combobox", { name: "Trocar sala de Cálculo" });
    await expect(sala).toContainText("sem sala");
    await escolher(sala, "A01");
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
  });
});

test.describe("aula órfã", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO professores (id, nome) VALUES (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (1, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 2);
      PRAGMA foreign_keys = OFF;
      DELETE FROM disciplina_professores WHERE professor_id = 2;
      PRAGMA foreign_keys = ON;`,
  });

  test("entra no diagnóstico", async ({ page }) => {
    await irPara(page, "Manual");
    await page.getByText("1 aula(s) deste curso violam regra dura").click();
    await expect(page.getByText(/este professor não leciona mais a disciplina/)).toBeVisible();
  });
});
```

Se o `PRAGMA foreign_keys = OFF` não tiver efeito dentro do `db.exec` da semente (ele é ignorado dentro de transação), o `DELETE` falha: nesse caso tire os `PRAGMA`s e o `DELETE` da semente e faça-os no teste, com `banco.exec(…)` seguido de `page.reload()`.

Em `testes/e2e/gerador.spec.ts`, o teste "aula fixada com o botão direito sobrevive à geração" não muda: o botão direito continua fixando.

Run: `npm run test:e2e -- desfazer grade-manual` → os novos FALHAM.

- [ ] **Passo 6: converter a tela**

Mova o bloco "grade de aulas" de `legado.css` para `grade.css`, desaninhado (`.painel-duplo`, `.pendencias`, `.fatia`, `.malha`, `.dia`, `.hora`, `.faixa-turno`, `.celula` e seus seis estados, `.legenda`, `.sw`, `.cadeado`, `.ponto`, `.abas-periodo`, `.diagnostico`), definindo o que antes vinha do padrão do navegador, e converta a página pela receita. Próprio desta tela:

**`index.tsx`**

- Cabeçalho: `<CabecalhoPagina titulo="Grade horária" sub={…}>` com `<BotaoDesfazer />` e `<Button variant="outline" className="text-destructive" …>Limpar período</Button>` (desabilitado quando toda aula do período é fixada, como hoje).
- `const { versao } = useHistorico();` e `useEffect(() => { void carregar(); }, [versao])`, para a tela recarregar depois de um desfazer.
- **Toda escrita passa por `historico.executarNaGrade(cursoId, rotulo, [instrucao])`**, seguida de `carregar()`. Em falha: `avisar.erro(mensagemErro(e, "A aula"))` e `carregar()`. Rótulos e toasts:

| Ação | Rótulo | Depois |
|---|---|---|
| alocar | `Alocar <disciplina_curta>` | — |
| remover | `Remover <disciplina>` | `avisar.desfazer(`<disciplina> removida de <Dia> <código>`, desfazerEAvisar)` |
| trocar sala | `Trocar a sala de <disciplina>` | — |
| fixar / soltar | `Fixar <disciplina>` / `Soltar <disciplina>` | — |
| limpar | `Limpar o Nº período` | `avisar.desfazer(`N aula(s) apagadas do Nº período`, desfazerEAvisar)` |

- Clicar numa célula impedida com fatia escolhida não faz nada: o motivo já está escrito na célula. O `setErro(motivo)` de hoje some.
- As abas de período viram botões com `aria-pressed`, no mesmo desenho.

**`Celula.tsx`**

- Vazia: `<button type="button" aria-label="Segunda, M1" className={`celula ${classe}`} onClick={…}>` com o conteúdo de hoje (o motivo, ou "Alocar").
- Ocupada:

```tsx
<div role="group" aria-label={rotulo} className={`celula ${classe}`} onContextMenu={(e) => { e.preventDefault(); aoFixar(); }}>
  <span className="nome">{aula.disciplina}</span>
  <span className="meta">
    {curto(aula.professor)}
    {mostraSala && " · "}
    {mostraSala && (
      <Seletor
        rotulo={`Trocar sala de ${aula.disciplina}`}
        className="trocar-sala"
        valor={aula.salaId}
        opcoes={salas}
        exibir={aula.sala ?? "sem sala"}
        aoMudar={aoTrocarSala}
      />
    )}
  </span>
  <span className="controles">
    <BotaoIcone rotulo={aula.fixada ? "Soltar" : "Fixar"} icone={aula.fixada ? Lock : LockOpen} aoClicar={aoFixar} />
    <BotaoIcone
      rotulo="Remover aula"
      icone={X}
      perigo
      desabilitado={!!aula.fixada}
      aoClicar={aoRemover}
    />
  </span>
  {foraDoTurno && <span className="ponto" />}
</div>
```

  - `mostraSala = aula.salaId != null || exigeSala` (a aula sem sala em disciplina que exige sala mostra "sem sala" — pendência herdada).
  - `salas` é o resultado de `salasParaTroca(aula)` mapeado para `{ valor: s.id, rotulo: s.rotulo }`.
  - `.controles` (em `grade.css`): escondidos, aparecem em `.celula:hover` e `.celula:focus-within`; na aula fixada o botão "Soltar" (cadeado fechado) fica sempre visível, no lugar do `Cadeado` em SVG de hoje.
  - O botão "Remover aula" desabilitado numa aula fixada tem a dica "Solte o cadeado para remover" (passe por um `rotulo` condicional: `aula.fixada ? "Remover aula (solte o cadeado antes)" : "Remover aula"` — o nome acessível continua começando por "Remover aula").
  - `.trocar-sala` no gatilho do `Seletor`: sem borda, sem fundo, altura de linha, sublinhado pontilhado, como o botão de hoje.

**`Pendencias.tsx`** — o painel é `<section aria-label="Pendências">`; a lista continua `<ul>` com `<li>`, e cada pendência continua um `<button>` com `aria-pressed`; os avisos da fatia (`avisosDaFatia`) como hoje; a nota do rodapé como hoje.

**`Diagnostico.tsx`** — `<details>` com `<summary>` no mesmo texto (`N aula(s) deste curso violam regra dura`), dentro de um `Alerta tom="aviso"`; cada linha mostra período, dia, código, disciplina e os motivos.

**`Malha.tsx`** — a legenda ganha no fim: `Clique numa pendência e depois num horário para alocar.` (a frase com "arraste" entra na tarefa 14).

Depois: `legado: false` para a página "grade-manual" em `App.tsx`.

- [ ] **Passo 7: rodar**

Run: `npm run typecheck && npm test && npm run test:e2e` → verde (75 e2e). Atenção a `cadastro.spec.ts` (aloca clicando), aos I1/B4 de `bugs-conhecidos.spec.ts` (motivo na célula, `aria-pressed`) e a `regras.spec.ts`.

- [ ] **Passo 8: capturas e commit**

Capturas: receita, para "Manual" e "Manual, pendência escolhida". A malha tem de estar igual à de antes; mudam o cabeçalho (botão Desfazer) e os controles da aula no pouso do mouse (que a captura não mostra).

```bash
git add -A
git commit -m "Grade manual convertida: botões de remover e fixar, sala pelo seletor, desfazer"
```

### Tarefa 14: Arrastar na grade manual

**Arquivos:**
- Modificar: `src/paginas/grade-manual/{index.tsx,Pendencias.tsx,Malha.tsx,Celula.tsx}`, `src/estilos/grade.css`, `testes/e2e/paginas.ts`
- Teste: `testes/e2e/arrastar.spec.ts` (novo)

**Interfaces:**
- Consome: `acoes.ts` (`mover`, `remover`, `alocar`, `semAOrigem`, `salaAoMover`), `historico`.
- Produz: `arrastar(page, origem, destino)` em `testes/e2e/paginas.ts`.

- [ ] **Passo 1: auxiliar de arrasto**

Em `testes/e2e/paginas.ts`:

```ts
/**
 * Arrasta com o mouse de verdade. O arrasto só começa depois de alguns pixels
 * de movimento, então o ponteiro anda em passos e passa duas vezes pelo destino.
 */
export async function arrastar(page: Page, origem: Locator, destino: Locator) {
  const de = await origem.boundingBox();
  const para = await destino.boundingBox();
  if (!de || !para) throw new Error("arrastar: origem ou destino fora da tela");
  await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2);
  await page.mouse.down();
  await page.mouse.move(de.x + de.width / 2 + 12, de.y + de.height / 2 + 12, { steps: 4 });
  await page.mouse.move(para.x + para.width / 2, para.y + para.height / 2, { steps: 12 });
  await page.mouse.move(para.x + para.width / 2 + 1, para.y + para.height / 2 + 1);
  await page.mouse.up();
}
```

- [ ] **Passo 2: testes que falham**

`testes/e2e/arrastar.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { arrastar, celula, contar, irPara } from "./paginas";

const BASE = `
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
  INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
  INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 4);
  INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4);`;

const AULA = `${BASE}
  INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 2);`;

const onde = (banco: import("node:sqlite").DatabaseSync, dia: number, hora: number) =>
  contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = ? AND hora = ?", dia, hora);

test.describe("pendência", () => {
  test.use({ semMassa: true, semente: `${BASE} INSERT INTO indisponibilidades (professor_id, dia, hora) VALUES (1, 2, 0);` });

  test("arrastar para célula apta aloca", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, page.getByRole("button", { name: /Cálculo/ }), celula(page, "Terça", "M2"));
    await expect.poll(() => onde(banco, 1, 1)).toBe(1);
    await expect(celula(page, "Terça", "M2")).toContainText("Cálculo");
  });

  test("durante o arrasto a célula impedida mostra o motivo, e soltar nela não grava", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const pendencia = page.getByRole("button", { name: /Cálculo/ });
    const de = (await pendencia.boundingBox())!;
    const alvo = (await celula(page, "Quarta", "M1").boundingBox())!;
    await page.mouse.move(de.x + 10, de.y + 10);
    await page.mouse.down();
    await page.mouse.move(de.x + 30, de.y + 30, { steps: 4 });
    await page.mouse.move(alvo.x + alvo.width / 2, alvo.y + alvo.height / 2, { steps: 10 });
    await expect(celula(page, "Quarta", "M1")).toContainText("A. Souza indisponível");
    await page.mouse.up();
    await expect(page.getByText("A. Souza indisponível").last()).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
  });
});

test.describe("aula", () => {
  test.use({ semMassa: true, semente: AULA });

  test("arrastar para outra célula move e mantém a sala", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect.poll(() => onde(banco, 3, 2)).toBe(1);
    expect(onde(banco, 0, 0)).toBe(0);
    expect(contar(banco, "SELECT sala_id FROM alocacoes")).toBe(2);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
  });

  test("mover desfaz com Ctrl+Z", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect.poll(() => onde(banco, 3, 2)).toBe(1);
    await page.keyboard.press("Control+z");
    await expect.poll(() => onde(banco, 0, 0)).toBe(1);
  });

  test("arrastar para o painel de pendências remove", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), page.getByRole("region", { name: "Pendências" }));
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
    await expect(page.getByRole("button", { name: "Desfazer" }).last()).toBeVisible();
  });

  test("soltar na própria célula não faz nada", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const origem = celula(page, "Segunda", "M1");
    const caixa = (await origem.boundingBox())!;
    await page.mouse.move(caixa.x + 10, caixa.y + 10);
    await page.mouse.down();
    await page.mouse.move(caixa.x + 30, caixa.y + 20, { steps: 4 });
    await page.mouse.up();
    expect(onde(banco, 0, 0)).toBe(1);
  });

  test("a sala ainda se troca pelo seletor, sem iniciar arrasto", async ({ page, banco }) => {
    await irPara(page, "Manual");
    const sala = page.getByRole("combobox", { name: "Trocar sala de Cálculo" });
    await sala.click();
    await page.getByRole("option", { name: "A01", exact: true }).click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes")).toBe(1);
  });
});

test.describe("aula fixada", () => {
  test.use({ semMassa: true, semente: `${AULA} UPDATE alocacoes SET fixada = 1;` });

  test("não arrasta", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Quinta", "M3"));
    await expect(celula(page, "Segunda", "M1")).toContainText("Cálculo");
    expect(onde(banco, 0, 0)).toBe(1);
    expect(onde(banco, 3, 2)).toBe(0);
  });
});

test.describe("sala ocupada no destino", () => {
  test.use({
    semMassa: true,
    semente: `${AULA}
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (2, 1, 'Física', 2, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (2, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 2, 1, 0, 2, 2, 2);`,
  });

  test("mover para um horário em que a sala está tomada troca a sala", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await arrastar(page, celula(page, "Segunda", "M1"), celula(page, "Terça", "M1"));
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND dia = 1 AND hora = 0")).toBe(1);
    expect(contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
  });
});
```

Run: `npm run test:e2e -- arrastar` → FALHA.

- [ ] **Passo 3: o arrasto**

**`index.tsx`** — o contexto e o estado:

```tsx
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";

type Carga = { tipo: "fatia"; fatia: Fatia } | { tipo: "aula"; aula: Aula; fatia: Fatia };
type Alvo = { tipo: "celula"; dia: number; hora: number } | { tipo: "pendencias" };

// O arrasto só começa depois de 6 px: antes disso é clique.
const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
const [arrasto, setArrasto] = useState<Carga | null>(null);
```

- **A fatia em mãos** é `arrasto?.fatia ?? fatiaEscolhida`. É ela que pinta as células.
- **A ocupação usada para avaliar** é `arrasto?.tipo === "aula" ? semAOrigem(cursoId, aulas, arrasto.aula) : oc`. Ao mover, a checagem "N de N aulas já alocadas" é pulada (a aula já conta).
- `motivoDe(f, dia, hora)` passa a receber a ocupação e um sinal `movendo` por parâmetro, em vez de ler `oc` do fechamento.

```tsx
function aoComecar(e: DragStartEvent) {
  setArrasto(e.active.data.current as Carga);
}

async function aoSoltar(e: DragEndEvent) {
  const carga = e.active.data.current as Carga;
  const alvo = e.over?.data.current as Alvo | undefined;
  setArrasto(null);
  if (!alvo || periodo == null || !ctx) return;

  if (alvo.tipo === "pendencias") {
    if (carga.tipo === "aula") await removerAula(carga.aula);
    return;
  }

  const movendo = carga.tipo === "aula";
  if (movendo && carga.aula.dia === alvo.dia && carga.aula.hora === alvo.hora) return;
  const ocupacao = movendo ? semAOrigem(cursoId, aulas, carga.aula) : oc;
  const motivo = motivoDe(carga.fatia, alvo.dia, alvo.hora, ocupacao, movendo);
  if (motivo) return avisar.aviso(motivo);

  if (movendo) await moverAula(carga.aula, carga.fatia, alvo.dia, alvo.hora, ocupacao);
  else await alocarEm(carga.fatia, alvo.dia, alvo.hora);
}
```

`moverAula` calcula a sala com `salaAoMover(ctx, ocupacao, regrasDe(fatia), aula, dia, hora, salaVizinha)` — a vizinha é a sala da aula da mesma fatia em `hora ± 1` no destino, como em alocar — e grava com `historico.executarNaGrade(cursoId, `Mover ${aula.disciplina}`, [mover(aula, dia, hora, sala)])`. O destino é decidido pela posição do ponteiro (`pointerWithin`), não pelo retângulo do cartão: a pendência é mais larga que uma célula e encostaria nas vizinhas.

O JSX da página fica dentro de:

```tsx
<DndContext sensors={sensores} collisionDetection={pointerWithin} onDragStart={aoComecar} onDragEnd={aoSoltar} onDragCancel={() => setArrasto(null)}>
  {/* painel de pendências e malha */}
  <DragOverlay>
    {arrasto && (
      <div className="celula ocupada arrastando">
        <span className="nome">{arrasto.tipo === "aula" ? arrasto.aula.disciplina : arrasto.fatia.disciplina_curta}</span>
        <span className="meta">{curto(arrasto.fatia.professor)}</span>
      </div>
    )}
  </DragOverlay>
</DndContext>
```

**`Pendencias.tsx`** — o painel é destino e cada pendência é origem:

```tsx
const { setNodeRef, isOver } = useDroppable({ id: "pendencias", data: { tipo: "pendencias" } satisfies Alvo });
// <section ref={setNodeRef} aria-label="Pendências" className={cn("pendencias", isOver && arrastandoAula && "soltar-aqui")}>
```

```tsx
function Pendencia({ fatia, completa, … }) {
  const { setNodeRef, listeners } = useDraggable({
    id: `fatia:${idFatia(fatia)}`,
    data: { tipo: "fatia", fatia } satisfies Carga,
    disabled: completa,
  });
  return <button ref={setNodeRef} {...listeners} aria-pressed={…} …>…</button>;
}
```

Use só `listeners`, não `attributes`: o `attributes` do dnd-kit põe `role="button"` e `aria-roledescription` de arrasto por teclado, que não existe aqui (decisão 2 do spec).

**`Celula.tsx`**

- Vazia: `useDroppable({ id: `celula:${dia}-${hora}`, data: { tipo: "celula", dia, hora } })`; o `ref` vai no `<button>`; com `isOver`, a classe `sobre` reforça a borda.
- Ocupada: `useDraggable({ id: `aula:${dia}-${hora}`, data: { tipo: "aula", aula, fatia }, disabled: !!aula.fixada || !fatia })`; `ref` e `listeners` na `div` do grupo; com `isDragging`, a classe `origem` (rebaixo e tracejado, sem `opacity`).
- **Os controles não iniciam arrasto**: o `span.controles` e o `span` em volta do `Seletor` recebem `onPointerDown={(e) => e.stopPropagation()}`.

**`grade.css`** — `.celula.arrastando` (sombra `0 6px 16px var(--shadow)`, cursor `grabbing`, largura fixa de 140 px), `.celula.origem`, `.celula.sobre`, `.pendencias.soltar-aqui` (borda tracejada no negativo e o texto "Solte aqui para remover" por `::after`), `.celula.ocupada:not(.travada)` e `.fatia:not(.completa)` com `cursor: grab`.

**`Malha.tsx`** — a frase da legenda vira: `Arraste uma pendência para um horário, ou clique nela e depois no horário.`

- [ ] **Passo 4: rodar**

Run: `npm run typecheck && npm test && npm run test:e2e` → verde (84 e2e). Rode `npm run test:e2e -- arrastar` três vezes: arrasto sintético é o tipo de teste que oscila; se oscilar, aumente os `steps` do auxiliar, não ponha `waitForTimeout`.

- [ ] **Passo 5: capturas e commit**

Capturas: "Manual" e "Manual, pendência escolhida" mudam só na legenda. Receita.

```bash
git add -A
git commit -m "Grade manual: arrastar para alocar, mover e remover"
```

### Tarefa 15: Grade automática

**Arquivos:**
- Modificar: `src/paginas/GradeAutomatica.tsx`, `src/App.tsx`, `src/estilos/legado.css`, `testes/e2e/desfazer.spec.ts`

**Interfaces:**
- Consome: `historico`, `BotaoDesfazer`, `useHistorico`, `desfazerEAvisar`, `aoNavegar` (tarefa 5).

- [ ] **Passo 1: teste que falha**

Em `testes/e2e/desfazer.spec.ts`, num `describe` novo (este usa a massa, então precisa do próprio `test.use`):

```ts
test.describe("grade gerada", () => {
  test.use({ semMassa: false, semente: "" });

  test("aplicar, abrir a grade manual pelo botão e desfazer lá", async ({ page, banco }) => {
    await responderConfirmacoes(page);
    // A massa é totalmente resolúvel: a grade gerada coloca todas as aulas.
    const total = contar(
      banco,
      "SELECT SUM(dp.aulas) FROM disciplina_professores dp JOIN disciplinas d ON d.id = dp.disciplina_id WHERE d.curso_id = 1",
    );
    banco.exec("DELETE FROM alocacoes WHERE curso_id = 1 AND periodo = 1");
    await page.reload();
    const semOPrimeiro = contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1");
    expect(semOPrimeiro).toBeLessThan(total);

    await irPara(page, "Automática");
    await page.getByRole("button", { name: "Gerar grade" }).click();
    await page.getByRole("button", { name: "Aplicar esta grade" }).click({ timeout: 30_000 });
    await expect(page.getByText("Grade aplicada.")).toBeVisible();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1")).toBe(total);

    await page.getByRole("button", { name: "Abrir a grade manual" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Grade horária");
    await page.getByRole("main").getByRole("button", { name: "Desfazer" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1")).toBe(semOPrimeiro);
  });
});
```

Run: `npm run test:e2e -- desfazer` → o novo FALHA.

- [ ] **Passo 2: converter**

Receita. Próprio:

- A página recebe `aoNavegar` (ajuste o `componente` em `App.tsx`: `(p) => <GradeAutomatica cursoId={p.cursoId} aoNavegar={p.aoNavegar} />`).
- Cabeçalho: `<CabecalhoPagina titulo="Grade automática" sub={…o texto de hoje…}>` com `<BotaoDesfazer />` e `<Button onClick={gerar} disabled={gerando}>{gerando ? "Gerando…" : "Gerar grade"}</Button>`.
- `aplicar`: depois da confirmação, `await historico.executarNaGrade(cursoId, "Aplicar a grade gerada", instrucoes)` no lugar de `transacao(instrucoes)`; em seguida `avisar.desfazer("Grade aplicada", desfazerEAvisar)`.
- O aviso de sucesso:

```tsx
<Alerta tom="sucesso">
  Grade aplicada.{" "}
  <Button variant="link" className="h-auto p-0" onClick={() => aoNavegar("grade-manual")}>
    Abrir a grade manual
  </Button>
</Alerta>
```

  O texto "Grade aplicada." fica num nó só, com o ponto (os e2e procuram exatamente isso).
- `const { versao } = useHistorico();` e recarga quando muda, como na grade manual: desfazer aqui devolve o "antes" do comparativo.
- O erro de carga (teste B5) continua na página, em `<Alerta tom="erro">`, mesmo sem problema montado.
- O comparativo antes/depois e a lista de fatias de fora: `Table` do shadcn; "melhor" em `text-primary` com `▲`/`▼` junto do número (a cor não vai sozinha), "pior" em `text-destructive`.

- [ ] **Passo 3: rodar, capturas, commit**

Run: `npm run typecheck && npm test && npm run test:e2e` → verde (85 e2e).
Capturas: receita, para "Automática".

```bash
git add -A
git commit -m "Grade automática convertida: aplicar entra no histórico e leva à grade manual"
```

---

## Onda 5 — Fecho

### Tarefa 16: E2E herdados que faltavam

Dois dos cinco e2e herdados já entraram na tarefa 8 (cancelar a remoção de turno e recusa por turno forçado). Faltam: opção "Sem sala", sala vizinha preferida e "Limpar período" desabilitado.

**Arquivos:**
- Modificar: `testes/e2e/grade-manual.spec.ts`

- [ ] **Passo 1: os três testes**

No fim de `testes/e2e/grade-manual.spec.ts`:

```ts
test.describe("disciplina que não exige sala", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 1);`,
  });

  test("a troca de sala oferece 'Sem sala'", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await escolher(page.getByRole("combobox", { name: "Trocar sala de Cálculo" }), "Sem sala");
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE sala_id IS NULL")).toBe(1);
  });
});

test.describe("sala vizinha", () => {
  // A02 é só aceitável, mas a aula ao lado já está nela: o bloco não troca de sala.
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (1, 1, 1), (1, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 2);`,
  });

  test("a aula ao lado vai para a mesma sala, mesmo havendo uma ideal livre", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await celula(page, "Segunda", "M2").click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE sala_id = 2")).toBe(2);
  });
});

test.describe("limpar período", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, fixada) VALUES (1, 1, 0, 0, 1, 1, 1);`,
  });

  test("fica desabilitado quando só há aula fixada, e habilita ao soltar", async ({ page }) => {
    await irPara(page, "Manual");
    const limpar = page.getByRole("button", { name: "Limpar período" });
    await expect(limpar).toBeDisabled();
    await celula(page, "Segunda", "M1").getByRole("button", { name: "Soltar" }).click();
    await expect(limpar).toBeEnabled();
  });
});
```

- [ ] **Passo 2: rodar**

Run: `npm run test:e2e -- grade-manual`
Esperado: os três passam de primeira (cobrem comportamento que já existe). Se algum falhar, é defeito real: corrija na tela, não no teste, e anote no relatório.

- [ ] **Passo 3: commit**

```bash
git add testes/e2e/grade-manual.spec.ts
git commit -m "Testes e2e: opção Sem sala, sala vizinha e Limpar período desabilitado"
```

### Tarefa 17: Apagar o legado, documentação e verificação final

**Arquivos:**
- Apagar: `src/estilos/legado.css`, `src/componentes/legado.tsx`
- Modificar: `src/estilos/tema.css`, `src/App.tsx`, `testes/e2e/paginas.ts`, `README.md`, `docs/regras.md`, `docs/superpowers/specs/2026-10-11-refatoracao-visual-design.md`

- [ ] **Passo 1: nada mais usa o legado**

```bash
grep -rn "componentes/legado\|className=\"legado\"\|legado: true" src/
grep -rn "<select\|confirm(" src/
```

Esperado: nenhuma linha nos dois. Se sobrar import de `componentes/legado`, troque pelo componente novo (ou por `@/lib/erros`, para `mensagemErro`).

- [ ] **Passo 2: apagar**

```bash
git rm src/estilos/legado.css src/componentes/legado.tsx
```

Em `src/estilos/tema.css`: tire o `@import "./legado.css" layer(legado);` e `legado` da lista de `@layer` (fica `@layer theme, base, components, utilities;`), e ajuste o comentário das camadas. Em `src/App.tsx`: tire o campo `legado` do tipo `Pagina`, de cada página e do JSX (`atual.legado ? … : conteudo` vira `conteudo`).

Em `testes/e2e/paginas.ts`: tire a função `nativo` e os dois ramos nativos de `escolher` e `escolhida`:

```ts
/** Escolhe uma opção do seletor pelo texto que o usuário vê. */
export async function escolher(campo: Locator, opcao: string | RegExp) {
  await campo.click();
  await campo.page().getByRole("option", { name: opcao, exact: typeof opcao === "string" }).click();
}

/** O texto da opção escolhida. */
export async function escolhida(campo: Locator): Promise<string> {
  return ((await campo.textContent()) ?? "").trim();
}
```

- [ ] **Passo 3: os critérios de fim do spec**

```bash
ls src/App.css src/estilos/legado.css src/componentes/legado.tsx 2>&1   # os três: não existe
grep -rn "confirm(\|<select\|\.legado\|legado" src/                      # nenhuma linha
```

- [ ] **Passo 4: documentação**

`docs/regras.md`:
- seção "Cursos": "lista, num diagnóstico, as aulas gravadas antes desta regra que a violam" continua valendo; acrescente que o diagnóstico lista também a aula cujo professor não leciona mais a disciplina;
- seção "Salas": "a sala de uma aula pode ser trocada pela própria célula" continua; nada a mudar no texto além de conferir que não fala em "botão";
- seção "Mudanças de cadastro que invalidam aulas": onde diz "Se só houve reatribuições, não há diálogo" (duas vezes), acrescente "; um aviso diz quantas aulas mudaram de sala e quantas eram fixadas".

`README.md`: na descrição da grade manual, troque "clicar numa aula a remove" (ou equivalente) por: arrastar ou clicar para alocar; arrastar para mover; botão "Remover aula" ou arrastar para o painel de pendências para remover; cadeado ou botão direito para fixar; Ctrl+Z desfaz. Acrescente a pilha nova (Tailwind, shadcn/ui, TanStack Table, dnd-kit, lucide-react, Sonner) onde o README lista as tecnologias, e uma linha sobre `src/estilos/tema.css` ser a fonte dos tokens e das três regras do design.

No spec, atualize a linha de status do topo para "implementado" e acrescente, no fim de "Decisões tomadas sem o usuário", o que tiver sido decidido durante a execução e não constava (uma linha por decisão).

- [ ] **Passo 5: verificação final**

```bash
npm run typecheck
npm test
npm run test:e2e
npm run test:visual
npm run build
```

Esperado: tudo verde; Vitest em menos de 20 s; e2e (88 testes) em menos de 3 min. As capturas não mudam nesta tarefa: se mudarem, alguma tela ainda dependia de regra do `legado.css` — recupere a regra para o `grade.css` ou para a tela, não regere.

Smoke, se houver build de debug na máquina (`src-tauri/target/debug/` com o executável): `npm run tauri build -- --debug --no-bundle && npm run test:smoke`. O build de debug usa outro arquivo de banco; **não** abra o app de produção sobre o banco real sem uma cópia de `%APPDATA%\br.edu.utfpr.distribuicaoaulas\distribuicao.db` (a migração 010 roda na primeira abertura). Se não houver como rodar o smoke, diga isso no relatório.

- [ ] **Passo 6: commit**

```bash
git add -A
git commit -m "Fecho do subprojeto 2: legado apagado, documentação e verificação final"
```
