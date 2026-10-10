"""
Migra o banco do programa JavaFX (distribuicaodb.db) para o esquema novo.

    python scripts/migrar.py <banco_antigo.db> [-o distribuicao.db] [--periodos N]

E idempotente: recria o banco de destino do zero a cada execucao.

Alem de converter, o script infere da grade ja montada a mao aquilo que o
esquema novo sabe representar e o antigo nao sabia: turno de cada periodo,
disciplinas liberadas para sabado, disciplinas de contraturno, disciplinas sem
sala, padroes de bloco livres, e a unificacao das disciplinas divididas em
"- A"/"- B"/"- C" numa unica disciplina com varios professores.

    ATENCAO - HEURISTICAS DE NOME

    Duas inferencias olham o NOME das disciplinas e das salas deste banco
    especifico: `optativa` pelos prefixos "HUM -"/"OPT -", e `exige_sala` pelas
    salas "Remota...". Elas existem porque o nome e o unico registro que o banco
    antigo guarda dessas duas informacoes. Sao chutes descartaveis de uma
    conversao unica, e `--sem-heuristicas-de-nome` desliga as duas.

    Nada disso existe no esquema nem na aplicacao. Ali as caracteristicas sao
    campos (`optativa`, `exige_sala`, `blocos_livres`, `prioridade`,
    `permite_sabado`), e o solver nunca le o nome de uma disciplina - outro
    curso chama as mesmas coisas por outros nomes.

    Toda inferencia vem marcada no relatorio final para voce revisar.
"""
import argparse
import glob
import os
import re
import sqlite3
import sys
from collections import defaultdict

DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
HORAS_LEGADO = 12          # o banco antigo era fixo em 12 horarios por dia
SUFIXO = re.compile(r"^(.*?)\s*-\s*([A-Z])$")


def chave_legado(nome):
    """Reproduz nome.toLowerCase().replace(' ','') do Java, usado como nome de tabela."""
    return nome.strip().lower().replace(" ", "")


