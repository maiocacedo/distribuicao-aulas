# Fundação de testes e CI — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao app Distribuição de Aulas uma bateria de testes em três camadas (solver, interface, binário real) e um CI no GitHub Actions, transformando os bugs conhecidos em testes de falha esperada.

**Architecture:** Uma massa anonimizada (SQL) alimenta `criarBanco()`, que monta um SQLite em memória (`node:sqlite`) com as migrações reais. O Vitest usa esse banco para testar o solver via `carregarProblema` com leitura injetável e um auditor independente (`conferir`). O Playwright roda o front no Chromium com o IPC do Tauri redirecionado para uma "ponte" no Node que opera o mesmo banco. O smoke usa WebdriverIO + tauri-driver contra o binário debug, com o banco isolado por `DISTRIBUICAO_BANCO`.

**Tech Stack:** Vitest 3.2, vite-node 3.2, `node:sqlite` (Node ≥ 22.13), Playwright 1.55, WebdriverIO 9 + tauri-driver, Python 3 (script de massa), GitHub Actions.

Spec: `docs/superpowers/specs/2026-09-28-fundacao-testes-ci-design.md`.

## Global Constraints

- Node ≥ 22.13 (`node:sqlite` sem flag); `.nvmrc` = `22`.
- Nomes de arquivos, funções e mensagens em português, como no resto do projeto.
- O app não muda de comportamento. Mudanças de produção permitidas: `carregarProblema` com leitura injetável; `aria-label` nas células da grade manual e de indisponibilidades; `DISTRIBUICAO_BANCO` + comando `banco()` só em debug; `src/solver/conferir.ts` novo.
- Nenhum teste toca o banco real do usuário.
- Nenhum nome de professor real entra no git.
- Bugs conhecidos: `it.fails` (Vitest) / `test.fail(true, "<id> — …")` (Playwright), com o id no título.
- Vitest < 20 s; Playwright < 2 min.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Diretório de trabalho: raiz do repo, branch `fundacao-testes-ci`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `.gitattributes`, `.nvmrc`, `.gitignore` | finais de linha, versão do Node, artefatos de teste |
| `scripts/anonimizar_massa.py` | gera a massa anonimizada a partir do banco real |
| `testes/massa/engenharia_v9.sql` | massa (gerada, commitada) |
| `testes/suporte/ponte.ts` | simulação do IPC do Tauri sobre `node:sqlite`; `converter` |
| `testes/suporte/banco.ts` | `criarBanco`, `lerDe`, `lerAlocacoes` |
| `testes/suporte/problema.ts` | fábricas de `Problema`/`Fatia`/`Alocacao` para testes unitários |
| `testes/suporte/cenarios.ts` | cenários de estresse compartilhados por testes e benchmark |
| `src/solver/conferir.ts` | auditor das regras duras |
| `src/solver/carregar.ts` | `carregarProblema(cursoId, ler)` |
| `src/solver/*.test.ts` | testes do solver |
| `scripts/bench_solver.ts` | benchmark |
| `src/db.ts`, `src-tauri/src/lib.rs` | comando `banco()` e `DISTRIBUICAO_BANCO` |
| `playwright.config.ts`, `testes/e2e/*` | camada de interface |
| `testes/smoke/*` | camada do binário real |
| `.github/workflows/ci.yml` | CI |

---

### Task 1: Base do repositório (spec, finais de linha, Node, typecheck)

**Files:**
- Create: `.gitattributes`, `.nvmrc`
- Modify: `.gitignore`, `package.json`

**Interfaces:**
- Produces: script `npm run typecheck` (ampliado nas tasks seguintes).

- [ ] **Step 1: Commitar o spec, se ainda não estiver commitado**

```bash
git status --short docs/superpowers
git add docs/superpowers/specs/2026-09-28-fundacao-testes-ci-design.md docs/superpowers/plans/2026-09-28-fundacao-testes-ci.md
git commit -m "Spec e plano do subprojeto 0: fundação de testes e CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Criar `.gitattributes`**

```gitattributes
* text=auto eol=lf
*.png binary
*.ico binary
*.icns binary
*.db binary
```

- [ ] **Step 3: Criar `.nvmrc`**

```
22
```

- [ ] **Step 4: Acrescentar ao fim do `.gitignore`**

```gitignore

# Testes
playwright-report/
test-results/
msedgedriver.exe
```

- [ ] **Step 5: Em `package.json`, acrescentar `engines` e o script `typecheck`**

O bloco `scripts` passa a ser:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.13"
  },
```

- [ ] **Step 6: Renormalizar e conferir**

Run: `git add --renormalize . && npm run typecheck`
Expected: `tsc` sem saída, exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Normaliza finais de linha, fixa Node 22 e adiciona typecheck

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Massa anonimizada

**Files:**
- Create: `scripts/anonimizar_massa.py`
- Create (gerado): `testes/massa/engenharia_v9.sql`

**Interfaces:**
- Produces: arquivo SQL cujo cabeçalho contém a linha `-- esquema: 9`; professores nomeados `Professor 01`…`Professor 22`.

Pré-requisito: o banco real `distribuicao.db` na raiz do repo (fora do git, gerado por `scripts/migrar.py`).

- [ ] **Step 1: Criar `scripts/anonimizar_massa.py`**

```python
"""
Gera a massa de teste anonimizada a partir de um banco real.

    python scripts/anonimizar_massa.py <banco.db> [-o testes/massa/engenharia_v9.sql]

A massa é só de dados: o esquema vem das migrações. O cabeçalho registra em que
versão do esquema ela foi gravada, e `testes/suporte/banco.ts` aplica as
migrações até essa versão, insere a massa e aplica o restante — assim toda
migração nova é exercida contra um banco já populado.

Anonimiza o que é dado pessoal: nomes de professores, observações e motivos de
indisponibilidade. Nomes de disciplinas, salas e curso ficam: são currículo
público. Os ids são preservados.
"""
import argparse
import glob
import os
import sqlite3
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (tabela, colunas do conflito para upsert). As três primeiras já têm linhas
# semeadas pelas migrações; o resto entra puro, na ordem das dependências.
ORDEM = [
    ("cursos", "id"),
    ("configuracao", "chave"),
    ("padroes_blocos", "aulas, padrao"),
    ("periodos", None),
    ("professores", None),
    ("salas", None),
    ("tipos_disciplina", None),
    ("disciplinas", None),
    ("disciplina_professores", None),
    ("disciplina_salas", None),
    ("indisponibilidades", None),
    ("alocacoes", None),
]

APAGAR = {"observacao", "motivo"}


def versao_do_esquema():
    arquivos = glob.glob(os.path.join(RAIZ, "scripts", "migracoes", "*.sql"))
    return max(int(os.path.basename(a)[:3]) for a in arquivos)


def literal(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, bytes):
        return "X'%s'" % v.hex()
    return "'%s'" % str(v).replace("'", "''")


def gerar(origem):
    con = sqlite3.connect("file:%s?mode=ro" % origem.replace(os.sep, "/"), uri=True)
    ids = [r[0] for r in con.execute("SELECT id FROM professores ORDER BY id")]
    novo_nome = {pid: "Professor %02d" % (i + 1) for i, pid in enumerate(ids)}
    nomes_reais = [r[0] for r in con.execute("SELECT nome FROM professores")]

    linhas = [
        "-- Massa de teste anonimizada, gerada por scripts/anonimizar_massa.py.",
        "-- Não editar à mão: regenere a partir do banco real.",
        "-- esquema: %d" % versao_do_esquema(),
        "",
    ]
    for tabela, conflito in ORDEM:
        colunas = [r[1] for r in con.execute("PRAGMA table_info(%s)" % tabela)]
        chaves = [c.strip() for c in conflito.split(",")] if conflito else []
        for registro in con.execute("SELECT * FROM %s ORDER BY rowid" % tabela):
            valores = dict(zip(colunas, registro))
            for c in APAGAR & valores.keys():
                valores[c] = None
            if tabela == "professores":
                valores["nome"] = novo_nome[valores["id"]]
            sql = "INSERT INTO %s (%s) VALUES (%s)" % (
                tabela, ", ".join(colunas),
                ", ".join(literal(valores[c]) for c in colunas))
            if conflito:
                resto = [c for c in colunas if c not in chaves]
                sql += " ON CONFLICT(%s) DO UPDATE SET %s" % (
                    conflito, ", ".join("%s = excluded.%s" % (c, c) for c in resto))
            linhas.append(sql + ";")
    return nomes_reais, len(ids), "\n".join(linhas) + "\n"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("banco")
    ap.add_argument("-o", "--saida",
                    default=os.path.join(RAIZ, "testes", "massa", "engenharia_v9.sql"))
    a = ap.parse_args()
    if not os.path.exists(a.banco):
        sys.exit("banco não encontrado: %s" % a.banco)
    nomes_reais, n, texto = gerar(a.banco)
    vazados = [nome for nome in nomes_reais if nome in texto]
    if vazados:
        sys.exit("ABORTADO: %d nome(s) real(is) de professor na saída" % len(vazados))
    os.makedirs(os.path.dirname(a.saida), exist_ok=True)
    with open(a.saida, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(texto)
    print("%s: %d professores anonimizados, %d linhas"
          % (a.saida, n, texto.count("\n")))
```

- [ ] **Step 2: Gerar a massa**

Run: `python scripts/anonimizar_massa.py distribuicao.db`
Expected: `…engenharia_v9.sql: 22 professores anonimizados, <N> linhas`, sem `ABORTADO`.

- [ ] **Step 3: Conferir o conteúdo**

Run: `grep -c "INSERT INTO alocacoes" testes/massa/engenharia_v9.sql && grep -m1 "esquema:" testes/massa/engenharia_v9.sql && grep -o "'Professor [0-9]*'" testes/massa/engenharia_v9.sql | sort -u | wc -l`
Expected: `219`, `-- esquema: 9`, `22`.

- [ ] **Step 4: Commit**

```bash
git add scripts/anonimizar_massa.py testes/massa/engenharia_v9.sql
git commit -m "Massa de teste anonimizada gerada do banco real

Professores viram 'Professor NN', observações e motivos são apagados; ids,
disciplinas, salas e grade preservados.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ponte de IPC e banco de teste

**Files:**
- Create: `testes/suporte/ponte.ts`, `testes/suporte/banco.ts`, `testes/suporte/ponte.test.ts`, `testes/suporte/banco.test.ts`, `vitest.config.ts`, `testes/tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `testes/massa/engenharia_v9.sql` (Task 2).
- Produces:
  - `ponte.ts`: `type Valor = null | number | bigint | string | Uint8Array`; `converter(v: unknown): Valor`; `type Resposta = { ok: true; valor: unknown } | { ok: false; erro: string }`; `interface OpcoesPonte { falharQuando?: RegExp }`; `NOME_DO_BANCO = "sqlite:distribuicao.db"`; `criarPonte(db: DatabaseSync, opcoes?: OpcoesPonte): (cmd: string, args?: Record<string, unknown>) => Resposta`.
  - `banco.ts`: `criarBanco(opcoes?: { massa?: boolean }): DatabaseSync` (massa padrão `true`).

- [ ] **Step 1: Instalar dependências**

Run: `npm i -D vitest@^3.2.4 vite-node@^3.2.4 @types/node@^22.15.0`

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "testes/suporte/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 3: Criar `testes/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "jsx": "react-jsx"
  },
  "include": ["**/*.ts", "../scripts/*.ts"],
  "exclude": ["smoke"]
}
```

- [ ] **Step 4: Scripts no `package.json`**

```json
    "typecheck": "tsc --noEmit && tsc --noEmit -p testes",
    "test": "vitest run",
