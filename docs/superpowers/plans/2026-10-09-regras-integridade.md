# Regras e integridade — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** uma regra dura vale igual no solver, na grade manual e no auditor; decisões de optativa, oferta, sala preferida, conflito entre cursos e noite implementadas; bugs B1–B5, B7–B10, I1 e I2 corrigidos.

**Arquitetura:** novo módulo TS puro `src/regras/` (contexto, `Ocupacao`, `impedimento`, `escolherSala`, `violacoesDaAula`, `descrever`) usado pelo solver e pela grade manual. O `conferir` continua independente e aprende as regras novas. Uma migração (`010`) sem recriar tabelas: gatilho para a cascata do curso, `DROP COLUMN`, `ADD COLUMN`.

**Stack:** Tauri v2, React 19 + TS 5.8, SQLite (`tauri-plugin-sql`; `node:sqlite` nos testes), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-regras-integridade-design.md` (leia antes de começar qualquer tarefa).

## Restrições globais

- Textos de interface, comentários e mensagens de commit em **português do Brasil**. Comentário explica o *porquê*, no estilo do código vizinho.
- **Nada depende do nome** de disciplina, sala, professor ou curso (regra de ouro do README). Nomes próprios não aparecem em código nem em comentário.
- Um arquivo em `scripts/migracoes/` já publicado **nunca é editado**; esquema novo = arquivo novo + entrada em `src-tauri/src/lib.rs`.
- Ao corrigir um bug com teste de falha esperada, **remova** a marcação `it.fails` / `test.fail(...)` daquele teste.
- Comandos: `npm run typecheck`, `npm test` (Vitest, meta < 20 s), `npm run test:e2e` (Playwright, meta < 2 min), `npm run bench:solver`. Rust: `cargo fmt --check` e `cargo clippy -- -D warnings` dentro de `src-tauri/`.
- Toda tarefa termina com `npm run typecheck` e `npm test` verdes; tarefas que mexem em tela terminam também com `npm run test:e2e` verde.
- Commits terminam com o trailer `Co-Authored-By: <modelo que de fato escreveu> <noreply@anthropic.com>`. Sem `git push` (não há remoto).
- Node ≥ 22.13. Plataforma de desenvolvimento: Windows (Git Bash disponível).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/migracoes/010_regras_e_integridade.sql` (novo) | noite fora, views fora, `permite_contraturno` fora, contraturno sem optativas, `ofertada`, gatilho de cascata |
| `src-tauri/src/lib.rs` | registra a migração 10; tira o plugin opener |
| `scripts/migrar.py` | deixa de usar views e `permite_contraturno` |
| `src/regras/tipos.ts` (novo) | `Turno`, `Contexto`, `FatiaRegras`, `SalaAceita`, `AulaOcupada`, `Motivo`, `criarContexto` |
| `src/regras/ocupacao.ts` (novo) | `class Ocupacao` |
| `src/regras/impedimentos.ts` (novo) | `impedimentoDeHorario`, `impedimento`, `salasPossiveis`, `escolherSala`, `violacoesDaAula` |
| `src/regras/descrever.ts` (novo) | `curto`, `Nomes`, `descrever` |
| `src/regras/carregar.ts` (novo) | `Leitor`, `carregarContexto` |
| `src/regras/avisos.ts` (novo) | `avisosDaFatia` (pendências da grade manual) |
| `testes/suporte/regras.ts` (novo) | fábricas de teste do módulo de regras |
| `src/solver/tipos.ts`, `carregar.ts`, `contexto.ts` (novo), `solver.ts`, `custo.ts`, `conferir.ts` | solver sobre o módulo; custos novos; auditor ampliado |
| `src/tipos.ts` | `Turno` sem noite; `Periodo` sem `permite_contraturno`; `Disciplina.ofertada` |
| `src/paginas/GradeManual.tsx` | regras pelo módulo, entre cursos, sala automática e troca, avisos, diagnóstico, B8 |
| `src/paginas/Disciplinas.tsx`, `src/componentes/RequisitoSala.tsx` | ofertada, preferência de sala, B3, revalidação, B9, turnos do curso |
| `src/paginas/Cursos.tsx`, `Periodos.tsx`, `Instituicao.tsx`, `Professores.tsx`, `Indisponibilidades.tsx`, `GradeAutomatica.tsx`, `Tipos.tsx` | turnos do curso, I2, máx. de dias, B10, B5, textos |
| `testes/suporte/ponte.ts`, `testes/e2e/fixtures.ts` | registro de chamadas do IPC (para o B10) |
| `docs/regras.md`, `README.md` | documentação das regras novas |

---

### Tarefa 1: Migração 010

**Arquivos:**
- Criar: `scripts/migracoes/010_regras_e_integridade.sql`
- Modificar: `src-tauri/src/lib.rs` (lista `migracoes()`), `scripts/migrar.py` (linhas ~310–316 e ~418–436), `src/paginas/Periodos.tsx` (UPDATE de `max_disciplinas_contraturno`), `testes/suporte/banco.test.ts`, `testes/e2e/bugs-conhecidos.spec.ts` (B2)

**Interfaces:**
- Produz: coluna `disciplinas.ofertada INTEGER NOT NULL DEFAULT 1`; `periodos` sem `permite_contraturno`; sem horários de turno `noite`; gatilho `cursos_cascata`; nenhuma view.

- [ ] **Passo 1: testes da migração (falham)**

Em `testes/suporte/banco.test.ts`, troque `{ n: 17 }` por `{ n: 12 }` no primeiro teste e acrescente ao fim do arquivo:

```ts
describe("migração 010 sobre a massa", () => {
  it("tira a noite, as views e permite_contraturno", () => {
    const db = criarBanco();
    expect(um(db, "SELECT COUNT(*) AS n FROM horarios WHERE turno = 'noite'")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'view'")).toEqual({ n: 0 });
    const colunas = (db.prepare("PRAGMA table_info(periodos)").all() as { name: string }[]).map((c) => c.name);
    expect(colunas).not.toContain("permite_contraturno");
    expect(um(db, "SELECT COUNT(*) AS n FROM configuracao WHERE chave = 'versao_schema'")).toEqual({ n: 0 });
  });

  it("desconta as optativas do máximo no contraturno", () => {
    const db = criarBanco();
    const linhas = db
      .prepare("SELECT numero, max_disciplinas_contraturno AS m FROM periodos WHERE curso_id = 1 AND numero IN (2, 7, 8) ORDER BY numero")
      .all()
      .map((l) => ({ ...(l as object) }));
    expect(linhas).toEqual([
      { numero: 2, m: 0 },
      { numero: 7, m: 0 },
      { numero: 8, m: 0 },
    ]);
  });

  it("toda disciplina nasce ofertada e nada da grade se perde", () => {
    const db = criarBanco();
    expect(um(db, "SELECT COUNT(*) AS n FROM disciplinas WHERE ofertada <> 1")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM alocacoes WHERE curso_id = 1")).toEqual({ n: 219 });
    expect(
      um(db, `SELECT SUM(dp.aulas) AS n FROM disciplina_professores dp
              JOIN disciplinas d ON d.id = dp.disciplina_id WHERE d.curso_id = 1`),
    ).toEqual({ n: 223 });
  });

  it("excluir o curso leva períodos, disciplinas e aulas junto", () => {
    const db = criarBanco();
    db.exec("INSERT INTO cursos (id, nome) VALUES (2, 'Outro')");
    db.exec("DELETE FROM cursos WHERE id = 1");
    expect(um(db, "SELECT COUNT(*) AS n FROM disciplinas")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM periodos")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM alocacoes")).toEqual({ n: 0 });
    expect(um(db, "SELECT COUNT(*) AS n FROM disciplina_professores")).toEqual({ n: 0 });
  });

  it("excluir um período com disciplinas continua recusado", () => {
    const db = criarBanco();
    expect(() => db.exec("DELETE FROM periodos WHERE curso_id = 1 AND numero = 1")).toThrow(/FOREIGN KEY/);
  });
});
```

(219 aulas e 223 aulas contratadas são os mesmos números do teste da v9: a migração não pode perder nada da grade nem das fatias.)

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run testes/suporte/banco.test.ts`
Expected: FAIL (17 horários, views existem, coluna existe, `ofertada` não existe, DELETE do curso falha por FK).

- [ ] **Passo 3: escrever a migração**

`scripts/migracoes/010_regras_e_integridade.sql`:

```sql
-- Regras e integridade (subprojeto 1).
--
-- Nenhuma tabela é recriada. Dentro da transação da migração a chave
-- estrangeira está ligada, e DROP TABLE disciplinas faria um DELETE implícito
-- que dispara ON DELETE CASCADE em disciplina_professores, disciplina_salas e
-- alocacoes — o dado se perderia. Por isso a cascata do curso é um gatilho, e
-- os CHECK que ainda citam 'noite' ficam como estão: sem nenhum horário
-- noturno, nada consegue usá-los.

-- ---------------------------------------------------------------- noite

DELETE FROM alocacoes
 WHERE hora IN (SELECT indice FROM horarios WHERE turno = 'noite');
DELETE FROM indisponibilidades
 WHERE hora IN (SELECT indice FROM horarios WHERE turno = 'noite');
DELETE FROM horarios WHERE turno = 'noite';

UPDATE disciplinas SET turno = NULL    WHERE turno = 'noite';
UPDATE periodos    SET turno = 'tarde' WHERE turno = 'noite';

-- 'manha,tarde,noite' → 'manha,tarde'; um curso que só tinha noite volta ao padrão.
UPDATE cursos SET turnos = COALESCE(
    NULLIF(TRIM(REPLACE(',' || turnos || ',', ',noite,', ','), ','), ''),
    'manha,tarde');
UPDATE configuracao SET valor = COALESCE(
    NULLIF(TRIM(REPLACE(',' || valor || ',', ',noite,', ','), ','), ''),
    'manha')
 WHERE chave = 'turnos_sabado';

-- ---------------------------------------------------------------- views
--
-- Nenhuma tela as lê. Os choques entre cursos passam a ser regra dura, e o
-- diagnóstico das aulas antigas que já os violam vem do módulo de regras.

DROP VIEW IF EXISTS ocupacao_professor;
DROP VIEW IF EXISTS ocupacao_sala;
DROP VIEW IF EXISTS aulas_conferencia;
DROP VIEW IF EXISTS alocacao_conferencia;
DROP VIEW IF EXISTS conflitos;

-- ---------------------------------------------------------------- contraturno
--
-- permite_contraturno era derivado de max > 0 e nada o lia.
ALTER TABLE periodos DROP COLUMN permite_contraturno;

-- O máximo passa a contar só as obrigatórias: as optativas vão ao contraturno
-- quando o gerador achar melhor. O valor antigo incluía as optativas — era o
-- "uma no turno, o resto no contraturno" escrito à mão.
UPDATE periodos SET max_disciplinas_contraturno = MAX(0,
    max_disciplinas_contraturno - (
        SELECT COUNT(*) FROM disciplinas d
         WHERE d.curso_id = periodos.curso_id
           AND d.periodo  = periodos.numero
           AND d.optativa = 1));

-- ---------------------------------------------------------------- oferta

ALTER TABLE disciplinas ADD COLUMN ofertada INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------- cascata
--
-- disciplinas não tem FK para cursos. Os períodos já caem pela FK; as
-- disciplinas (e com elas fatias, salas e aulas) caem por aqui, antes.
CREATE TRIGGER cursos_cascata BEFORE DELETE ON cursos
BEGIN
    DELETE FROM alocacoes   WHERE curso_id = OLD.id;
    DELETE FROM disciplinas WHERE curso_id = OLD.id;
END;

-- ---------------------------------------------------------------- versão

-- A versão real do esquema é a do _sqlx_migrations; esta chave parou na 1.
DELETE FROM configuracao WHERE chave = 'versao_schema';
```

- [ ] **Passo 4: registrar no Rust**

Em `src-tauri/src/lib.rs`, depois da entrada `version: 9`, acrescente:

```rust
        Migration {
            version: 10,
            description: "regras e integridade",
            sql: include_str!("../../scripts/migracoes/010_regras_e_integridade.sql"),
            kind: MigrationKind::Up,
        },
```

- [ ] **Passo 5: Periodos.tsx deixa de gravar a coluna removida**

Em `src/paginas/Periodos.tsx`, o `onBlur` do máximo no contraturno passa a:

```tsx
                      onBlur={(e) =>
                        Number(e.target.value) !== p.max_disciplinas_contraturno &&
                        tentar(
                          () =>
                            executar(
                              "UPDATE periodos SET max_disciplinas_contraturno = ?"
                                + " WHERE curso_id = ? AND numero = ?",
                              [Number(e.target.value), cursoId, p.numero],
                            ),
                          "O período",
                        )
                      }
```

- [ ] **Passo 6: migrar.py sem views e sem permite_contraturno**

`scripts/migrar.py` roda todas as migrações (inclusive a 010) antes de copiar o banco antigo, então não pode mais usar as views nem a coluna. Troque o UPDATE de períodos (~linha 310) por:

```python
    # Optativas não contam: o gerador as põe no contraturno quando convém.
    novo.execute(
        "UPDATE periodos SET"
        " max_disciplinas_contraturno = (SELECT COUNT(*) FROM disciplinas d"
        "   WHERE d.periodo = periodos.numero AND d.turno IS NOT NULL"
        "   AND d.optativa = 0)")
```

E, na seção de conferência (~linhas 418–436), troque as quatro consultas a views por SQL direto, com as mesmas colunas:

```python
    ch_bad = list(novo.execute(
        "SELECT d.id, d.curso_id, d.nome, d.aulas_semanais,"
        "       COALESCE((SELECT SUM(aulas) FROM disciplina_professores dp"
        "                  WHERE dp.disciplina_id = d.id), 0) AS distribuidas"
        "  FROM disciplinas d WHERE d.aulas_semanais <> distribuidas"))
```

```python
    al_bad = list(novo.execute(
        "SELECT dp.disciplina_id, d.curso_id, d.nome, dp.professor_id,"
        "       p.nome, dp.aulas AS previsto,"
        "       (SELECT COUNT(*) FROM alocacoes a"
        "         WHERE a.disciplina_id = dp.disciplina_id"
        "           AND a.professor_id  = dp.professor_id) AS alocado"
        "  FROM disciplina_professores dp"
        "  JOIN disciplinas d ON d.id = dp.disciplina_id"
        "  JOIN professores p ON p.id = dp.professor_id"
        " WHERE previsto <> alocado"))
```

```python
    cp = list(novo.execute(
        "SELECT dia, hora, professor_id, COUNT(*) c FROM alocacoes"
        " GROUP BY dia, hora, professor_id HAVING c > 1"))
    cs = list(novo.execute(
        "SELECT dia, hora, sala_id, COUNT(*) c FROM alocacoes"
        " WHERE sala_id IS NOT NULL"
        " GROUP BY dia, hora, sala_id HAVING c > 1"))
```

Confira com `grep -n "conferencia\|ocupacao_\|permite_contraturno" scripts/migrar.py` que não sobrou uso, e `python -m py_compile scripts/migrar.py`.

- [ ] **Passo 7: B2 deixa de ser falha esperada**

Em `testes/e2e/bugs-conhecidos.spec.ts`, no teste B2, apague a linha `test.fail(true, "B2 — falta ON DELETE CASCADE; corrigir no subprojeto 1");`.

- [ ] **Passo 8: rodar tudo**

Run: `npm run typecheck && npm test && npx playwright test testes/e2e/bugs-conhecidos.spec.ts -g B2`
Expected: tudo PASS. (Os demais e2e continuam como antes; rode `npm run test:e2e` inteiro para confirmar que nada quebrou: os únicos `test.fail` restantes ainda falham como esperado.)

Run (Rust): `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings`
Expected: sem erros.

- [ ] **Passo 9: commit**

```bash
git add scripts/migracoes/010_regras_e_integridade.sql src-tauri/src/lib.rs scripts/migrar.py src/paginas/Periodos.tsx testes/suporte/banco.test.ts testes/e2e/bugs-conhecidos.spec.ts
git commit -m "Migração 010: noite fora, oferta, contraturno sem optativas e cascata do curso (B2)"
```

---

### Tarefa 2: Módulo de regras

**Arquivos:**
- Criar: `src/regras/tipos.ts`, `src/regras/ocupacao.ts`, `src/regras/impedimentos.ts`, `src/regras/descrever.ts`, `src/regras/avisos.ts`, `testes/suporte/regras.ts`
- Testar: `src/regras/ocupacao.test.ts`, `src/regras/impedimentos.test.ts`, `src/regras/descrever.test.ts`, `src/regras/avisos.test.ts`

**Interfaces (produz — nomes exatos usados nas tarefas seguintes):**
```ts
// tipos.ts
export type Turno = "manha" | "tarde";
export interface HorarioRegra { indice: number; turno: Turno }
export interface Contexto { cursoId; dias; horarios: HorarioRegra[]; turnoDaHora: Map<number, Turno>; turnosDoCurso: Turno[]; turnosSabado: Turno[]; indisponiveis: Set<string>; maxDias: Map<number, number>; salas: { id: number; tipo: string }[] }
export interface SalaAceita { id: number; preferencia: 1 | 2 }
export interface FatiaRegras { disciplinaId; professorId; periodo; permiteSabado: boolean; turno: Turno | null; exigeSala: boolean; tipoSala: string | null; salas: SalaAceita[]; ofertada: boolean }
export interface AulaOcupada { cursoId; periodo; dia; hora; disciplinaId; professorId; salaId: number | null }
export type Motivo = ...; // ver código
export function criarContexto(base: Omit<Contexto, "turnoDaHora">): Contexto;
// ocupacao.ts
export class Ocupacao { constructor(cursoId: number, aulas?: AulaOcupada[]); colocar(a); retirar(a); noPeriodo(p, d, h); doProfessor(pr, d, h); daSala(s, d, h); diasDoProfessor(pr): ReadonlyMap<number, number> }
// impedimentos.ts
export function impedimentoDeHorario(ctx, oc, f, dia, hora): Motivo | null;
export function salasPossiveis(ctx, f): SalaAceita[];
export function escolherSala(ctx, oc, f, dia, hora, preferida?: number | null): number | null | undefined;
export function impedimento(ctx, oc, f, dia, hora): Motivo | null;
export function violacoesDaAula(ctx, oc, f, aula: AulaOcupada): Motivo[];
// descrever.ts
export function curto(nome: string): string;
export interface Nomes { cursoAtual: number; professor(id: number): string; curso(id: number): string; sala(id: number): string }
export function descrever(m: Motivo, n: Nomes): string;
// avisos.ts
export function avisosDaFatia(aulas: { dia: number; hora: number }[], total: number, blocosLivres: boolean, padroes: string[] | undefined, turnoDaHora: Map<number, Turno>): string[];
```

- [ ] **Passo 1: fábricas de teste**

`testes/suporte/regras.ts`:

```ts
import { criarContexto, type AulaOcupada, type Contexto, type FatiaRegras, type Turno } from "../../src/regras/tipos";

/** M1..M6 = índices 0..5 (manhã); T1..T6 = 6..11 (tarde). Igual a `problemaMinimo`. */
export const HORARIOS_REGRAS = Array.from({ length: 12 }, (_, i) => ({
  indice: i,
  turno: (i < 6 ? "manha" : "tarde") as Turno,
}));

export function contextoMinimo(extra: Partial<Omit<Contexto, "turnoDaHora">> = {}): Contexto {
  return criarContexto({
    cursoId: 1,
    dias: 6,
    horarios: HORARIOS_REGRAS,
    turnosDoCurso: ["manha", "tarde"],
    turnosSabado: ["manha"],
    indisponiveis: new Set(),
    maxDias: new Map(),
    salas: [],
    ...extra,
  });
}

