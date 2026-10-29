# Versão de navegador — desenho

Status: implementado em 2026-10-15 (N1 e N2 revisadas; suíte conferida pelo orquestrador em `4f7a1e7`). Aprovado pelo usuário em 2026-10-15 (opção 1: "usar sem instalar, uma pessoa por vez",
para abrir e experimentar o app de verdade no navegador). Branch `versao-navegador`, a partir de
`refatoracao-visual`.

## Objetivo

Abrir o aplicativo num navegador comum, sem o `.exe`, com um banco próprio do navegador, e usar
todas as telas como no desktop. O desktop (Tauri) continua igual.

Não é objetivo: vários usuários sobre os mesmos dados, servidor, login, sincronização entre
máquinas, publicar o app num endereço público.

## Decisões (técnicas, do orquestrador)

1. **Uma compilação do front, escolha em tempo de execução.** Se `window.__TAURI_INTERNALS__`
   existe, o banco é o do Tauri, como hoje; senão, é o banco do navegador. `npm run dev` e abrir
   `http://localhost:1420` num navegador já usa o banco do navegador. `npm run build` gera
   `dist/`, que serve tanto ao Tauri quanto a um servidor estático. O código do banco do
   navegador (e o WebAssembly) só é carregado quando usado (import dinâmico): o desktop não paga
   por ele.
2. **A fronteira é `src/db.ts`**, que já concentra tudo o que é do Tauri (`consultar`,
   `transacao`, `executar`, o nome do banco, `aoEscrever`). A interface pública não muda; por
   baixo, um "motor" Tauri e um "motor" de navegador.
3. **Banco do navegador:** `@sqlite.org/sqlite-wasm` (o SQLite oficial em WebAssembly), num Web
   Worker dedicado, com o VFS `opfs-sahpool` (persistente no armazenamento de origem do
   navegador, sem exigir os cabeçalhos COOP/COEP). Uma conexão só, e o worker atende um pedido
   por vez — a mesma garantia da conexão única do `transacao` do Rust. Se o OPFS não estiver
   disponível (janela anônima de alguns navegadores), o banco roda em memória e a tela avisa
   que nada será guardado. Pede `navigator.storage.persist()` para o navegador não apagar os
   dados por falta de espaço.
4. **Mesma semântica do Rust.** `transacao`: `PRAGMA foreign_keys = ON` fora da transação,
   `BEGIN`, as instruções, `COMMIT` (ou `ROLLBACK` e erro), devolvendo `rowsAffected` (soma) e
   `lastInsertId` (o da última instrução). Parâmetros amarrados como em `amarrar`: `null`,
   booleano como inteiro, número, texto, e lista ou objeto como texto JSON. Leituras devolvem
   linhas como objetos, como o plugin SQL. Os textos de erro do SQLite chegam com as frases que
   `src/lib/erros.ts` reconhece ("FOREIGN KEY constraint failed" etc.).
5. **Migrações:** os mesmos arquivos de `scripts/migracoes/`, aplicados em ordem, cada um numa
   transação com a chave estrangeira ligada, e registrados na tabela `_sqlx_migrations` com as
   mesmas colunas e o mesmo `checksum` que o sqlx (do plugin do Tauri) grava. Assim um banco
   exportado do navegador abre no desktop, e um banco do desktop importado no navegador continua
   da versão em que está.
6. **Página "Dados do navegador"**, só no modo navegador, na barra lateral: diz onde os dados
   ficam (neste navegador, nesta máquina; somem se os dados do site forem limpos) e oferece
   Exportar banco (baixa um `.db`), Importar banco (substitui o atual, com confirmação; recusa
   arquivo que não seja um banco deste app; aplica as migrações que faltarem), Carregar dados de
   exemplo (a massa anonimizada dos testes, `testes/massa/engenharia_v9.sql`, montada como em
   `testes/suporte/banco.ts`: migrações até a versão da massa, a massa, as migrações restantes)
   e Começar vazio. Substituir o banco zera o histórico de desfazer e recarrega o app.
7. **Testes:** os e2e e as capturas atuais continuam com a ponte falsa do Tauri (modo desktop).
   Um projeto novo do Playwright, `navegador`, roda sem a ponte, contra o banco do navegador de
   verdade: abre vazio, carrega o exemplo, grava, recarrega a página e o dado continua,
   exporta e importa. Vitest cobre o que for lógica pura (amarração, checksum, montagem do
   exemplo).
8. **Publicar** o `dist/` num endereço público não está no escopo. Antes de fazê-lo, decidir se
   a massa de exemplo (anonimizada, mas derivada de dados reais) pode ir junto.

## Tarefas

- **N1 · Banco do navegador.** Motores em `src/db.ts`, worker, migrações com `_sqlx_migrations`
  compatível, aviso de modo em memória, projeto `navegador` do Playwright com o básico (abre,
  migra, grava, persiste ao recarregar).
- **N2 · Página "Dados do navegador".** Exportar, importar, exemplo, vazio; e2e no projeto
  `navegador`; README.

## Decisões tomadas na execução

- Uma aba por vez: o worker segura uma trava exclusiva (`navigator.locks`) antes de abrir o banco, esperando até 2 s (uma recarga espera o worker antigo morrer; uma aba de fato aberta ao lado é recusada com a mensagem de outra aba). Sem a trava, duas abas na primeira abertura criavam dois bancos e um deles sumia.
- Trocar o banco (importar, exemplo, vazio) acontece dentro do worker que tem a trava; a imagem do banco atual é guardada antes, e se a gravação do novo falha a anterior é regravada e reaberta, sem recarga.
- Sem armazenamento persistente (janela anônima de alguns navegadores), o banco roda em memória com aviso permanente, e Importar e Carregar exemplo ficam desabilitados com o motivo à vista.
- Em `consultar`, os parâmetros são amarrados como o `select` do plugin do Tauri faz (número como REAL); nas escritas, como o `amarrar` do Rust.
- O checksum das migrações exige contexto seguro (`localhost` ou `https`); por IP da rede local a abertura falha com mensagem clara.

## Pendências

- Na falha dupla (nem o banco novo nem o anterior gravam), mandar a imagem anterior à página para download de resgate.
- O e2e da falha dupla só confere o aviso.
- Publicar: a decisão 8 continua em aberto (a massa de exemplo vai no `dist/`, pedida só ao clicar).