```

- [ ] **Step 5: Escrever o teste da ponte — `testes/suporte/ponte.test.ts`**

```ts
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { NOME_DO_BANCO, criarPonte } from "./ponte";

function bancoMinimo() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE pai (id INTEGER PRIMARY KEY, nome TEXT, dados TEXT);
    CREATE TABLE filho (id INTEGER PRIMARY KEY, pai_id INTEGER NOT NULL REFERENCES pai(id));
  `);
  return db;
}

describe("ponte de IPC", () => {
  it("responde banco e load como o app espera", () => {
    const ponte = criarPonte(bancoMinimo());
    expect(ponte("banco")).toEqual({ ok: true, valor: NOME_DO_BANCO });
    expect(ponte("plugin:sql|load", { db: "sqlite:x.db" })).toEqual({ ok: true, valor: "sqlite:x.db" });
  });

  it("converte booleano em 0/1 como o amarrar do Rust", () => {
    const r = criarPonte(bancoMinimo())("plugin:sql|select", { query: "SELECT ? AS v", values: [true] });
    expect(r).toEqual({ ok: true, valor: [{ v: 1 }] });
  });

  it("grava array como texto JSON", () => {
    const db = bancoMinimo();
    const ponte = criarPonte(db);
    ponte("transacao", { instrucoes: [{ sql: "INSERT INTO pai (nome, dados) VALUES (?, ?)", params: ["a", [1, 2]] }] });
    expect({ ...(db.prepare("SELECT dados FROM pai").get() as object) }).toEqual({ dados: "[1,2]" });
  });

  it("transacao devolve linhas afetadas e último id", () => {
    const r = criarPonte(bancoMinimo())("transacao", {
      instrucoes: [
        { sql: "INSERT INTO pai (nome) VALUES (?)", params: ["a"] },
        { sql: "INSERT INTO pai (nome) VALUES (?)", params: ["b"] },
      ],
    });
    expect(r).toEqual({ ok: true, valor: { rowsAffected: 2, lastInsertId: 2 } });
  });

  it("desfaz tudo quando uma instrução viola chave estrangeira", () => {
    const db = bancoMinimo();
    const r = criarPonte(db)("transacao", {
      instrucoes: [
        { sql: "INSERT INTO pai (nome) VALUES (?)", params: ["a"] },
        { sql: "INSERT INTO filho (pai_id) VALUES (?)", params: [999] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.erro).toMatch(/FOREIGN KEY constraint failed/);
    expect({ ...(db.prepare("SELECT COUNT(*) AS n FROM pai").get() as object) }).toEqual({ n: 0 });
  });

  it("rejeita comando que não simula", () => {
    expect(criarPonte(bancoMinimo())("plugin:sql|execute")).toEqual({
      ok: false,
      erro: "comando não simulado: plugin:sql|execute",
    });
  });

  it("injeta falha por padrão de SQL", () => {
    const r = criarPonte(bancoMinimo(), { falharQuando: /FROM pai/ })("plugin:sql|select", {
      query: "SELECT * FROM pai",
      values: [],
    });
    expect(r).toEqual({ ok: false, erro: "falha simulada: SELECT * FROM pai" });
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run testes/suporte/ponte.test.ts`
Expected: FAIL — `Failed to resolve import "./ponte"`.

- [ ] **Step 7: Implementar `testes/suporte/ponte.ts`**

```ts
import type { DatabaseSync } from "node:sqlite";

/**
 * Simulação do IPC do Tauri sobre um SQLite do Node, para testar o front sem o
 * binário. Cobre só o que o app usa; qualquer outro comando é rejeitado, para
 * que um uso novo apareça como falha em vez de passar despercebido.
 *
 * A semântica de `transacao` segue `src-tauri/src/lib.rs`: chave estrangeira
 * ligada, tudo ou nada, e parâmetros convertidos como no `amarrar`.
 */

export type Valor = null | number | bigint | string | Uint8Array;
export type Resposta = { ok: true; valor: unknown } | { ok: false; erro: string };
export interface OpcoesPonte {
  /** Toda consulta ou instrução cujo SQL casar com isto falha. */
  falharQuando?: RegExp;
}

interface Instrucao {
  sql: string;
  params?: unknown[];
}

export const NOME_DO_BANCO = "sqlite:distribuicao.db";

/** Como o `amarrar` do Rust: booleano vira 0/1; array e objeto viram texto JSON. */
export function converter(v: unknown): Valor {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return JSON.stringify(v);
}

export function criarPonte(db: DatabaseSync, opcoes: OpcoesPonte = {}) {
  function verificar(sql: string) {
    if (opcoes.falharQuando?.test(sql)) throw new Error(`falha simulada: ${sql}`);
  }

  function transacao(instrucoes: Instrucao[]) {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("BEGIN");
    let rowsAffected = 0;
    let lastInsertId = 0;
    try {
      for (const i of instrucoes) {
        verificar(i.sql);
        const r = db.prepare(i.sql).run(...(i.params ?? []).map(converter));
        rowsAffected += Number(r.changes);
        lastInsertId = Number(r.lastInsertRowid);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { rowsAffected, lastInsertId };
  }

  function executar(cmd: string, args: Record<string, unknown>): unknown {
    switch (cmd) {
      case "banco":
        return NOME_DO_BANCO;
      case "plugin:sql|load":
        return args.db;
      case "plugin:sql|select": {
        const query = String(args.query);
        verificar(query);
        const valores = ((args.values as unknown[]) ?? []).map(converter);
        return db.prepare(query).all(...valores).map((linha) => ({ ...(linha as object) }));
      }
      case "transacao":
        return transacao(args.instrucoes as Instrucao[]);
      default:
        throw new Error(`comando não simulado: ${cmd}`);
    }
  }

  return (cmd: string, args: Record<string, unknown> = {}): Resposta => {
    try {
      return { ok: true, valor: executar(cmd, args) };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  };
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run testes/suporte/ponte.test.ts`
Expected: 7 passed. Se o Vitest acusar `Failed to load url node:sqlite`, acrescente em `vitest.config.ts`, dentro de `test`: `server: { deps: { external: [/^node:/] } },` e rode de novo.

- [ ] **Step 9: Escrever o teste do banco — `testes/suporte/banco.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { criarBanco } from "./banco";

const um = (db: ReturnType<typeof criarBanco>, sql: string) =>
  ({ ...(db.prepare(sql).get() as Record<string, unknown>) });

describe("criarBanco", () => {
  it("sem massa sai igual à primeira abertura do app", () => {
    const db = criarBanco({ massa: false });
    expect(um(db, "SELECT COUNT(*) AS n, MIN(nome) AS nome FROM cursos")).toEqual({ n: 1, nome: "Curso" });
    expect(um(db, "SELECT COUNT(*) AS n FROM horarios")).toEqual({ n: 17 });
    expect(um(db, "SELECT COUNT(*) AS n FROM professores")).toEqual({ n: 0 });
  });

  it("com massa carrega o curso anonimizado", () => {
    const db = criarBanco();
    expect(um(db, "SELECT COUNT(*) AS n FROM professores WHERE nome GLOB 'Professor [0-9][0-9]'")).toEqual({ n: 22 });
    expect(um(db, "SELECT COUNT(*) AS n FROM professores")).toEqual({ n: 22 });
    expect(um(db, "SELECT COUNT(*) AS n FROM alocacoes WHERE curso_id = 1")).toEqual({ n: 219 });
    expect(
      um(db, `SELECT SUM(dp.aulas) AS n FROM disciplina_professores dp
              JOIN disciplinas d ON d.id = dp.disciplina_id WHERE d.curso_id = 1`),
    ).toEqual({ n: 223 });
  });

  it("liga a chave estrangeira", () => {
    const db = criarBanco({ massa: false });
    expect(() => db.exec("INSERT INTO disciplina_professores VALUES (999, 999, 1)")).toThrow(/FOREIGN KEY/);
  });
});
```

- [ ] **Step 10: Rodar e ver falhar**

Run: `npx vitest run testes/suporte/banco.test.ts`
Expected: FAIL — `Failed to resolve import "./banco"`.

- [ ] **Step 11: Implementar `testes/suporte/banco.ts`**

```ts
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const MIGRACOES = join(RAIZ, "scripts", "migracoes");
const MASSA = join(RAIZ, "testes", "massa", "engenharia_v9.sql");

function migracoes(): { versao: number; sql: string }[] {
  return readdirSync(MIGRACOES)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort()
    .map((f) => ({ versao: Number(f.slice(0, 3)), sql: readFileSync(join(MIGRACOES, f), "utf-8") }));
}

/**
 * Banco em memória montado como o do usuário: migrações reais até a versão em
 * que a massa foi gravada, a massa, e as migrações restantes. Cada migração
 * roda numa transação com a chave estrangeira ligada, como faz o sqlx.
 */
export function criarBanco({ massa = true }: { massa?: boolean } = {}): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const texto = massa ? readFileSync(MASSA, "utf-8") : "";
  const versaoMassa = massa ? Number(/-- esquema: (\d+)/.exec(texto)?.[1]) : 0;
  if (massa && !versaoMassa) throw new Error("massa sem a linha '-- esquema: N'");

  const aplicar = (sql: string) => {
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };

  const todas = migracoes();
  for (const m of todas.filter((m) => m.versao <= versaoMassa)) aplicar(m.sql);
  if (massa) aplicar(texto);
  for (const m of todas.filter((m) => m.versao > versaoMassa)) aplicar(m.sql);
  return db;
}
```

- [ ] **Step 12: Rodar e ver passar**

Run: `npm test`
Expected: 10 passed (7 da ponte, 3 do banco).

- [ ] **Step 13: Typecheck e commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add vitest.config.ts testes/tsconfig.json testes/suporte package.json package-lock.json
git commit -m "Ponte de IPC e banco de teste sobre node:sqlite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Auditor `conferir`

**Files:**
- Create: `src/solver/conferir.ts`, `src/solver/conferir.test.ts`, `testes/suporte/problema.ts`

**Interfaces:**
- Consumes: tipos de `src/solver/tipos.ts` (`Problema`, `Fatia`, `Alocacao`, `SalaDisponivel`).
- Produces:
  - `conferir.ts`: `type TipoViolacao = "periodo" | "professor" | "sala" | "indisponivel" | "sabado" | "requisito-sala" | "contagem" | "padrao" | "bloco-turno"`; `interface Violacao { tipo: TipoViolacao; mensagem: string }`; `conferir(problema: Problema, alocacoes: Alocacao[]): Violacao[]`.
  - `problema.ts`: `problemaMinimo(extra?: Partial<Problema>): Problema`; `fatia(extra?: Partial<Fatia>): Fatia`; `aula(dia: number, hora: number, extra?: Partial<Alocacao>): Alocacao`; `indisponivelExceto(professorId: number, dias: number, livres: [number, number][]): string[]`.

- [ ] **Step 1: Criar as fábricas — `testes/suporte/problema.ts`**

