# Regras de montagem da grade

Documento de referência do gerador automático. Toda regra aqui ou é **dura** (o
solver nunca viola) ou **branda** (custo a minimizar). A política do curso mora em
dados — tabelas `padroes_blocos`, `periodos`, `horarios`, `configuracao` e os
campos de preferência — não em código.

> **Nada no sistema depende do nome de uma disciplina, de uma sala ou de um
> professor.** Comportamento vem sempre de campos. Os nomes deste curso aparecem
> aqui só como exemplo, e em outro curso serão outros.
>
> A única exceção é o `scripts/migrar.py`, que para converter o banco antigo
> chuta duas propriedades a partir de nomes — `optativa` pelos prefixos
> `HUM -`/`OPT -`, e `exige_sala` pelas salas `Remota*` — porque o nome é o
> único registro dessa informação que o banco antigo guarda. São heurísticas de
> uma conversão única, reportadas para revisão, e desligáveis com
> `--sem-heuristicas-de-nome`. Nada disso existe na aplicação.

## Cursos

Um banco guarda **vários cursos**. Cada curso tem os próprios períodos,
disciplinas e grade, e a própria conversão currículo→aulas.

São da **instituição**, compartilhados por todos os cursos: professores, salas,
horários do dia, padrões de bloco, tipos de disciplina, dias letivos e as
indisponibilidades dos professores.

Professores e salas são da instituição, e um professor ou uma sala **não estão
em dois lugares no mesmo horário em curso nenhum** (D2, D3). O gerador monta um
curso por vez e trata as aulas dos outros cursos como ocupação fixa. A grade
manual mostra quem ocupa o horário ("A. Souza em Beta (1º)") e lista, num
diagnóstico, as aulas gravadas antes desta regra que a violam.

O compromisso de um professor fora de qualquer curso continua sendo a
**indisponibilidade** dele: declara-se os horários uma vez e todo curso os
respeita.

## Unidade de medida

A grade conta **aulas**, não horas. Uma disciplina de "4" tem quatro aulas por
semana. Quanto cada aula dura é outra coisa — 50 minutos,
guardado em `horarios.duracao_min` — e não entra em cálculo nenhum.

O currículo do curso, esse sim, fala em horas. A conversão fica em
`cursos.horas_por_aula_semanal`, hoje **15h = 1 aula por semana**
(60h → 4 aulas). É política do curso, e serve só de apoio ao cadastro: o que a
grade e o gerador usam é sempre `disciplinas.aulas_semanais`.

## Modelo de tempo

Uma aula é identificada por **(periodo, dia, hora)**. Não existe índice de slot
calculado: era o `slot = dia * 12 + hora` do programa antigo que amarrava tudo em
12 horários por dia.

- `horarios` define os horários do dia, em ordem, cada um com seu turno.
  São **fixos** (migração 008): 7:30 · 8:20 · 9:10 · 10:20 · 11:10 · 12:00
  (manhã) · 13:00 · 13:50 · 14:40 · 15:50 · 16:40 · 17:30 (tarde). O que varia
  de um curso para outro é quais turnos ele ocupa (`cursos.turnos`): manhã e/ou
  tarde. A noite saiu do escopo na migração 010.
- `dia` 0 = Segunda .. 5 = Sábado; quantos dias valem vem de
  `configuracao['dias_letivos']`.
- `periodos` é uma tabela: 6, 8, 10 ou quantos períodos o curso tiver. Nenhum
  laço do sistema é fixo em 8.

**Contiguidade**: dois horários são vizinhos se os índices são consecutivos *e* o
turno é o mesmo. É isso que impede um bloco de aulas de atravessar o almoço —
11:10 e 13:00 são índices 4 e 6, mas de turnos diferentes.

## Disciplinas com mais de um professor

Uma disciplina com muitas aulas pode ser dividida entre vários professores, cada um
com sua fatia (`disciplina_professores.aulas`). No banco antigo isso era contornado
criando disciplinas separadas chamadas `- A` e `- B`; agora é uma disciplina só.

**Cada fatia é planejada como se fosse uma disciplina independente**: tem seus
próprios blocos, e as restrições de professor se aplicam ao dono da fatia.

## Restrições duras

