use serde::{Deserialize, Serialize};
use serde_json::Value as Json;
use sqlx::{Acquire, Sqlite};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

/// As migrações vivem em `scripts/migracoes/`, fonte única: os mesmos arquivos
/// criam o banco da aplicação e são aplicados pela conversão do banco antigo
/// (`scripts/migrar.py`).
///
/// Regra: um arquivo já publicado NUNCA é editado — bancos existentes não o
/// executariam de novo. Toda alteração de esquema é um arquivo novo com o
/// próximo número, acrescentado também a esta lista.
fn migracoes() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "esquema inicial",
            sql: include_str!("../../scripts/migracoes/001_esquema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "codigo e duracao dos horarios",
            sql: include_str!("../../scripts/migracoes/002_horarios_codigo.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "unidade e a aula, nao a hora",
            sql: include_str!("../../scripts/migracoes/003_aulas_em_vez_de_horas.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "conversao horas de curriculo para aulas semanais",
            sql: include_str!("../../scripts/migracoes/004_horas_por_aula.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "varios cursos compartilhando professores e salas",
            sql: include_str!("../../scripts/migracoes/005_varios_cursos.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "requisito de sala por tipo",
            sql: include_str!("../../scripts/migracoes/006_requisito_de_sala.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "abreviacao da disciplina",
            sql: include_str!("../../scripts/migracoes/007_abreviacao.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "horarios fixos da instituicao, turnos por curso",
            sql: include_str!("../../scripts/migracoes/008_turnos_do_curso.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "sabado so de manha",
            sql: include_str!("../../scripts/migracoes/009_sabado_manha.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[derive(Deserialize)]
pub struct Instrucao {
    sql: String,
    #[serde(default)]
    params: Vec<Json>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resultado {
    rows_affected: u64,
    last_insert_id: i64,
}

fn amarrar<'q>(
    consulta: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    valor: &'q Json,
) -> sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match valor {
        Json::Null => consulta.bind(None::<String>),
        Json::Bool(b) => consulta.bind(*b),
        Json::Number(n) => match n.as_i64() {
            Some(i) => consulta.bind(i),
            None => consulta.bind(n.as_f64().unwrap_or(0.0)),
        },
        Json::String(s) => consulta.bind(s.as_str()),
        // Arrays e objetos não têm representação nativa; viram texto JSON.
        outro => consulta.bind(outro.to_string()),
    }
}

/// Executa uma sequência de instruções numa transação única: ou todas valem,
/// ou nenhuma vale.
///
/// Existe por dois motivos, e o segundo é o menos óbvio:
///
/// 1. Salvar uma disciplina, ou uma grade inteira, escreve em várias tabelas.
///    Falhar no meio deixaria o banco num estado que nenhuma tela sabe
///    representar.
///
/// 2. `PRAGMA foreign_keys` vale por CONEXÃO, e o plugin trabalha com uma pool
///    de várias. Ligá-lo uma vez pelo lado do JavaScript acerta uma conexão e
///    deixa as outras sem verificação nenhuma. Aqui a conexão é adquirida,
///    configurada e usada — nessa ordem, e é a mesma do início ao fim.
#[tauri::command]
async fn transacao(
    instancias: State<'_, DbInstances>,
    banco: String,
    instrucoes: Vec<Instrucao>,
) -> Result<Resultado, String> {
    let mapa = instancias.0.read().await;
    // Só a feature `sqlite` está ligada, então esta é a única variante possível.
    let DbPool::Sqlite(pool) = mapa
        .get(&banco)
        .ok_or_else(|| format!("banco '{banco}' não está carregado"))?;

    let mut conexao = pool.acquire().await.map_err(|e| e.to_string())?;

    // Fora de qualquer transação, senão o PRAGMA é silenciosamente ignorado.
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *conexao)
        .await
        .map_err(|e| e.to_string())?;

    let mut tx = conexao.begin().await.map_err(|e| e.to_string())?;

    let mut afetadas = 0u64;
    let mut ultimo = 0i64;
    for instrucao in &instrucoes {
        let mut consulta = sqlx::query(&instrucao.sql);
        for p in &instrucao.params {
            consulta = amarrar(consulta, p);
        }
        let r = consulta
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        afetadas += r.rows_affected();
        ultimo = r.last_insert_rowid();
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(Resultado {
        rows_affected: afetadas,
        last_insert_id: ultimo,
    })
}

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