```ts
import type { Alocacao, Fatia, HorarioDoDia, Problema } from "../../src/solver/tipos";

/** M1..M6 = índices 0..5 (manhã); T1..T6 = 6..11 (tarde). */
const HORARIOS: HorarioDoDia[] = Array.from({ length: 12 }, (_, i) => ({
  indice: i,
  turno: i < 6 ? "manha" : "tarde",
}));

export function problemaMinimo(extra: Partial<Problema> = {}): Problema {
  return {
    dias: 6,
    horarios: HORARIOS,
    periodos: [{ numero: 1, turno: "manha", maxContraturno: 0 }],
    fatias: [],
    padroes: {
      1: [{ partes: [1], custo: 0 }],
      2: [
        { partes: [2], custo: 0 },
        { partes: [1, 1], custo: 5 },
      ],
      4: [
        { partes: [2, 2], custo: 0 },
        { partes: [3, 1], custo: 1 },
      ],
    },
    salas: [],
    professores: [{ id: 1, prefDias: "indiferente", peso: 0, maxDias: null }],
    indisponiveis: [],
    turnosSabado: ["manha"],
    fixadas: [],
    ...extra,
  };
}

export function fatia(extra: Partial<Fatia> = {}): Fatia {
  return {
    disciplinaId: 1,
    professorId: 1,
    nome: "Disciplina",
    periodo: 1,
    aulas: 2,
    permiteSabado: false,
    turno: null,
    optativa: false,
    exigeSala: false,
    tipoSala: null,
    salas: [],
    prioridade: 2,
    blocosLivres: false,
    ...extra,
  };
}

export function aula(dia: number, hora: number, extra: Partial<Alocacao> = {}): Alocacao {
  return { periodo: 1, dia, hora, disciplinaId: 1, professorId: 1, salaId: null, ...extra };
}

/** Chaves de indisponibilidade para todo horário de todos os dias, menos os `livres` [dia, hora]. */
export function indisponivelExceto(professorId: number, dias: number, livres: [number, number][]): string[] {
  const saida: string[] = [];
  for (let d = 0; d < dias; d++)
    for (const h of HORARIOS)
      if (!livres.some(([ld, lh]) => ld === d && lh === h.indice)) saida.push(`${professorId}:${d}:${h.indice}`);
  return saida;
}
```

- [ ] **Step 2: Escrever os testes — `src/solver/conferir.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { aula, fatia, problemaMinimo } from "../../testes/suporte/problema";
import { conferir } from "./conferir";

const tipos = (v: { tipo: string }[]) => v.map((x) => x.tipo);

describe("conferir", () => {
  it("aceita uma grade válida", () => {
    const p = problemaMinimo({ fatias: [fatia()] });
    expect(conferir(p, [aula(0, 0), aula(0, 1)])).toEqual([]);
  });

  it("acusa duas aulas no mesmo horário do período", () => {
    const p = problemaMinimo({
      fatias: [fatia({ aulas: 1 }), fatia({ disciplinaId: 2, professorId: 2, aulas: 1 })],
    });
    expect(tipos(conferir(p, [aula(0, 0), aula(0, 0, { disciplinaId: 2, professorId: 2 })]))).toContain("periodo");
  });

  it("acusa professor em dois lugares", () => {
    const p = problemaMinimo({
      periodos: [
        { numero: 1, turno: "manha", maxContraturno: 0 },
        { numero: 2, turno: "manha", maxContraturno: 0 },
      ],
      fatias: [fatia({ aulas: 1 }), fatia({ disciplinaId: 2, periodo: 2, aulas: 1 })],
    });
    expect(tipos(conferir(p, [aula(0, 0), aula(0, 0, { disciplinaId: 2, periodo: 2 })]))).toContain("professor");
  });

  it("acusa sala em dois lugares", () => {
    const p = problemaMinimo({
      periodos: [
        { numero: 1, turno: "manha", maxContraturno: 0 },
        { numero: 2, turno: "manha", maxContraturno: 0 },
      ],
      salas: [{ id: 1, tipo: "Sala de Aula" }],
      fatias: [
        fatia({ aulas: 1, exigeSala: true }),
        fatia({ disciplinaId: 2, professorId: 2, periodo: 2, aulas: 1, exigeSala: true }),
      ],
    });
    const alocs = [aula(0, 0, { salaId: 1 }), aula(0, 0, { disciplinaId: 2, professorId: 2, periodo: 2, salaId: 1 })];
    expect(tipos(conferir(p, alocs))).toContain("sala");
  });

  it("acusa aula em horário indisponível", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 1 })], indisponiveis: ["1:0:0"] });
    expect(tipos(conferir(p, [aula(0, 0)]))).toEqual(["indisponivel"]);
  });

  it("acusa sábado sem permissão e sábado à tarde", () => {
    const semPermissao = problemaMinimo({ fatias: [fatia({ aulas: 1 })] });
    expect(tipos(conferir(semPermissao, [aula(5, 0)]))).toEqual(["sabado"]);
    const aTarde = problemaMinimo({ fatias: [fatia({ aulas: 1, permiteSabado: true })] });
    expect(tipos(conferir(aTarde, [aula(5, 6)]))).toEqual(["sabado"]);
  });

  it("acusa requisito de sala violado", () => {
    const salas = [
      { id: 1, tipo: "Sala de Aula" },
      { id: 2, tipo: "Laboratório" },
    ];
    const casos = [
      { f: fatia({ aulas: 1, exigeSala: true, tipoSala: "Laboratório" }), sala: 1 },
      { f: fatia({ aulas: 1, exigeSala: true, salas: [2] }), sala: 1 },
      { f: fatia({ aulas: 1, exigeSala: true }), sala: null },
      { f: fatia({ aulas: 1, exigeSala: false }), sala: 1 },
    ];
    for (const c of casos) {
      const p = problemaMinimo({ salas, fatias: [c.f] });
      expect(tipos(conferir(p, [aula(0, 0, { salaId: c.sala })]))).toEqual(["requisito-sala"]);
    }
  });

  it("acusa fatia alocada pela metade", () => {
    const p = problemaMinimo({ fatias: [fatia()] });
    expect(tipos(conferir(p, [aula(0, 0)]))).toEqual(["contagem"]);
  });

  it("acusa padrão fora da tabela e dois blocos no mesmo dia", () => {
    const quatro = problemaMinimo({ fatias: [fatia({ aulas: 4 })] });
    expect(tipos(conferir(quatro, [aula(0, 0), aula(1, 0), aula(2, 0), aula(3, 0)]))).toEqual(["padrao"]);
    const mesmoDia = problemaMinimo({ fatias: [fatia()] });
    expect(tipos(conferir(mesmoDia, [aula(0, 0), aula(0, 2)]))).toContain("padrao");
  });

  it("aceita qualquer partição em blocos livres", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 4, blocosLivres: true })] });
    expect(conferir(p, [aula(0, 0), aula(1, 0), aula(2, 0), aula(3, 0)])).toEqual([]);
  });

  it("acusa bloco atravessando a troca de turno", () => {
    const p = problemaMinimo({ fatias: [fatia()] });
    expect(tipos(conferir(p, [aula(0, 5), aula(0, 6)]))).toContain("bloco-turno");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/solver/conferir.test.ts`
Expected: FAIL — `Failed to resolve import "./conferir"`.

- [ ] **Step 4: Implementar `src/solver/conferir.ts`**

```ts
import type { Alocacao, Fatia, Problema, SalaDisponivel } from "./tipos";

/**
 * Auditor das regras duras, independente do solver: recebe uma grade pronta e
 * reconta tudo a partir dela. É o juiz dos testes e do benchmark — um solver
 * não pode ser conferido pelo próprio código que decide onde pôr as aulas.
 */

export type TipoViolacao =
  | "periodo"
  | "professor"
  | "sala"
  | "indisponivel"
  | "sabado"
  | "requisito-sala"
  | "contagem"
  | "padrao"
  | "bloco-turno";

export interface Violacao {
  tipo: TipoViolacao;
  mensagem: string;
}

const SABADO = 5;
const chaveFatia = (x: { disciplinaId: number; professorId: number }) => `${x.disciplinaId}:${x.professorId}`;

function agrupar<T>(xs: T[], chave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = chave(x);
    const lista = m.get(k);
    if (lista) lista.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function requisitoDeSala(f: Fatia, salaId: number | null, salas: Map<number, SalaDisponivel>): string | null {
  if (!f.exigeSala) return salaId == null ? null : "recebeu sala sem precisar";
  if (salaId == null) return "ficou sem sala";
  if (f.tipoSala) return salas.get(salaId)?.tipo === f.tipoSala ? null : `sala fora do tipo ${f.tipoSala}`;
  if (f.salas.length > 0 && !f.salas.includes(salaId)) return "sala fora da lista aceita";
  return null;
}

export function conferir(problema: Problema, alocacoes: Alocacao[]): Violacao[] {
  const saida: Violacao[] = [];
  const add = (tipo: TipoViolacao, mensagem: string) => saida.push({ tipo, mensagem });

  const turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const salas = new Map(problema.salas.map((s) => [s.id, s]));
  const indisponiveis = new Set(problema.indisponiveis);
  const fatias = new Map(problema.fatias.map((f) => [chaveFatia(f), f]));
  const comFixada = new Set(problema.fixadas.map(chaveFatia));

  const duplicadas = (xs: Alocacao[], chave: (a: Alocacao) => string, tipo: TipoViolacao, texto: string) => {
    for (const [k, v] of agrupar(xs, chave)) if (v.length > 1) add(tipo, `${texto} (${k})`);
  };
  duplicadas(alocacoes, (a) => `${a.periodo}:${a.dia}:${a.hora}`, "periodo", "duas aulas no mesmo horário do período");
  duplicadas(alocacoes, (a) => `${a.professorId}:${a.dia}:${a.hora}`, "professor", "professor em dois lugares");
  duplicadas(
    alocacoes.filter((a) => a.salaId != null),
    (a) => `${a.salaId}:${a.dia}:${a.hora}`,
    "sala",
    "sala em dois lugares",
  );

  for (const a of alocacoes) {
    if (indisponiveis.has(`${a.professorId}:${a.dia}:${a.hora}`))
      add("indisponivel", `professor ${a.professorId} indisponível em ${a.dia}:${a.hora}`);
    const f = fatias.get(chaveFatia(a));
    if (!f) continue;
    if (a.dia === SABADO && !f.permiteSabado) add("sabado", `${f.nome} no sábado sem permissão`);
    const turno = turnoDaHora.get(a.hora);
    if (a.dia === SABADO && turno && !problema.turnosSabado.includes(turno))
      add("sabado", `${f.nome} num turno que o sábado não tem`);
    const problemaSala = requisitoDeSala(f, a.salaId, salas);
    if (problemaSala) add("requisito-sala", `${f.nome}: ${problemaSala}`);
  }

  for (const [k, aulas] of agrupar(alocacoes, chaveFatia)) {
    const f = fatias.get(k);
    if (!f) continue;
    if (aulas.length !== f.aulas) {
      add("contagem", `${f.nome}: ${aulas.length} de ${f.aulas} aulas`);
      continue;
    }
    const blocos: number[] = [];
    for (const doDia of agrupar(aulas, (a) => String(a.dia)).values()) {
      const horas = doDia.map((a) => a.hora).sort((x, y) => x - y);
      const doDiaBlocos: number[] = [];
      let tamanho = 1;
      for (let i = 1; i <= horas.length; i++) {
        if (i < horas.length && horas[i] === horas[i - 1] + 1) {
          if (turnoDaHora.get(horas[i]) !== turnoDaHora.get(horas[i - 1]))
            add("bloco-turno", `${f.nome}: bloco atravessa troca de turno`);
          tamanho++;
        } else {
          doDiaBlocos.push(tamanho);
          tamanho = 1;
        }
      }
      if (doDiaBlocos.length > 1) add("padrao", `${f.nome}: dois blocos no mesmo dia`);
      blocos.push(...doDiaBlocos);
    }
    if (f.blocosLivres || comFixada.has(k)) continue;
    const usado = [...blocos].sort((x, y) => y - x).join("+");
    const permitidos = (problema.padroes[f.aulas] ?? []).map((p) => [...p.partes].sort((x, y) => y - x).join("+"));
    if (!permitidos.includes(usado)) add("padrao", `${f.nome}: padrão ${usado} não cadastrado`);
  }

  return saida;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/solver/conferir.test.ts`
Expected: 11 passed.