| # | Regra | Onde vive |
|---|---|---|
| D1 | Um período não tem duas aulas no mesmo (dia, hora) | `src/regras/impedimentos.ts` (e `alocacoes` PK) |
| D2 | Um professor não está em dois lugares no mesmo (dia, hora), **em qualquer curso** | `src/regras/impedimentos.ts` |
| D3 | Uma sala não recebe duas turmas no mesmo (dia, hora), **em qualquer curso** | `src/regras/impedimentos.ts` |
| D4 | Professor não é alocado onde declarou indisponibilidade | `src/regras/impedimentos.ts` |
| D5 | Sábado só com `permite_sabado = 1` e só nos `turnos_sabado` | `src/regras/impedimentos.ts` |
| D6 | Disciplina com `exige_sala = 1` recebe sala; com `0`, `sala_id` fica nulo | `src/regras/impedimentos.ts` |
| D7 | Se `tipo_sala` está preenchido, a sala tem de ser daquele tipo | `src/regras/impedimentos.ts` |
| D8 | Se há linhas em `disciplina_salas`, a sala tem de ser uma delas | `src/regras/impedimentos.ts` |
| D9 | As aulas alocadas de cada fatia somam exatamente as `aulas` dela | solver (`src/solver/`) |
| D10 | O padrão de blocos existe em `padroes_blocos`, salvo se `blocos_livres = 1` | solver (`src/solver/`) |
| D11 | Alocação com `fixada = 1` não é movida pelo gerador | `alocacoes.fixada` |
| D12 | Um bloco não atravessa troca de turno | solver (`src/solver/`) |
| D13 | Aula só nos turnos do curso (`cursos.turnos`) | `src/regras/impedimentos.ts` |
| D14 | Disciplina com `turno` preenchido só tem aula naquele turno | `src/regras/impedimentos.ts` |
| D15 | Professor aparece em no máximo `max_dias_semana` dias distintos, somando todos os cursos | `src/regras/impedimentos.ts` |
| D16 | Disciplina com `ofertada = 0` não tem aula | `src/regras/impedimentos.ts` |

O mesmo módulo, `src/regras/`, serve ao gerador e à grade manual: as regras de
célula (D1–D8, D13–D16) são decididas num lugar só, e a grade manual mostra o
motivo quando recusa uma célula. D9 e D10 dependem da fatia inteira; na grade
manual aparecem como **aviso na pendência** (a fatia está sempre incompleta
durante a montagem à mão), não como bloqueio. D9, D10 e D12 são estruturais do
gerador. O auditor `src/solver/conferir.ts` reimplementa todas de forma
independente, para que um erro no módulo de regras não passe despercebido.

## Prioridade

`disciplinas.prioridade` define a ordem em que o solver aloca: **1** primeiro,
**3** por último, no que sobrar. A prioridade 3 também atenua os custos brandos da
disciplina — ela se encaixa nas folgas em vez de disputar horário com as demais.

Existe uma categoria de disciplina que combina três campos e se comporta de modo
bem diferente das demais: muitas aulas, divididas entre professores, sem sala fixa,
sem padrão de bloco, encaixada onde não atrapalha o resto.

| Campo | Valor | Efeito |
|---|---|---|
| `prioridade` | 3 | alocado por último, custos brandos atenuados |
| `blocos_livres` | 1 | qualquer partição das aulas vale — `3+1+1+1` é legal |
| `exige_sala` | 0 | não ocupa sala, não disputa sala com ninguém |

Neste curso são os Projetos Integradores e os TCCs, mas **isso é só o nome que
eles têm aqui** — outro curso chama a mesma coisa de outra forma. O que define o
comportamento são os três campos; nem o solver nem a interface olham o nome de
uma disciplina para decidir qualquer coisa.

A migração deduz essa categoria observando a grade: uma fatia cujo padrão de
blocos atual não consta de `padroes_blocos` ganha `blocos_livres` e
`prioridade = 3`. Onde há aulas de menos para haver padrão observável —
uma disciplina de 1 aula só tem um padrão possível — ela não deduz nada e
apenas lista a disciplina para você marcar na interface. É o caso dos TCCs.

## Tipos de disciplina

