# Distribuição de Aulas

Aplicativo de desktop para montar a grade horária de um curso: cadastro de
professores, disciplinas e salas, montagem manual da grade e geração automática
de um horário sem conflitos.

Sucessor do programa em JavaFX que vive em
`../Programa - Distribuição de Aulas`, que continua servindo de referência.

## Pilha

React + TypeScript (Vite) numa janela Tauri v2, com SQLite local via
`tauri-plugin-sql`. O banco é um arquivo, copiável de uma máquina para outra.

## Antes de começar

Além do Node.js (22.13 ou mais novo), o lado Tauri compila Rust de verdade, então
a máquina precisa de:

- **Rust**, via [rustup](https://rustup.rs);
- no Windows, as **Build Tools do Visual Studio** com a carga de trabalho
  "Desenvolvimento para desktop com C++" — é ela que traz o linker;
- o **WebView2**, que já vem no Windows 11 e no 10 atualizado.

O passo a passo por sistema operacional está em
<https://v2.tauri.app/start/prerequisites/>.

## Como rodar

```bash
npm install
npm run tauri dev
```

A primeira execução compila as dependências Rust e leva alguns minutos; as
seguintes são rápidas, porque o resultado fica em `src-tauri/target/`. Essa
pasta e `node_modules/` são cache — somam vários gigabytes, se refazem sozinhas
e nunca devem ser copiadas de uma máquina para outra.

Na primeira abertura o app cria o banco no diretório de dados do aplicativo e
roda as migrações declaradas em `src-tauri/src/lib.rs`, que são os arquivos
de `scripts/migracoes/`.

Um arquivo de migração já publicado nunca é editado — bancos existentes não o
executariam de novo. Toda alteração de esquema é um arquivo novo com o próximo
número, acrescentado também à lista em `lib.rs`.

## Testes

Três camadas de teste, mais o benchmark, todas sobre a mesma massa anonimizada (`testes/massa/`):

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
- **Falha esperada.** Todos os bugs conhecidos do subprojeto de regras e
  integridade foram corrigidos: não restam testes marcados com `it.fails` ou
  `test.fail`. Ao descobrir um bug novo, a convenção é escrever o teste com essa
  marcação (ele passa enquanto o bug existir, e a ferramenta acusa "passou
  inesperadamente" quando for corrigido) e removê-la na correção.
- **CI.** `.github/workflows/ci.yml` roda typecheck, Vitest, Playwright e
  `cargo fmt`/`clippy` em todo push; o smoke roda em PR para `main` e pelo
  botão "Run workflow".

## Estrutura

| Caminho | O que é |
|---|---|
| `docs/regras.md` | **As regras da grade.** Leia antes de mexer no gerador. |
| `scripts/migracoes/` | O esquema, em migrações numeradas. Fonte única: criam o banco do app e o da conversão. |
| `scripts/migrar.py` | Converte o banco do programa antigo. Uso pontual. |
| `src/db.ts` | Conexão com o SQLite e utilitários de consulta. |
| `src/tipos.ts` | Tipos do domínio, espelhando o esquema. |
| `src/regras/` | Regras duras de célula, compartilhadas pelo gerador e pela grade manual. |
| `src/solver/` | O gerador automático e o auditor independente (`conferir.ts`). |
| `src-tauri/` | Lado Rust: plugin SQL, migrações e o comando `transacao`, a única escrita do app. |

## Massa de teste

O banco da aplicação nasce vazio. Para desenvolver contra dados realistas —
22 professores, 55 disciplinas, 16 salas e uma grade de verdade — gere uma cópia
a partir do banco antigo:

```bash
python scripts/migrar.py "../Programa - Distribuição de Aulas/distribuicaodb.db" -o distribuicao.db
```

O script relata tudo que inferiu e confere a consistência do resultado. Ele
deduz propriedades a partir de nomes de disciplinas e salas do banco antigo;
`--sem-heuristicas-de-nome` desliga isso. Detalhes em `docs/regras.md`.

## Regra de ouro

Nada no sistema decide comportamento pelo **nome** de uma disciplina, sala ou
professor — só por campos. Cursos diferentes chamam as mesmas coisas por nomes
diferentes.