- [ ] **Step 6: Typecheck e commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add src/solver/conferir.ts src/solver/conferir.test.ts testes/suporte/problema.ts
git commit -m "Auditor independente das regras duras do solver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `carregarProblema` injetável e testes do solver

**Files:**
- Modify: `src/solver/carregar.ts` (arquivo inteiro), `testes/suporte/banco.ts` (acrescentar `lerDe`, `lerAlocacoes`)
- Create: `testes/suporte/cenarios.ts`, `src/solver/solver.test.ts`, `src/solver/blocos.test.ts`

**Interfaces:**
- Consumes: `criarBanco` (Task 3), `converter` (Task 3), `conferir` (Task 4), fábricas (Task 4).
- Produces:
  - `carregar.ts`: `type Leitor = <T>(sql: string, params?: unknown[]) => Promise<T[]>`; `carregarProblema(cursoId: number, ler?: Leitor): Promise<Problema>`.
  - `banco.ts`: `lerDe(db: DatabaseSync): Leitor`; `lerAlocacoes(db: DatabaseSync, cursoId: number): Alocacao[]`.
  - `cenarios.ts`: `lcg(semente: number): () => number`; `comSalas(p: Problema, n: number): Problema`; `indisponivelUmDia(p: Problema, semente: number): Problema`; `interface Cenario { nome: string; montar: (p: Problema) => Problema }`; `CENARIOS: Cenario[]`.

- [ ] **Step 1: Reescrever `src/solver/carregar.ts`**

```ts
import { consultar } from "../db";
import type { Alocacao, Fatia, PadraoDeBloco, Problema, Turno } from "./tipos";

/** Como ler do banco. No app é a pool do plugin SQL; nos testes e no benchmark, `node:sqlite`. */
export type Leitor = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

/**
 * Monta o problema a partir do banco. A leitura é injetável para que os testes
 * e o benchmark (`scripts/bench_solver.ts`) montem o problema pelo MESMO SQL
 * que o app usa — sem uma segunda implementação para manter em sincronia.
 */
export async function carregarProblema(cursoId: number, ler: Leitor = consultar): Promise<Problema> {
  const config = async (chave: string) =>
    (await ler<{ valor: string }>("SELECT valor FROM configuracao WHERE chave = ?", [chave]))[0]?.valor;

  const dias = Number((await config("dias_letivos")) ?? 6);
  const turnosSabado = ((await config("turnos_sabado")) ?? "manha").split(",").filter(Boolean) as Turno[];

  const horarios = await ler<{ indice: number; turno: Turno }>(
    "SELECT indice, turno FROM horarios ORDER BY indice",
  );

  const periodos = (
    await ler<{ numero: number; turno: Turno; max_disciplinas_contraturno: number }>(
      "SELECT * FROM periodos WHERE curso_id = ? ORDER BY numero",
      [cursoId],
    )
  ).map((p) => ({
    numero: p.numero,
    turno: p.turno,
    maxContraturno: p.max_disciplinas_contraturno,
  }));

  const salasEspecificas = new Map<number, number[]>();
  for (const r of await ler<{ disciplina_id: number; sala_id: number }>(
    `SELECT ds.disciplina_id, ds.sala_id FROM disciplina_salas ds
       JOIN disciplinas d ON d.id = ds.disciplina_id WHERE d.curso_id = ?`,
    [cursoId],
  )) {
    salasEspecificas.set(r.disciplina_id, [...(salasEspecificas.get(r.disciplina_id) ?? []), r.sala_id]);
  }

  const fatias: Fatia[] = (
    await ler<{
      disciplina_id: number;
      professor_id: number;
      aulas: number;
      nome: string;
      periodo: number;
      permite_sabado: number;
      turno: Turno | null;
      optativa: number;
      exige_sala: number;
      tipo_sala: string | null;
      prioridade: number;
      blocos_livres: number;
    }>(
      `SELECT dp.disciplina_id, dp.professor_id, dp.aulas, d.nome, d.periodo,
              d.permite_sabado, d.turno, d.optativa, d.exige_sala, d.tipo_sala,
              d.prioridade, d.blocos_livres
         FROM disciplina_professores dp
         JOIN disciplinas d ON d.id = dp.disciplina_id
        WHERE d.curso_id = ?`,
      [cursoId],
    )
  ).map((r) => ({
    disciplinaId: r.disciplina_id,
    professorId: r.professor_id,
    nome: r.nome,
    periodo: r.periodo,
    aulas: r.aulas,
    permiteSabado: !!r.permite_sabado,
    turno: r.turno,
    optativa: !!r.optativa,
    exigeSala: !!r.exige_sala,
    tipoSala: r.tipo_sala,
    salas: salasEspecificas.get(r.disciplina_id) ?? [],
    prioridade: r.prioridade,
    blocosLivres: !!r.blocos_livres,
  }));

  const padroes: Record<number, PadraoDeBloco[]> = {};
  for (const r of await ler<{ aulas: number; padrao: string; custo: number }>(
    "SELECT aulas, padrao, custo FROM padroes_blocos",
  )) {
    (padroes[r.aulas] ??= []).push({ partes: r.padrao.split("+").map(Number), custo: r.custo });
  }

  const salas = await ler<{ id: number; tipo: string }>("SELECT id, tipo FROM salas");

  const professores = (
    await ler<{
      id: number;
      pref_dias: "consecutivos" | "intercalados" | "indiferente";
      pref_dias_peso: number;
      max_dias_semana: number | null;
    }>("SELECT id, pref_dias, pref_dias_peso, max_dias_semana FROM professores")
  ).map((p) => ({ id: p.id, prefDias: p.pref_dias, peso: p.pref_dias_peso, maxDias: p.max_dias_semana }));

  const indisponiveis = (
    await ler<{ professor_id: number; dia: number; hora: number }>(
      "SELECT professor_id, dia, hora FROM indisponibilidades",
    )
  ).map((i) => `${i.professor_id}:${i.dia}:${i.hora}`);

  const fixadas: Alocacao[] = (
    await ler<{
      periodo: number;
      dia: number;
      hora: number;
      disciplina_id: number;
      professor_id: number;
      sala_id: number | null;
    }>("SELECT * FROM alocacoes WHERE curso_id = ? AND fixada = 1", [cursoId])
  ).map((a) => ({
    periodo: a.periodo,
    dia: a.dia,
    hora: a.hora,
    disciplinaId: a.disciplina_id,
    professorId: a.professor_id,
    salaId: a.sala_id,
  }));

  return { dias, horarios, periodos, fatias, padroes, salas, professores, indisponiveis, turnosSabado, fixadas };
}
```

- [ ] **Step 2: Acrescentar ao fim de `testes/suporte/banco.ts`**

```ts
import type { Leitor } from "../../src/solver/carregar";
import type { Alocacao } from "../../src/solver/tipos";
import { converter } from "./ponte";

/** Leitor para `carregarProblema` sobre um banco de teste. */
export function lerDe(db: DatabaseSync): Leitor {
  return async <T,>(sql: string, params: unknown[] = []) =>
    db.prepare(sql).all(...params.map(converter)).map((linha) => ({ ...(linha as object) })) as T[];
}

/** A grade gravada de um curso, no formato do solver. */
export function lerAlocacoes(db: DatabaseSync, cursoId: number): Alocacao[] {
  const linhas = db
    .prepare("SELECT periodo, dia, hora, disciplina_id, professor_id, sala_id FROM alocacoes WHERE curso_id = ?")
    .all(cursoId) as {
    periodo: number;
    dia: number;
    hora: number;
    disciplina_id: number;
    professor_id: number;
    sala_id: number | null;
  }[];
  return linhas.map((a) => ({
    periodo: a.periodo,
    dia: a.dia,
    hora: a.hora,
    disciplinaId: a.disciplina_id,
    professorId: a.professor_id,
    salaId: a.sala_id,
  }));
}
```

Mova os três `import` acima para o topo do arquivo, junto dos existentes.

- [ ] **Step 3: Criar `testes/suporte/cenarios.ts`**

```ts
import type { Problema } from "../../src/solver/tipos";

/** O mesmo gerador congruencial do solver: cenários reproduzíveis por semente. */
export function lcg(semente: number): () => number {
  let s = semente >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export function comSalas(p: Problema, n: number): Problema {
  return { ...p, salas: p.salas.slice(0, n) };
}

/** Cada professor perde um dia inteiro, de segunda a sexta, sorteado pela semente. */
export function indisponivelUmDia(p: Problema, semente: number): Problema {
  const rnd = lcg(semente);
  const indisponiveis = [...p.indisponiveis];
  for (const prof of p.professores) {
    const dia = Math.floor(rnd() * 5);
    for (const h of p.horarios) indisponiveis.push(`${prof.id}:${dia}:${h.indice}`);
  }
  return { ...p, indisponiveis };
}

export interface Cenario {
  nome: string;
  montar: (p: Problema) => Problema;
}

export const CENARIOS: Cenario[] = [
  { nome: "massa real", montar: (p) => p },
  { nome: "6 salas + 1 dia indisponível", montar: (p) => indisponivelUmDia(comSalas(p, 6), 77) },
  { nome: "3 salas + 1 dia indisponível", montar: (p) => indisponivelUmDia(comSalas(p, 3), 77) },
];
```

- [ ] **Step 4: Escrever os testes de unidade — `src/solver/blocos.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { aula, fatia, problemaMinimo } from "../../testes/suporte/problema";
import { blocoCabeNoDia, particoes } from "./blocos";
import { buracos, custoTotal } from "./custo";

describe("blocos", () => {
  it("particoes lista as partições decrescentes", () => {
    expect(particoes(4)).toEqual([[4], [3, 1], [2, 2], [2, 1, 1], [1, 1, 1, 1]]);
  });

  it("blocoCabeNoDia respeita a troca de turno e o fim do dia", () => {
    const p = problemaMinimo();
    expect(blocoCabeNoDia(p, 4, 2)).toBe(true);
    expect(blocoCabeNoDia(p, 5, 2)).toBe(false);
    expect(blocoCabeNoDia(p, 11, 2)).toBe(false);
  });
});

describe("custo", () => {
  it("buracos conta horários vagos entre a primeira e a última aula", () => {
    expect(buracos(problemaMinimo(), [aula(0, 0), aula(0, 3)], (a) => `p${a.professorId}`)).toBe(2);
  });

  it("contraturno conta aula fora do turno do período", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 1 })] });
    const pesos = {
      padraoForaDoIdeal: 0,
      buracoProfessor: 0,
      buracoAluno: 0,
      contraturno: 1,
      preferenciaDias: 0,
      excessoContraturno: 0,
    };
    expect(custoTotal(p, [aula(0, 6)], pesos)).toBe(1);
    expect(custoTotal(p, [aula(0, 0)], pesos)).toBe(0);
  });
});
```