export function fatiaRegras(extra: Partial<FatiaRegras> = {}): FatiaRegras {
  return {
    disciplinaId: 1,
    professorId: 1,
    periodo: 1,
    permiteSabado: false,
    turno: null,
    exigeSala: false,
    tipoSala: null,
    salas: [],
    ofertada: true,
    ...extra,
  };
}

/** Aula de OUTRA disciplina e OUTRO professor, salvo o que se passar. */
export function aulaOcupada(extra: Partial<AulaOcupada> = {}): AulaOcupada {
  return { cursoId: 1, periodo: 1, dia: 0, hora: 0, disciplinaId: 9, professorId: 9, salaId: null, ...extra };
}
```

- [ ] **Passo 2: testes da Ocupacao (falham)**

`src/regras/ocupacao.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aulaOcupada } from "../../testes/suporte/regras";
import { Ocupacao } from "./ocupacao";

describe("Ocupacao", () => {
  it("coloca e retira", () => {
    const a = aulaOcupada({ professorId: 1, salaId: 3 });
    const oc = new Ocupacao(1, [a]);
    expect(oc.noPeriodo(1, 0, 0)).toEqual(a);
    expect(oc.doProfessor(1, 0, 0)).toEqual(a);
    expect(oc.daSala(3, 0, 0)).toEqual(a);
    oc.retirar(a);
    expect(oc.noPeriodo(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)).toBeUndefined();
    expect(oc.daSala(3, 0, 0)).toBeUndefined();
  });

  it("aula de outro curso ocupa professor e sala, mas não o período", () => {
    const oc = new Ocupacao(1, [aulaOcupada({ cursoId: 2, professorId: 1, salaId: 3 })]);
    expect(oc.noPeriodo(1, 0, 0)).toBeUndefined();
    expect(oc.doProfessor(1, 0, 0)?.cursoId).toBe(2);
    expect(oc.daSala(3, 0, 0)?.cursoId).toBe(2);
  });

  it("conta os dias do professor e esquece o dia que esvaziou", () => {
    const a = aulaOcupada({ professorId: 1, dia: 0, hora: 0 });
    const b = aulaOcupada({ professorId: 1, dia: 0, hora: 1 });
    const c = aulaOcupada({ professorId: 1, dia: 2, hora: 0 });
    const oc = new Ocupacao(1, [a, b, c]);
    expect([...oc.diasDoProfessor(1).entries()]).toEqual([[0, 2], [2, 1]]);
    oc.retirar(c);
    expect([...oc.diasDoProfessor(1).keys()]).toEqual([0]);
    expect(oc.diasDoProfessor(42).size).toBe(0);
  });

  it("representa duas aulas no mesmo lugar e retira a certa", () => {
    const deAlfa = aulaOcupada({ cursoId: 1, professorId: 1 });
    const deBeta = aulaOcupada({ cursoId: 2, professorId: 1 });
    const oc = new Ocupacao(1, [deAlfa, deBeta]);
    oc.retirar(deAlfa);
    expect(oc.doProfessor(1, 0, 0)).toEqual(deBeta);
    expect(oc.diasDoProfessor(1).get(0)).toBe(1);
  });
});
```

Run: `npx vitest run src/regras` → FAIL (módulo não existe).

- [ ] **Passo 3: tipos.ts e ocupacao.ts**

`src/regras/tipos.ts`:

```ts
/**
 * As regras duras de célula, num lugar só. O solver e a grade manual montam a
 * mesma `Ocupacao` e fazem a mesma pergunta — "esta aula pode ir aqui?" — e
 * por isso não podem discordar. O auditor (`src/solver/conferir.ts`) fica de
 * fora de propósito: ele reimplementa as regras para pegar erro daqui.
 *
 * A numeração D1..D16 é a de `docs/regras.md`.
 */

export type Turno = "manha" | "tarde";

export interface HorarioRegra {
  indice: number;
  turno: Turno;
}

/** O que não muda enquanto a grade é montada. */
export interface Contexto {
  /** Curso em montagem. Aula de outro curso ocupa professor e sala, nunca período. */
  cursoId: number;
  dias: number;
  horarios: HorarioRegra[];
  turnoDaHora: Map<number, Turno>;
  turnosDoCurso: Turno[];
  turnosSabado: Turno[];
  /** Chaves "professorId:dia:hora". */
  indisponiveis: Set<string>;
  /** Professor → máximo de dias distintos na semana. Ausente = sem limite. */
  maxDias: Map<number, number>;
  salas: { id: number; tipo: string }[];
}

export interface SalaAceita {
  id: number;
  /** 1 = ideal, 2 = aceitável. */
  preferencia: 1 | 2;
}

/** O que as regras precisam saber de uma fatia (disciplina × professor). */
export interface FatiaRegras {
  disciplinaId: number;
  professorId: number;
  periodo: number;
  permiteSabado: boolean;
  /** Turno forçado; `null` = qualquer turno do curso. */
  turno: Turno | null;
  exigeSala: boolean;
  /** Exige sala deste tipo; `null` = sem exigência de tipo. */
  tipoSala: string | null;
  /** Salas específicas aceitas; vazio = qualquer uma que sirva. */
  salas: SalaAceita[];
  ofertada: boolean;
}

export interface AulaOcupada {
  cursoId: number;
  periodo: number;
  dia: number;
  hora: number;
  disciplinaId: number;
  professorId: number;
  salaId: number | null;
}

/** Por que uma aula não pode ir (ou não deveria estar) num horário. */
export type Motivo =
  | { regra: "faixa" }
  | { regra: "D16" }
  | { regra: "D1"; aula: AulaOcupada }
  | { regra: "D5" }
  | { regra: "D5-turno"; turnosSabado: Turno[] }
  | { regra: "D13" }
  | { regra: "D14"; turno: Turno }
  | { regra: "D4"; professorId: number }
  | { regra: "D2"; aula: AulaOcupada }
  | { regra: "D15"; professorId: number; limite: number }
  | { regra: "D3"; aula: AulaOcupada }
  | { regra: "D3-sem-sala" }
  | { regra: "sala-invalida"; salaId: number | null };

export function criarContexto(base: Omit<Contexto, "turnoDaHora">): Contexto {
  return { ...base, turnoDaHora: new Map(base.horarios.map((h) => [h.indice, h.turno])) };
}
```

`src/regras/ocupacao.ts`:

```ts
import type { AulaOcupada } from "./tipos";

const chave = (quem: number, dia: number, hora: number) => `${quem}:${dia}:${hora}`;

/** A identidade de uma aula é a chave primária de `alocacoes`. */
const mesma = (x: AulaOcupada, a: AulaOcupada) =>
  x.cursoId === a.cursoId && x.periodo === a.periodo && x.dia === a.dia && x.hora === a.hora;

const NENHUM_DIA: ReadonlyMap<number, number> = new Map();

/**
 * Quem ocupa cada (dia, hora): por período (só do curso em montagem), por
 * professor e por sala (de todos os cursos).
 *
 * Listas, e não um valor só, porque um banco anterior às regras entre cursos
 * pode trazer o mesmo professor em dois lugares. A ocupação precisa
 * representar o choque para que o diagnóstico o mostre, e retirar uma das
 * aulas não pode apagar a outra.
 */
export class Ocupacao {
  private periodos = new Map<string, AulaOcupada[]>();
  private professores = new Map<string, AulaOcupada[]>();
  private salas = new Map<string, AulaOcupada[]>();
  private dias = new Map<number, Map<number, number>>();

  constructor(
    readonly cursoId: number,
    aulas: AulaOcupada[] = [],
  ) {
    for (const a of aulas) this.colocar(a);
  }

  colocar(a: AulaOcupada): void {
    if (a.cursoId === this.cursoId) empilhar(this.periodos, chave(a.periodo, a.dia, a.hora), a);
    empilhar(this.professores, chave(a.professorId, a.dia, a.hora), a);
    if (a.salaId != null) empilhar(this.salas, chave(a.salaId, a.dia, a.hora), a);
    const dias = this.dias.get(a.professorId) ?? new Map<number, number>();
    dias.set(a.dia, (dias.get(a.dia) ?? 0) + 1);
    this.dias.set(a.professorId, dias);
  }

  retirar(a: AulaOcupada): void {
    if (!desempilhar(this.professores, chave(a.professorId, a.dia, a.hora), a)) return;
    if (a.cursoId === this.cursoId) desempilhar(this.periodos, chave(a.periodo, a.dia, a.hora), a);
    if (a.salaId != null) desempilhar(this.salas, chave(a.salaId, a.dia, a.hora), a);
    const dias = this.dias.get(a.professorId)!;
    const n = (dias.get(a.dia) ?? 0) - 1;
    if (n > 0) dias.set(a.dia, n);
    else dias.delete(a.dia);
  }

  noPeriodo(periodo: number, dia: number, hora: number): AulaOcupada | undefined {
    return this.periodos.get(chave(periodo, dia, hora))?.[0];
  }

  doProfessor(professorId: number, dia: number, hora: number): AulaOcupada | undefined {
    return this.professores.get(chave(professorId, dia, hora))?.[0];
  }

  daSala(salaId: number, dia: number, hora: number): AulaOcupada | undefined {
    return this.salas.get(chave(salaId, dia, hora))?.[0];
  }

  /** Dia → quantas aulas o professor tem nele, somando todos os cursos. */
  diasDoProfessor(professorId: number): ReadonlyMap<number, number> {
    return this.dias.get(professorId) ?? NENHUM_DIA;
  }
}

function empilhar(m: Map<string, AulaOcupada[]>, k: string, a: AulaOcupada) {
  const lista = m.get(k);
  if (lista) lista.push(a);
  else m.set(k, [a]);
}

function desempilhar(m: Map<string, AulaOcupada[]>, k: string, a: AulaOcupada): boolean {
  const lista = m.get(k);
  const i = lista ? lista.findIndex((x) => mesma(x, a)) : -1;
  if (i < 0) return false;
  lista!.splice(i, 1);
  if (lista!.length === 0) m.delete(k);
  return true;
}
```

Run: `npx vitest run src/regras/ocupacao.test.ts` → PASS.

- [ ] **Passo 4: testes de impedimentos (falham)**

`src/regras/impedimentos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aulaOcupada, contextoMinimo, fatiaRegras } from "../../testes/suporte/regras";
import { escolherSala, impedimento, impedimentoDeHorario, salasPossiveis, violacoesDaAula } from "./impedimentos";
import { Ocupacao } from "./ocupacao";
import type { Motivo } from "./tipos";

const regra = (m: Motivo | null) => m?.regra ?? null;
const vazia = () => new Ocupacao(1);
const SALAS = [
  { id: 1, tipo: "Sala de Aula" },
  { id: 2, tipo: "Laboratório" },
];

describe("impedimentoDeHorario", () => {
  it("aceita horário livre", () => {
    expect(impedimentoDeHorario(contextoMinimo(), vazia(), fatiaRegras(), 0, 0)).toBeNull();
  });

  it("faixa: dia ou hora fora da grade", () => {
    const ctx = contextoMinimo({ dias: 5 });
    expect(regra(impedimentoDeHorario(ctx, vazia(), fatiaRegras(), 5, 0))).toBe("faixa");
    expect(regra(impedimentoDeHorario(ctx, vazia(), fatiaRegras(), 0, 12))).toBe("faixa");
  });

  it("D16: disciplina não ofertada", () => {
    expect(regra(impedimentoDeHorario(contextoMinimo(), vazia(), fatiaRegras({ ofertada: false }), 0, 0))).toBe("D16");
  });

  it("D1: horário do período ocupado", () => {
    const oc = new Ocupacao(1, [aulaOcupada()]);
    expect(regra(impedimentoDeHorario(contextoMinimo(), oc, fatiaRegras(), 0, 0))).toBe("D1");
  });

  it("D1 não vale entre cursos: o 1º período de outro curso é outra turma", () => {
    const oc = new Ocupacao(1, [aulaOcupada({ cursoId: 2 })]);
    expect(impedimentoDeHorario(contextoMinimo(), oc, fatiaRegras(), 0, 0)).toBeNull();
  });

  it("D5: sábado sem permissão", () => {
    expect(regra(impedimentoDeHorario(contextoMinimo(), vazia(), fatiaRegras(), 5, 0))).toBe("D5");
  });

  it("D5-turno: sábado à tarde", () => {
    const m = impedimentoDeHorario(contextoMinimo(), vazia(), fatiaRegras({ permiteSabado: true }), 5, 6);
    expect(m).toEqual({ regra: "D5-turno", turnosSabado: ["manha"] });
  });

  it("D13: fora dos turnos do curso", () => {
    const ctx = contextoMinimo({ turnosDoCurso: ["manha"] });
    expect(regra(impedimentoDeHorario(ctx, vazia(), fatiaRegras(), 0, 6))).toBe("D13");
  });

  it("D14: turno forçado", () => {
    const f = fatiaRegras({ turno: "tarde" });
    expect(impedimentoDeHorario(contextoMinimo(), vazia(), f, 0, 0)).toEqual({ regra: "D14", turno: "tarde" });
    expect(impedimentoDeHorario(contextoMinimo(), vazia(), f, 0, 6)).toBeNull();
  });

  it("D4: indisponibilidade", () => {
    const ctx = contextoMinimo({ indisponiveis: new Set(["1:0:0"]) });
    expect(regra(impedimentoDeHorario(ctx, vazia(), fatiaRegras(), 0, 0))).toBe("D4");
  });

  it("D2: professor ocupado em outro curso", () => {
    const oc = new Ocupacao(1, [aulaOcupada({ cursoId: 2, professorId: 1 })]);
    const m = impedimentoDeHorario(contextoMinimo(), oc, fatiaRegras(), 0, 0);
    expect(m?.regra).toBe("D2");
    expect(m?.regra === "D2" && m.aula.cursoId).toBe(2);
  });

  it("D15: máximo de dias conta só dia novo", () => {
    const ctx = contextoMinimo({ maxDias: new Map([[1, 1]]) });
    const oc = new Ocupacao(1, [aulaOcupada({ professorId: 1, disciplinaId: 1, dia: 0, hora: 3 })]);
    expect(impedimentoDeHorario(ctx, oc, fatiaRegras(), 1, 0)).toEqual({ regra: "D15", professorId: 1, limite: 1 });
    expect(impedimentoDeHorario(ctx, oc, fatiaRegras(), 0, 0)).toBeNull();
  });
});

describe("salas", () => {
  it("salasPossiveis: nenhuma quando não exige; por tipo; por lista com ideais primeiro; qualquer", () => {
    const ctx = contextoMinimo({ salas: SALAS });
    expect(salasPossiveis(ctx, fatiaRegras())).toEqual([]);
    expect(salasPossiveis(ctx, fatiaRegras({ exigeSala: true, tipoSala: "Laboratório" })).map((s) => s.id)).toEqual([2]);
    const lista = fatiaRegras({
      exigeSala: true,
      salas: [
        { id: 1, preferencia: 2 },
        { id: 2, preferencia: 1 },
      ],
    });
    expect(salasPossiveis(ctx, lista).map((s) => s.id)).toEqual([2, 1]);
    expect(salasPossiveis(ctx, fatiaRegras({ exigeSala: true })).map((s) => s.id)).toEqual([1, 2]);
  });

  it("escolherSala: null quando não exige, pula ocupada, respeita a preferida, undefined quando nenhuma serve", () => {
    const ctx = contextoMinimo({ salas: SALAS });
    const f = fatiaRegras({ exigeSala: true });
    expect(escolherSala(ctx, vazia(), fatiaRegras(), 0, 0)).toBeNull();
    expect(escolherSala(ctx, new Ocupacao(1, [aulaOcupada({ cursoId: 2, salaId: 1 })]), f, 0, 0)).toBe(2);
    expect(escolherSala(ctx, vazia(), f, 0, 0, 2)).toBe(2);
    expect(escolherSala(ctx, new Ocupacao(1, [aulaOcupada({ cursoId: 2, salaId: 2 })]), f, 0, 0, 2)).toBe(1);
    const cheia = new Ocupacao(1, [aulaOcupada({ cursoId: 2, salaId: 1 }), aulaOcupada({ cursoId: 3, salaId: 2 })]);
    expect(escolherSala(ctx, cheia, f, 0, 0)).toBeUndefined();
  });

  it("impedimento diz qual sala está tomada, ou que não há sala possível", () => {
    const ctx = contextoMinimo({ salas: [SALAS[0]] });
    const oc = new Ocupacao(1, [aulaOcupada({ cursoId: 2, salaId: 1 })]);
    const m = impedimento(ctx, oc, fatiaRegras({ exigeSala: true }), 0, 0);
    expect(m?.regra === "D3" && m.aula.cursoId).toBe(2);
    expect(regra(impedimento(ctx, vazia(), fatiaRegras({ exigeSala: true, tipoSala: "Laboratório" }), 0, 0))).toBe(
      "D3-sem-sala",
    );
    expect(impedimento(ctx, vazia(), fatiaRegras({ exigeSala: true }), 0, 0)).toBeNull();
  });
});

describe("violacoesDaAula", () => {
  const propria = aulaOcupada({ disciplinaId: 1, professorId: 1 });

  it("a aula não conflita consigo mesma", () => {
    const oc = new Ocupacao(1, [propria]);
    expect(violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), propria)).toEqual([]);
  });

  it("acusa todas as regras violadas de uma vez", () => {
    const noSabado = { ...propria, dia: 5, hora: 6 };
    const oc = new Ocupacao(1, [noSabado]);
    expect(violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), noSabado).map((m) => m.regra)).toEqual(["D5", "D5-turno"]);
  });

  it("acusa sala fora do requisito e choque de sala com outro curso", () => {
    const ctx = contextoMinimo({ salas: SALAS });
    const naSala1 = { ...propria, salaId: 1 };
    const oc = new Ocupacao(1, [naSala1, aulaOcupada({ cursoId: 2, salaId: 1 })]);
    expect(violacoesDaAula(ctx, oc, fatiaRegras({ exigeSala: true, tipoSala: "Laboratório" }), naSala1).map((m) => m.regra)).toEqual([
      "sala-invalida",
    ]);
    expect(violacoesDaAula(ctx, oc, fatiaRegras({ exigeSala: true }), naSala1).map((m) => m.regra)).toEqual(["D3"]);
  });

  it("devolve a ocupação como estava", () => {
    const oc = new Ocupacao(1, [propria]);
    violacoesDaAula(contextoMinimo(), oc, fatiaRegras(), propria);
    expect(oc.noPeriodo(1, 0, 0)).toEqual(propria);
  });
});
```

Run: `npx vitest run src/regras/impedimentos.test.ts` → FAIL.

- [ ] **Passo 5: impedimentos.ts**

```ts
import type { Ocupacao } from "./ocupacao";
import type { AulaOcupada, Contexto, FatiaRegras, Motivo, SalaAceita } from "./tipos";

const SABADO = 5;

type Checagem = (ctx: Contexto, oc: Ocupacao, f: FatiaRegras, dia: number, hora: number) => Motivo | null;

/**
 * As regras de horário, na ordem em que o motivo aparece na célula: primeiro
 * o que é do cadastro (não adianta trocar de horário), depois o que é da
 * ocupação (outro horário pode servir).
 */