`tipos_disciplina` guarda combinações de propriedades com um nome, para preencher
o cadastro de uma disciplina nova de uma vez em vez de marcar campo por campo.

**É só um molde.** Os valores que valem são sempre os de `disciplinas`; o solver
nunca lê essa tabela e a disciplina pode divergir do seu tipo. Os nomes são
livres — cada curso cria e nomeia os seus.

Os tipos que a migração deduziu, agrupando as disciplinas que terminaram com a
mesma combinação de propriedades:

| Tipo | Disciplinas |
|---|---|
| Regular | 38 |
| Optativa | 12 |
| Regular — sem sala, blocos livres, prioridade baixa, sábado | 3 |
| Regular — sem sala, sábado | 1 |
| Regular — sem sala | 1 |

Os nomes gerados são descritivos porque não há como adivinhar o nome que você
usa; renomeie na interface.

## Blocos de aulas seguidas

Vale para a **fatia de cada professor**, não para o total da disciplina.
Padrão ausente da tabela = proibido; `custo 0` = ideal; custo maior = evitar.

| Aulas | Padrão | Custo | Observação |
|---|---|---|---|
| 1 | `1` | 0 | |
| 2 | `2` | 0 | |
| 2 | `1+1` | 5 | evitar |
| 3 | `3` | 0 | |
| 3 | `2+1` | 1 | |
| 4 | `2+2` | 0 | o normal |
| 4 | `3+1` | 1 | opção aceitável |
| 4 | `4` | 6 | pode acontecer, mas evite |
| 5 | `3+2` | 0 | |
| 5 | `2+2+1` | 2 | |
| 6 | `3+3` | 0 | |
| 6 | `2+2+2` | 1 | |
| 6 | `4+2` | 6 | evitar |

Descartados de propósito para 4 aulas: `1+1+1+1` e `2+1+1` — por isso não constam
da tabela. Um número de aulas que não tiver linha nenhuma bloqueia o gerador; cadastrar
uma disciplina com um total novo exige cadastrar seus padrões. A página Regras
tem o editor.

## Turnos

- Cada período tem um `turno` e o gerador tenta manter tudo nele.
- `disciplinas.turno` preenchido força a disciplina naquele turno,
  independentemente do período. É **regra dura** (D14), não custo.
- `periodos.max_disciplinas_contraturno` limita quantas disciplinas
  **obrigatórias** do período podem ir ao contraturno; as optativas não entram
  na conta. Passar do limite é custo, não proibição.
- **Optativas.** São exclusivas no horário do período: cada uma ocupa um horário
  próprio. O gerador decide quais vão ao contraturno; a optativa no contraturno
  não paga custo de contraturno, mas há custo se **nenhuma** optativa do período
  ficar inteira no turno.

## Oferta

`disciplinas.ofertada = 0` tira a disciplina da grade, das pendências e do
gerador. Desmarcar uma disciplina que já tem aulas pede confirmação e apaga as
aulas (D16).

## Sábado

Só disciplinas com `permite_sabado = 1`; para as demais o sábado nem entra no
domínio da variável.

## Preferências do professor

Duas dimensões brandas, ambas por professor:

1. **Buracos na agenda** — dar aula às 7:30 e depois só às 15h é ruim. Penaliza-se
   cada horário vago entre a primeira e a última aula do professor no dia.
   Prioridade alta, global.
2. **Distribuição dos dias** — `professores.pref_dias`:
   - `consecutivos` — prefere dias colados (Seg+Ter);
   - `intercalados` — prefere pelo menos um dia de intervalo (Seg+Qua);
   - `indiferente` — não pontua.

   `pref_dias_peso` (0..3) diz o quanto isso pesa para aquele professor.

Além dessas, `max_dias_semana` é **regra dura** (D15): limita em quantos dias
distintos o professor aparece, somando as aulas de **todos** os cursos.

## Salas

A alocação de sala entra no solver junto com o horário, não como passo posterior.
Há três casos:

| Situação | Como se declara |
|---|---|
| Não ocupa sala (remota) | `exige_sala = 0` |
| Serve qualquer sala | `exige_sala = 1`, `tipo_sala` nulo, sem `disciplina_salas` |
| Precisa de um **tipo** de sala | `tipo_sala = 'Laboratório'` |
| Precisa de salas **específicas** | linhas em `disciplina_salas` |