- [ ] **Step 5: Escrever os testes do solver — `src/solver/solver.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../testes/suporte/banco";
import { comSalas, indisponivelUmDia } from "../../testes/suporte/cenarios";
import { aula, fatia, indisponivelExceto, problemaMinimo } from "../../testes/suporte/problema";
import { carregarProblema } from "./carregar";
import { conferir } from "./conferir";
import { resolver } from "./solver";

const problemaDaMassa = () => carregarProblema(1, lerDe(criarBanco()));
const total = (p: { fatias: { aulas: number }[] }) => p.fatias.reduce((s, f) => s + f.aulas, 0);

describe("solver atual — massa real", () => {
  it("fecha a grade sem violar regra dura", async () => {
    const p = await problemaDaMassa();
    const r = resolver(p, { rodadasDeMelhoria: 300 });
    expect(r.completo).toBe(true);
    expect(r.alocacoes).toHaveLength(total(p));
    expect(conferir(p, r.alocacoes)).toEqual([]);
  });

  it("dá a mesma grade para a mesma semente", async () => {
    const p = await problemaDaMassa();
    const a = resolver(p, { rodadasDeMelhoria: 200, semente: 7 });
    const b = resolver(p, { rodadasDeMelhoria: 200, semente: 7 });
    expect(b.alocacoes).toEqual(a.alocacoes);
  });

  it.each([1, 2, 3])("não viola regra dura sob estresse (semente %i)", async (semente) => {
    const p = indisponivelUmDia(comSalas(await problemaDaMassa(), 6), semente);
    const r = resolver(p, { rodadasDeMelhoria: 100, semente });
    expect(conferir(p, r.alocacoes)).toEqual([]);
  });
});

describe("solver atual — cenários mínimos", () => {
  it("preserva as aulas fixadas", () => {
    const fixada = aula(2, 3);
    const p = problemaMinimo({ fatias: [fatia()], fixadas: [fixada] });
    const r = resolver(p);
    expect(r.alocacoes).toContainEqual(fixada);
    expect(r.alocacoes).toHaveLength(2);
    expect(conferir(p, r.alocacoes)).toEqual([]);
  });

  it("respeita a indisponibilidade", () => {
    const p = problemaMinimo({ fatias: [fatia()], indisponiveis: indisponivelExceto(1, 6, [[3, 0], [3, 1]]) });
    const r = resolver(p);
    expect(r.alocacoes).toEqual(expect.arrayContaining([aula(3, 0), aula(3, 1)]));
    expect(r.alocacoes).toHaveLength(2);
  });

  it("põe a disciplina numa sala do tipo exigido", () => {
    const p = problemaMinimo({
      salas: [
        { id: 1, tipo: "Sala de Aula" },
        { id: 2, tipo: "Laboratório" },
      ],
      fatias: [fatia({ exigeSala: true, tipoSala: "Laboratório" })],
    });
    expect(resolver(p).alocacoes.map((a) => a.salaId)).toEqual([2, 2]);
  });

  it("põe a disciplina numa das salas da lista", () => {
    const p = problemaMinimo({
      salas: [1, 2, 3].map((id) => ({ id, tipo: "Sala de Aula" })),
      fatias: [fatia({ exigeSala: true, salas: [3] })],
    });
    expect(resolver(p).alocacoes.map((a) => a.salaId)).toEqual([3, 3]);
  });

  it("só usa o sábado de manhã", () => {
    const livresNoSabado: [number, number][] = Array.from({ length: 12 }, (_, h) => [5, h]);
    const p = problemaMinimo({
      fatias: [fatia({ permiteSabado: true })],
      indisponiveis: indisponivelExceto(1, 6, livresNoSabado),
    });
    const r = resolver(p);
    expect(r.alocacoes).toHaveLength(2);
    expect(r.alocacoes.every((a) => a.dia === 5 && a.hora <= 5)).toBe(true);
  });

  it("não forma bloco atravessando a troca de turno", () => {
    const livres: [number, number][] = [];
    for (let d = 0; d < 6; d++) livres.push([d, 5], [d, 6]);
    const p = problemaMinimo({
      padroes: { 2: [{ partes: [2], custo: 0 }] },
      fatias: [fatia()],
      indisponiveis: indisponivelExceto(1, 6, livres),
    });
    const r = resolver(p);
    expect(r.completo).toBe(false);
    expect(r.alocacoes).toEqual([]);
  });
});

describe("bugs conhecidos (falha esperada até o subprojeto 1)", () => {
  // B1 — o domínio inclui horários de turnos que o curso não ocupa.
  it.fails("B1: não aloca fora dos turnos do curso", async () => {
    const p = indisponivelUmDia(comSalas(await problemaDaMassa(), 3), 77);
    const r = resolver(p, { rodadasDeMelhoria: 300 });
    const turno = new Map(p.horarios.map((h) => [h.indice, h.turno]));
    const turnosDoCurso = ["manha", "tarde"];
    expect(r.alocacoes.filter((a) => !turnosDoCurso.includes(turno.get(a.hora)!))).toEqual([]);
  });

  // B4 — max_dias_semana é só custo; decidido que é regra dura.
  it.fails("B4: max_dias_semana limita os dias do professor", async () => {
    const p = await problemaDaMassa();
    p.professores.forEach((x) => (x.maxDias = 2));
    const r = resolver(p, { rodadasDeMelhoria: 300 });
    const dias = new Map<number, Set<number>>();
    for (const a of r.alocacoes) dias.set(a.professorId, (dias.get(a.professorId) ?? new Set()).add(a.dia));
    expect([...dias.entries()].filter(([, s]) => s.size > 2)).toEqual([]);
  });

  // I1 — o solver não enxerga as aulas dos outros cursos.
  it.fails("I1: não usa professor nem sala ocupados por outro curso", async () => {
    const db = criarBanco();
    const [{ professor_id: P }] = db
      .prepare(
        `SELECT dp.professor_id FROM disciplina_professores dp
           JOIN disciplinas d ON d.id = dp.disciplina_id
          WHERE d.curso_id = 1 GROUP BY dp.professor_id ORDER BY SUM(dp.aulas) DESC LIMIT 1`,
      )
      .all() as { professor_id: number }[];
    const [{ id: S }] = db.prepare("SELECT id FROM salas ORDER BY id LIMIT 1").all() as { id: number }[];
    db.exec(`
      INSERT INTO cursos (id, nome) VALUES (2, 'Outro curso');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (2, 1, 'manha');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (9001, 2, 'Ocupação', 1, 60);
    `);
    db.prepare("INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (9001, ?, 60)").run(P);
    const inserir = db.prepare(
      "INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (2, 1, ?, ?, 9001, ?, ?)",
    );
    for (let d = 0; d < 5; d++) for (let h = 0; h < 12; h++) inserir.run(d, h, P, S);

    const p = await carregarProblema(1, lerDe(db));
    const r = resolver(p, { rodadasDeMelhoria: 100 });
    const conflitos = r.alocacoes.filter(
      (a) => a.dia < 5 && a.hora < 12 && (a.professorId === P || a.salaId === S),
    );
    expect(conflitos).toEqual([]);
  });
});
```

- [ ] **Step 6: Rodar tudo**

Run: `npm test`
Expected: todos passam — os três `it.fails` contam como aprovados porque o bug ainda existe. Se o B1 acusar "passou inesperadamente" (o cenário não reproduziu aula fora do turno), troque `comSalas(…, 3)` por `comSalas(…, 2)` e rode de novo. Tempo total abaixo de 20 s.

- [ ] **Step 7: Typecheck e commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add src/solver testes/suporte
git commit -m "Testes do solver sobre a massa real e cenários mínimos

carregarProblema recebe a função de leitura, então os testes montam o
problema pelo mesmo SQL do app. B1, B4 e I1 entram como falha esperada.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Benchmark e remoção dos scripts antigos

**Files:**
- Create: `scripts/bench_solver.ts`, `testes/benchmark/linha-de-base.md` (gerado)
- Delete: `scripts/testar_solver.ts`, `scripts/exportar_problema.py`
- Modify: `package.json`

**Interfaces:**
- Consumes: `criarBanco`, `lerDe` (Tasks 3, 5); `CENARIOS` (Task 5); `carregarProblema` (Task 5); `conferir` (Task 4).
- Produces: `npm run bench:solver [-- --banco <arq>] [-- --curso <id>] [-- --salvar]`; lista `SOLVERS: { nome: string; resolver: (p: Problema, semente: number) => Resultado }[]`, onde o subprojeto 3 acrescenta o v2.

- [ ] **Step 1: Script no `package.json`**

```json
    "bench:solver": "vite-node scripts/bench_solver.ts --"
```

- [ ] **Step 2: Criar `scripts/bench_solver.ts`**

```ts
/**
 * Benchmark do solver: cenários × sementes × solvers, com a grade conferida
 * pelo auditor independente.
 *
 *   npm run bench:solver                       massa anonimizada
 *   npm run bench:solver -- --banco meu.db     banco real, só leitura
 *   npm run bench:solver -- --salvar           grava testes/benchmark/linha-de-base.md
 */
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { carregarProblema } from "../src/solver/carregar";
import { conferir } from "../src/solver/conferir";
import { buracos } from "../src/solver/custo";
import { resolver } from "../src/solver/solver";
import type { Alocacao, Problema, Resultado } from "../src/solver/tipos";
import { criarBanco, lerDe } from "../testes/suporte/banco";
import { CENARIOS } from "../testes/suporte/cenarios";

interface Solver {
  nome: string;
  resolver: (p: Problema, semente: number) => Resultado;
}

/** O solver v2 entra nesta lista, ao lado do atual. */
const SOLVERS: Solver[] = [{ nome: "atual", resolver: (p, semente) => resolver(p, { semente }) }];
const SEMENTES = [1, 2, 3];

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function foraDoTurno(p: Problema, alocacoes: Alocacao[]): number {
  const turnoDaHora = new Map(p.horarios.map((h) => [h.indice, h.turno]));
  const turnoDoPeriodo = new Map(p.periodos.map((x) => [x.numero, x.turno]));
  const forcado = new Map(p.fatias.map((f) => [`${f.disciplinaId}:${f.professorId}`, f.turno]));
  return alocacoes.filter(
    (a) => turnoDaHora.get(a.hora) !== (forcado.get(`${a.disciplinaId}:${a.professorId}`) ?? turnoDoPeriodo.get(a.periodo)),
  ).length;
}

const arquivo = argumento("--banco");
const banco = arquivo ? new DatabaseSync(arquivo, { readOnly: true }) : criarBanco();
const base = await carregarProblema(Number(argumento("--curso") ?? 1), lerDe(banco));

const linhas = [
  "| solver | cenário | semente | completo | faltantes | custo | violações | buracos prof. | buracos turma | fora do turno | ms |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
];
for (const solver of SOLVERS) {
  for (const cenario of CENARIOS) {
    for (const semente of SEMENTES) {
      const p = cenario.montar(structuredClone(base));
      const r = solver.resolver(p, semente);
      linhas.push(
        `| ${solver.nome} | ${cenario.nome} | ${semente} | ${r.completo ? "sim" : "não"} | ${r.faltantes.length} | ` +
          `${r.custo} | ${conferir(p, r.alocacoes).length} | ` +
          `${buracos(p, r.alocacoes, (a) => `p${a.professorId}`)} | ${buracos(p, r.alocacoes, (a) => `t${a.periodo}`)} | ` +
          `${foraDoTurno(p, r.alocacoes)} | ${r.milissegundos} |`,
      );
    }
  }
}

const tabela = linhas.join("\n");
console.log(tabela);
if (process.argv.includes("--salvar")) {
  const data = new Date().toISOString().slice(0, 10);
  writeFileSync(
    "testes/benchmark/linha-de-base.md",
    `# Linha de base do solver\n\nGerada por \`npm run bench:solver -- --salvar\` em ${data}, ` +
      `sobre a massa anonimizada. É a referência "antes" para comparar o solver v2.\n\n${tabela}\n`,
  );
}
```

- [ ] **Step 3: Rodar e salvar a linha de base**

Run: `mkdir -p testes/benchmark && npm run bench:solver -- --salvar`
Expected: tabela com 9 linhas de `atual`. A coluna `violações` é `0` em todas; no cenário "massa real", `completo` é `sim`. O arquivo `testes/benchmark/linha-de-base.md` é criado.

- [ ] **Step 4: Remover os scripts substituídos**

Run: `git rm scripts/testar_solver.ts scripts/exportar_problema.py`

- [ ] **Step 5: Typecheck e commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add scripts/bench_solver.ts testes/benchmark package.json
git commit -m "Benchmark do solver com linha de base; remove scripts substituídos

testar_solver.ts e exportar_problema.py davam o mesmo resultado por outra
implementação do SQL de carga; os testes e o benchmark os substituem.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Comando `banco()` e `DISTRIBUICAO_BANCO` em debug

**Files:**
- Modify: `src-tauri/src/lib.rs` (função `run` e nova função/comando), `src/db.ts` (arquivo inteiro)

**Interfaces:**
- Produces: comando Tauri `banco` → `string` (URL do banco); variável `DISTRIBUICAO_BANCO` (caminho absoluto, só em debug). A ponte (Task 3) já responde `banco`.

- [ ] **Step 1: Em `src-tauri/src/lib.rs`, acrescentar antes de `#[cfg_attr(mobile, …)]`**