const CHECAGENS: Checagem[] = [
  (ctx, _oc, _f, dia, hora) => (dia < 0 || dia >= ctx.dias || !ctx.turnoDaHora.has(hora) ? { regra: "faixa" } : null),
  (_ctx, _oc, f) => (f.ofertada ? null : { regra: "D16" }),
  (_ctx, oc, f, dia, hora) => {
    const aula = oc.noPeriodo(f.periodo, dia, hora);
    return aula ? { regra: "D1", aula } : null;
  },
  (_ctx, _oc, f, dia) => (dia === SABADO && !f.permiteSabado ? { regra: "D5" } : null),
  (ctx, _oc, _f, dia, hora) =>
    dia === SABADO && !ctx.turnosSabado.includes(ctx.turnoDaHora.get(hora)!)
      ? { regra: "D5-turno", turnosSabado: ctx.turnosSabado }
      : null,
  (ctx, _oc, _f, _dia, hora) => (ctx.turnosDoCurso.includes(ctx.turnoDaHora.get(hora)!) ? null : { regra: "D13" }),
  (ctx, _oc, f, _dia, hora) => (f.turno && ctx.turnoDaHora.get(hora) !== f.turno ? { regra: "D14", turno: f.turno } : null),
  (ctx, _oc, f, dia, hora) =>
    ctx.indisponiveis.has(`${f.professorId}:${dia}:${hora}`) ? { regra: "D4", professorId: f.professorId } : null,
  (_ctx, oc, f, dia, hora) => {
    const aula = oc.doProfessor(f.professorId, dia, hora);
    return aula ? { regra: "D2", aula } : null;
  },
  (ctx, oc, f, dia) => {
    const limite = ctx.maxDias.get(f.professorId);
    if (limite == null) return null;
    const dias = oc.diasDoProfessor(f.professorId);
    // Só um dia NOVO conta: mais aulas num dia em que ele já vem não pesam.
    return !dias.has(dia) && dias.size >= limite ? { regra: "D15", professorId: f.professorId, limite } : null;
  },
];

/** Primeira regra de horário que impede a fatia em (dia, hora). Não olha sala. */
export function impedimentoDeHorario(
  ctx: Contexto,
  oc: Ocupacao,
  f: FatiaRegras,
  dia: number,
  hora: number,
): Motivo | null {
  for (const checar of CHECAGENS) {
    const m = checar(ctx, oc, f, dia, hora);
    if (m) return m;
  }
  return null;
}

/** As salas que atendem o requisito (D6–D8), na ordem de tentativa: ideais primeiro. */
export function salasPossiveis(ctx: Contexto, f: FatiaRegras): SalaAceita[] {
  if (!f.exigeSala) return [];
  if (f.tipoSala) return ctx.salas.filter((s) => s.tipo === f.tipoSala).map((s) => ({ id: s.id, preferencia: 1 }));
  if (f.salas.length > 0) return [...f.salas].sort((a, b) => a.preferencia - b.preferencia);
  return ctx.salas.map((s) => ({ id: s.id, preferencia: 1 }));
}

/**
 * A sala da aula: a `preferida` (a da aula vizinha, para não trocar de sala no
 * meio do bloco) se servir e estiver livre, senão a primeira possível e livre.
 * `null` = a fatia não usa sala; `undefined` = nenhuma serve.
 */
export function escolherSala(
  ctx: Contexto,
  oc: Ocupacao,
  f: FatiaRegras,
  dia: number,
  hora: number,
  preferida: number | null = null,
): number | null | undefined {
  if (!f.exigeSala) return null;
  const possiveis = salasPossiveis(ctx, f);
  const livre = (id: number) => oc.daSala(id, dia, hora) === undefined;
  if (preferida != null && possiveis.some((s) => s.id === preferida) && livre(preferida)) return preferida;
  return possiveis.find((s) => livre(s.id))?.id;
}

/** Por que a fatia não pode ir a (dia, hora), sala incluída. `null` = pode. */
export function impedimento(ctx: Contexto, oc: Ocupacao, f: FatiaRegras, dia: number, hora: number): Motivo | null {
  const m = impedimentoDeHorario(ctx, oc, f, dia, hora);
  if (m) return m;
  if (escolherSala(ctx, oc, f, dia, hora) !== undefined) return null;
  // Dizer QUAL sala e por quem está tomada: "nenhuma sala livre" não sugere o
  // que fazer a seguir.
  const primeira = salasPossiveis(ctx, f)[0];
  const tomada = primeira ? oc.daSala(primeira.id, dia, hora) : undefined;
  return tomada ? { regra: "D3", aula: tomada } : { regra: "D3-sem-sala" };
}

function salaServe(ctx: Contexto, f: FatiaRegras, salaId: number | null): boolean {
  if (!f.exigeSala) return salaId == null;
  return salaId != null && salasPossiveis(ctx, f).some((s) => s.id === salaId);
}

/**
 * Tudo o que uma aula JÁ GRAVADA viola, contra a ocupação sem ela mesma.
 * Serve ao diagnóstico da grade manual e à revalidação ao editar o cadastro.
 */
export function violacoesDaAula(ctx: Contexto, oc: Ocupacao, f: FatiaRegras, aula: AulaOcupada): Motivo[] {
  oc.retirar(aula);
  try {
    const saida: Motivo[] = [];
    for (const checar of CHECAGENS) {
      const m = checar(ctx, oc, f, aula.dia, aula.hora);
      if (!m) continue;
      saida.push(m);
      if (m.regra === "faixa") return saida;
    }
    if (!salaServe(ctx, f, aula.salaId)) {
      saida.push({ regra: "sala-invalida", salaId: aula.salaId });
    } else if (aula.salaId != null) {
      const tomada = oc.daSala(aula.salaId, aula.dia, aula.hora);
      if (tomada) saida.push({ regra: "D3", aula: tomada });
    }
    return saida;
  } finally {
    oc.colocar(aula);
  }
}
```

Run: `npx vitest run src/regras/impedimentos.test.ts` → PASS.

- [ ] **Passo 6: descrever (teste → código)**

`src/regras/descrever.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aulaOcupada } from "../../testes/suporte/regras";
import { curto, descrever, type Nomes } from "./descrever";

const nomes: Nomes = {
  cursoAtual: 1,
  professor: () => "Ana Maria Souza",
  curso: (id) => (id === 2 ? "Beta" : "Alfa"),
  sala: () => "A01",
};

describe("descrever", () => {
  it("encurta o nome", () => {
    expect(curto("Ana Maria Souza")).toBe("A. Souza");
    expect(curto("Ana")).toBe("Ana");
  });

  it("professor no mesmo curso e em outro", () => {
    expect(descrever({ regra: "D2", aula: aulaOcupada({ periodo: 2 }) }, nomes)).toBe("A. Souza no 2º período");
    expect(descrever({ regra: "D2", aula: aulaOcupada({ cursoId: 2 }) }, nomes)).toBe("A. Souza em Beta (1º)");
  });

  it("sala tomada no mesmo curso e em outro", () => {
    expect(descrever({ regra: "D3", aula: aulaOcupada({ salaId: 1, periodo: 3 }) }, nomes)).toBe("Sala A01 ocupada (3º per.)");
    expect(descrever({ regra: "D3", aula: aulaOcupada({ cursoId: 2, salaId: 1 }) }, nomes)).toBe("Sala A01 ocupada (Beta, 1º)");
  });

  it("regras de cadastro", () => {
    expect(descrever({ regra: "D15", professorId: 1, limite: 2 }, nomes)).toBe("A. Souza no máx. de 2 dia(s)");
    expect(descrever({ regra: "D5-turno", turnosSabado: ["manha"] }, nomes)).toBe("Sábado só tem aula de manhã");
    expect(descrever({ regra: "D14", turno: "tarde" }, nomes)).toBe("Disciplina só à tarde");
    expect(descrever({ regra: "D14", turno: "manha" }, nomes)).toBe("Disciplina só de manhã");
    expect(descrever({ regra: "D4", professorId: 1 }, nomes)).toBe("A. Souza indisponível");
    expect(descrever({ regra: "D5" }, nomes)).toBe("Sábado desmarcado no cadastro");
  });
});
```

`src/regras/descrever.ts`:

```ts
import type { Motivo, Turno } from "./tipos";

/** "Marina Sousa" → "M. Sousa": a célula é estreita e o sobrenome basta. */
export function curto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return nome;
  return `${partes[0][0]}. ${partes[partes.length - 1]}`;
}

/** Como chamar cada id na tela. As regras guardam ids; nomes são da interface. */
export interface Nomes {
  cursoAtual: number;
  professor(id: number): string;
  curso(id: number): string;
  sala(id: number): string;
}

const TURNO: Record<Turno, string> = { manha: "manhã", tarde: "tarde" };

/** O motivo como texto curto, para caber na célula da grade. */
export function descrever(m: Motivo, n: Nomes): string {
  switch (m.regra) {
    case "faixa":
      return "Horário fora da grade";
    case "D16":
      return "Disciplina não ofertada";
    case "D1":
      return "Já há aula neste horário";
    case "D5":
      return "Sábado desmarcado no cadastro";
    case "D5-turno":
      return `Sábado só tem aula de ${m.turnosSabado.map((t) => TURNO[t]).join(" e ")}`;
    case "D13":
      return "Fora dos turnos do curso";
    case "D14":
      return `Disciplina só ${m.turno === "manha" ? "de manhã" : "à tarde"}`;
    case "D4":
      return `${curto(n.professor(m.professorId))} indisponível`;
    case "D2": {
      const quem = curto(n.professor(m.aula.professorId));
      return m.aula.cursoId === n.cursoAtual
        ? `${quem} no ${m.aula.periodo}º período`
        : `${quem} em ${n.curso(m.aula.cursoId)} (${m.aula.periodo}º)`;
    }
    case "D15":
      return `${curto(n.professor(m.professorId))} no máx. de ${m.limite} dia(s)`;
    case "D3": {
      const sala = n.sala(m.aula.salaId!);
      return m.aula.cursoId === n.cursoAtual
        ? `Sala ${sala} ocupada (${m.aula.periodo}º per.)`
        : `Sala ${sala} ocupada (${n.curso(m.aula.cursoId)}, ${m.aula.periodo}º)`;
    }
    case "D3-sem-sala":
      return "Nenhuma sala aceitável livre";
    case "sala-invalida":
      return m.salaId == null ? "Aula sem sala" : `Sala ${n.sala(m.salaId)} fora do requisito`;
  }
}
```

- [ ] **Passo 7: avisos da fatia (teste → código)**

`src/regras/avisos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contextoMinimo } from "../../testes/suporte/regras";
import { avisosDaFatia } from "./avisos";

const turnos = contextoMinimo().turnoDaHora;
const a = (dia: number, hora: number) => ({ dia, hora });

describe("avisosDaFatia", () => {
  it("nada a dizer de uma fatia em padrão cadastrado", () => {
    expect(avisosDaFatia([a(0, 0), a(0, 1), a(2, 0), a(2, 1)], 4, false, ["2+2", "3+1"], turnos)).toEqual([]);
  });

  it("padrão fora da tabela, só quando a fatia está completa", () => {
    expect(avisosDaFatia([a(0, 0), a(1, 0), a(2, 0), a(3, 0)], 4, false, ["2+2"], turnos)).toEqual([
      "padrão 1+1+1+1 não cadastrado",
    ]);
    expect(avisosDaFatia([a(0, 0)], 4, false, ["2+2"], turnos)).toEqual([]);
  });

  it("dois blocos no mesmo dia", () => {
    expect(avisosDaFatia([a(0, 0), a(0, 3)], 4, false, ["2+2"], turnos)).toEqual(["dois blocos no mesmo dia"]);
  });

  it("bloco não atravessa a troca de turno", () => {
    expect(avisosDaFatia([a(0, 5), a(0, 6)], 2, false, ["2"], turnos)).toEqual(["dois blocos no mesmo dia"]);
  });

  it("sem padrão para o total da fatia", () => {
    expect(avisosDaFatia([], 7, false, undefined, turnos)).toEqual(["sem padrão de bloco para 7 aula(s)"]);
  });

  it("blocos livres não tem padrão a cumprir", () => {
    expect(avisosDaFatia([a(0, 0), a(1, 0), a(2, 0)], 3, true, undefined, turnos)).toEqual([]);
  });
});
```

`src/regras/avisos.ts`:

```ts
import type { Turno } from "./tipos";

/**
 * O que a grade manual avisa numa pendência: o que faria o gerador recusar a
 * fatia como está. Não bloqueia — montando à mão, a fatia passa por estados
 * incompletos —, só aponta. `padroes` são os padrões cadastrados para o total
 * da fatia, na forma canônica decrescente ("3+1").
 */
export function avisosDaFatia(
  aulas: { dia: number; hora: number }[],
  total: number,
  blocosLivres: boolean,
  padroes: string[] | undefined,
  turnoDaHora: Map<number, Turno>,
): string[] {
  const avisos: string[] = [];
  if (!blocosLivres && !padroes?.length) avisos.push(`sem padrão de bloco para ${total} aula(s)`);

  const blocos: number[] = [];
  let doisNoDia = false;
  for (const dia of new Set(aulas.map((x) => x.dia))) {
    const horas = aulas.filter((x) => x.dia === dia).map((x) => x.hora).sort((x, y) => x - y);
    let doDia = 0;
    let tamanho = 1;
    for (let i = 1; i <= horas.length; i++) {
      const emenda =
        i < horas.length && horas[i] === horas[i - 1] + 1 && turnoDaHora.get(horas[i]) === turnoDaHora.get(horas[i - 1]);
      if (emenda) tamanho++;
      else {
        blocos.push(tamanho);
        doDia++;
        tamanho = 1;
      }
    }
    if (doDia > 1) doisNoDia = true;
  }
  if (doisNoDia) avisos.push("dois blocos no mesmo dia");

  if (!blocosLivres && padroes?.length && aulas.length === total) {
    const usado = blocos.sort((x, y) => y - x).join("+");
    if (!padroes.includes(usado)) avisos.push(`padrão ${usado} não cadastrado`);
  }
  return avisos;
}
```

- [ ] **Passo 8: rodar e commitar**

Run: `npm run typecheck && npx vitest run src/regras`
Expected: PASS.

```bash
git add src/regras testes/suporte/regras.ts
git commit -m "Módulo de regras compartilhado: ocupação, impedimentos, salas e descrição dos motivos"
```

---

### Tarefa 3: Contexto do banco e problema do solver sobre os tipos novos

**Arquivos:**
- Criar: `src/regras/carregar.ts`, `src/solver/contexto.ts`, `src/solver/carregar.test.ts`
- Modificar: `src/solver/tipos.ts`, `src/solver/carregar.ts`, `src/solver/solver.ts` (só `salasDe`), `src/solver/conferir.ts` (só `requisitoDeSala`), `src/tipos.ts`, `testes/suporte/problema.ts`, `src/solver/solver.test.ts` e `src/solver/conferir.test.ts` (literais `salas: [n]`)

**Interfaces:**
- Consome: `criarContexto`, `Contexto`, `FatiaRegras`, `SalaAceita`, `AulaOcupada`, `Turno` (Tarefa 2).
- Produz:
  - `src/regras/carregar.ts`: `export type Leitor = <T>(sql: string, params?: unknown[]) => Promise<T[]>;` e `export async function carregarContexto(cursoId: number, ler: Leitor): Promise<Contexto>`.
  - `src/solver/tipos.ts`: `Fatia extends FatiaRegras { nome; aulas; optativa; prioridade; blocosLivres }`; `Problema` ganha `cursoId: number`, `turnosDoCurso: Turno[]`, `externas: AulaOcupada[]`.
  - `src/solver/contexto.ts`: `export function contextoDe(p: Problema): Contexto`.
  - `src/solver/carregar.ts` continua exportando `Leitor` (re-export) e `carregarProblema(cursoId, ler = consultar)`.

- [ ] **Passo 1: teste de carga (falha)**

`src/solver/carregar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { criarBanco, lerDe } from "../../testes/suporte/banco";
import { carregarProblema } from "./carregar";

describe("carregarProblema", () => {
  it("traz os turnos do curso e nenhum horário noturno", async () => {
    const p = await carregarProblema(1, lerDe(criarBanco()));
    expect(p.cursoId).toBe(1);
    expect(p.turnosDoCurso).toEqual(["manha", "tarde"]);
    expect(p.horarios).toHaveLength(12);
    expect(p.externas).toEqual([]);
  });

  it("deixa de fora a disciplina não ofertada", async () => {
    const db = criarBanco();
    const { id } = db.prepare("SELECT id FROM disciplinas WHERE curso_id = 1 ORDER BY id LIMIT 1").get() as { id: number };
    db.prepare("UPDATE disciplinas SET ofertada = 0 WHERE id = ?").run(id);
    const p = await carregarProblema(1, lerDe(db));
    expect(p.fatias.some((f) => f.disciplinaId === id)).toBe(false);
    expect(p.fatias.every((f) => f.ofertada)).toBe(true);
  });

  it("traz as aulas dos outros cursos e a preferência de sala", async () => {
    const db = criarBanco();
    const { id: d } = db.prepare("SELECT id FROM disciplinas WHERE curso_id = 1 AND exige_sala = 1 ORDER BY id LIMIT 1").get() as {
      id: number;
    };
    db.exec(`
      INSERT INTO cursos (id, nome) VALUES (2, 'Outro');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (2, 1, 'manha');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (9001, 2, 'X', 1, 1);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (9001, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (2, 1, 0, 0, 9001, 1);
    `);
    db.prepare("INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (?, 1, 2)").run(d);
    const p = await carregarProblema(1, lerDe(db));
    expect(p.externas).toEqual([
      { cursoId: 2, periodo: 1, dia: 0, hora: 0, disciplinaId: 9001, professorId: 1, salaId: null },
    ]);
    expect(p.fatias.find((f) => f.disciplinaId === d)?.salas).toEqual([{ id: 1, preferencia: 2 }]);
  });
});
```

Run: `npx vitest run src/solver/carregar.test.ts` → FAIL (campos não existem).

- [ ] **Passo 2: `src/regras/carregar.ts`**

```ts
import { criarContexto, type Contexto, type HorarioRegra, type Turno } from "./tipos";

/** Como ler do banco. No app é a pool do plugin SQL; nos testes e no benchmark, `node:sqlite`. */
export type Leitor = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

const lista = (texto: string | undefined, padrao: string) =>
  (texto ?? padrao).split(",").filter(Boolean) as Turno[];

/**
 * O contexto das regras, montado por um SQL só para o solver e para a grade
 * manual — senão cada um volta a ter a sua cópia e elas divergem.
 */
export async function carregarContexto(cursoId: number, ler: Leitor): Promise<Contexto> {
  const config = async (chave: string) =>
    (await ler<{ valor: string }>("SELECT valor FROM configuracao WHERE chave = ?", [chave]))[0]?.valor;

  const [curso] = await ler<{ turnos: string }>("SELECT turnos FROM cursos WHERE id = ?", [cursoId]);
  const horarios = await ler<HorarioRegra>("SELECT indice, turno FROM horarios ORDER BY indice");
  const indisponiveis = await ler<{ professor_id: number; dia: number; hora: number }>(
    "SELECT professor_id, dia, hora FROM indisponibilidades",
  );
  const limites = await ler<{ id: number; max_dias_semana: number }>(
    "SELECT id, max_dias_semana FROM professores WHERE max_dias_semana IS NOT NULL",
  );

  return criarContexto({
    cursoId,
    dias: Number((await config("dias_letivos")) ?? 6),
    horarios,
    turnosDoCurso: lista(curso?.turnos, "manha,tarde"),
    turnosSabado: lista(await config("turnos_sabado"), "manha"),
    indisponiveis: new Set(indisponiveis.map((i) => `${i.professor_id}:${i.dia}:${i.hora}`)),
    maxDias: new Map(limites.map((p) => [p.id, p.max_dias_semana])),
    salas: await ler<{ id: number; tipo: string }>("SELECT id, tipo FROM salas ORDER BY id"),
  });
}
```

O SQL `SELECT indice, turno FROM horarios ORDER BY indice` tem de começar exatamente assim: o teste B5 injeta a falha por esse prefixo.

- [ ] **Passo 3: tipos do solver**

Em `src/solver/tipos.ts`:
- troque `export type Turno = "manha" | "tarde" | "noite";` por:
  ```ts
  import type { AulaOcupada, FatiaRegras, HorarioRegra, Turno } from "../regras/tipos";
  export type { Turno } from "../regras/tipos";
  ```
- `HorarioDoDia` vira `export type HorarioDoDia = HorarioRegra;`
- `Fatia` passa a:
  ```ts
  /**
   * A unidade que o solver aloca: a fatia de uma disciplina que pertence a um
   * professor. Uma disciplina dividida entre dois professores são duas fatias
   * independentes, cada uma com seus próprios blocos. Os campos de regra vêm
   * de `FatiaRegras`; aqui só o que é do solver.
   */
  export interface Fatia extends FatiaRegras {
    nome: string;
    aulas: number;
    /** Optativa vai ao contraturno sem custo; ver `custo.ts`. */
    optativa: boolean;
    prioridade: number;
    blocosLivres: boolean;
  }
  ```
- em `Problema`, acrescente no início `cursoId: number;` e, depois de `turnosSabado`:
  ```ts
  /** Turnos que o curso ocupa (D13). */
  turnosDoCurso: Turno[];
  /** Aulas dos outros cursos: ocupam professor e sala (D2, D3). */
  externas: AulaOcupada[];
  ```

`src/solver/contexto.ts`:

```ts
import { criarContexto, type Contexto } from "../regras/tipos";
import type { Problema } from "./tipos";

