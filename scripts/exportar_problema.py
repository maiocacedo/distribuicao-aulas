"""
Exporta o problema de montagem da grade de um curso para JSON.

    python scripts/exportar_problema.py <banco.db> [--curso 1] [-o problema.json]

Existe para que o solver possa ser rodado e medido fora do aplicativo, contra
dados reais. Sem isto, a única forma de saber se ele presta seria clicar na
interface e olhar.
"""
import argparse
import json
import os
import sqlite3
import sys
from collections import defaultdict


def exportar(caminho, curso_id):
    con = sqlite3.connect("file:%s?mode=ro" % caminho.replace(os.sep, "/"), uri=True)
    con.row_factory = sqlite3.Row

    dias = con.execute(
        "SELECT valor FROM configuracao WHERE chave = 'dias_letivos'").fetchone()
    dias = int(dias["valor"]) if dias else 6

    sab = con.execute(
        "SELECT valor FROM configuracao WHERE chave = 'turnos_sabado'").fetchone()
    turnos_sabado = (sab["valor"] if sab else "manha").split(",")

    horarios = [dict(indice=r["indice"], turno=r["turno"])
                for r in con.execute("SELECT indice, turno FROM horarios ORDER BY indice")]

    periodos = [dict(numero=r["numero"], turno=r["turno"],
                     maxContraturno=r["max_disciplinas_contraturno"])
                for r in con.execute(
                    "SELECT * FROM periodos WHERE curso_id = ? ORDER BY numero", (curso_id,))]

    salas_por_disciplina = defaultdict(list)
    for r in con.execute(
            "SELECT ds.disciplina_id, ds.sala_id FROM disciplina_salas ds"
            " JOIN disciplinas d ON d.id = ds.disciplina_id WHERE d.curso_id = ?",
            (curso_id,)):
        salas_por_disciplina[r["disciplina_id"]].append(r["sala_id"])

    fatias = []
    for r in con.execute(
            """SELECT dp.disciplina_id, dp.professor_id, dp.aulas, d.nome, d.periodo,
                      d.permite_sabado, d.turno, d.optativa, d.exige_sala, d.tipo_sala,
                      d.prioridade, d.blocos_livres
                 FROM disciplina_professores dp
                 JOIN disciplinas d ON d.id = dp.disciplina_id
                WHERE d.curso_id = ?""", (curso_id,)):
        fatias.append(dict(
            disciplinaId=r["disciplina_id"],
            professorId=r["professor_id"],
            nome=r["nome"],
            periodo=r["periodo"],
            aulas=r["aulas"],
            permiteSabado=bool(r["permite_sabado"]),
            turno=r["turno"],
            optativa=bool(r["optativa"]),
            exigeSala=bool(r["exige_sala"]),
            tipoSala=r["tipo_sala"],
            salas=salas_por_disciplina.get(r["disciplina_id"], []),
            prioridade=r["prioridade"],
            blocosLivres=bool(r["blocos_livres"]),
        ))

    padroes = defaultdict(list)
    for r in con.execute("SELECT aulas, padrao, custo FROM padroes_blocos"):
        padroes[str(r["aulas"])].append(
            dict(partes=[int(x) for x in r["padrao"].split("+")], custo=r["custo"]))

    salas = [dict(id=r["id"], tipo=r["tipo"]) for r in con.execute("SELECT id, tipo FROM salas")]

    professores = [dict(id=r["id"], prefDias=r["pref_dias"], peso=r["pref_dias_peso"],
                        maxDias=r["max_dias_semana"])
                   for r in con.execute("SELECT * FROM professores")]

    indisponiveis = ["%d:%d:%d" % (r["professor_id"], r["dia"], r["hora"])
                     for r in con.execute("SELECT * FROM indisponibilidades")]

    fixadas = [dict(periodo=r["periodo"], dia=r["dia"], hora=r["hora"],
                    disciplinaId=r["disciplina_id"], professorId=r["professor_id"],
                    salaId=r["sala_id"])
               for r in con.execute(
                   "SELECT * FROM alocacoes WHERE curso_id = ? AND fixada = 1", (curso_id,))]

    return dict(dias=dias, horarios=horarios, periodos=periodos, fatias=fatias,
                padroes=dict(padroes), salas=salas, professores=professores,
                indisponiveis=indisponiveis, turnosSabado=turnos_sabado,
                fixadas=fixadas)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("banco")
    ap.add_argument("-c", "--curso", type=int, default=1)
    ap.add_argument("-o", "--saida", default="problema.json")
    a = ap.parse_args()
    if not os.path.exists(a.banco):
        sys.exit("banco não encontrado: %s" % a.banco)
    problema = exportar(a.banco, a.curso)
    with open(a.saida, "w", encoding="utf-8") as fh:
        json.dump(problema, fh, ensure_ascii=False, indent=1)
    print("%s: %d fatias, %d aulas, %d períodos, %d horários, %d salas"
          % (a.saida, len(problema["fatias"]),
             sum(f["aulas"] for f in problema["fatias"]),
             len(problema["periodos"]), len(problema["horarios"]),
             len(problema["salas"])))