```rust
/// URL do banco. Em build de debug, `DISTRIBUICAO_BANCO` pode apontar para um
/// arquivo absoluto — é o que isola o smoke test do banco de verdade do
/// usuário. Em release a variável é ignorada.
fn url_do_banco() -> String {
    if cfg!(debug_assertions) {
        if let Ok(caminho) = std::env::var("DISTRIBUICAO_BANCO") {
            return format!("sqlite:{caminho}");
        }
    }
    String::from("sqlite:distribuicao.db")
}

struct Banco(String);

/// O front pergunta o nome do banco em vez de fixá-lo: as migrações são
/// registradas por essa mesma URL, e as duas precisam casar.
#[tauri::command]
fn banco(estado: State<'_, Banco>) -> String {
    estado.0.clone()
}
```

- [ ] **Step 2: Substituir a função `run`**

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let url = url_do_banco();
    tauri::Builder::default()
        .manage(Banco(url.clone()))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&url, migracoes())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![transacao, banco])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Compilar**

Run: `cd src-tauri && cargo fmt && cargo clippy -- -D warnings && cd ..`
Expected: sem erros e sem avisos. Se o clippy apontar aviso em código que já existia, corrija exatamente o que ele indicar — a regra do CI é zero avisos.

- [ ] **Step 4: Reescrever `src/db.ts`**

```ts
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

/**
 * Leituras vão pela pool do plugin; escritas vão pelo comando `transacao` do
 * lado Rust, que envolve tudo numa transação: salvar uma disciplina escreve em
 * várias tabelas, e falhar no meio deixaria o banco num estado que nenhuma
 * tela sabe representar.
 *
 * O nome do banco vem do Rust (comando `banco`): em debug ele pode apontar
 * para outro arquivo, e as migrações são registradas por esse mesmo nome.
 */
let nome: Promise<string> | null = null;
let conexao: Promise<Database> | null = null;

function banco(): Promise<string> {
  if (!nome) nome = invoke<string>("banco");
  return nome;
}

function db(): Promise<Database> {
  if (!conexao) conexao = banco().then((b) => Database.load(b));
  return conexao;
}

export async function consultar<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await db();
  return d.select<T[]>(sql, params);
}

export interface Instrucao {
  sql: string;
  params?: unknown[];
}

export interface ResultadoEscrita {
  rowsAffected: number;
  lastInsertId: number;
}

/** Tudo ou nada: uma falha no meio desfaz as instruções anteriores. */
export async function transacao(instrucoes: Instrucao[]): Promise<ResultadoEscrita> {
  return invoke<ResultadoEscrita>("transacao", { banco: await banco(), instrucoes });
}

export function executar(sql: string, params: unknown[] = []): Promise<ResultadoEscrita> {
  return transacao([{ sql, params }]);
}

/**
 * Reserva o próximo id de uma tabela antes de abrir a transação, para que as
 * instruções seguintes possam referenciá-lo. `last_insert_rowid()` não serve:
 * ele muda a cada INSERT seguinte dentro da mesma transação.
 *
 * Serve porque o aplicativo é de um usuário só — não há outra escrita
 * concorrente para disputar o id.
 */
export async function proximoId(tabela: string): Promise<number> {
  const [linha] = await consultar<{ proximo: number }>(
    `SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM ${tabela}`,
  );
  return linha.proximo;
}

/** Lê uma chave de `configuracao`, ou `undefined` se não existir. */
export async function config(chave: string): Promise<string | undefined> {
  const linhas = await consultar<{ valor: string }>(
    "SELECT valor FROM configuracao WHERE chave = ?",
    [chave],
  );
  return linhas[0]?.valor;
}
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm test`
Expected: exit 0; testes verdes.

Run manual (opcional, confirma o app intacto): `npm run tauri dev` → o app abre com o banco de sempre.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src/db.ts
git commit -m "Comando banco() e DISTRIBUICAO_BANCO em debug

Permite ao smoke test rodar com um banco isolado; em release nada muda.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Infraestrutura do Playwright e fluxo de cadastro

**Files:**
- Create: `playwright.config.ts`, `testes/e2e/fixtures.ts`, `testes/e2e/paginas.ts`, `testes/e2e/cadastro.spec.ts`
- Modify: `src/paginas/GradeManual.tsx` (célula, ~linha 503), `src/paginas/Indisponibilidades.tsx` (td, ~linha 236), `package.json`

**Interfaces:**
- Consumes: `criarBanco` (Task 3), `criarPonte`, `OpcoesPonte` (Task 3).
- Produces:
  - `fixtures.ts`: `test` com opções `semMassa: boolean` (padrão `false`), `semente: string` (SQL executado após montar o banco; padrão `""`), `opcoesPonte: OpcoesPonte`, e a fixture `banco: DatabaseSync`; reexporta `expect`.
  - `paginas.ts`: `irPara(page, rotulo)`, `celula(page, dia, codigo)`, `aceitarConfirmacoes(page)`, `contar(banco, sql, ...params): number`.

- [ ] **Step 1: Instalar**

Run: `npm i -D @playwright/test@^1.55.0 && npx playwright install chromium`

- [ ] **Step 2: Script no `package.json`**

```json
    "test:e2e": "playwright test",
```

- [ ] **Step 3: Criar `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "testes/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 4: Criar `testes/e2e/fixtures.ts`**

```ts
import { test as base, expect } from "@playwright/test";
import type { DatabaseSync } from "node:sqlite";
import { criarBanco } from "../suporte/banco";
import { criarPonte, type OpcoesPonte } from "../suporte/ponte";

interface Opcoes {
  /** true = banco como na primeira abertura, sem a massa. */
  semMassa: boolean;
  /** SQL executado depois de montar o banco e antes de abrir o app. */
  semente: string;
  opcoesPonte: OpcoesPonte;
}

/**
 * Cada teste recebe um banco próprio e o app aberto com o IPC do Tauri
 * apontando para a ponte no Node. O teste pode consultar `banco` direto para
 * conferir o que a tela gravou.
 */
export const test = base.extend<Opcoes & { banco: DatabaseSync }>({
  semMassa: [false, { option: true }],
  semente: ["", { option: true }],
  opcoesPonte: [{}, { option: true }],

  banco: async ({ semMassa, semente }, use) => {
    const db = criarBanco({ massa: !semMassa });
    if (semente) db.exec(semente);
    await use(db);
    db.close();
  },

  page: async ({ page, banco, opcoesPonte }, use) => {
    await page.exposeFunction("__ipc", criarPonte(banco, opcoesPonte));
    await page.addInitScript(() => {
      type Resposta = { ok: boolean; valor?: unknown; erro?: string };
      const w = window as unknown as Record<string, unknown>;
      const ipc = (cmd: string, args: unknown) =>
        (w.__ipc as (c: string, a: unknown) => Promise<Resposta>)(cmd, args);
      w.__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args?: unknown) => {
          const r = await ipc(cmd, args ?? {});
          if (r.ok) return r.valor;
          throw r.erro; // o Tauri rejeita com a string de erro do Rust
        },
        transformCallback: () => 0,
        unregisterCallback: () => {},
        convertFileSrc: (s: string) => s,
        metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
      };
    });
    await page.goto("/");
    await use(page);
  },
});

export { expect };
```

- [ ] **Step 5: Criar `testes/e2e/paginas.ts`**

```ts
import type { Page } from "@playwright/test";
import type { DatabaseSync } from "node:sqlite";
import { converter } from "../suporte/ponte";

export async function irPara(page: Page, rotulo: string) {
  await page.getByRole("navigation").getByRole("button", { name: rotulo, exact: true }).click();
}

/** Célula da grade manual ou de indisponibilidades, pelo `aria-label` "Segunda, M1". */
export function celula(page: Page, dia: string, codigo: string) {
  return page.getByLabel(`${dia}, ${codigo}`, { exact: true });
}

/** O Playwright recusa `confirm()` por padrão; isto passa a aceitar. */
export function aceitarConfirmacoes(page: Page) {
  page.on("dialog", (d) => d.accept());
}

export function contar(banco: DatabaseSync, sql: string, ...params: unknown[]): number {
  const linha = banco.prepare(sql).get(...params.map(converter)) as Record<string, number>;
  return Number(Object.values(linha)[0]);
}
```

- [ ] **Step 6: Escrever o teste — `testes/e2e/cadastro.spec.ts`**

```ts
import { expect, test } from "./fixtures";
import { celula, contar, irPara } from "./paginas";

test.use({ semMassa: true });