/** O contexto das regras a partir do problema — que é serializável e por isso não guarda Set nem Map. */
export function contextoDe(p: Problema): Contexto {
  return criarContexto({
    cursoId: p.cursoId,
    dias: p.dias,
    horarios: p.horarios,
    turnosDoCurso: p.turnosDoCurso,
    turnosSabado: p.turnosSabado,
    indisponiveis: new Set(p.indisponiveis),
    maxDias: new Map(p.professores.filter((x) => x.maxDias != null).map((x) => [x.id, x.maxDias!])),
    salas: p.salas,
  });
}
```

- [ ] **Passo 4: `carregarProblema`**

Reescreva `src/solver/carregar.ts`:

```ts
import { consultar } from "../db";
import { carregarContexto, type Leitor } from "../regras/carregar";
import type { AulaOcupada, SalaAceita } from "../regras/tipos";
import type { Alocacao, Fatia, PadraoDeBloco, Problema, Turno } from "./tipos";

export type { Leitor } from "../regras/carregar";

/**
 * Monta o problema a partir do banco. A leitura é injetável para que os testes
 * e o benchmark (`scripts/bench_solver.ts`) montem o problema pelo MESMO SQL
 * que o app usa — sem uma segunda implementação para manter em sincronia.
 */
export async function carregarProblema(cursoId: number, ler: Leitor = consultar): Promise<Problema> {
  const ctx = await carregarContexto(cursoId, ler);

  const periodos = (
    await ler<{ numero: number; turno: Turno; max_disciplinas_contraturno: number }>(
      "SELECT numero, turno, max_disciplinas_contraturno FROM periodos WHERE curso_id = ? ORDER BY numero",
      [cursoId],
    )
  ).map((p) => ({ numero: p.numero, turno: p.turno, maxContraturno: p.max_disciplinas_contraturno }));

  const salasEspecificas = new Map<number, SalaAceita[]>();
  for (const r of await ler<{ disciplina_id: number; sala_id: number; preferencia: number }>(
    `SELECT ds.disciplina_id, ds.sala_id, ds.preferencia FROM disciplina_salas ds
       JOIN disciplinas d ON d.id = ds.disciplina_id WHERE d.curso_id = ?`,
    [cursoId],
  )) {
    const sala: SalaAceita = { id: r.sala_id, preferencia: r.preferencia === 2 ? 2 : 1 };
    salasEspecificas.set(r.disciplina_id, [...(salasEspecificas.get(r.disciplina_id) ?? []), sala]);
  }

  // Disciplina não ofertada (D16) nem entra: não tem aula a distribuir.
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
        WHERE d.curso_id = ? AND d.ofertada = 1`,
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
    ofertada: true,
  }));

  const padroes: Record<number, PadraoDeBloco[]> = {};
  for (const r of await ler<{ aulas: number; padrao: string; custo: number }>(
    "SELECT aulas, padrao, custo FROM padroes_blocos",
  )) {
    (padroes[r.aulas] ??= []).push({ partes: r.padrao.split("+").map(Number), custo: r.custo });
  }

  const professores = (
    await ler<{
      id: number;
      pref_dias: "consecutivos" | "intercalados" | "indiferente";
      pref_dias_peso: number;
      max_dias_semana: number | null;
    }>("SELECT id, pref_dias, pref_dias_peso, max_dias_semana FROM professores")
  ).map((p) => ({ id: p.id, prefDias: p.pref_dias, peso: p.pref_dias_peso, maxDias: p.max_dias_semana }));

  type Linha = {
    curso_id: number;
    periodo: number;
    dia: number;
    hora: number;
    disciplina_id: number;
    professor_id: number;
    sala_id: number | null;
  };
  const aula = (a: Linha): AulaOcupada => ({
    cursoId: a.curso_id,
    periodo: a.periodo,
    dia: a.dia,
    hora: a.hora,
    disciplinaId: a.disciplina_id,
    professorId: a.professor_id,
    salaId: a.sala_id,
  });
  const colunas = "curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id";

  const externas = (await ler<Linha>(`SELECT ${colunas} FROM alocacoes WHERE curso_id <> ?`, [cursoId])).map(aula);
  const fixadas: Alocacao[] = (
    await ler<Linha>(`SELECT ${colunas} FROM alocacoes WHERE curso_id = ? AND fixada = 1`, [cursoId])
  ).map((a) => ({
    periodo: a.periodo,
    dia: a.dia,
    hora: a.hora,
    disciplinaId: a.disciplina_id,
    professorId: a.professor_id,
    salaId: a.sala_id,
  }));

  return {
    cursoId,
    dias: ctx.dias,
    horarios: ctx.horarios,
    periodos,
    fatias,
    padroes,
    salas: ctx.salas,
    professores,
    indisponiveis: [...ctx.indisponiveis],
    turnosSabado: ctx.turnosSabado,
    turnosDoCurso: ctx.turnosDoCurso,
    externas,
    fixadas,
  };
}
```

- [ ] **Passo 5: ajustes mínimos de compilação no solver e no conferir**

`src/solver/solver.ts`, função `salasDe`: troque `if (f.salas.length > 0) return f.salas;` por `if (f.salas.length > 0) return f.salas.map((s) => s.id);`. (A Tarefa 4 reescreve isto.)

`src/solver/conferir.ts`, função `requisitoDeSala`: troque `!f.salas.includes(salaId)` por `!f.salas.some((s) => s.id === salaId)`.

- [ ] **Passo 6: fábricas e literais de teste**

`testes/suporte/problema.ts`:
- `problemaMinimo` ganha `cursoId: 1,` (primeira chave), `turnosDoCurso: ["manha", "tarde"],` e `externas: [],` antes do `...extra`.
- `fatia()` ganha `ofertada: true,` antes do `...extra`.

Em `src/solver/solver.test.ts` e `src/solver/conferir.test.ts`, todo literal `salas: [n, ...]` passado a `fatia(...)` vira `salas: [{ id: n, preferencia: 1 }, ...]`. Ache-os com `grep -n "salas: \[[0-9]" src/solver/*.test.ts`. Os `salas:` do `problemaMinimo` (lista de `SalaDisponivel`) não mudam.

- [ ] **Passo 7: `src/tipos.ts`**

- Topo: troque o comentário `/** Espelha o esquema em \`scripts/schema.sql\`. */` por `/** Espelha o esquema criado pelas migrações em \`scripts/migracoes/\`. */`.
- `export type Turno = ...` vira `export type { Turno } from "./regras/tipos";` e acrescente `import type { Turno } from "./regras/tipos";` no topo.
- `TURNOS` perde a linha da noite.
- O comentário de `Curso.turnos` vira `/** Turnos que o curso ocupa, em ordem: "manha,tarde", "tarde"… */`.
- `Periodo` perde `permite_contraturno: number;`.
- `Disciplina` ganha, depois de `optativa: number;`:
  ```ts
  /** 0 = não ofertada neste semestre: fica fora da grade e do gerador (D16). */
  ofertada: number;
  ```

- [ ] **Passo 8: rodar**

Run: `npm run typecheck && npm test`
Expected: PASS (o solver ainda ignora `externas`/`turnosDoCurso`; os `it.fails` B1/B4/I1 continuam falhando como esperado). Se `typecheck` acusar `Disciplina` sem `ofertada` em `Disciplinas.tsx` (função `novo`), acrescente `ofertada: 1,` depois de `optativa: 0,` ali.

- [ ] **Passo 9: commit**

```bash
git add src/regras/carregar.ts src/solver src/tipos.ts testes/suporte/problema.ts src/paginas/Disciplinas.tsx
git commit -m "Contexto das regras num SQL só; problema do solver com turnos do curso, aulas externas, oferta e preferência de sala"
```

---

### Tarefa 4: Solver sobre o módulo de regras (B1, B4, I1, B7)

**Arquivos:**
- Modificar: `src/solver/solver.ts`, `src/solver/solver.test.ts`

**Interfaces:**
- Consome: `Ocupacao`, `impedimentoDeHorario`, `salasPossiveis` (Tarefa 2); `contextoDe`, `Problema.externas/cursoId` (Tarefa 3).
- Produz: `resolver(problema, opcoes)` com a mesma assinatura; regras D2/D3 entre cursos, D13, D14, D15 e D16 respeitadas; `Resultado.passos` não vaza na melhoria.

- [ ] **Passo 1: testes (falham)**

Em `src/solver/solver.test.ts`:
1. No bloco `describe("bugs conhecidos ...")`, troque os três `it.fails(` por `it(` e o título do `describe` para `"bugs corrigidos no subprojeto 1"`. Mude os títulos dos `describe` internos para afirmações (`"B1 — só aloca nos turnos do curso"`, `"B4 — max_dias_semana é regra dura"`, `"I1 — respeita as aulas dos outros cursos"`).
2. Acrescente `import type { AulaOcupada } from "../regras/tipos";` aos imports e, ao `describe("solver atual — cenários mínimos")`:

```ts
  it("turno forçado é regra: nunca sai dele", () => {
    const p = problemaMinimo({ fatias: [fatia({ turno: "tarde" })] });
    const r = resolver(p);
    expect(r.alocacoes).toHaveLength(2);
    expect(r.alocacoes.every((a) => a.hora >= 6)).toBe(true);
  });

  it("turno forçado sem horário livre fica de fora em vez de ir ao outro turno", () => {
    const manha: [number, number][] = [];
    for (let d = 0; d < 6; d++) for (let h = 0; h < 6; h++) manha.push([d, h]);
    const p = problemaMinimo({ fatias: [fatia({ turno: "tarde" })], indisponiveis: indisponivelExceto(1, 6, manha) });
    const r = resolver(p);
    expect(r.completo).toBe(false);
    expect(r.alocacoes).toEqual([]);
  });

  it("vai para a sala ideal antes da aceitável", () => {
    const p = problemaMinimo({
      salas: [1, 2].map((id) => ({ id, tipo: "Sala de Aula" })),
      fatias: [
        fatia({
          exigeSala: true,
          salas: [
            { id: 1, preferencia: 2 },
            { id: 2, preferencia: 1 },
          ],
        }),
      ],
    });
    expect(resolver(p).alocacoes.map((a) => a.salaId)).toEqual([2, 2]);
  });

  it("não usa sala ocupada por outro curso", () => {
    const externas: AulaOcupada[] = [];
    for (let d = 0; d < 6; d++)
      for (let h = 0; h < 12; h++)
        if (!(d === 3 && h < 2)) externas.push({ cursoId: 2, periodo: 1, dia: d, hora: h, disciplinaId: 9, professorId: 9, salaId: 1 });
    const p = problemaMinimo({
      salas: [{ id: 1, tipo: "Sala de Aula" }],
      professores: [
        { id: 1, prefDias: "indiferente", peso: 0, maxDias: null },
        { id: 9, prefDias: "indiferente", peso: 0, maxDias: null },
      ],
      fatias: [fatia({ exigeSala: true })],
      externas,
    });
    const r = resolver(p);
    expect(r.alocacoes).toEqual([aula(3, 0, { salaId: 1 }), aula(3, 1, { salaId: 1 })]);
  });

  it("max_dias_semana: a segunda disciplina reaproveita os dias da primeira", () => {
    const p = problemaMinimo({
      professores: [{ id: 1, prefDias: "indiferente", peso: 0, maxDias: 2 }],
      fatias: [fatia({ aulas: 4 }), fatia({ disciplinaId: 2, aulas: 2 })],
    });
    const r = resolver(p);
    expect(r.completo).toBe(true);
    expect(new Set(r.alocacoes.map((a) => a.dia)).size).toBeLessThanOrEqual(2);
  });
```

3. Acrescente ao `describe("solver atual — massa real")`:

```ts
  it("B7: rodada de melhoria que falha não consome o orçamento da busca", async () => {
    const p = await problemaDaMassa();
    const base = resolver(p, { rodadasDeMelhoria: 0 });
    // Teto logo acima do que a construção gastou: toda recolocação estoura e
    // falha. Sem a correção, os passos da rodada falha ficavam somados.
    const r = resolver(p, { rodadasDeMelhoria: 50, maxPassos: base.passos + 50 });
    expect(r.passos).toBe(base.passos);
  });
```

Run: `npx vitest run src/solver/solver.test.ts`
Expected: FAIL (turno forçado, sala ideal, externas, max dias, B1/B4/I1 e B7).

- [ ] **Passo 2: reescrever o núcleo do `solver.ts`**

Imports no topo:

```ts
import { impedimentoDeHorario, salasPossiveis } from "../regras/impedimentos";
import { Ocupacao } from "../regras/ocupacao";
import type { AulaOcupada } from "../regras/tipos";
import { blocoCabeNoDia, padroesDe } from "./blocos";
import { contextoDe } from "./contexto";
import { custoTotal } from "./custo";
```

Troque a classe `Estado` por:

```ts
/**
 * Estado mutável da busca. A ocupação é a do módulo de regras — a mesma que a
 * grade manual monta —, já com as aulas dos outros cursos e as fixadas.
 */
class Estado {
  oc: Ocupacao;
  colocados = new Map<string, Bloco[]>(); // fatia -> blocos

  constructor(problema: Problema) {
    this.oc = new Ocupacao(problema.cursoId, problema.externas);
    for (const a of problema.fixadas) this.oc.colocar({ ...a, cursoId: problema.cursoId });
  }
}
```

Dentro de `resolver`, depois de `const turnoDoPeriodo = ...`, troque `salasDe`, `salasPorFatia` e `livre` por:

```ts
  const ctx = contextoDe(problema);

  /** Salas que atendem o requisito, ideais primeiro (D6–D8). */
  const salasPorFatia = new Map(problema.fatias.map((f) => [idDe(f), salasPossiveis(ctx, f).map((s) => s.id)]));
  const aceitaveis = new Map(
    problema.fatias.map((f) => [idDe(f), new Set(f.salas.filter((s) => s.preferencia === 2).map((s) => s.id))]),
  );

  /**
   * A sala em que o bloco inteiro cabe, `null` se a fatia não usa sala, ou
   * `undefined` se o bloco não pode ir ali. As regras de horário são as do
   * módulo compartilhado com a grade manual.
   */
  function livre(e: Estado, f: Fatia, dia: number, h0: number, tam: number): number | null | undefined {
    for (let i = 0; i < tam; i++) {
      if (impedimentoDeHorario(ctx, e.oc, f, dia, problema.horarios[h0 + i].indice)) return undefined;
    }
    if (!f.exigeSala) return null;
    for (const s of salasPorFatia.get(idDe(f))!) {
      let cabe = true;
      for (let i = 0; i < tam && cabe; i++) {
        if (e.oc.daSala(s, dia, problema.horarios[h0 + i].indice)) cabe = false;
      }
      if (cabe) return s;
    }
    return undefined;
  }
```

Troque `buracosDoDia` por (o comportamento é o mesmo de antes, B6 incluído, agora lendo a `Ocupacao`):

```ts
  /**
   * Quantos horários vagos existem entre a primeira e a última aula do dia.
   *
   * B6, conhecido e deixado para o solver v2: a mesma `chave` é procurada como
   * período E como professor, então o professor 3 enxerga as aulas do 3º
   * período e vice-versa. Corrigir só isto piorou o custo médio do benchmark
   * (619 → 838): a nota local está desalinhada do objetivo, e o conserto de
   * verdade é reescrever a busca (subprojeto 3).
   */
  function buracosDoDia(e: Estado, chave: number, dia: number, extras: number[]): number {
    const horas: number[] = [...extras];
    for (const h of problema.horarios) {
      if (e.oc.noPeriodo(chave, dia, h.indice) || e.oc.doProfessor(chave, dia, h.indice)) horas.push(h.indice);
    }
    if (horas.length === 0) return 0;
    horas.sort((a, b) => a - b);
    return horas[horas.length - 1] - horas[0] + 1 - horas.length;
  }
```

Troque `pontuar` por (agora recebe a sala):

```ts
  /** Custo local aproximado: serve só para ordenar candidatos, não para decidir. */
  function pontuar(e: Estado, f: Fatia, dia: number, h0: number, tam: number, sala: number | null): number {
    const horas = Array.from({ length: tam }, (_, i) => problema.horarios[h0 + i].indice);
    let p = 0;
    // Optativa no contraturno não custa: quem cobra é `optativaSemTurno`, no
    // custo total. E o buraco que ela abre na turma não é de quem não a cursa.
    if (!f.optativa) {
      const esperado = f.turno ?? turnoDoPeriodo.get(f.periodo);
      for (const h of horas) if (turnoDaHora.get(h) !== esperado) p += pesos.contraturno;
      p += buracosDoDia(e, f.periodo, dia, horas) * pesos.buracoAluno;
    }
    p += buracosDoDia(e, f.professorId, dia, horas) * pesos.buracoProfessor;
    if (sala != null && aceitaveis.get(idDe(f))!.has(sala)) p += tam * pesos.salaAceitavel;
    return f.prioridade === 3 ? p * 0.3 : p;
  }
```

e, em `colocarBlocos`, a chamada vira `nota: pontuar(e, f, dia, h0, tam, sala),`.

Troque `ocupar` por:

```ts
  function aulaDe(f: Fatia, b: Bloco, i: number): AulaOcupada {
    return {
      cursoId: problema.cursoId,
      periodo: f.periodo,
      dia: b.dia,
      hora: problema.horarios[b.horaInicio + i].indice,
      disciplinaId: f.disciplinaId,
      professorId: f.professorId,
      salaId: b.salaId,
    };
  }

  function ocupar(e: Estado, f: Fatia, b: Bloco, ligar: boolean) {
    for (let i = 0; i < b.tamanho; i++) {
      if (ligar) e.oc.colocar(aulaDe(f, b, i));
      else e.oc.retirar(aulaDe(f, b, i));
    }
  }
```

`const estado = new Estado(problema.fixadas);` vira `const estado = new Estado(problema);`.

B7: o laço de melhoria passa a:

```ts
  for (let r = 0; r < rodadas && colocadas.length > 0; r++) {
    const f = colocadas[Math.floor(sorteio() * colocadas.length)];
    const anterior = estado.colocados.get(idDe(f))!;
    retirarFatia(estado, f);
    const antesDosPassos = passos;
    try {
      if (!colocarFatia(estado, f)) {
        // Não recolocou: devolve exatamente onde estava.
        for (const b of anterior) ocupar(estado, f, b, true);
        estado.colocados.set(idDe(f), anterior);
        continue;
      }
      const agora = custoTotal(problema, materializar(estado, problema, fatiasEfetivas), pesos);
      if (agora <= melhor) {
        melhor = agora;
      } else {
        retirarFatia(estado, f);
        for (const b of anterior) ocupar(estado, f, b, true);
        estado.colocados.set(idDe(f), anterior);
      }
    } finally {
      // A melhoria não consome o orçamento da busca — nem quando a rodada
      // falha (B7: antes, a falha deixava os passos somados e as rodadas
      // seguintes estouravam o teto em cascata).
      passos = antesDosPassos;
    }
  }
```

`pesos.salaAceitavel` ainda não existe em `Pesos`: a Tarefa 5 o cria. Para esta tarefa compilar, acrescente já a `Pesos` em `src/solver/tipos.ts` o campo `salaAceitavel: number;` e a `PESOS_PADRAO` o valor `salaAceitavel: 2,`, e em `src/solver/blocos.test.ts` (objeto de pesos da linha ~27) `salaAceitavel: 0,`.

- [ ] **Passo 3: rodar**

Run: `npm run typecheck && npx vitest run src/solver`
Expected: PASS, incluindo B1, B4 e I1 sem `it.fails`. Se o teste "fecha a grade sem violar regra dura" acusar violação nova, a falha está no solver (o `conferir` ainda não conhece as regras novas, então não pode ser ele).

- [ ] **Passo 4: medir o tempo**

Run: `npm run bench:solver` (sem `--salvar`) e compare a coluna `ms` com `testes/benchmark/linha-de-base.md`. Anote no relatório da tarefa as medianas antes e depois. Piora acima de 20% na mediana: investigar antes de seguir (perfilar `impedimentoDeHorario` e `Ocupacao`).

- [ ] **Passo 5: commit**

```bash
git add src/solver
git commit -m "Solver sobre o módulo de regras: turnos do curso, turno forçado, máx. de dias e outros cursos (B1, B4, I1, B7)"
```

---

### Tarefa 5: Custos — optativa, sala aceitável e máx. de dias fora do custo

**Arquivos:**
- Modificar: `src/solver/custo.ts`, `src/solver/tipos.ts` (`Pesos`, `PESOS_PADRAO`), `src/solver/blocos.test.ts`
- Criar: `src/solver/custo.test.ts`

**Interfaces:**
- Produz: `Pesos = { buracoProfessor; buracoAluno; contraturno; preferenciaDias; excessoContraturno; optativaSemTurno; salaAceitavel }`; `custoTotal(problema, alocacoes, pesos)` e `buracos(...)` com as mesmas assinaturas.

- [ ] **Passo 1: testes (falham)**

`src/solver/custo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aula, fatia, problemaMinimo } from "../../testes/suporte/problema";
import { custoTotal } from "./custo";
import type { Pesos } from "./tipos";

const ZERO: Pesos = {
  buracoProfessor: 0,
  buracoAluno: 0,
  contraturno: 0,
  preferenciaDias: 0,
  excessoContraturno: 0,
  optativaSemTurno: 0,
  salaAceitavel: 0,
};
const so = (extra: Partial<Pesos>): Pesos => ({ ...ZERO, ...extra });

const opt = (disciplinaId: number) => fatia({ disciplinaId, professorId: disciplinaId, optativa: true });
const daOpt = (disciplinaId: number, dia: number, hora: number) => aula(dia, hora, { disciplinaId, professorId: disciplinaId });

describe("custoTotal", () => {
  it("optativa no contraturno não paga contraturno nem excesso", () => {
    const p = problemaMinimo({ fatias: [opt(1)] });
    const grade = [daOpt(1, 0, 6), daOpt(1, 0, 7)];
    expect(custoTotal(p, grade, so({ contraturno: 1, excessoContraturno: 1 }))).toBe(0);
  });

  it("obrigatória no contraturno paga as duas coisas", () => {
    const p = problemaMinimo({ fatias: [fatia()] });
    expect(custoTotal(p, [aula(0, 6), aula(0, 7)], so({ contraturno: 1 }))).toBe(2);
    expect(custoTotal(p, [aula(0, 6), aula(0, 7)], so({ excessoContraturno: 1 }))).toBe(1);
  });

  it("optativaSemTurno cobra quando nenhuma optativa do período ficou no turno", () => {
    const p = problemaMinimo({ fatias: [opt(1), opt(2)] });
    const ambasNaTarde = [daOpt(1, 0, 6), daOpt(1, 0, 7), daOpt(2, 1, 6), daOpt(2, 1, 7)];
    const umaDeManha = [daOpt(1, 0, 0), daOpt(1, 0, 1), daOpt(2, 1, 6), daOpt(2, 1, 7)];
    expect(custoTotal(p, ambasNaTarde, so({ optativaSemTurno: 1 }))).toBe(1);
    expect(custoTotal(p, umaDeManha, so({ optativaSemTurno: 1 }))).toBe(0);
  });

  it("optativa só conta como no turno com todas as aulas nele", () => {
    const p = problemaMinimo({ fatias: [opt(1)] });
    expect(custoTotal(p, [daOpt(1, 0, 5), daOpt(1, 0, 6)], so({ optativaSemTurno: 1 }))).toBe(1);
  });

  it("sala aceitável custa por aula", () => {
    const p = problemaMinimo({
      salas: [1, 2].map((id) => ({ id, tipo: "Sala de Aula" })),
      fatias: [
        fatia({
          exigeSala: true,
          salas: [
            { id: 1, preferencia: 1 },
            { id: 2, preferencia: 2 },
          ],
        }),
      ],
    });
    expect(custoTotal(p, [aula(0, 0, { salaId: 2 }), aula(0, 1, { salaId: 2 })], so({ salaAceitavel: 1 }))).toBe(2);
    expect(custoTotal(p, [aula(0, 0, { salaId: 1 }), aula(0, 1, { salaId: 1 })], so({ salaAceitavel: 1 }))).toBe(0);
  });

  it("buraco da turma ignora optativas", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 1 }), opt(2)] });
    const grade = [aula(0, 0), daOpt(2, 0, 3), daOpt(2, 0, 4)];
    expect(custoTotal(p, grade, so({ buracoAluno: 1 }))).toBe(0);
  });

  it("max_dias_semana não entra no custo: é regra dura", () => {
    const p = problemaMinimo({
      professores: [{ id: 1, prefDias: "indiferente", peso: 0, maxDias: 1 }],
      fatias: [fatia()],
    });
    expect(custoTotal(p, [aula(0, 0), aula(1, 0)], so({ preferenciaDias: 1 }))).toBe(0);
  });
});
```

Run: `npx vitest run src/solver/custo.test.ts` → FAIL.

- [ ] **Passo 2: `Pesos` e `PESOS_PADRAO`**

Em `src/solver/tipos.ts`:

```ts
export interface Pesos {
  buracoProfessor: number;
  buracoAluno: number;
  contraturno: number;
  preferenciaDias: number;
  excessoContraturno: number;
  /** Por período cujas optativas ficaram todas fora do turno. */
  optativaSemTurno: number;
  /** Por aula em sala só "aceitável" da lista da disciplina. */
  salaAceitavel: number;
}
```

e em `PESOS_PADRAO` remova `padraoForaDoIdeal` (nunca foi somado: o custo do padrão já ordena as tentativas em `padroesDe`) e acrescente:

```ts
  // Ponto de partida; a calibração fina é do solver v2.
  optativaSemTurno: 40,
  salaAceitavel: 2,
```

Em `src/solver/blocos.test.ts`, remova `padraoForaDoIdeal: 0,` e acrescente `optativaSemTurno: 0,` (o `salaAceitavel: 0` já entrou na Tarefa 4).

- [ ] **Passo 3: `custo.ts`**

Substitua `custoTotal`, `contraturno`, `excessoDeContraturno` e a parte de `maxDias` de `preferenciaDeDias`:

```ts
export function custoTotal(problema: Problema, alocacoes: Alocacao[], pesos: Pesos): number {
  const optativa = optativas(problema);
  const obrigatorias = alocacoes.filter((a) => !optativa.has(a.disciplinaId));
  return (
    buracos(problema, alocacoes, (a) => `p${a.professorId}`) * pesos.buracoProfessor +
    // A turma é quem cursa as obrigatórias. O buraco que uma optativa abre não
    // é de quem não a escolheu — e contá-lo anularia a isenção de contraturno.
    buracos(problema, obrigatorias, (a) => `t${a.periodo}`) * pesos.buracoAluno +
    contraturno(problema, obrigatorias) * pesos.contraturno +
    excessoDeContraturno(problema, obrigatorias) * pesos.excessoContraturno +
    optativaSemTurno(problema, alocacoes) * pesos.optativaSemTurno +
    salaAceitavel(problema, alocacoes) * pesos.salaAceitavel +
    preferenciaDeDias(problema, alocacoes) * pesos.preferenciaDias
  );
}

function optativas(problema: Problema): Set<number> {
  return new Set(problema.fatias.filter((f) => f.optativa).map((f) => f.disciplinaId));
}
```

`contraturno` (recebe só obrigatórias; o resto do corpo fica igual):

```ts
/**
 * Aulas obrigatórias fora do turno do período, descontadas as de turno
 * forçado: forçar é decisão de cadastro, e o turno forçado já é regra dura.
 */
function contraturno(problema: Problema, alocacoes: Alocacao[]): number {
```

`excessoDeContraturno`: o corpo fica igual (já recebe só obrigatórias); atualize o comentário:

```ts
/**
 * Quantas disciplinas obrigatórias a mais do que o permitido escaparam do
 * turno do período — as de turno forçado inclusive, porque o aluno vai e
 * volta do mesmo jeito. Optativas não contam: ver `optativaSemTurno`.
 */
```

Novas funções:

```ts
/**
 * Períodos com optativa ofertada em que nenhuma ficou inteira no turno. O
 * gerador é livre para mandar optativas ao contraturno, mas quem cursa uma só
 * não deveria ter de voltar ao campus por ela.
 */
function optativaSemTurno(problema: Problema, alocacoes: Alocacao[]): number {
  const turnoDaHora = new Map(problema.horarios.map((h) => [h.indice, h.turno]));
  const porDisciplina = new Map<number, Alocacao[]>();
  for (const a of alocacoes) porDisciplina.set(a.disciplinaId, [...(porDisciplina.get(a.disciplinaId) ?? []), a]);

  let n = 0;
  for (const p of problema.periodos) {
    const ids = new Set(problema.fatias.filter((f) => f.optativa && f.periodo === p.numero).map((f) => f.disciplinaId));
    if (ids.size === 0) continue;
    const algumaNoTurno = [...ids].some((id) => {
      const aulas = porDisciplina.get(id) ?? [];
      return aulas.length > 0 && aulas.every((a) => turnoDaHora.get(a.hora) === p.turno);
    });
    if (!algumaNoTurno) n++;
  }
  return n;
}

/** Aulas em sala que a disciplina lista só como "aceitável". */
function salaAceitavel(problema: Problema, alocacoes: Alocacao[]): number {
  const aceitaveis = new Set(
    problema.fatias.flatMap((f) => f.salas.filter((s) => s.preferencia === 2).map((s) => `${f.disciplinaId}:${s.id}`)),
  );
  return alocacoes.filter((a) => a.salaId != null && aceitaveis.has(`${a.disciplinaId}:${a.salaId}`)).length;
}
```

Em `preferenciaDeDias`, apague o bloco `if (prof.maxDias != null && dias.length > prof.maxDias) { ... }` e atualize o comentário da função acrescentando: "O máximo de dias não entra aqui: é regra dura (D15)."

- [ ] **Passo 4: rodar e commitar**

Run: `npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/solver
git commit -m "Custos: optativa livre no contraturno com uma no turno, sala aceitável, turma sem optativas"
```

---

### Tarefa 6: Auditor (`conferir`) aprende as regras novas

**Arquivos:**
- Modificar: `src/solver/conferir.ts`, `src/solver/conferir.test.ts`

**Interfaces:**
- Produz: `TipoViolacao` ganha `"turno-curso" | "turno-forcado" | "max-dias" | "faixa"`. Assinatura de `conferir` igual.

- [ ] **Passo 1: testes (falham)**

Acrescente a `src/solver/conferir.test.ts`:

```ts
  it("acusa professor e sala ocupados por outro curso", () => {
    const externa = { cursoId: 2, periodo: 1, dia: 0, hora: 0, disciplinaId: 9, professorId: 1, salaId: 1 };
    const p = problemaMinimo({
      salas: [{ id: 1, tipo: "Sala de Aula" }],
      fatias: [fatia({ aulas: 1, exigeSala: true })],
      externas: [externa],
    });
    expect(tipos(conferir(p, [aula(0, 0, { salaId: 1 })]))).toEqual(["professor", "sala"]);
  });

  it("acusa aula fora dos turnos do curso", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 1 })], turnosDoCurso: ["manha"] });
    expect(tipos(conferir(p, [aula(0, 6)]))).toEqual(["turno-curso"]);
  });

  it("acusa aula fora do turno forçado", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 1, turno: "tarde" })] });
    expect(tipos(conferir(p, [aula(0, 0)]))).toEqual(["turno-forcado"]);
  });

  it("acusa professor acima do máximo de dias, somando outros cursos", () => {
    const p = problemaMinimo({
      professores: [{ id: 1, prefDias: "indiferente", peso: 0, maxDias: 1 }],
      fatias: [fatia({ aulas: 1 })],
      externas: [{ cursoId: 2, periodo: 1, dia: 3, hora: 0, disciplinaId: 9, professorId: 1, salaId: null }],
    });
    expect(tipos(conferir(p, [aula(0, 0)]))).toEqual(["max-dias"]);
  });

  it("acusa dia, hora ou sala inexistentes", () => {
    const p = problemaMinimo({ dias: 5, fatias: [fatia({ aulas: 1, exigeSala: true })], salas: [{ id: 1, tipo: "Sala de Aula" }] });
    expect(tipos(conferir(p, [aula(5, 0, { salaId: 1 })]))).toContain("faixa");
    expect(tipos(conferir(p, [aula(0, 12, { salaId: 1 })]))).toContain("faixa");
    expect(tipos(conferir(p, [aula(0, 0, { salaId: 7 })]))).toContain("faixa");
  });

  it("fixada só isenta de 'dois blocos no mesmo dia' no dia dela", () => {
    const p = problemaMinimo({ fatias: [fatia({ aulas: 4 })], fixadas: [aula(0, 0)] });
    const noDiaDaFixada = [aula(0, 0), aula(0, 3), aula(2, 0), aula(2, 1)];
    const emOutroDia = [aula(0, 0), aula(2, 0), aula(2, 3), aula(4, 0)];
    expect(tipos(conferir(p, noDiaDaFixada))).toEqual([]);
    expect(tipos(conferir(p, emOutroDia))).toEqual(["padrao"]);
  });
```

Run: `npx vitest run src/solver/conferir.test.ts` → FAIL.

- [ ] **Passo 2: implementar**

Em `src/solver/conferir.ts`:
- `TipoViolacao` ganha `| "turno-curso" | "turno-forcado" | "max-dias" | "faixa"`.
- Depois de `const comFixada = ...`, acrescente:

```ts
  // Isenção de "dois blocos no mesmo dia": a fixada foi posta à mão naquele
  // dia, e o resto da fatia pode ter de encostar nela. Nos outros dias, não.
  const comFixadaNoDia = new Set(problema.fixadas.map((a) => `${chaveFatia(a)}:${a.dia}`));
  const salasExistentes = new Set(problema.salas.map((s) => s.id));
  const professorFora = new Set(problema.externas.map((a) => `${a.professorId}:${a.dia}:${a.hora}`));
  const salaFora = new Set(
    problema.externas.filter((a) => a.salaId != null).map((a) => `${a.salaId}:${a.dia}:${a.hora}`),
  );
```

- No laço `for (const a of alocacoes)`, logo no começo:

```ts
    if (a.dia < 0 || a.dia >= problema.dias || !turnoDaHora.has(a.hora))
      add("faixa", `aula fora da grade em ${a.dia}:${a.hora}`);
    if (a.salaId != null && !salasExistentes.has(a.salaId)) add("faixa", `sala ${a.salaId} não existe`);
    if (professorFora.has(`${a.professorId}:${a.dia}:${a.hora}`))
      add("professor", `professor ${a.professorId} também em outro curso (${a.dia}:${a.hora})`);
    if (a.salaId != null && salaFora.has(`${a.salaId}:${a.dia}:${a.hora}`))
      add("sala", `sala ${a.salaId} também em outro curso (${a.dia}:${a.hora})`);
```

- No mesmo laço, depois de `const turno = turnoDaHora.get(a.hora);`:

```ts
    if (turno && !problema.turnosDoCurso.includes(turno)) add("turno-curso", `${f.nome} fora dos turnos do curso`);
    if (turno && f.turno && turno !== f.turno) add("turno-forcado", `${f.nome} fora do turno ${f.turno}`);
```

  (mova o `const turno = ...` para antes das checagens de sábado, se precisar, mantendo-o depois do `if (!f) { ... continue; }`.)

- Depois do laço, antes do agrupamento por fatia:

```ts
  const diasDoProfessor = new Map<number, Set<number>>();
  for (const a of [...alocacoes, ...problema.externas]) {
    diasDoProfessor.set(a.professorId, (diasDoProfessor.get(a.professorId) ?? new Set()).add(a.dia));
  }
  for (const prof of problema.professores) {
    const usados = diasDoProfessor.get(prof.id)?.size ?? 0;
    if (prof.maxDias != null && usados > prof.maxDias)
      add("max-dias", `professor ${prof.id} em ${usados} dias, máximo ${prof.maxDias}`);
  }
```

- No agrupamento por dia, troque `for (const doDia of agrupar(aulas, (a) => String(a.dia)).values())` por `for (const [dia, doDia] of agrupar(aulas, (a) => String(a.dia)))` e a condição `if (doDiaBlocos.length > 1 && !comFixada.has(k))` por `if (doDiaBlocos.length > 1 && !comFixadaNoDia.has(`${k}:${dia}`))`. A isenção de padrão (`if (f.blocosLivres || comFixada.has(k)) continue;`) fica como está.

- [ ] **Passo 3: rodar e commitar**

Run: `npm run typecheck && npm test`
Expected: PASS (inclui "fecha a grade sem violar regra dura" e o estresse: o solver da Tarefa 4 já respeita as regras que o auditor passou a cobrar).

```bash
git add src/solver/conferir.ts src/solver/conferir.test.ts
git commit -m "Auditor: outros cursos, turnos do curso, turno forçado, máx. de dias, faixa e isenção por dia da fixada"
```

---

### Tarefa 7: Grade manual sobre o módulo de regras (I1, B4, B8)

**Arquivos:**
- Modificar: `src/paginas/GradeManual.tsx`, `src/App.css` (estilos mínimos dos elementos novos), `testes/e2e/bugs-conhecidos.spec.ts`
- Criar: `testes/e2e/grade-manual.spec.ts`

**Interfaces:**
- Consome: `carregarContexto`, `Ocupacao`, `impedimento`, `escolherSala`, `salasPossiveis`, `violacoesDaAula`, `descrever`, `curto`, `Nomes`, `avisosDaFatia`.

- [ ] **Passo 1: e2e (falham)**

Em `testes/e2e/bugs-conhecidos.spec.ts`, apague as linhas `test.fail(...)` dos testes I1 (sala), I1 (professor), B4 e B8.

`testes/e2e/grade-manual.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { celula, contar, irPara } from "./paginas";

const BASE = `
  INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
  INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
`;

test.describe("turno forçado", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, turno) VALUES (1, 1, 'Cálculo', 1, 2, 0, 'tarde');
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);`,
  });

  test("a célula fora do turno forçado diz por quê", async ({ page }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await expect(celula(page, "Segunda", "M1")).toContainText("Disciplina só à tarde");
    await expect(celula(page, "Segunda", "T1")).toContainText("Alocar");
  });
});