Os dois últimos são alternativas, e a diferença importa: `tipo_sala` acompanha
o cadastro — um laboratório novo passa a servir sozinho — enquanto a lista
específica é um retrato do momento e não muda por conta própria. Para "precisa
ser em laboratório, tanto faz qual", use o tipo. Para "só o L4 tem o
equipamento", use a lista.

- `disciplina_salas` lista as salas aceitáveis, com `preferencia` 1 (ideal) ou 2
  (aceitável). É assim que se expressa "esta disciplina precisa do laboratório L4".
  A preferência é editável no cadastro da disciplina; o gerador e a grade manual
  tentam as ideais primeiro.
- Na grade manual a sala de uma aula pode ser trocada pela própria célula, entre
  as salas válidas e livres naquele horário, ou ficar sem sala quando a disciplina
  não a exige.
- `salas.capacidade` e `salas.tipo` ficam disponíveis para checagem, mas a regra
  operativa é a lista explícita.

## Custos brandos

Nenhum destes impede uma solução; todos entram na função objetivo. Os pesos
iniciais estão em `PESOS_PADRAO` (`src/solver/tipos.ts`); a calibração fina é do
gerador v2.

| Custo | Escopo | Peso |
|---|---|---|
| Buraco na agenda do professor | professor/dia | `buracoProfessor` (8) |
| Buraco na grade do aluno | período/dia, só obrigatórias | `buracoAluno` (8) |
| Preferência de dias do professor | professor | `preferenciaDias` (3) × `pref_dias_peso` (0..3) |
| Disciplina no contraturno | disciplina | `contraturno` (30) |
| Excesso sobre `max_disciplinas_contraturno` | período | `excessoContraturno` (20) |
| Optativa: nenhuma no turno | período | `optativaSemTurno` (40) |
| Sala apenas "aceitável" em vez de "ideal" | aula | `salaAceitavel` (2) |

O `custo` de cada linha de `padroes_blocos` não entra na soma: ele só ordena as
tentativas do gerador, que experimenta primeiro os padrões de custo menor.
O buraco na grade do aluno conta só as disciplinas obrigatórias, porque quem não
cursa uma optativa não tem buraco por causa dela.

Disciplinas com `prioridade = 3` têm todos os seus custos atenuados.

## Mudanças de cadastro que invalidam aulas

Alterar o cadastro pode deixar aulas já gravadas fora das regras. O app não deixa
isso passar em silêncio:

- **Dias letivos** (6 para 5 com aula no sábado), **turnos do curso**, **oferta**,
  **turno forçado**, **sábado** e **requisito de sala**: o app confirma, diz quantas
  aulas serão atingidas (no diálogo de apagar, quais: dia, horário e motivo) e,
  se o usuário confirmar, apaga-as na mesma transação da alteração. Cancelar não
  muda nada.
- **Tirar um turno do curso** é recusado se algum período ou disciplina com turno
  forçado ainda o usa; senão confirma e apaga as aulas nele.
- **Mudar o período** de uma disciplina leva as aulas junto, no mesmo (dia, hora,
  sala). Se algum horário do período novo estiver ocupado, a mudança é recusada,
  com a lista dos horários em choque.
- **Sala que deixou de servir** ao editar a disciplina: a aula não é apagada de
  imediato. Se a disciplina não exige mais sala, a aula fica sem sala; se exige,
  recebe uma sala válida e livre, preferindo a da aula vizinha do mesmo professor.
  Só quando não há sala livre a aula entra na confirmação de apagar. Se só houve
  reatribuições, não há diálogo.
- **Baixar `max_dias_semana`** abaixo dos dias que o professor já usa é recusado,
  com explicação: não há como escolher sozinho qual dia sai.

## Pendências

- [ ] Preencher `disciplina_salas` para as disciplinas que exigem laboratório.
- [ ] Preencher as preferências de distribuição de dias de cada professor.
- [ ] Definir o peso relativo entre os custos brandos.
- [ ] Marcar `prioridade` e `blocos_livres` nas disciplinas que a migração
      listou como "aulas de menos para inferir" — os TCCs entre elas.