def tabelas(con):
    return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def migrar(origem, destino, migracoes, n_periodos=None, unificar=True,
           heuristicas_nome=True, nome_curso="Curso convertido"):
    velho = sqlite3.connect(origem)
    velho.row_factory = sqlite3.Row
    presentes = tabelas(velho)

    if os.path.exists(destino):
        os.remove(destino)
    novo = sqlite3.connect(destino)
    for arquivo in sorted(glob.glob(os.path.join(migracoes, "*.sql"))):
        with open(arquivo, encoding="utf-8") as fh:
            novo.executescript(fh.read())
    novo.execute("PRAGMA foreign_keys = ON")

    # Tudo que vem do banco antigo pertence a um curso só: ele não tinha o
    # conceito. O curso 1 já é criado pela migração 005 a partir da
    # configuração; aqui só ajustamos o nome.
    curso_id = 1
    novo.execute("UPDATE cursos SET nome = ? WHERE id = ?", (nome_curso, curso_id))

    horarios = {i: (rot, turno) for i, rot, turno
                in novo.execute("SELECT indice, rotulo, turno FROM horarios")}
    avisos = []

    def descr(dia, hora):
        return "%s %s" % (DIAS[dia], horarios[hora][0])

    # ---- professores -------------------------------------------------------
    profs = {}          # id -> nome limpo
    for r in velho.execute("SELECT id, nome FROM professores ORDER BY id"):
        nome = " ".join(r["nome"].split())
        profs[r["id"]] = nome
        novo.execute("INSERT INTO professores (id, nome) VALUES (?, ?)", (r["id"], nome))

    # ---- salas (o nome era a chave primaria; agora ganham id) --------------
    salas = {}          # nome legado -> id novo
    consulta = "SELECT nome, tipo, capacidade FROM salas ORDER BY nome"
    for i, r in enumerate(velho.execute(consulta), start=1):
        salas[r["nome"]] = i
        novo.execute("INSERT INTO salas (id, nome, tipo, capacidade) VALUES (?,?,?,?)",
                     (i, r["nome"], r["tipo"], r["capacidade"]))

    # ---- quantos periodos --------------------------------------------------
    legado = [p for p in range(1, 21) if "%dperiodo" % p in presentes]
    maior_disc = velho.execute("SELECT MAX(periodo) FROM disciplinas").fetchone()[0] or 0
    total = n_periodos or max([maior_disc] + legado or [0])
    if n_periodos and maior_disc > n_periodos:
        avisos.append("ha disciplinas ate o %dº periodo, mas foram pedidos %d periodos;"
                      " as excedentes nao serao migradas." % (maior_disc, n_periodos))

    # O turno e inferido apenas dos dias uteis: sabado e sempre de manha e
    # poluiria a contagem (as disciplinas de sabado ocupam a manha mesmo em
    # periodos que sao de tarde).
    usados = defaultdict(lambda: {"manha": 0, "tarde": 0})
    for p in legado:
        for r in velho.execute('SELECT id, horario FROM "%dperiodo"' % p):
            dia, hora = divmod(r["id"] - 1, HORAS_LEGADO)
            if r["horario"] > 0 and dia < 5:
                usados[p][horarios[hora][1]] += 1

    turnos = {}
    for p in range(1, total + 1):
        m, t = usados[p]["manha"], usados[p]["tarde"]
        turnos[p] = "tarde" if t > m else "manha"
        novo.execute("INSERT INTO periodos (curso_id, numero, turno) VALUES (?,?,?)",
                     (curso_id, p, turnos[p]))

    # ---- disciplinas -------------------------------------------------------
    # Agrupa "Disciplina - A" e "- B" numa disciplina so, com um professor por
    # fatia de carga horaria.
    brutas = []
    for r in velho.execute("SELECT id, nome, periodo, chsemanal, idprofessor"
                           " FROM disciplinas ORDER BY id"):
        if r["idprofessor"] not in profs:
            avisos.append("disciplina %d (%s) aponta para professor %s inexistente"
                          " - NAO migrada." % (r["id"], r["nome"], r["idprofessor"]))
            continue
        if r["periodo"] > total:
            avisos.append("disciplina %d (%s) e do %dº periodo, fora dos %d configurados"
                          " - NAO migrada." % (r["id"], r["nome"], r["periodo"], total))
            continue
        brutas.append((r["id"], " ".join(r["nome"].split()), r["periodo"],
                       r["chsemanal"], r["idprofessor"]))

    grupos = defaultdict(list)
    for did, nome, per, ch, pid in brutas:
        m = SUFIXO.match(nome) if unificar else None
        chave = (m.group(1), per) if m else (nome, per, did)
        grupos[chave].append((did, nome, per, ch, pid))

    mapa = {}           # id antigo -> (id novo, professor_id)
    unificadas = []
    for chave, membros in grupos.items():
        membros.sort()
        novo_id = membros[0][0]
        per = membros[0][2]
        if len(membros) > 1:
            nome = chave[0]
            unificadas.append((novo_id, nome, [(m[1], profs[m[4]], m[3]) for m in membros]))
        else:
            nome = membros[0][1]
        ch_total = sum(m[3] for m in membros)
        novo.execute("INSERT INTO disciplinas (id, curso_id, nome, periodo,"
                     " aulas_semanais) VALUES (?,?,?,?,?)",
                     (novo_id, curso_id, nome, per, ch_total))
        por_prof = defaultdict(int)
        for did, _n, _p, ch, pid in membros:
            mapa[did] = (novo_id, pid)
            por_prof[pid] += ch
        for pid, ch in por_prof.items():
            novo.execute("INSERT INTO disciplina_professores (disciplina_id, professor_id, aulas)"
                         " VALUES (?,?,?)", (novo_id, pid, ch))

    # ---- indisponibilidades declaradas (valor -1 no banco antigo) ----------
    nind = 0
    for pid, nome in profs.items():
        tab = chave_legado(nome) + "_restricoes"
        if tab not in presentes:
            avisos.append("professor %s: tabela '%s' nao existe no banco antigo." % (nome, tab))
            continue
        for r in velho.execute('SELECT id, horario FROM "%s"' % tab):
            if r["horario"] == -1:
                dia, hora = divmod(r["id"] - 1, HORAS_LEGADO)
                novo.execute("INSERT OR IGNORE INTO indisponibilidades"
                             " (professor_id, dia, hora) VALUES (?,?,?)", (pid, dia, hora))
                nind += 1

    # ---- alocacoes (grade + salas) -----------------------------------------
    nal = 0
    nsemsala = 0
    for p in legado:
        if p > total:
            continue
        grade = {r["id"]: r["horario"]
                 for r in velho.execute('SELECT id, horario FROM "%dperiodo"' % p)}
        salag = {}
        if "%dperiodosalas" % p in presentes:
            salag = {r["id"]: r["horario"]
                     for r in velho.execute('SELECT id, horario FROM "%dperiodosalas"' % p)}

        for pos, did in sorted(grade.items()):
            if did <= 0:
                continue
            dia, hora = divmod(pos - 1, HORAS_LEGADO)
            if did not in mapa:
                avisos.append("periodo %d %s: disciplina %d inexistente - ignorada."
                              % (p, descr(dia, hora), did))
                continue
            novo_id, pid = mapa[did]
            nome_sala = (salag.get(pos) or "").strip()
            sid = salas.get(nome_sala) if nome_sala else None
            if nome_sala and sid is None:
                avisos.append("periodo %d %s: sala '%s' inexistente - alocada sem sala."
                              % (p, descr(dia, hora), nome_sala))
            if sid is None:
                nsemsala += 1
            novo.execute("INSERT INTO alocacoes (curso_id, periodo, dia, hora,"
                         " disciplina_id, professor_id, sala_id)"
                         " VALUES (?,?,?,?,?,?,?)",
                         (curso_id, p, dia, hora, novo_id, pid, sid))
            nal += 1

    # ---- atributos inferidos da grade --------------------------------------
    # Sabado so vale para disciplina que ja ocupa sabado hoje.
    novo.execute("UPDATE disciplinas SET permite_sabado = 1 WHERE id IN"
                 " (SELECT disciplina_id FROM alocacoes WHERE dia = 5)")
    nsab = novo.execute(
        "SELECT COUNT(*) FROM disciplinas WHERE permite_sabado = 1").fetchone()[0]

    # Optativas, pela nomenclatura em uso. Heuristica de nome: e a unica pista
    # que o banco antigo guarda sobre quais disciplinas sao optativas.
    if heuristicas_nome:
        novo.execute("UPDATE disciplinas SET optativa = 1"
                     " WHERE nome LIKE 'HUM -%' OR nome LIKE 'OPT -%'")
    nopt = novo.execute(
        "SELECT COUNT(*) FROM disciplinas WHERE optativa = 1").fetchone()[0]

    # Disciplinas que nao ocupam sala: todas as aulas sem sala ou numa sala
    # "Remota ...", que no banco antigo era uma sala-fantasma justamente para
    # contornar a exigencia de sala. Tambem heuristica de nome.
    remotas = []
    if heuristicas_nome:
        remotas = list(novo.execute(
            "SELECT d.id, d.nome FROM disciplinas d"
            " WHERE EXISTS (SELECT 1 FROM alocacoes a WHERE a.disciplina_id = d.id)"
            "   AND NOT EXISTS (SELECT 1 FROM alocacoes a"
            "                   JOIN salas s ON s.id = a.sala_id"
            "                   WHERE a.disciplina_id = d.id"
            "                     AND s.nome NOT LIKE 'Remota%')"))
        for did, _nome in remotas:
            novo.execute("UPDATE disciplinas SET exige_sala = 0 WHERE id = ?", (did,))

    # Fatias cujo padrao de blocos atual nao consta de `padroes_blocos`.
    # A disciplina passa a ter blocos livres e prioridade baixa: ela se encaixa
    # nas folgas em vez de disputar horario com as demais.
    padroes = {(ch, p) for ch, p in novo.execute("SELECT aulas, padrao FROM padroes_blocos")}
    turno_hora = dict(novo.execute("SELECT indice, turno FROM horarios"))
    fatias = defaultdict(list)
    for did, pid, dia, hora in novo.execute(
            "SELECT disciplina_id, professor_id, dia, hora FROM alocacoes"):
        fatias[(did, pid)].append((dia, hora))

    fora_padrao = []
    for (did, pid), aulas in sorted(fatias.items()):
        por_dia = defaultdict(list)
        for dia, hora in aulas:
            por_dia[dia].append(hora)
        blocos = []
        for dia in sorted(por_dia):
            hs = sorted(por_dia[dia])
            corrida = 1
            for i in range(1, len(hs)):
                contiguo = (hs[i] == hs[i - 1] + 1
                            and turno_hora[hs[i]] == turno_hora[hs[i - 1]])
                if contiguo:
                    corrida += 1
                else:
                    blocos.append(corrida)
                    corrida = 1
            blocos.append(corrida)
        blocos.sort(reverse=True)
        padrao = "+".join(str(b) for b in blocos)
        if (sum(blocos), padrao) not in padroes:
            fora_padrao.append((did, pid, padrao, sum(blocos)))
            novo.execute("UPDATE disciplinas SET blocos_livres = 1, prioridade = 3"
                         " WHERE id = ?", (did,))

    # Disciplinas em que a grade atual e curta demais para revelar o padrao de
    # blocos: com uma aula so, existe um unico padrao possivel. Nao se infere
    # nada nelas - `prioridade` e `blocos_livres` ficam no padrao e voce ajusta
    # na interface, que e onde essas propriedades pertencem.
    sem_sinal = list(novo.execute(
        "SELECT d.id, d.nome, d.aulas_semanais,"
        "       (SELECT COUNT(*) FROM alocacoes a WHERE a.disciplina_id = d.id)"
        " FROM disciplinas d WHERE d.aulas_semanais <= 2"
        " ORDER BY d.aulas_semanais, d.nome"))

    # Turno proprio: disciplina obrigatoria cujas aulas em dia util caem no
    # turno oposto ao do periodo. A optativa fica de fora mesmo estando no
    # contraturno na grade antiga: turno forcado e regra dura, e quem escolhe
    # qual optativa vai ao contraturno e o gerador.
    contraturno = []
    consulta = ("SELECT d.id, d.nome, p.turno, h.turno, COUNT(*), d.optativa"
                " FROM alocacoes a"
                " JOIN disciplinas d ON d.id = a.disciplina_id"
                " JOIN periodos    p ON p.numero = a.periodo"
                " JOIN horarios    h ON h.indice = a.hora"
                " WHERE a.dia < 5 GROUP BY d.id, h.turno")
    por_disc = defaultdict(dict)
    turno_periodo = {}
    nomes = {}
    optativas = set()
    for did, nome, tp, th, n, opt in novo.execute(consulta).fetchall():
        por_disc[did][th] = n
        turno_periodo[did] = tp
        nomes[did] = nome
        if opt:
            optativas.add(did)
    for did, cont in por_disc.items():
        proprio = max(cont, key=cont.get)
        if proprio != turno_periodo[did] and did not in optativas:
            contraturno.append((did, nomes[did], proprio))
            novo.execute("UPDATE disciplinas SET turno = ? WHERE id = ?", (proprio, did))

    # Optativas não contam: o gerador as põe no contraturno quando convém.
    novo.execute(
        "UPDATE periodos SET"
        " max_disciplinas_contraturno = (SELECT COUNT(*) FROM disciplinas d"
        "   WHERE d.periodo = periodos.numero AND d.turno IS NOT NULL"
        "   AND d.optativa = 0)")

    # ---- tipos de disciplina -----------------------------------------------
    # Derivados das PROPRIEDADES ja inferidas, nunca dos nomes: disciplinas que
    # acabaram com a mesma combinacao de caracteristicas viram um tipo. Os nomes
    # gerados sao descritivos e servem so de rotulo inicial - renomeie a vontade.
    grupos_tipo = defaultdict(list)
    for did, ex, ts, bl, pr, sab, opt in novo.execute(
            "SELECT id, exige_sala, tipo_sala, blocos_livres, prioridade,"
            " permite_sabado, optativa FROM disciplinas"):
        grupos_tipo[(ex, ts, bl, pr, sab, opt)].append(did)

    def nome_tipo(ex, ts, bl, pr, sab, opt):
        detalhes = []
        if not ex:
            detalhes.append("sem sala")
        elif ts:
            detalhes.append("só %s" % ts)
        if bl:
            detalhes.append("blocos livres")
        if pr == 3:
            detalhes.append("prioridade baixa")
        elif pr == 1:
            detalhes.append("prioridade alta")
        if sab:
            detalhes.append("sábado")
        base = "Optativa" if opt else "Regular"
        return base + (" — " + ", ".join(detalhes) if detalhes else "")

    tipos = []
    for i, (chave, ids) in enumerate(sorted(grupos_tipo.items()), start=1):
        ex, ts, bl, pr, sab, opt = chave
        novo.execute("INSERT INTO tipos_disciplina (id, nome, exige_sala, tipo_sala,"
                     " blocos_livres, prioridade, permite_sabado, optativa)"
                     " VALUES (?,?,?,?,?,?,?,?)",
                     (i, nome_tipo(*chave), ex, ts, bl, pr, sab, opt))
        novo.executemany("UPDATE disciplinas SET tipo_id = ? WHERE id = ?",
                         [(i, d) for d in ids])
        tipos.append((i, nome_tipo(*chave), len(ids)))

    novo.commit()

    # ---- conferencia -------------------------------------------------------
    ndisc = novo.execute("SELECT COUNT(*) FROM disciplinas").fetchone()[0]
    print("origem : %s" % origem)
    print("destino: %s\n" % destino)
    print("  curso ................ %s" % nome_curso)
    print("  períodos ............. %d" % total)
    print("  professores .......... %d" % len(profs))
    print("  salas ................ %d" % len(salas))
    print("  disciplinas .......... %d  (de %d registros do banco antigo)"
          % (ndisc, len(brutas)))
    print("  indisponibilidades ... %d" % nind)
    print("  alocações ............ %d  (%d sem sala)" % (nal, nsemsala))
    print("  optativas ............ %d" % nopt)
    print("  liberadas p/ sábado .. %d" % nsab)

    print("\n  tipos de disciplina derivados das propriedades:")
    for i, nome, n in tipos:
        print("    %d  %-58s %2d disc." % (i, nome, n))

    if remotas:
        print("\n  disciplinas sem sala (exige_sala = 0) — confira:")
        for did, nome in remotas:
            print("    %3d  %s" % (did, nome))

    if fora_padrao:
        print("\n  fatias fora dos padrões de bloco"
              " (disciplina marcada blocos_livres + prioridade 3):")
        for did, pid, padrao, ch in fora_padrao:
            nome = novo.execute("SELECT nome FROM disciplinas WHERE id = ?",
                                (did,)).fetchone()[0]
            print("    %-40s %-12s aulas=%-2d %s" % (nome[:40], profs[pid], ch, padrao))
        print("    (%d de %d fatias; as outras %d seguem os padrões)"
              % (len(fora_padrao), len(fatias), len(fatias) - len(fora_padrao)))

    if sem_sinal:
        print("\n  aulas de menos para inferir padrão de bloco — nada foi deduzido,"
              "\n  ajuste prioridade/blocos_livres na interface se for o caso:")
        for did, nome, ch, al in sem_sinal:
            print("    %3d  %-45s aulas=%d alocado=%d" % (did, nome[:45], ch, al))

    if unificadas:
        print("\n  disciplinas unificadas (uma disciplina, vários professores):")
        for did, nome, membros in unificadas:
            print("    %3d  %s" % (did, nome))
            for orig, prof, ch in membros:
                print("           %-42s %-12s %d aulas" % (orig[:42], prof, ch))

    print("\n  turno por período (contado só em dias úteis):")
    for p in range(1, total + 1):
        n = novo.execute("SELECT max_disciplinas_contraturno FROM periodos"
                         " WHERE numero = ?", (p,)).fetchone()[0]
        extra = "  + %d no contraturno" % n if n else ""
        print("    %2dº: %-6s (manhã %2d / tarde %2d)%s"
              % (p, turnos[p], usados[p]["manha"], usados[p]["tarde"], extra))

    if contraturno:
        print("\n  disciplinas marcadas para o contraturno:")
        for did, nome, t in contraturno:
            print("    %3d  %-45s -> %s" % (did, nome[:45], t))

    print("\n  consistência:")
    ch_bad = list(novo.execute(
        "SELECT d.id, d.curso_id, d.nome, d.aulas_semanais,"
        "       COALESCE((SELECT SUM(aulas) FROM disciplina_professores dp"
        "                  WHERE dp.disciplina_id = d.id), 0) AS distribuidas"
        "  FROM disciplinas d WHERE d.aulas_semanais <> distribuidas"))
    print("    aulas da disciplina x soma das fatias: %s"
          % ("ok" if not ch_bad else "%d divergências" % len(ch_bad)))
    for _i, _c, nome, esperado, dist in ch_bad[:10]:
        print("      %-45s disciplina %d  fatias %d" % (nome[:45], esperado, dist))

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
    print("    aulas alocadas x fatia contratada: %s"
          % ("ok" if not al_bad else "%d divergências" % len(al_bad)))
    for _d, _c, nome, _p, prof, prev, real in al_bad[:10]:
        print("      %-38s %-12s previsto %d  alocado %d" % (nome[:38], prof, prev, real))

    cp = list(novo.execute(
        "SELECT dia, hora, professor_id, COUNT(*) c FROM alocacoes"
        " GROUP BY dia, hora, professor_id HAVING c > 1"))
    cs = list(novo.execute(
        "SELECT dia, hora, sala_id, COUNT(*) c FROM alocacoes"
        " WHERE sala_id IS NOT NULL"
        " GROUP BY dia, hora, sala_id HAVING c > 1"))
    print("    professor em dois lugares: %d" % len(cp))
    for dia, hora, pid, c in cp[:10]:
        print("      %-14s %s (%d turmas)" % (profs[pid], descr(dia, hora), c))
    print("    sala em dois lugares:      %d" % len(cs))
    nomes_sala = {v: k for k, v in salas.items()}
    for dia, hora, sid, c in cs[:10]:
        print("      %-14s %s (%d turmas)" % (nomes_sala[sid], descr(dia, hora), c))

    if avisos:
        print("\n  avisos (%d):" % len(avisos))
        for a in avisos:
            print("    - %s" % a)

    novo.close()
    velho.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("origem")
    ap.add_argument("-o", "--destino", default="distribuicao.db")
    ap.add_argument("-p", "--periodos", type=int,
                    help="quantos períodos criar (padrão: o que houver no banco antigo)")
    ap.add_argument("--nao-unificar", action="store_true",
                    help="mantém 'Disciplina - A' e '- B' como disciplinas separadas")
    ap.add_argument("-c", "--curso", default="Curso convertido",
                    help="nome do curso criado com os dados convertidos")
    ap.add_argument("--sem-heuristicas-de-nome", action="store_true",
                    help="não deduz optativa nem exige_sala a partir de nomes;"
                         " esses campos ficam no padrão para você preencher")
    ap.add_argument("-s", "--migracoes",
                    default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         "migracoes"))
    a = ap.parse_args()
    if not os.path.exists(a.origem):
        sys.exit("banco de origem nao encontrado: %s" % a.origem)
    migrar(a.origem, a.destino, a.migracoes, a.periodos, not a.nao_unificar,
           not a.sem_heuristicas_de_nome, a.curso)