test.describe("sala", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (1, 1, 2), (1, 2, 1);`,
  });

  test("a aula vai para a sala ideal", async ({ page, banco }) => {
    await irPara(page, "Manual");
    await page.getByRole("button", { name: /Cálculo/ }).click();
    await celula(page, "Segunda", "M1").click();
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });

  test("a sala se troca pela célula", async ({ page, banco }) => {
    banco.exec(
      "INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id) VALUES (1, 1, 0, 0, 1, 1, 2)",
    );
    await page.reload();
    await irPara(page, "Manual");
    await page.getByRole("button", { name: "Trocar sala de Cálculo" }).click();
    await page.getByRole("combobox", { name: "Sala" }).selectOption({ label: "A01 (aceitável)" });
    await expect.poll(() => contar(banco, "SELECT sala_id FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(1);
  });
});

test.describe("diagnóstico", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Cálculo', 1, 2, 0), (2, 2, 'Física', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id)
        VALUES (1, 1, 0, 0, 1, 1), (2, 1, 0, 0, 2, 1);`,
  });

  test("lista a aula que choca com outro curso", async ({ page }) => {
    await irPara(page, "Manual");
    const resumo = page.getByText("1 aula(s) deste curso violam regra dura");
    await expect(resumo).toBeVisible();
    await resumo.click();
    await expect(page.getByText(/A\. Souza em Beta/)).toBeVisible();
  });
});

