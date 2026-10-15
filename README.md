# Distribuição de Aulas

Aplicativo de desktop para montar a grade horária de um curso: cadastro de
professores, disciplinas e salas, montagem manual da grade e geração automática
de um horário sem conflitos.

Sucessor do programa em JavaFX que vive em
`../Programa - Distribuição de Aulas`, que continua servindo de referência.

## Pilha

React + TypeScript (Vite) numa janela Tauri v2, com SQLite local via
`tauri-plugin-sql`. O banco é um arquivo, copiável de uma máquina para outra.

A interface é feita com Tailwind CSS v4 e componentes do shadcn/ui (sobre
Radix), tabelas com TanStack Table (v8), arrastar e soltar com dnd-kit, ícones
do lucide-react e avisos (toasts) com Sonner. `src/estilos/tema.css` é a fonte
dos tokens (cores, tipografia, raios, claro e escuro) e das três regras do
design: identidade nunca é cor; nenhum estado depende só de cor; desabilitado
rebaixa texto e borda, nunca `opacity` no bloco. Leia o cabeçalho dele antes de
mexer em estilo. O spec do desenho é
`docs/superpowers/specs/2026-10-11-refatoracao-visual-design.md`.

## O que a interface faz

- **Disciplinas e Salas** têm busca e filtros por coluna, com um chip por valor
  marcado e "Limpar filtros". Em Disciplinas os filtros são Período, Tipo
  (inclui "Sem tipo"), Optativa, Ofertada e Turno forçado (inclui "Segue o
  período"), e a busca olha também os professores da disciplina. Em Salas, o
  filtro é por Tipo.
- **Grade manual.** Para alocar, arraste uma pendência para uma célula ou
  escolha a pendência e clique na célula. Para mover, arraste a aula para outra
  célula. Para remover, use o botão "Remover aula" ou arraste a aula para o
  painel de pendências. O cadeado (ou o botão direito sobre a aula) fixa a aula:
  ela não é arrastada nem removida, e "Limpar período" e o gerador a respeitam.
  Esc cancela o arrasto ou solta a pendência escolhida.
- **Desfazer.** As duas grades têm o botão "Desfazer" (com a dica "Desfazer:
  …") e o atalho Ctrl+Z, que valem para toda ação da grade. Remover ou mover uma
  aula, limpar o período e aplicar a grade gerada abrem também um aviso com o
  mesmo botão. O histórico é de um curso e dura a sessão: trocar de curso, ou gravar
  qualquer coisa fora da grade (professor, sala, disciplina, indisponibilidade,
  regra), o zera.
- **Grade automática.** "Gerar grade" mostra o resultado sem gravar nada, com
  um comparativo que diz, em cada medida, se a grade gerada é melhor, pior ou
  igual à atual;
  "Aplicar esta grade" grava, entra no histórico (dá para desfazer) e oferece
  "Abrir a grade manual".

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

## Rodar no navegador

O desktop continua sendo o modo principal. Para abrir o app sem instalar nada,
num navegador comum:

```bash
npm install
npm run dev
```

e abra <http://localhost:1420>. Fora do Tauri, o app usa um banco próprio do
navegador (SQLite em WebAssembly, no armazenamento do site): os dados ficam
naquele navegador, naquela máquina, e somem se os dados do site forem limpos.
Numa janela anônima, somem ao fechar a janela; se o navegador não oferece
armazenamento, o app avisa no topo de toda tela.

A página **Dados do navegador**, que só existe nesse modo, exporta o banco
num arquivo `.db` (o mesmo formato do desktop, que o abre se for copiado para a
pasta de dados dele com o nome `distribuicao.db`), importa um `.db` exportado
daqui ou do desktop, carrega os dados de exemplo da massa de teste e recomeça
com um banco vazio.

O banco abre em uma aba por vez. Não há sincronização entre navegadores ou
máquinas nem vários usuários: para levar os dados, exporte e importe.

## Testes

Cinco camadas de teste (unidade, interface, capturas, navegador e binário real), mais o
benchmark, sobre a mesma massa anonimizada (`testes/massa/`):

```bash
npm run typecheck      # tipos do app e dos testes
npm test               # Vitest: regras, solver e auditor, histórico de desfazer, db,
                       # ações da grade, validação de Disciplinas, ponte de IPC (segundos)
npm run test:e2e       # Playwright: a interface no Chromium, sem compilar Rust
npm run test:visual    # capturas de cada tela, claro e escuro (só local, Windows)
npm run test:navegador # Playwright: o app no navegador, com o banco do navegador de verdade
npm run test:smoke     # binário real (Windows); exige build debug e drivers
npm run bench:solver   # compara solvers em cenários × sementes
```

- `npm run test:visual` — compara cada tela, no claro e no escuro, com as capturas de
  `testes/visual/__capturas__/`. Mudança visual de
  propósito: `npm run test:visual -- -g "<tela>" --update-snapshots` e confira as imagens.
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
  do smoke é temporário: o build de debug atual lê `DISTRIBUICAO_BANCO` e usa
  esse arquivo no lugar do seu. Um binário compilado antes desse suporte abriria
  o banco real, por isso o smoke recusa o binário mais antigo que
  `src-tauri/src/lib.rs` e confere o banco em uso antes de gravar.
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
| `src/estilos/` | `tema.css` (tokens, camadas e as três regras do design) e `grade.css` (as malhas: Indisponibilidades e grade manual). |
| `src/componentes/` | Componentes próprios (diálogo de formulário, confirmação, tabela, filtros, seletor, avisos); `ui/` guarda os do shadcn. |
| `src/paginas/` | Uma tela por arquivo (ou pasta, quando é grande). |
| `src/grade/` | O histórico de desfazer das grades e o botão que o usa. |
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