test("cadastra do zero e fecha as pendências na grade manual", async ({ page, banco }) => {
  await irPara(page, "Períodos");
  await page.getByRole("button", { name: "Adicionar 1º período" }).click();
  await expect(page.getByRole("cell", { name: "1º", exact: true })).toBeVisible();

  await irPara(page, "Professores");
  for (const nome of ["Ana Souza", "Bruno Lima"]) {
    await page.getByRole("button", { name: "Novo professor" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(nome)).toBeVisible();
  }

  await irPara(page, "Salas");
  await page.getByRole("button", { name: "Nova sala" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("A01");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("A01")).toBeVisible();

  await irPara(page, "Disciplinas");
  await page.getByRole("button", { name: "Nova disciplina" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Cálculo");
  await page.getByRole("button", { name: "Adicionar professor" }).click();
  await page.locator(".linha-fatia input[type=number]").first().fill("2");
  await page.getByRole("button", { name: "Adicionar professor" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  // GROUP_CONCAT não garante ordem: confere cada professor separadamente.
  await expect(page.getByText(/Ana Souza \(2\)/)).toBeVisible();
  await expect(page.getByText(/Bruno Lima \(2\)/)).toBeVisible();

  await irPara(page, "Manual");
  await page.getByRole("button", { name: /Ana Souza/ }).click();
  for (const codigo of ["M1", "M2"]) {
    await celula(page, "Segunda", codigo).click();
    await expect(celula(page, "Segunda", codigo)).toContainText("Cálculo");
  }
  await page.getByRole("button", { name: /Bruno Lima/ }).click();
  for (const codigo of ["M1", "M2"]) {
    await celula(page, "Terça", codigo).click();
    await expect(celula(page, "Terça", codigo)).toContainText("Cálculo");
  }

  await expect(page.getByText("Todas as aulas deste período estão alocadas.")).toBeVisible();
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(4);
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npx playwright test testes/e2e/cadastro.spec.ts`
Expected: FAIL no primeiro `celula(...)` — `getByLabel('Segunda, M1')` não encontra elemento (as células ainda não têm `aria-label`).

- [ ] **Step 8: `aria-label` na célula da grade manual**

Em `src/paginas/GradeManual.tsx`, no `<div key={d} className={`celula …`}` dentro do mapa de dias, acrescentar o atributo logo após `key`:

```tsx
                      <div
                        key={d}
                        aria-label={`${DIAS[d]}, ${l.h.codigo}`}
                        className={`celula ${classe} ${foraDoTurno ? "contraturno" : ""}`}
```

- [ ] **Step 9: `aria-label` na célula de indisponibilidades**

Em `src/paginas/Indisponibilidades.tsx`, no `<td key={d}` do corpo da tabela:

```tsx
                          <td
                            key={d}
                            aria-label={`${DIAS[d]}, ${h.codigo}`}
                            className={
```

- [ ] **Step 10: Rodar e ver passar**

Run: `npx playwright test testes/e2e/cadastro.spec.ts`
Expected: 1 passed.

- [ ] **Step 11: Incluir o e2e no typecheck e commitar**

Run: `npm run typecheck`
Expected: exit 0 (o `testes/tsconfig.json` já inclui `testes/e2e`).

```bash
git add playwright.config.ts testes/e2e src/paginas/GradeManual.tsx src/paginas/Indisponibilidades.tsx package.json package-lock.json
git commit -m "Playwright com ponte de IPC; fluxo de cadastro do zero

As células das grades ganham aria-label: acessibilidade e seletores estáveis.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Cenários de interface que passam hoje

**Files:**
- Create: `testes/e2e/gerador.spec.ts`, `testes/e2e/regras.spec.ts`

**Interfaces:**
- Consumes: `test`, `expect` (Task 8); `irPara`, `celula`, `aceitarConfirmacoes`, `contar` (Task 8); `carregarProblema` (Task 5); `lerDe`, `lerAlocacoes` (Task 5); `conferir` (Task 4); `DIAS` de `src/tipos.ts`.

- [ ] **Step 1: Criar `testes/e2e/gerador.spec.ts`**

```ts
import type { Page } from "@playwright/test";
import type { DatabaseSync } from "node:sqlite";
import { carregarProblema } from "../../src/solver/carregar";
import { conferir } from "../../src/solver/conferir";
import { DIAS } from "../../src/tipos";
import { lerAlocacoes, lerDe } from "../suporte/banco";
import { expect, test } from "./fixtures";
import { aceitarConfirmacoes, celula, contar, irPara } from "./paginas";

async function gerarEAplicar(page: Page) {
  aceitarConfirmacoes(page);
  await irPara(page, "Automática");
  await page.getByRole("button", { name: "Gerar grade" }).click();
  await page.getByRole("button", { name: "Aplicar esta grade" }).click({ timeout: 30_000 });
  await expect(page.getByText("Grade aplicada.")).toBeVisible();
}

const umaLinha = <T,>(banco: DatabaseSync, sql: string, ...params: (number | string)[]) =>
  ({ ...(banco.prepare(sql).get(...params) as object) }) as T;

test("gera e aplica uma grade que o auditor aprova", async ({ page, banco }) => {
  await gerarEAplicar(page);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1")).toBe(223);
  const problema = await carregarProblema(1, lerDe(banco));
  expect(conferir(problema, lerAlocacoes(banco, 1))).toEqual([]);
});

test("aula fixada com o botão direito sobrevive à geração", async ({ page, banco }) => {
  const alvo = umaLinha<{ dia: number; hora: number; codigo: string; disciplina_id: number }>(
    banco,
    `SELECT a.dia, a.hora, h.codigo, a.disciplina_id FROM alocacoes a
       JOIN horarios h ON h.indice = a.hora
      WHERE a.curso_id = 1 AND a.periodo = 1 ORDER BY a.dia, a.hora LIMIT 1`,
  );
  await irPara(page, "Manual");
  await celula(page, DIAS[alvo.dia], alvo.codigo).click({ button: "right" });
  await expect
    .poll(() => contar(banco, "SELECT fixada FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND dia = ? AND hora = ?", alvo.dia, alvo.hora))
    .toBe(1);

  await gerarEAplicar(page);
  expect(
    contar(
      banco,
      "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1 AND periodo = 1 AND dia = ? AND hora = ? AND disciplina_id = ? AND fixada = 1",
      alvo.dia,
      alvo.hora,
      alvo.disciplina_id,
    ),
  ).toBe(1);
});

test("indisponibilidade marcada por arrasto é respeitada pelo gerador", async ({ page, banco }) => {
  const { id } = umaLinha<{ id: number }>(banco, "SELECT id FROM professores WHERE nome = 'Professor 01'");
  const { dia } = umaLinha<{ dia: number }>(
    banco,
    `SELECT d.dia FROM (SELECT 0 AS dia UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) d
      WHERE NOT EXISTS (SELECT 1 FROM alocacoes a WHERE a.professor_id = ? AND a.dia = d.dia AND a.hora <= 2)
      ORDER BY d.dia LIMIT 1`,
    id,
  );

  await irPara(page, "Indisponibilidades");
  await page.getByRole("button", { name: "Professor 01" }).click();
  await celula(page, DIAS[dia], "M1").hover();
  await page.mouse.down();
  await celula(page, DIAS[dia], "M2").hover();
  await celula(page, DIAS[dia], "M3").hover();
  await page.mouse.up();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades WHERE professor_id = ?", id)).toBe(3);

  await gerarEAplicar(page);
  expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE professor_id = ? AND dia = ? AND hora <= 2", id, dia)).toBe(0);
});
```

- [ ] **Step 2: Rodar**

Run: `npx playwright test testes/e2e/gerador.spec.ts`
Expected: 3 passed.

- [ ] **Step 3: Criar `testes/e2e/regras.spec.ts`**

```ts
import { expect, test } from "./fixtures";
import { aceitarConfirmacoes, celula, contar, irPara } from "./paginas";

test.describe("requisito de sala por tipo", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'Lab 1', 'Laboratório', 30);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, tipo_sala) VALUES (1, 1, 'Química', 1, 2, 'Laboratório');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
    `,
  });

  test("na grade manual a aula vai para o laboratório", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Química/ }).click();
    await celula(page, "Segunda", "M1").click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });

  test("no gerador todas as aulas vão para o laboratório", async ({ page, banco }) => {
    aceitarConfirmacoes(page);
    await irPara(page, "Automática");
    await page.getByRole("button", { name: "Gerar grade" }).click();
    await page.getByRole("button", { name: "Aplicar esta grade" }).click({ timeout: 30_000 });
    await expect(page.getByText("Grade aplicada.")).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1 AND sala_id = 2")).toBe(2);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });
});

test.describe("motivo do impedimento na grade manual", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Álgebra', 1, 2, 0), (2, 1, 'Física', 2, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);
      INSERT INTO indisponibilidades (professor_id, dia, hora) VALUES (1, 0, 0);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 2, 1, 0, 2, 1);
    `,
  });

  test("cada célula impedida diz por quê", async ({ page }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Álgebra/ }).click();
    await expect(celula(page, "Segunda", "M1")).toContainText("A. Souza indisponível");
    await expect(celula(page, "Terça", "M1")).toContainText("A. Souza no 2º período");
    await expect(celula(page, "Sábado", "M1")).toContainText("Sábado desmarcado no cadastro");
  });
});
```

- [ ] **Step 4: Rodar**

Run: `npx playwright test testes/e2e/regras.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add testes/e2e/gerador.spec.ts testes/e2e/regras.spec.ts
git commit -m "E2E: gerador, aulas fixadas, indisponibilidade e regras de sala

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Bugs conhecidos na interface (falha esperada)

**Files:**
- Create: `testes/e2e/bugs-conhecidos.spec.ts`

**Interfaces:**
- Consumes: as mesmas da Task 9.

Cada teste descreve o comportamento **correto**; hoje falha, e `test.fail(true, …)` o marca como esperado. Quando o subprojeto 1 corrigir, o Playwright acusa "passou inesperadamente" e a linha `test.fail` sai.

- [ ] **Step 1: Criar `testes/e2e/bugs-conhecidos.spec.ts`**

```ts
import { expect, test } from "./fixtures";
import { aceitarConfirmacoes, celula, contar, irPara } from "./paginas";

test.describe("B2", () => {
  test.use({ semente: "INSERT INTO cursos (id, nome) VALUES (2, 'Zeta');" });

  test("B2: excluir curso com disciplinas remove tudo junto", async ({ page, banco }) => {
    test.fail(true, "B2 — falta ON DELETE CASCADE; corrigir no subprojeto 1");
    aceitarConfirmacoes(page);
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Remover" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM disciplinas WHERE curso_id = 1"), { timeout: 3_000 }).toBe(0);
  });
});

test("B3: mudar o período da disciplina leva as aulas junto", async ({ page, banco }) => {
  test.fail(true, "B3 — aulas ficam no período antigo; corrigir no subprojeto 1");
  const d = banco
    .prepare(
      `SELECT d.id, d.nome, d.periodo FROM disciplinas d
        WHERE d.curso_id = 1
          AND EXISTS (SELECT 1 FROM alocacoes a WHERE a.disciplina_id = d.id)
          AND d.aulas_semanais = (SELECT SUM(aulas) FROM disciplina_professores dp WHERE dp.disciplina_id = d.id)
          AND (SELECT COUNT(*) FROM disciplinas x WHERE x.nome = d.nome) = 1
        ORDER BY d.id LIMIT 1`,
    )
    .get() as { id: number; nome: string; periodo: number };
  const novo = d.periodo === 8 ? 7 : d.periodo + 1;

  await irPara(page, "Disciplinas");
  await page
    .locator("tr", { has: page.getByText(d.nome, { exact: true }) })
    .getByRole("button", { name: "Editar" })
    .click();
  await page.locator(".modal select").first().selectOption(String(novo));
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect
    .poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = ? AND periodo = ?", d.id, d.periodo), {
      timeout: 3_000,
    })
    .toBe(0);
});

test("B8: limpar período preserva as aulas fixadas", async ({ page, banco }) => {
  test.fail(true, "B8 — o DELETE ignora fixada; corrigir no subprojeto 1");
  banco.exec(`UPDATE alocacoes SET fixada = 1
               WHERE rowid = (SELECT rowid FROM alocacoes WHERE curso_id = 1 AND periodo = 1 LIMIT 1)`);
  await page.reload();
  aceitarConfirmacoes(page);
  await irPara(page, "Manual");
  await page.getByRole("button", { name: "Limpar período" }).click();
  await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE curso_id = 1 AND periodo = 1"), { timeout: 3_000 }).toBe(1);
});

test.describe("B5", () => {
  test.use({ opcoesPonte: { falharQuando: /^SELECT indice, turno FROM horarios/ } });

  test("B5: erro ao carregar a grade automática aparece na tela", async ({ page }) => {
    test.fail(true, "B5 — o return null vem antes do <Erro>; corrigir no subprojeto 1");
    await irPara(page, "Automática");
    await expect(page.getByText(/falha simulada/)).toBeVisible({ timeout: 3_000 });
  });
});

const DOIS_CURSOS = `
  UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
  INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
`;

test.describe("I1 — sala", () => {
  test.use({
    semMassa: true,
    semente: `${DOIS_CURSOS}
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2), (2, 2, 'Física', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 2, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (2, 1, 0, 0, 2, 2, 1);
    `,
  });

  test("I1: sala usada por outro curso aparece como impedida", async ({ page }) => {
    test.fail(true, "I1 — a grade manual só olha o próprio curso; corrigir no subprojeto 1");
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await expect(celula(page, "Segunda", "M1")).toContainText(/A01|Beta|ocupad/i, { timeout: 3_000 });
  });
});

test.describe("I1 — professor", () => {
  test.use({
    semMassa: true,
    semente: `${DOIS_CURSOS}
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Cálculo', 1, 2, 0), (2, 2, 'Física', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (2, 1, 0, 0, 2, 1);
    `,
  });

  test("I1: professor ocupado em outro curso aparece como impedido", async ({ page }) => {
    test.fail(true, "I1 — a grade manual só olha o próprio curso; corrigir no subprojeto 1");
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await expect(celula(page, "Segunda", "M1")).toContainText(/A\. Souza|Beta/, { timeout: 3_000 });
  });
});