test.describe("oferta", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala, ofertada)
        VALUES (1, 1, 'Cálculo', 1, 2, 0, 1), (2, 1, 'Libras', 1, 2, 0, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2), (2, 1, 2);`,
  });

  test("disciplina não ofertada não aparece nas pendências", async ({ page }) => {
    await irPara(page, "Manual");
    await expect(page.getByRole("button", { name: /Cálculo/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Libras/ })).toHaveCount(0);
  });
});

test.describe("avisos da pendência", () => {
  test.use({
    semMassa: true,
    semente: `${BASE}
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 4, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 4);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 0, 3, 1, 1);`,
  });

  test("avisa dois blocos no mesmo dia", async ({ page }) => {
    await irPara(page, "Manual");
    await expect(page.getByText("dois blocos no mesmo dia")).toBeVisible();
  });
});
```

Run: `npx playwright test testes/e2e/grade-manual.spec.ts testes/e2e/bugs-conhecidos.spec.ts`
Expected: FAIL nos testes novos e em I1/B4/B8.

- [ ] **Passo 2: dados da grade manual**

Em `src/paginas/GradeManual.tsx`:

- Remova a função local `curto` (passa a vir de `../regras/descrever`).
- Imports:

```ts
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { consultar, transacao, type Instrucao } from "../db";
import { DIAS, type Horario, type Periodo } from "../tipos";
import { Erro, Vazio, mensagemErro } from "../componentes/ui";
import { avisosDaFatia } from "../regras/avisos";
import { carregarContexto } from "../regras/carregar";
import { curto, descrever, type Nomes } from "../regras/descrever";
import { escolherSala, impedimento, salasPossiveis, violacoesDaAula } from "../regras/impedimentos";
import { Ocupacao } from "../regras/ocupacao";
import type { AulaOcupada, Contexto, FatiaRegras, SalaAceita, Turno } from "../regras/tipos";
```

- Tipos locais:

```ts
/** Uma fatia de disciplina: o par (disciplina, professor) com suas aulas. */
interface Fatia {
  disciplina_id: number;
  professor_id: number;
  disciplina: string;
  disciplina_curta: string;
  professor: string;
  aulas: number;
  periodo: number;
  permite_sabado: number;
  exige_sala: number;
  tipo_sala: string | null;
  turno: Turno | null;
  ofertada: number;
  blocos_livres: number;
}

/** Aula de qualquer curso, com os nomes que a tela mostra. */
interface Aula extends AulaOcupada {
  fixada: number;
  disciplina: string;
  professor: string;
  sala: string | null;
  curso: string;
}
```

- Estado: remova `salas`, `indisponiveis`, `turnosSabado`, `dias` como estados soltos; acrescente:

```ts
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [salasPorDisciplina, setSalasPorDisciplina] = useState<Map<number, SalaAceita[]>>(new Map());
  const [nomesSala, setNomesSala] = useState<Map<number, string>>(new Map());
  const [nomesProfessor, setNomesProfessor] = useState<Map<number, string>>(new Map());
  const [nomesCurso, setNomesCurso] = useState<Map<number, string>>(new Map());
  const [padroes, setPadroes] = useState<Map<number, string[]>>(new Map());
  const [trocando, setTrocando] = useState<string | null>(null);
```

- `carregar()` passa a:

```ts
  const carregar = useCallback(async () => {
    const contexto = await carregarContexto(cursoId, consultar);
    setCtx(contexto);
    // A grade mostra só os turnos que o curso ocupa (D13).
    const todos = await consultar<Horario>("SELECT * FROM horarios ORDER BY indice");
    setHorarios(todos.filter((h) => contexto.turnosDoCurso.includes(h.turno)));

    const ps = await consultar<Periodo>("SELECT * FROM periodos WHERE curso_id = ? ORDER BY numero", [cursoId]);
    setPeriodos(ps);
    setPeriodo((p) => (p != null && ps.some((x) => x.numero === p) ? p : (ps[0]?.numero ?? null)));

    setFatias(
      await consultar<Fatia>(
        `SELECT dp.disciplina_id, dp.professor_id, d.nome AS disciplina,
                COALESCE(NULLIF(d.abreviacao, ''), d.nome) AS disciplina_curta,
                p.nome AS professor, dp.aulas, d.periodo, d.permite_sabado,
                d.exige_sala, d.tipo_sala, d.turno, d.ofertada, d.blocos_livres
           FROM disciplina_professores dp
           JOIN disciplinas d ON d.id = dp.disciplina_id
           JOIN professores p ON p.id = dp.professor_id
          WHERE d.curso_id = ?
          ORDER BY d.periodo, d.nome COLLATE NOCASE, p.nome COLLATE NOCASE`,
        [cursoId],
      ),
    );

    // A grade de TODOS os cursos: professor e sala são da instituição, e um
    // choque com outro curso é tão proibido quanto dentro deste (D2, D3).
    const linhas = await consultar<{
      curso_id: number;
      periodo: number;
      dia: number;
      hora: number;
      disciplina_id: number;
      professor_id: number;
      sala_id: number | null;
      fixada: number;
      disciplina: string;
      professor: string;
      sala: string | null;
      curso: string;
    }>(
      `SELECT a.curso_id, a.periodo, a.dia, a.hora, a.disciplina_id, a.professor_id, a.sala_id,
              a.fixada, COALESCE(NULLIF(d.abreviacao, ''), d.nome) AS disciplina,
              p.nome AS professor, s.nome AS sala, c.nome AS curso
         FROM alocacoes a
         JOIN disciplinas d ON d.id = a.disciplina_id
         JOIN professores p ON p.id = a.professor_id
         JOIN cursos c ON c.id = a.curso_id
         LEFT JOIN salas s ON s.id = a.sala_id`,
    );
    setAulas(
      linhas.map((a) => ({
        cursoId: a.curso_id,
        periodo: a.periodo,
        dia: a.dia,
        hora: a.hora,
        disciplinaId: a.disciplina_id,
        professorId: a.professor_id,
        salaId: a.sala_id,
        fixada: a.fixada,
        disciplina: a.disciplina,
        professor: a.professor,
        sala: a.sala,
        curso: a.curso,
      })),
    );

    const ds = await consultar<{ disciplina_id: number; sala_id: number; preferencia: number }>(
      `SELECT ds.disciplina_id, ds.sala_id, ds.preferencia FROM disciplina_salas ds
         JOIN disciplinas d ON d.id = ds.disciplina_id WHERE d.curso_id = ?`,
      [cursoId],
    );
    const mapa = new Map<number, SalaAceita[]>();
    ds.forEach((r) =>
      mapa.set(r.disciplina_id, [
        ...(mapa.get(r.disciplina_id) ?? []),
        { id: r.sala_id, preferencia: r.preferencia === 2 ? 2 : 1 },
      ]),
    );
    setSalasPorDisciplina(mapa);

    const nomes = async (sql: string) =>
      new Map((await consultar<{ id: number; nome: string }>(sql)).map((r) => [r.id, r.nome]));
    setNomesSala(await nomes("SELECT id, nome FROM salas"));
    setNomesProfessor(await nomes("SELECT id, nome FROM professores"));
    setNomesCurso(await nomes("SELECT id, nome FROM cursos"));

    const pads = new Map<number, string[]>();
    for (const r of await consultar<{ aulas: number; padrao: string }>("SELECT aulas, padrao FROM padroes_blocos"))
      pads.set(r.aulas, [...(pads.get(r.aulas) ?? []), r.padrao]);
    setPadroes(pads);
  }, [cursoId]);
```

- Derivados (substituem `alocadas`, `daGrade`, `fatiasDoPeriodo` antigos):

```ts
  const idFatia = (f: { disciplina_id: number; professor_id: number }) => `${f.disciplina_id}:${f.professor_id}`;
  const idAula = (a: Aula) => `${a.disciplinaId}:${a.professorId}`;
  const doCurso = useMemo(() => aulas.filter((a) => a.cursoId === cursoId), [aulas, cursoId]);
  const oc = useMemo(() => new Ocupacao(cursoId, aulas), [aulas, cursoId]);

  const alocadas = useMemo(() => {
    const m = new Map<string, number>();
    doCurso.forEach((a) => m.set(idAula(a), (m.get(idAula(a)) ?? 0) + 1));
    return m;
  }, [doCurso]);

  const daGrade = useMemo(() => {
    const m = new Map<string, Aula>();
    doCurso.filter((a) => a.periodo === periodo).forEach((a) => m.set(chave(a.dia, a.hora), a));
    return m;
  }, [doCurso, periodo]);

  const regrasDe = useCallback(
    (f: Fatia): FatiaRegras => ({
      disciplinaId: f.disciplina_id,
      professorId: f.professor_id,
      periodo: f.periodo,
      permiteSabado: !!f.permite_sabado,
      turno: f.turno,
      exigeSala: !!f.exige_sala,
      tipoSala: f.tipo_sala,
      salas: salasPorDisciplina.get(f.disciplina_id) ?? [],
      ofertada: !!f.ofertada,
    }),
    [salasPorDisciplina],
  );

  const nomes: Nomes = {
    cursoAtual: cursoId,
    professor: (id) => nomesProfessor.get(id) ?? `#${id}`,
    curso: (id) => nomesCurso.get(id) ?? `#${id}`,
    sala: (id) => nomesSala.get(id) ?? `#${id}`,
  };

  const fatiaDaAula = (a: Aula) => fatias.find((f) => f.disciplina_id === a.disciplinaId && f.professor_id === a.professorId);
  const fatiasDoPeriodo = fatias.filter((f) => f.periodo === periodo && f.ofertada);
  const fatiaEscolhida = fatias.find((f) => idFatia(f) === escolhida) ?? null;

  /** Aulas deste curso que já violam regra dura — dado antigo ou cadastro que mudou. */
  const violacoes = useMemo(() => {
    if (!ctx) return [];
    return doCurso.flatMap((a) => {
      const f = fatiaDaAula(a);
      if (!f) return [];
      const motivos = violacoesDaAula(ctx, oc, regrasDe(f), a);
      return motivos.length ? [{ aula: a, motivos }] : [];
    });
    // fatiaDaAula depende de `fatias`
  }, [ctx, doCurso, oc, regrasDe, fatias]);
```

- `impedimento` local é substituído por:

```ts
  /** Por que esta célula não aceita a fatia escolhida. `null` = aceita. */
  function motivoDe(f: Fatia, dia: number, hora: number): string | null {
    if ((alocadas.get(idFatia(f)) ?? 0) >= f.aulas) return `${f.aulas} de ${f.aulas} aulas já alocadas`;
    if (!ctx) return null;
    const m = impedimento(ctx, oc, regrasDe(f), dia, hora);
    return m ? descrever(m, nomes) : null;
  }
```

  Remova `salasCandidatas` e `salaLivre`. No JSX, `impedimento(fatiaEscolhida, d, l.h.indice)` vira `motivoDe(fatiaEscolhida, d, l.h.indice)`. `dias` passa a ser `ctx?.dias ?? 6` (declare `const dias = ctx?.dias ?? 6;` depois dos derivados).

- [ ] **Passo 3: alocar, trocar sala, limpar período (B8)**

```ts
  async function alocar(dia: number, hora: number) {
    if (!fatiaEscolhida || periodo == null || !ctx) return;
    const motivo = motivoDe(fatiaEscolhida, dia, hora);
    if (motivo) return setErro(motivo);
    setErro("");
    // A sala da aula vizinha da mesma fatia, para o bloco não trocar de sala.
    const vizinha = [hora - 1, hora + 1]
      .map((h) => daGrade.get(chave(dia, h)))
      .find((a) => a && idAula(a) === idFatia(fatiaEscolhida));
    const sala = escolherSala(ctx, oc, regrasDe(fatiaEscolhida), dia, hora, vizinha?.salaId ?? null) ?? null;
    try {
      await transacao([
        {
          sql: `INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [cursoId, periodo, dia, hora, fatiaEscolhida.disciplina_id, fatiaEscolhida.professor_id, sala],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
      await carregar();
    }
  }

  /** Salas que servem à aula e estão livres naquele horário (a dela inclusive). */
  function salasParaTroca(a: Aula): { id: number; rotulo: string }[] {
    const f = fatiaDaAula(a);
    if (!f || !ctx) return [];
    const regras = regrasDe(f);
    const comLista = regras.salas.length > 0;
    return salasPossiveis(ctx, regras)
      .filter((s) => s.id === a.salaId || !oc.daSala(s.id, a.dia, a.hora))
      .map((s) => ({
        id: s.id,
        rotulo: nomes.sala(s.id) + (comLista ? (s.preferencia === 1 ? " (ideal)" : " (aceitável)") : ""),
      }));
  }

  async function trocarSala(a: Aula, salaId: number) {
    setTrocando(null);
    if (salaId === a.salaId) return;
    setErro("");
    try {
      await transacao([
        {
          sql: "UPDATE alocacoes SET sala_id = ? WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
          params: [salaId, cursoId, a.periodo, a.dia, a.hora],
        },
      ]);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A aula"));
    }
  }

  async function limparPeriodo() {
    if (periodo == null) return;
    const fixadas = [...daGrade.values()].filter((a) => a.fixada).length;
    // Fixar protege a aula do gerador; limpar à mão também não a leva (B8).
    if (
      !confirm(
        `Apagar as aulas do ${periodo}º período?` +
          (fixadas ? `\n\nAs ${fixadas} aula(s) fixadas ficam.` : ""),
      )
    )
      return;
    const instrucoes: Instrucao[] = [
      { sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND fixada = 0", params: [cursoId, periodo] },
    ];
    try {
      await transacao(instrucoes);
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e, "A grade"));
    }
  }
```

  `alternarFixada` e `remover` ficam iguais (usam `daGrade`). O botão "Limpar período" fica desabilitado quando `[...daGrade.values()].every((a) => a.fixada)`.

- [ ] **Passo 4: JSX — diagnóstico, faixa, célula, pendências**

- Remova o bloco `semHorariosNoTurno` (e as variáveis `semHorariosNoTurno`, `turnosExistentes`): os horários são fixos, e um período não pode ter turno fora do curso (Tarefa 9).
- Depois de `<Erro>{erro}</Erro>`:

```tsx
      {violacoes.length > 0 && (
        <details className="aviso diagnostico">
          <summary>{violacoes.length} aula(s) deste curso violam regra dura</summary>
          <ul>
            {violacoes.map(({ aula, motivos }) => (
              <li key={`${aula.periodo}:${aula.dia}:${aula.hora}`}>
                {aula.periodo}º · {DIAS[aula.dia]} {codigoDe(aula.hora)} · <strong>{aula.disciplina}</strong>:{" "}
                {motivos.map((m) => descrever(m, nomes)).join("; ")}
              </li>
            ))}
          </ul>
        </details>
      )}
```

  Para o `codigoDe`, guarde também a lista completa de horários (a aula pode estar num turno que o curso não ocupa mais): estado `const [horariosTodos, setHorariosTodos] = useState<Horario[]>([]);`, `setHorariosTodos(todos);` em `carregar`, e
  `const codigoDe = (indice: number) => horariosTodos.find((h) => h.indice === indice)?.codigo ?? String(indice);`.
- Faixa de turno: `nota: h.turno === turnoDoPeriodo ? \`turno do ${periodo}º período\` : "contraturno",`.
- Célula ocupada — troque o `<span className="meta">` por:

```tsx
                            <span className="meta">
                              {curto(aula.professor)}
                              {aula.sala ? " · " : ""}
                              {aula.sala &&
                                (trocando === chave(d, l.h.indice) ? (
                                  <select
                                    aria-label="Sala"
                                    autoFocus
                                    value={aula.salaId ?? ""}
                                    onClick={(ev) => ev.stopPropagation()}
                                    onChange={(ev) => trocarSala(aula, Number(ev.target.value))}
                                    onBlur={() => setTrocando(null)}
                                  >
                                    {salasParaTroca(aula).map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.rotulo}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <button
                                    type="button"
                                    className="trocar-sala"
                                    aria-label={`Trocar sala de ${aula.disciplina}`}
                                    title="Trocar a sala"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setTrocando(chave(d, l.h.indice));
                                    }}
                                  >
                                    {aula.sala}
                                  </button>
                                ))}
                            </span>
```

- Pendência: dentro do `<button className="fatia ...">`, depois de `<span className="prof">`, acrescente:

```tsx
                      {ctx &&
                        avisosDaFatia(
                          [...daGrade.values()].filter((a) => idAula(a) === idFatia(f)),
                          f.aulas,
                          !!f.blocos_livres,
                          padroes.get(f.aulas),
                          ctx.turnoDaHora,
                        ).map((aviso) => (
                          <span key={aviso} className="aviso-fatia">
                            {aviso}
                          </span>
                        ))}
```

- O comentário antigo "precisa das cinco linhas da noite vazias" some com o `carregar` novo.

`src/App.css` — acrescente, perto dos estilos da grade manual:

```css
.trocar-sala {
  all: unset;
  cursor: pointer;
  text-decoration: underline dotted;
}
.aviso-fatia {
  display: block;
  font-size: 0.75em;
  color: var(--aviso, #b45309);
}
.diagnostico ul {
  margin: 0.5em 0 0;
  padding-left: 1.2em;
}
```

(Use a variável de cor de aviso que o `App.css` já define, se houver; confira com `grep -n "\-\-" src/App.css | head`.)

- [ ] **Passo 5: rodar**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: PASS em tudo, inclusive `grade-manual.spec.ts`, `regras.spec.ts` (textos "A. Souza indisponível", "A. Souza no 2º período", "Sábado desmarcado no cadastro") e I1/B4/B8 sem `test.fail`.

- [ ] **Passo 6: commit**

```bash
git add src/paginas/GradeManual.tsx src/App.css testes/e2e/grade-manual.spec.ts testes/e2e/bugs-conhecidos.spec.ts
git commit -m "Grade manual sobre o módulo de regras: outros cursos, máx. de dias, sala preferida e troca, avisos, diagnóstico (I1, B4, B8)"
```

---

### Tarefa 8: Cadastro de disciplinas — oferta, preferência de sala, B3, revalidação, B9

**Arquivos:**
- Modificar: `src/paginas/Disciplinas.tsx`, `src/componentes/RequisitoSala.tsx`, `testes/e2e/bugs-conhecidos.spec.ts` (B3)
- Criar: `testes/e2e/disciplinas.spec.ts`

**Interfaces:**
- Consome: `carregarContexto`, `Ocupacao`, `violacoesDaAula`, `descrever`, tipos de regras.
- Produz: `ValorSala` ganha `aceitaveis?: number[]` (ids de sala com preferência 2).

- [ ] **Passo 1: e2e (falham)**

Em `bugs-conhecidos.spec.ts`, apague o `test.fail(...)` do B3.

`testes/e2e/disciplinas.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { contar, irPara } from "./paginas";

const editar = async (page: import("@playwright/test").Page, nome: string) => {
  await irPara(page, "Disciplinas");
  await page.locator("tr", { has: page.getByText(nome, { exact: true }) }).getByRole("button", { name: "Editar" }).click();
};

test.describe("oferta", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Libras', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 0, 1, 1, 1);`,
  });

  test("desmarcar Ofertada confirma e apaga as aulas", async ({ page, banco }) => {
    const mensagens: string[] = [];
    page.on("dialog", (d) => {
      mensagens.push(d.message());
      d.accept();
    });
    await editar(page, "Libras");
    await page.getByRole("checkbox", { name: /Ofertada/ }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT ofertada FROM disciplinas WHERE id = 1")).toBe(0);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1")).toBe(0);
    expect(mensagens.join("\n")).toMatch(/2 aula\(s\) desta disciplina serão apagadas/);
  });

  test("cancelar a confirmação não muda nada", async ({ page, banco }) => {
    page.on("dialog", (d) => d.dismiss());
    await editar(page, "Libras");
    await page.getByRole("checkbox", { name: /Ofertada/ }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    expect(contar(banco, "SELECT ofertada FROM disciplinas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE disciplina_id = 1")).toBe(2);
  });
});

test.describe("B9", () => {
  test.use({
    semMassa: true,
    semente: `
      DELETE FROM padroes_blocos WHERE aulas = 5;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Projeto', 1, 6);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 5), (1, 2, 1);`,
  });

  test("B9: o aviso de padrão olha a fatia de cada professor", async ({ page, banco }) => {
    expect(contar(banco, "SELECT COUNT(*) FROM padroes_blocos WHERE aulas = 6")).toBeGreaterThan(0);
    await editar(page, "Projeto");
    await expect(page.getByText(/fatia\(s\) de 5 aula\(s\)/)).toBeVisible();
  });
});

test.describe("preferência de sala", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO salas (id, nome, tipo, capacidade) VALUES (1, 'A01', 'Sala de Aula', 40), (2, 'A02', 'Sala de Aula', 40);
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais) VALUES (1, 1, 'Cálculo', 1, 2);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (1, 1, 1), (1, 2, 1);`,
  });

  test("marca uma sala como só aceitável", async ({ page, banco }) => {
    await editar(page, "Cálculo");
    await page.getByLabel("Preferência por A02").selectOption("2");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect
      .poll(() => contar(banco, "SELECT preferencia FROM disciplina_salas WHERE disciplina_id = 1 AND sala_id = 2"))
      .toBe(2);
    expect(contar(banco, "SELECT preferencia FROM disciplina_salas WHERE disciplina_id = 1 AND sala_id = 1")).toBe(1);
  });
});

test.describe("B3 com choque", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza'), (2, 'Bruno Lima');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala)
        VALUES (1, 1, 'Cálculo', 1, 1, 0), (2, 1, 'Física', 2, 1, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1), (2, 2, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id)
        VALUES (1, 1, 0, 0, 1, 1), (1, 2, 0, 0, 2, 2);`,
  });

  test("mudar para um período com o horário ocupado é recusado", async ({ page, banco }) => {
    await editar(page, "Cálculo");
    await page.locator(".modal select").first().selectOption("2");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/2º período já tem aula em Segunda M1/)).toBeVisible();
    expect(contar(banco, "SELECT periodo FROM disciplinas WHERE id = 1")).toBe(1);
    expect(contar(banco, "SELECT periodo FROM alocacoes WHERE disciplina_id = 1")).toBe(1);
  });
});
```

Run: `npx playwright test testes/e2e/disciplinas.spec.ts testes/e2e/bugs-conhecidos.spec.ts -g "oferta|B9|preferência|B3"` → FAIL.

- [ ] **Passo 2: RequisitoSala com preferência**

Em `src/componentes/RequisitoSala.tsx`:
- `ValorSala` ganha:
  ```ts
  /** Das `salas`, as que são só "aceitáveis" (preferência 2); as demais são ideais. */
  aceitaveis?: number[];
  ```
- Em `trocarModo`, todo objeto passado a `aoMudar` ganha `aceitaveis: []`, exceto o ramo `especificas`, que mantém `aceitaveis: valor.aceitaveis ?? []`.
- No modo `especificas`, cada item da grade vira:

```tsx
            {salas.map((s) => {
              const marcada = marcadas.includes(s.id);
              const aceitaveis = valor.aceitaveis ?? [];
              return (
                <div key={s.id} className="escolha-sala">
                  <label>
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() =>
                        aoMudar(
                          {
                            ...valor,
                            salas: marcada ? marcadas.filter((x) => x !== s.id) : [...marcadas, s.id],
                            aceitaveis: aceitaveis.filter((x) => x !== s.id),
                          },
                          modo,
                        )
                      }
                    />
                    <span>
                      {s.nome}
                      <em>
                        {s.tipo} · {s.capacidade}
                      </em>
                    </span>
                  </label>
                  {marcada && (
                    <select
                      className="embutido"
                      aria-label={`Preferência por ${s.nome}`}
                      value={aceitaveis.includes(s.id) ? 2 : 1}
                      onChange={(e) =>
                        aoMudar(
                          {
                            ...valor,
                            aceitaveis:
                              Number(e.target.value) === 2
                                ? [...aceitaveis, s.id]
                                : aceitaveis.filter((x) => x !== s.id),
                          },
                          modo,
                        )
                      }
                    >
                      <option value={1}>ideal</option>
                      <option value={2}>aceitável</option>
                    </select>
                  )}
                </div>
              );
            })}
