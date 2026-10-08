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