test.describe("B4 — grade manual", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome, max_dias_semana) VALUES (1, 'Ana Souza', 1);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1);
    `,
  });

  test("B4: segundo dia é barrado para professor com máximo de 1 dia", async ({ page }) => {
    test.fail(true, "B4 — max_dias_semana não é checado; corrigir no subprojeto 1");
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await expect(celula(page, "Terça", "M1")).toContainText(/máx|dias/i, { timeout: 3_000 });
  });
});

test.describe("I2", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, permite_sabado)
        VALUES (1, 1, 'Cálculo', 1, 1, 0, 1);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 5, 0, 1, 1);
    `,
  });

  // Ao corrigir, a mensagem deve conter "aula(s) no sábado"; se a solução for um
  // diálogo, troque a asserção pela captura do diálogo.
  test("I2: tirar o sábado com aula no sábado avisa", async ({ page }) => {
    test.fail(true, "I2 — as aulas de sábado somem sem aviso; corrigir no subprojeto 1");
    await irPara(page, "Regras");
    await page.getByLabel("Semana").selectOption("5");
    await expect(page.getByText(/aulas? no sábado/i)).toBeVisible({ timeout: 3_000 });
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npx playwright test testes/e2e/bugs-conhecidos.spec.ts`
Expected: 8 passed (todos marcados como falha esperada que de fato falhou). Se algum aparecer como "expected to fail, but passed", o bug não se reproduziu nesse cenário — investigue antes de seguir; não remova a marcação sem entender.

- [ ] **Step 3: Suíte completa e tempo**

Run: `npm run test:e2e`
Expected: 15 passed, em menos de 2 min.

- [ ] **Step 4: Commit**

```bash
git add testes/e2e/bugs-conhecidos.spec.ts
git commit -m "E2E: bugs conhecidos B2, B3, B4, B5, B8, I1 e I2 como falha esperada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Smoke no binário real

**Files:**
- Create: `testes/smoke/wdio.conf.ts`, `testes/smoke/app.spec.ts`, `testes/smoke/tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DISTRIBUICAO_BANCO` e `aria-label` das células (Tasks 7, 8).
- Produces: `npm run test:smoke` (exige binário debug, `tauri-driver` e, no Windows, `msedgedriver.exe`).

Pré-requisitos locais (uma vez): `cargo install tauri-driver --locked` e `cargo install --git https://github.com/chippers/msedgedriver-tool`; depois, na raiz do repo, `msedgedriver-tool` (baixa `msedgedriver.exe` compatível com o Edge/WebView2 instalado).

- [ ] **Step 1: Instalar**

Run: `npm i -D @wdio/cli@^9 @wdio/local-runner@^9 @wdio/mocha-framework@^9 @wdio/spec-reporter@^9 @wdio/globals@^9`

- [ ] **Step 2: Scripts no `package.json`**

```json
    "typecheck": "tsc --noEmit && tsc --noEmit -p testes && tsc --noEmit -p testes/smoke",
    "test:smoke": "wdio run testes/smoke/wdio.conf.ts",
```

- [ ] **Step 3: Criar `testes/smoke/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["node", "@wdio/globals/types", "@wdio/mocha-framework"]
  },
  "include": ["*.ts"],
  "exclude": []
}
```

- [ ] **Step 4: Criar `testes/smoke/wdio.conf.ts`**

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const WINDOWS = process.platform === "win32";
const APP = join(RAIZ, "src-tauri", "target", "debug", WINDOWS ? "distribuicao-aulas.exe" : "distribuicao-aulas");
const EDGE = process.env.MSEDGEDRIVER ?? join(RAIZ, "msedgedriver.exe");

let driver: ChildProcess | undefined;
let pasta = "";

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./*.spec.ts"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [{ maxInstances: 1, "tauri:options": { application: APP } } as WebdriverIO.Capabilities],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 120_000 },

  onPrepare() {
    if (!existsSync(APP)) throw new Error(`Binário não encontrado: ${APP}\nRode: npm run tauri build -- --debug --no-bundle`);
    if (WINDOWS && !existsSync(EDGE)) throw new Error(`msedgedriver não encontrado: ${EDGE}\nRode msedgedriver-tool na raiz.`);
  },

  // Banco isolado por sessão: o app de debug lê DISTRIBUICAO_BANCO, e o
  // tauri-driver repassa o ambiente ao app que abre.
  beforeSession() {
    pasta = mkdtempSync(join(tmpdir(), "distribuicao-smoke-"));
    driver = spawn(join(homedir(), ".cargo", "bin", "tauri-driver"), WINDOWS ? ["--native-driver", EDGE] : [], {
      stdio: [null, process.stdout, process.stderr],
      env: { ...process.env, DISTRIBUICAO_BANCO: join(pasta, "smoke.db") },
    });
  },

  afterSession() {
    driver?.kill();
    try {
      rmSync(pasta, { recursive: true, force: true });
    } catch {
      // No Windows o arquivo pode seguir preso por instantes; a pasta é temporária.
    }
  },
};
```

- [ ] **Step 5: Criar `testes/smoke/app.spec.ts`**

```ts
import { $, expect } from "@wdio/globals";

const ir = async (rotulo: string) => (await $("nav")).$(`button=${rotulo}`).click();

describe("binário real", () => {
  it("abre com as migrações aplicadas pelo sqlx", async () => {
    await ir("Gerenciar cursos");
    await expect($("td=Curso")).toBeDisplayed();
  });

  it("grava pelo comando transacao e lê pelo plugin", async () => {
    await ir("Professores");
    for (const nome of ["Ana Souza", "Bruno Lima"]) {
      await $("button=Novo professor").click();
      await $(".modal input").setValue(nome);
      await $("button=Salvar").click();
      await expect($(`td*=${nome}`)).toBeDisplayed();
    }
  });

  it("aplica a chave estrangeira de verdade", async () => {
    await ir("Períodos");
    await $("button=Adicionar 1º período").click();

    // Sem sala cadastrada, o requisito padrão ("qualquer sala") deixaria a célula impedida.
    await ir("Salas");
    await $("button=Nova sala").click();
    await $(".modal input").setValue("A01");
    await $("button=Salvar").click();
    await expect($("td*=A01")).toBeDisplayed();

    await ir("Disciplinas");
    await $("button=Nova disciplina").click();
    await $(".modal input").setValue("Cálculo");
    await $("button=Adicionar professor").click();
    await $("button=Salvar").click();

    await ir("Manual");
    await $("button*=Cálculo").click();
    await $('[aria-label="Segunda, M1"]').click();
    await expect($('[aria-label="Segunda, M1"]')).toHaveText(expect.stringContaining("Cálculo"));

    await ir("Disciplinas");
    await (await $("tr*=Cálculo")).$('button[aria-label="Editar"]').click();
    await $(".linha-fatia select").selectByVisibleText("Bruno Lima");
    await $("button=Salvar").click();
    await expect($(".alerta")).toHaveText(expect.stringContaining("está em uso"));
  });
});
```

- [ ] **Step 6: Compilar e rodar (Windows)**

Run: `npm run tauri build -- --debug --no-bundle && npm run test:smoke`
Expected: `3 passing`. O banco real em `%APPDATA%\br.edu.utfpr.distribuicaoaulas` não é tocado — confira que a data de modificação de `distribuicao.db` lá não mudou.

- [ ] **Step 7: Typecheck e commit**

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add testes/smoke package.json package-lock.json
git commit -m "Smoke no binário real com WebdriverIO e tauri-driver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: CI e documentação

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (nova seção "Testes" antes de "Estrutura")

- [ ] **Step 1: Criar `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verificacao:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/

  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      # generate_context! exige que frontendDist exista.
      - run: mkdir -p dist
      - run: cargo fmt --check
        working-directory: src-tauri
      - run: cargo clippy -- -D warnings
        working-directory: src-tauri

  smoke:
    if: github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.base_ref == 'main')
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: npm ci
      - run: cargo install tauri-driver --locked
      - run: cargo install --git https://github.com/chippers/msedgedriver-tool
      - run: msedgedriver-tool
      - run: npm run tauri build -- --debug --no-bundle
      - run: npm run test:smoke
```

- [ ] **Step 2: Seção "Testes" no `README.md`, inserida antes de `## Estrutura`**

````markdown
## Testes

Três camadas, todas sobre a mesma massa anonimizada (`testes/massa/`):

```bash
npm run typecheck      # tipos do app e dos testes
npm test               # Vitest: solver, auditor, ponte de IPC (segundos)
npm run test:e2e       # Playwright: a interface no Chromium, sem compilar Rust
npm run test:smoke     # binário real (Windows); exige build debug e drivers
npm run bench:solver   # compara solvers em cenários × sementes
```

- **Massa.** `testes/massa/engenharia_v9.sql` vem do banco real, com nomes de
  professores trocados por `Professor NN` e observações apagadas. Para
  regenerar: `python scripts/anonimizar_massa.py distribuicao.db`. O script
  recusa gravar se sobrar algum nome real.
- **Banco de teste.** `testes/suporte/banco.ts` aplica as migrações até a
  versão da massa, insere a massa e aplica as restantes — toda migração nova é
  testada contra um banco populado.
- **Interface sem Rust.** O Playwright abre o app no Chromium e redireciona o
  IPC do Tauri para `testes/suporte/ponte.ts`, que opera um SQLite no Node com a
  mesma semântica do comando `transacao`.
- **Smoke.** Precisa, uma vez: `cargo install tauri-driver --locked`,
  `cargo install --git https://github.com/chippers/msedgedriver-tool` e
  `msedgedriver-tool` na raiz. Depois:
  `npm run tauri build -- --debug --no-bundle && npm run test:smoke`. O banco
  do smoke é temporário (`DISTRIBUICAO_BANCO`, só em debug); o seu não é tocado.
- **Falha esperada.** Bugs conhecidos são testes marcados com `it.fails`
  (Vitest) ou `test.fail(true, "<id> — …")` (Playwright). Eles passam enquanto
  o bug existir. Quando o bug for corrigido, a ferramenta acusa "passou
  inesperadamente": remova a marcação nesse momento.
- **CI.** `.github/workflows/ci.yml` roda typecheck, Vitest, Playwright e
  `cargo fmt`/`clippy` em todo push; o smoke roda em PR para `main` e pelo
  botão "Run workflow".
````

- [ ] **Step 3: Verificação final completa**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: tudo verde; Vitest < 20 s, Playwright < 2 min.

Run: `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cd ..`
Expected: sem saída de erro.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "CI no GitHub Actions e documentação dos testes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Cobertura do spec

| Requisito do spec | Task |
|---|---|
| Massa anonimizada, cabeçalho de versão, verificação de vazamento | 2 |
| `criarBanco` com migrações antes/depois da massa | 3 |
| Ponte (banco, load, select, transacao, rejeição, injeção de falha) + testes | 3 |
| `carregarProblema` injetável | 5 |
| `conferir` + testes por violação | 4 |
| Testes do solver: massa, determinismo, cenários, unidades, estresse | 5 |
| B1, B4, I1 no Vitest | 5 |
| Benchmark + linha de base; remoção de `testar_solver.ts`/`exportar_problema.py`; comentário do `carregar.ts` | 5, 6 |
| `aria-label` nas células; helpers; `aceitarConfirmacoes` | 8 |
| Cenários de interface 1–6 | 8, 9 |
| Bugs B2, B3, B4, B5, B8, I1, I2 no Playwright | 10 |
| `DISTRIBUICAO_BANCO` + comando `banco()` | 7 |
| Smoke 1–3 | 11 |
| CI (3 jobs, concurrency, Node fixado) | 1, 12 |
| `.gitattributes`, README | 1, 12 |