```

- Acrescente, depois do aviso `marcadas.length === 0`, uma explicação fixa:

```tsx
          <p className="explica">
            O gerador e a grade manual tentam primeiro as salas ideais; as
            aceitáveis entram quando nenhuma ideal está livre.
          </p>
```

- Se a classe `.grade-salas` estilizar `label` filho direto, ajuste o seletor em `src/App.css` para `.grade-salas .escolha-sala` mantendo o visual (confira com `grep -n "grade-salas" src/App.css`).

- [ ] **Passo 3: Disciplinas.tsx — rascunho, carga e marcas**

- `Rascunho` ganha `aceitaveis: number[];`; `novo()` ganha `ofertada: 1,` e `aceitaveis: [],`.
- Estado novo: `const [turnosDoCurso, setTurnosDoCurso] = useState<string[]>(["manha", "tarde"]);`. Em `carregar()`, troque a leitura do curso por:
  ```ts
  const [curso] = await consultar<{ horas_por_aula_semanal: number; turnos: string }>(
    "SELECT horas_por_aula_semanal, turnos FROM cursos WHERE id = ?", [cursoId]);
  setHorasPorAula(curso?.horas_por_aula_semanal || 15);
  setTurnosDoCurso((curso?.turnos ?? "manha,tarde").split(",").filter(Boolean));
  ```
  e o comentário `// Conversão currículo → grade, definida na página Curso.` vira `// Conversão currículo → grade, definida em Gerenciar cursos.`
- `abrir(l)`:
  ```ts
    const ds = await consultar<{ sala_id: number; preferencia: number }>(
      "SELECT sala_id, preferencia FROM disciplina_salas WHERE disciplina_id = ?",
      [l.id],
    );
    const escolhidas = ds.map((s) => s.sala_id);
    setEdicao({
      ...l,
      fatias,
      salas: escolhidas,
      aceitaveis: ds.filter((s) => s.preferencia === 2).map((s) => s.sala_id),
      modoSala: modoDe({ ...l, salas: escolhidas }),
    });
  ```
- `marcasDe` ganha `!l.ofertada ? "não ofertada" : "",` como primeiro item; na coluna Marcas, antes de "sem sala": `{!l.ofertada && <span className="marca-prop">não ofertada</span>}`.
- `aplicarTipo` acrescenta `aceitaveis: [],`.
- `Editor` recebe a prop `turnosDoCurso: string[]` (passe `turnosDoCurso={turnosDoCurso}`).

- [ ] **Passo 4: Disciplinas.tsx — Editor**

- B9: troque `const semPadrao = ...` por:
  ```ts
  // O gerador planeja cada professor separadamente: o padrão que importa é o
  // da fatia, não o do total da disciplina (B9).
  const cargas = valor.fatias.length ? valor.fatias.map((f) => f.aulas) : [valor.aulas_semanais];
  const semPadrao = valor.blocos_livres ? [] : [...new Set(cargas)].filter((n) => !aulasComPadrao.has(n));
  ```
  e o aviso:
  ```tsx
        {semPadrao.length > 0 && (
          <p className="aviso">
            Não há padrões de bloco cadastrados para fatia(s) de {semPadrao.join(", ")} aula(s). O
            gerador planeja cada professor separadamente e não saberá dividir essa carga —
            cadastre os padrões na página Regras, ou marque a disciplina como "blocos livres".
          </p>
        )}
  ```
- Ofertada — logo antes de `<PropriedadesDisciplina`:
  ```tsx
        <div className="marcadores">
          <label>
            <input
              type="checkbox"
              checked={!!valor.ofertada}
              onChange={() => aoMudar({ ...valor, ofertada: valor.ofertada ? 0 : 1 })}
            />
            <span>
              Ofertada neste semestre
              <em>desmarcada, sai da grade, das pendências e do gerador, mas continua cadastrada</em>
            </span>
          </label>
        </div>
  ```
- Turno: a dica vira ``Por padrão segue o período (${turnoPeriodo ?? "—"}). Forçar um turno é regra: o gerador e a grade manual não põem a disciplina fora dele.``, e as opções vêm de `TURNOS.filter((t) => turnosDoCurso.includes(t.valor) || t.valor === valor.turno)` (importe `TURNOS` de `../tipos`), mais a opção `Segue o período`.
- `RequisitoSala.aoMudar` passa a propagar `aceitaveis`: `aoMudar({ ...valor, ...v, salas: v.salas ?? [], aceitaveis: v.aceitaveis ?? [], modoSala: m })`.

- [ ] **Passo 5: Disciplinas.tsx — salvar com B3 e revalidação**

Imports novos:

```ts
import { carregarContexto } from "../regras/carregar";
import { descrever } from "../regras/descrever";
import { violacoesDaAula } from "../regras/impedimentos";
import { Ocupacao } from "../regras/ocupacao";
import type { AulaOcupada, FatiaRegras, Motivo } from "../regras/tipos";
import { DIAS, TURNOS, type Disciplina, type Periodo, type Professor, type Sala, type TipoDisciplina, type Turno } from "../tipos";
```

Constante de módulo:

```ts
/**
 * As regras que uma edição de disciplina pode passar a violar nas aulas que
 * ela já tem. Choques de horário não entram: não mudam com o cadastro, e um
 * choque antigo apareceria aqui como se fosse culpa da edição.
 */
const MUDAM_COM_O_CADASTRO = new Set<Motivo["regra"]>(["D5", "D14", "D16", "sala-invalida"]);
```

Em `salvar(d)`, logo depois das validações (antes de montar `campos`):

```ts
    // Edição de disciplina com aulas: o período leva as aulas junto (B3), e o
    // que a mudança invalida é confirmado e apagado na mesma transação.
    const antes: Instrucao[] = [];
    const depois: Instrucao[] = [];
    if (d.id) {
      const original = linhas.find((l) => l.id === d.id);
      const dela = (
        await consultar<{
          curso_id: number;
          periodo: number;
          dia: number;
          hora: number;
          professor_id: number;
          sala_id: number | null;
          fixada: number;
        }>(
          "SELECT curso_id, periodo, dia, hora, professor_id, sala_id, fixada FROM alocacoes WHERE disciplina_id = ?",
          [d.id],
        )
      ).filter((a) => d.fatias.some((f) => f.professor_id === a.professor_id));

      if (dela.length > 0 && original && original.periodo !== d.periodo) {
        const choques = await consultar<{ dia: number; hora: number; codigo: string }>(
          `SELECT a.dia, a.hora, h.codigo FROM alocacoes a JOIN horarios h ON h.indice = a.hora
            WHERE a.curso_id = ? AND a.periodo = ? AND a.disciplina_id <> ?
              AND EXISTS (SELECT 1 FROM alocacoes b
                           WHERE b.disciplina_id = ? AND b.dia = a.dia AND b.hora = a.hora)
            ORDER BY a.dia, a.hora`,
          [cursoId, d.periodo, d.id, d.id],
        );
        if (choques.length > 0) {
          return setErro(
            `O ${d.periodo}º período já tem aula em ` +
              choques.map((c) => `${DIAS[c.dia]} ${c.codigo}`).join(", ") +
              ". Libere esses horários na grade antes de mudar o período.",
          );
        }
      }

      if (dela.length > 0) {
        const ctx = await carregarContexto(cursoId, consultar);
        const todas = (
          await consultar<{
            curso_id: number;
            periodo: number;
            dia: number;
            hora: number;
            disciplina_id: number;
            professor_id: number;
            sala_id: number | null;
          }>("SELECT curso_id, periodo, dia, hora, disciplina_id, professor_id, sala_id FROM alocacoes")
        ).map(
          (a): AulaOcupada => ({
            cursoId: a.curso_id,
            periodo: a.disciplina_id === d.id ? d.periodo : a.periodo,
            dia: a.dia,
            hora: a.hora,
            disciplinaId: a.disciplina_id,
            professorId: a.professor_id,
            salaId: a.sala_id,
          }),
        );
        const oc = new Ocupacao(cursoId, todas);
        const regras = (professorId: number): FatiaRegras => ({
          disciplinaId: d.id,
          professorId,
          periodo: d.periodo,
          permiteSabado: !!d.permite_sabado,
          turno: d.turno,
          exigeSala: !!d.exige_sala,
          tipoSala: d.tipo_sala,
          salas:
            d.exige_sala && !d.tipo_sala
              ? d.salas.map((id) => ({ id, preferencia: d.aceitaveis.includes(id) ? 2 : 1 }))
              : [],
          ofertada: !!d.ofertada,
        });
        const invalidas = dela.flatMap((a) => {
          const aula: AulaOcupada = {
            cursoId: a.curso_id,
            periodo: d.periodo,
            dia: a.dia,
            hora: a.hora,
            disciplinaId: d.id,
            professorId: a.professor_id,
            salaId: a.sala_id,
          };
          const motivos = violacoesDaAula(ctx, oc, regras(a.professor_id), aula).filter((m) =>
            MUDAM_COM_O_CADASTRO.has(m.regra),
          );
          return motivos.length ? [{ a, motivos }] : [];
        });

        if (invalidas.length > 0) {
          const fixadas = invalidas.filter((x) => x.a.fixada).length;
          const nomes = {
            cursoAtual: cursoId,
            professor: (id: number) => professores.find((p) => p.id === id)?.nome ?? `#${id}`,
            curso: (id: number) => `#${id}`,
            sala: (id: number) => salas.find((s) => s.id === id)?.nome ?? `#${id}`,
          };
          const razoes = [...new Set(invalidas.flatMap((x) => x.motivos.map((m) => descrever(m, nomes))))];
          if (
            !confirm(
              `${invalidas.length} aula(s) desta disciplina serão apagadas, porque deixam de valer com a mudança` +
                (fixadas ? ` (${fixadas} fixada(s))` : "") +
                `:\n\n- ${razoes.join("\n- ")}\n\nContinuar?`,
            )
          )
            return;
          antes.push(
            ...invalidas.map((x) => ({
              sql: "DELETE FROM alocacoes WHERE curso_id = ? AND periodo = ? AND dia = ? AND hora = ?",
              params: [x.a.curso_id, x.a.periodo, x.a.dia, x.a.hora],
            })),
          );
        }
        if (original && original.periodo !== d.periodo) {
          depois.push({
            sql: "UPDATE alocacoes SET periodo = ? WHERE disciplina_id = ?",
            params: [d.periodo, d.id],
          });
        }
      }
    }
```

- `campos` ganha `d.ofertada` depois de `d.optativa`; o UPDATE ganha `ofertada = ?,` depois de `optativa = ?,`; o INSERT ganha a coluna `ofertada` depois de `optativa` e mais um `?` em `VALUES`.
- `instrucoes` passa a `[...antes, <UPDATE/INSERT da disciplina>, ...demais como hoje..., ...depois]` (o `depois` vai por último, depois das salas).
- O INSERT de salas passa a gravar a preferência:
  ```ts
          ...(d.exige_sala && !d.tipo_sala
            ? d.salas.map((sala) => ({
                sql: "INSERT INTO disciplina_salas (disciplina_id, sala_id, preferencia) VALUES (?, ?, ?)",
                params: [id, sala, d.aceitaveis.includes(sala) ? 2 : 1],
              }))
            : []),
  ```

- [ ] **Passo 6: rodar e commitar**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: PASS, B3 sem `test.fail`.

```bash
git add src/paginas/Disciplinas.tsx src/componentes/RequisitoSala.tsx src/App.css testes/e2e/disciplinas.spec.ts testes/e2e/bugs-conhecidos.spec.ts
git commit -m "Disciplinas: oferta, preferência de sala, período leva as aulas, revalidação ao salvar (B3, B9)"
```

---

### Tarefa 9: Cursos, Períodos, Regras, Professores, Indisponibilidades, Automática, Tipos (I2, B5, B10)

**Arquivos:**
- Modificar: `src/paginas/Cursos.tsx`, `src/paginas/Periodos.tsx`, `src/paginas/Instituicao.tsx`, `src/paginas/Professores.tsx`, `src/paginas/Indisponibilidades.tsx`, `src/paginas/GradeAutomatica.tsx`, `src/paginas/Tipos.tsx`, `testes/suporte/ponte.ts`, `testes/e2e/fixtures.ts`, `testes/e2e/bugs-conhecidos.spec.ts`
- Criar: `testes/e2e/cadastros.spec.ts`

- [ ] **Passo 1: registro de chamadas na ponte (para o B10)**

`testes/suporte/ponte.ts`: em `OpcoesPonte` acrescente

```ts
  /** Cada comando recebido é anotado aqui, na ordem — para contar escritas. */
  registro?: string[];
```

e, na função que despacha os comandos (o `switch` com `case "transacao":`), antes do `switch`, `opcoes.registro?.push(cmd);` (use o nome da variável do comando que a função já usa).

`testes/e2e/fixtures.ts`: o tipo do `base.extend` ganha `chamadas: string[]`; acrescente a fixture

```ts
  chamadas: async ({}, use) => {
    await use([]);
  },
```

e o `page` passa a receber `chamadas` e a criar a ponte com `criarPonte(banco, { ...opcoesPonte, registro: chamadas })`.

- [ ] **Passo 2: e2e (falham)**

Em `bugs-conhecidos.spec.ts`:
- B5: apague o `test.fail(...)`.
- I2: troque o corpo do teste por:

```ts
  test("I2: tirar o sábado com aula no sábado avisa, e cancelar não muda nada", async ({ page, banco }) => {
    await irPara(page, "Regras");
    const semana = page.getByLabel("Semana");
    await expect(semana).toBeVisible();
    const mensagem = new Promise<string>((resolve) =>
      page.once("dialog", (d) => {
        resolve(d.message());
        d.dismiss();
      }),
    );
    await semana.selectOption("5");
    expect(await mensagem).toMatch(/aulas? no sábado/i);
    await expect(semana).toHaveValue("6");
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 5")).toBe(1);
    expect(contar(banco, "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'")).toBe(6);
  });

  test("I2: confirmar apaga as aulas do sábado e grava 5 dias", async ({ page, banco }) => {
    aceitarConfirmacoes(page);
    await irPara(page, "Regras");
    await page.getByLabel("Semana").selectOption("5");
    await expect.poll(() => contar(banco, "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'")).toBe(5);
    expect(contar(banco, "SELECT COUNT(*) FROM alocacoes WHERE dia = 5")).toBe(0);
  });
```

`testes/e2e/cadastros.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { aceitarConfirmacoes, celula, contar, irPara } from "./paginas";

test.describe("turnos do curso", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Engenharia' WHERE id = 1;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 1, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 6, 1, 1);`,
  });

  test("tirar a tarde com aula na tarde confirma e apaga", async ({ page, banco }) => {
    const mensagens: string[] = [];
    page.on("dialog", (d) => {
      mensagens.push(d.message());
      d.accept();
    });
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde" }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM alocacoes")).toBe(0);
    expect(mensagens.join("\n")).toMatch(/1 aula no turno da tarde/);
  });
});

test.describe("turno do curso em uso", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Engenharia' WHERE id = 1;
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (1, 2, 'tarde');`,
  });

  test("tirar um turno que um período usa é recusado", async ({ page, banco }) => {
    await irPara(page, "Gerenciar cursos");
    await page.getByRole("row", { name: /Engenharia/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("checkbox", { name: "Tarde" }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/período\(s\) 2º/)).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM cursos WHERE turnos = 'manha,tarde'")).toBe(1);
  });
});

test.describe("máximo de dias", () => {
  test.use({
    semMassa: true,
    semente: `
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (1, 1, 'Cálculo', 1, 2, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (1, 1, 2);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (1, 1, 0, 0, 1, 1), (1, 1, 2, 0, 1, 1);`,
  });

  test("baixar o máximo abaixo dos dias em uso é recusado", async ({ page, banco }) => {
    await irPara(page, "Professores");
    await page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Máximo de dias na semana").fill("1");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/já dá aula em 2 dias/)).toBeVisible();
    expect(contar(banco, "SELECT COUNT(*) FROM professores WHERE max_dias_semana IS NULL")).toBe(1);
  });
});

test.describe("B10", () => {
  test.use({ semMassa: true, semente: "INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');" });

  test("B10: um arrasto grava numa transação só", async ({ page, banco, chamadas }) => {
    await irPara(page, "Indisponibilidades");
    await page.getByRole("button", { name: "Ana Souza" }).click();
    await celula(page, "Segunda", "M1").hover();
    await page.mouse.down();
    await celula(page, "Segunda", "M2").hover();
    await page.mouse.up();
    await expect.poll(() => contar(banco, "SELECT COUNT(*) FROM indisponibilidades")).toBe(2);
    expect(chamadas.filter((c) => c === "transacao")).toHaveLength(1);
  });
});

test.describe("grade automática", () => {
  test.use({
    semMassa: true,
    semente: `
      UPDATE cursos SET nome = 'Alfa' WHERE id = 1;
      INSERT INTO cursos (id, nome) VALUES (2, 'Beta');
      INSERT INTO periodos (curso_id, numero, turno) VALUES (1, 1, 'manha'), (2, 1, 'manha');
      INSERT INTO professores (id, nome) VALUES (1, 'Ana Souza');
      INSERT INTO disciplinas (id, curso_id, nome, periodo, aulas_semanais, exige_sala) VALUES (2, 2, 'Física', 1, 1, 0);
      INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas) VALUES (2, 1, 1);
      INSERT INTO alocacoes (curso_id, periodo, dia, hora, disciplina_id, professor_id) VALUES (2, 1, 0, 0, 2, 1);`,
  });

  test("informa quantas aulas de outros cursos respeita", async ({ page }) => {
    aceitarConfirmacoes(page);
    await irPara(page, "Automática");
    await expect(page.getByText(/1 aula\(s\) de outros cursos respeitadas/)).toBeVisible();
  });
});
```

Run: `npx playwright test testes/e2e/cadastros.spec.ts testes/e2e/bugs-conhecidos.spec.ts` → FAIL nos novos, I2 e B5.

- [ ] **Passo 3: Cursos — turno retirado**

Em `src/paginas/Cursos.tsx`, importe `consultar, transacao, type Instrucao` de `../db` (além de `executar`) e troque o ramo de edição de `salvar` por:

```ts
      if (c.id) {
        const original = linhas.find((l) => l.id === c.id);
        const novos = c.turnos.split(",");
        const retirados = (original?.turnos ?? "").split(",").filter((t) => t && !novos.includes(t));
        const instrucoes: Instrucao[] = [];
        if (retirados.length > 0) {
          const marc = retirados.map(() => "?").join(",");
          const rotulos = retirados.map((t) => TURNOS.find((x) => x.valor === t)?.rotulo.toLowerCase() ?? t).join(" e ");
          const periodos = await consultar<{ numero: number }>(
            `SELECT numero FROM periodos WHERE curso_id = ? AND turno IN (${marc}) ORDER BY numero`,
            [c.id, ...retirados],
          );
          if (periodos.length > 0)
            return setErro(
              `O turno da ${rotulos} ainda é o do(s) período(s) ${periodos.map((p) => `${p.numero}º`).join(", ")}. ` +
                "Mude o turno deles em Períodos antes.",
            );
          const forcadas = await consultar<{ nome: string }>(
            `SELECT nome FROM disciplinas WHERE curso_id = ? AND turno IN (${marc}) ORDER BY nome`,
            [c.id, ...retirados],
          );
          if (forcadas.length > 0)
            return setErro(
              `As disciplinas ${forcadas.map((d) => d.nome).join(", ")} têm o turno da ${rotulos} forçado. ` +
                "Mude o turno delas em Disciplinas antes.",
            );
          const [{ n }] = await consultar<{ n: number }>(
            `SELECT COUNT(*) AS n FROM alocacoes a JOIN horarios h ON h.indice = a.hora
              WHERE a.curso_id = ? AND h.turno IN (${marc})`,
            [c.id, ...retirados],
          );
          // Sem isto as aulas sumiriam da tela e continuariam no banco (D13).
          if (n > 0) {
            if (!confirm(`${n} ${n === 1 ? "aula" : "aulas"} no turno da ${rotulos} serão apagadas. Continuar?`)) return;
            instrucoes.push({
              sql: `DELETE FROM alocacoes WHERE curso_id = ?
                      AND hora IN (SELECT indice FROM horarios WHERE turno IN (${marc}))`,
              params: [c.id, ...retirados],
            });
          }
        }
        instrucoes.push({
          sql: "UPDATE cursos SET nome = ?, turnos = ?, horas_por_aula_semanal = ?, observacao = ? WHERE id = ?",
          params: [nome, c.turnos, c.horas_por_aula_semanal, c.observacao, c.id],
        });
        await transacao(instrucoes);
      } else {
```

(O `else` com o INSERT fica como está.)

- [ ] **Passo 4: Instituicao — I2**

Em `src/paginas/Instituicao.tsx`, importe `transacao` de `../db` e acrescente, depois de `gravarConfig`:

```ts
  /**
   * Tirar o sábado com aula no sábado apagaria aulas sem ninguém ver — a grade
   * só esconderia a coluna (I2). Vale para todos os cursos: os dias letivos
   * são da instituição.
   */
  async function mudarDias(novo: number) {
    if (novo < dias) {
      const [{ n }] = await consultar<{ n: number }>("SELECT COUNT(*) AS n FROM alocacoes WHERE dia >= ?", [novo]);
      if (n > 0) {
        if (!confirm(`${n} ${n === 1 ? "aula" : "aulas"} no sábado, somando todos os cursos, serão apagadas. Continuar?`))
          return;
        setDias(novo);
        return tentar(
          () =>
            transacao([
              { sql: "DELETE FROM alocacoes WHERE dia >= ?", params: [novo] },
              {
                sql:
                  "INSERT INTO configuracao (chave, valor) VALUES ('dias_letivos', ?)" +
                  " ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
                params: [String(novo)],
              },
            ]),
          "A configuração",
        );
      }
    }
    setDias(novo);
    gravarConfig("dias_letivos", String(novo));
  }
```

e o `onChange` do select "Semana" vira `onChange={(e) => mudarDias(Number(e.target.value))}`.

- [ ] **Passo 5: Professores — máximo de dias**

Em `src/paginas/Professores.tsx`, importe `consultar` e, em `salvar(p)`, depois da validação do nome:

```ts
    // D15 é regra dura: baixar o máximo abaixo do que a grade já usa deixaria
    // aulas inválidas, e não há como escolher sozinho qual dia sai.
    if (p.id && p.max_dias_semana != null) {
      const [{ n }] = await consultar<{ n: number }>(
        "SELECT COUNT(DISTINCT dia) AS n FROM alocacoes WHERE professor_id = ?",
        [p.id],
      );
      if (n > p.max_dias_semana)
        return setErro(
          `${nome} já dá aula em ${n} dias da semana, somando todos os cursos. ` +
            `Tire aulas dele na grade antes de baixar o máximo para ${p.max_dias_semana}.`,
        );
    }
```

- [ ] **Passo 6: Indisponibilidades — B10**

Em `src/paginas/Indisponibilidades.tsx`:
- Acrescente `const marcadosRef = useRef<Set<string>>(new Set());` e a função
  ```ts
  /** O conjunto da tela mora no estado (para desenhar) e no ref (para gravar ao soltar). */
  function definirMarcados(s: Set<string>) {
    marcadosRef.current = s;
    setMarcados(s);
  }
  ```
- Todo `setMarcados(x)` vira `definirMarcados(x)` (em `carregarProfessor` e `alternarBloco`).
- `pintar` passa a:
  ```ts
  function pintar(dia: number, hora: number, modo: "marcar" | "desmarcar") {
    if (ocupadas.has(chave(dia, hora))) return;
    const k = chave(dia, hora);
    const antes = marcadosRef.current;
    if (modo === "marcar" ? antes.has(k) : !antes.has(k)) return;
    const novo = new Set(antes);
    if (modo === "marcar") novo.add(k);
    else novo.delete(k);
    definirMarcados(novo);
  }
  ```
- O `soltar` do `useEffect` passa a:
  ```ts
    const soltar = () => {
      if (!arrastando.current) return;
      arrastando.current = null;
      // Gravar fora do updater do estado: no StrictMode o React chama o
      // updater duas vezes, e cada chamada abria uma transação (B10).
      persistir(marcadosRef.current);
    };
  ```

- [ ] **Passo 7: Grade Automática — B5 e outros cursos**

Em `src/paginas/GradeAutomatica.tsx`, troque `if (!problema) return null;` por:

```tsx
  // O erro de carga precisa aparecer mesmo sem problema montado (B5).
  if (!problema)
    return (
      <>
        <header className="cabecalho-pagina">
          <h1>Grade automática</h1>
        </header>
        <Erro>{erro}</Erro>
      </>
    );
```

e o `<p className="sub">` vira:

```tsx
          <p className="sub">
            {previstas} aula(s) a distribuir em {problema.periodos.length} período(s).
            {problema.externas.length > 0 &&
              ` ${problema.externas.length} aula(s) de outros cursos respeitadas.`}
          </p>
```

- [ ] **Passo 8: Períodos e Tipos — textos**

`src/paginas/Periodos.tsx`:
- Cabeçalho da coluna: `<th className="num">Máx. de obrigatórias no contraturno</th>`.
- `<dt>Máx. de obrigatórias no contraturno</dt>` e
  `<dd>Quantas disciplinas obrigatórias podem escapar do turno do período. Optativas não contam: o gerador as põe no contraturno quando convém, mantendo ao menos uma no turno.</dd>`.
- O comentário `// Só os turnos que o curso ocupa: oferecer noite a um curso diurno é` vira `// Só os turnos que o curso ocupa: oferecer um turno de fora é`.

`src/paginas/Tipos.tsx`: a dica da optativa vira `<em>o gerador a põe no contraturno quando convém, mantendo ao menos uma optativa do período no turno</em>`.

- [ ] **Passo 9: rodar e commitar**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: PASS. Confira que não sobrou nenhum `test.fail(` nem `it.fails(` no repositório: `grep -rn "test.fail(\|it.fails(" src testes` → vazio.

```bash
git add src/paginas testes
git commit -m "Cadastros: turno do curso retirado, sábado com aulas, máx. de dias, arrasto numa transação, erro da automática (I2, B5, B10)"
```

---

### Tarefa 10: Limpeza e documentação

**Arquivos:**
- Modificar: `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `package.json` (+ `package-lock.json`), `src/App.tsx`, `index.html`, `src/solver/blocos.ts`, `docs/regras.md`, `README.md`
- Remover: `public/vite.svg`, `public/tauri.svg`, `src/assets/react.svg`
- Criar: `public/icone.png` (cópia de `src-tauri/icons/32x32.png`)

- [ ] **Passo 1: capability e plugin opener**

- `src-tauri/capabilities/default.json`: `permissions` fica `["core:default", "sql:default"]`. Sem `sql:allow-execute`, a única escrita possível é o comando `transacao`.
- `src-tauri/src/lib.rs`: apague `.plugin(tauri_plugin_opener::init())`.
- `src-tauri/Cargo.toml`: apague `tauri-plugin-opener = "2"`; `version = "1.0.0"`; `description = "Montagem da grade horária de cursos sem conflitos"`; `authors = ["Caio Macedo"]`.
- `npm uninstall @tauri-apps/plugin-opener`.
- Confira: `grep -rn "opener" src src-tauri/src src-tauri/capabilities package.json` → vazio.

- [ ] **Passo 2: App.tsx**

- `type Pagina` passa a `componente: (p: Props) => React.ReactNode;` (obrigatório).
- `const atual = TODAS.find((p) => p.id === pagina) ?? TODAS[0];`
- No botão do menu, remova `disabled={!p.componente}` e `title={...}`, e o `onClick` vira `onClick={() => setPagina(p.id)}`.
- `atual.componente?.(...)` vira `atual.componente(...)`.

- [ ] **Passo 3: sobras de template**

- `cp src-tauri/icons/32x32.png public/icone.png`; `git rm public/vite.svg public/tauri.svg src/assets/react.svg` (antes, `grep -rn "vite.svg\|tauri.svg\|react.svg" src index.html` deve mostrar só o `index.html`).
- `index.html`: `<html lang="pt-BR">`, `<link rel="icon" type="image/png" href="/icone.png" />`, `<title>Distribuição de Aulas</title>`.
- `src/solver/blocos.ts`, comentário de `particoes`: "`os Projetos Integradores do curso do Evandro fazem 3+1+1+1`" → "`uma disciplina de projeto pode fazer 3+1+1+1`".

- [ ] **Passo 4: docs/regras.md**

Reescreva as seções afetadas (mantenha o tom e a estrutura do documento):
- **Cursos**: troque "Os cursos não se validam entre si…" (os dois parágrafos, até "nenhuma regra a consulta.") por: professores e salas são da instituição, e um professor ou uma sala não estão em dois lugares no mesmo horário **em curso nenhum** (D2, D3). O gerador monta um curso por vez e trata as aulas dos outros cursos como ocupação fixa; a grade manual mostra quem ocupa ("A. Souza em Beta (1º)") e lista, num diagnóstico, as aulas gravadas antes desta regra que a violam.
- **Unidade de medida**: tire "45 à noite".
- **Modelo de tempo**: tire "Acrescentar turno da noite é inserir linhas nessa tabela."; diga que os horários são fixos (migração 008) e que o curso escolhe quais turnos ocupa (`cursos.turnos`), manhã e/ou tarde; a noite saiu do escopo na migração 010.
- **Restrições duras**: a tabela do spec (D1–D16), com "Onde vive" = `src/regras/impedimentos.ts` para D1–D8 e D13–D16, e D9/D10/D12 no solver (`src/solver/`). Parágrafo: o mesmo módulo serve ao gerador e à grade manual; o auditor `src/solver/conferir.ts` reimplementa todas de forma independente.
- **Turnos**: período tem turno; `disciplinas.turno` preenchido é **regra dura** (D14); `max_disciplinas_contraturno` conta só obrigatórias; optativas: exclusivas no horário do período, o gerador decide quais vão ao contraturno, custo se nenhuma ficar inteira no turno. Tire a frase sobre `permite_contraturno`.
- **Oferta** (seção nova): `ofertada = 0` tira a disciplina da grade, das pendências e do gerador; desmarcar com aulas confirma e apaga.
- **Preferências do professor**: `max_dias_semana` vira regra dura (D15), somando todos os cursos.
- **Salas**: `preferencia` 1 ideal / 2 aceitável é editável no cadastro; o gerador e a grade manual tentam as ideais primeiro.
- **Custos brandos**: tabela atualizada — sai "Padrão de bloco fora do ideal" (o custo do padrão só ordena as tentativas), entram "Optativa: nenhuma no turno" (`optativaSemTurno`, por período) e "Sala aceitável" (`salaAceitavel`, por aula); "Buraco na grade do aluno" conta só obrigatórias.
- **Blocos de aulas seguidas**: "A página Curso tem o editor." → "A página Regras tem o editor."
- **Mudanças de cadastro que invalidam aulas** (seção nova, curta): dias letivos, turnos do curso, oferta, turno forçado, sábado e requisito de sala confirmam e apagam as aulas atingidas; mudar o período leva as aulas junto, ou é recusado se houver choque; baixar o máximo de dias abaixo do uso é recusado.

- [ ] **Passo 5: README**

`grep -n "noite\|conflitos\|view\|opener" README.md` e ajuste o que estiver desatualizado. Na seção de testes, se houver lista de bugs conhecidos, diga que todos do subprojeto 1 foram corrigidos e que não restam testes de falha esperada.

- [ ] **Passo 6: rodar tudo e commitar**

Run: `npm run typecheck && npm test && npm run test:e2e`
Run: `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings`
Expected: tudo verde (o `Cargo.lock` muda com a saída do opener; inclua no commit).

```bash
git add -A
git commit -m "Limpeza: sem opener nem execute direto, sobras de template, textos e docs/regras.md das regras novas"
```

---

### Tarefa 11: Benchmark e verificação final

**Arquivos:**
- Modificar: `testes/benchmark/linha-de-base.md` (gerado)

- [ ] **Passo 1: nova linha de base**

Run: `npm run bench:solver -- --salvar`
Expected: coluna `violações` toda zero; arquivo regravado. Compare as medianas de `ms` e `custo` com a versão anterior (`git diff testes/benchmark/linha-de-base.md`). Os custos **não são comparáveis** (regras e pesos mudaram); o tempo é. Se a mediana de tempo piorou mais de 20%, registre no relatório final com a causa provável.

- [ ] **Passo 2: verificação completa**

Run, nesta ordem:
- `npm run typecheck`
- `npm test` (anote o tempo; meta < 20 s)
- `npm run test:e2e` (anote o tempo; meta < 2 min)
- `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings`
- `grep -rn "test.fail(\|it.fails(" src testes` → vazio
- Se der tempo e houver toolchain: `npm run tauri build -- --debug --no-bundle` e `npm run test:smoke` (Windows).

- [ ] **Passo 3: commit**

```bash
git add testes/benchmark/linha-de-base.md
git commit -m "Benchmark: nova linha de base com as regras do subprojeto 1"
```
