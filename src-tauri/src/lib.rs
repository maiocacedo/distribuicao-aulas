use serde::{Deserialize, Serialize};
use serde_json::Value as Json;
use sqlx::{Acquire, Sqlite};
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State};
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
        Migration {
            version: 10,
            description: "regras e integridade",
            sql: include_str!("../../scripts/migracoes/010_regras_e_integridade.sql"),
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

/// O arquivo do banco, resolvido como o plugin SQL o resolve: o que vem depois
/// de `sqlite:` é relativo à pasta de configuração do app (um caminho absoluto,
/// o do smoke, substitui a pasta inteira).
fn arquivo_do_banco(app: &AppHandle, url: &str) -> Result<PathBuf, String> {
    let (_, relativo) = url
        .split_once(':')
        .ok_or_else(|| format!("URL do banco sem ':': {url}"))?;
    let mut caminho = app.path().app_config_dir().map_err(|e| e.to_string())?;
    caminho.push(relativo);
    Ok(caminho)
}

/// `distribuicao.db` + `.importado` = `distribuicao.db.importado`.
fn com_sufixo(arquivo: &Path, sufixo: &str) -> PathBuf {
    let mut nome = arquivo.as_os_str().to_owned();
    nome.push(sufixo);
    PathBuf::from(nome)
}

async fn pool_do_banco(
    instancias: &DbInstances,
    banco: &str,
) -> Result<sqlx::Pool<Sqlite>, String> {
    let mapa = instancias.0.read().await;
    let DbPool::Sqlite(pool) = mapa
        .get(banco)
        .ok_or_else(|| format!("banco '{banco}' não está carregado"))?;
    Ok(pool.clone())
}

/// Grava uma cópia do banco na pasta Downloads e devolve o caminho. A cópia é
/// a do `VACUUM INTO`: um arquivo só, consistente, sem o diário WAL ao lado —
/// é o mesmo `.db` que a versão do navegador importa.
#[tauri::command]
async fn exportar_banco(
    app: AppHandle,
    instancias: State<'_, DbInstances>,
    estado: State<'_, Banco>,
    nome: String,
) -> Result<String, String> {
    // Só o nome do arquivo: o front não escolhe pasta.
    let nome = Path::new(&nome)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| n.ends_with(".db"))
        .ok_or("nome de arquivo inválido")?
        .to_owned();
    let pasta = app.path().download_dir().map_err(|e| e.to_string())?;
    let base = nome.trim_end_matches(".db").to_owned();
    // `VACUUM INTO` recusa um destino que já existe: "nome (2).db", "(3)"...
    let mut destino = pasta.join(&nome);
    let mut n = 2;
    while destino.exists() {
        destino = pasta.join(format!("{base} ({n}).db"));
        n += 1;
    }
    let texto = destino
        .to_str()
        .ok_or("caminho de destino não é texto")?
        .to_owned();
    let pool = pool_do_banco(&instancias, &estado.0).await?;
    sqlx::query("VACUUM INTO ?")
        .bind(&texto)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(texto)
}

#[derive(Serialize)]
pub struct Resumo {
    cursos: i64,
    professores: i64,
    disciplinas: i64,
}

const CABECALHO_SQLITE: &[u8] = b"SQLite format 3\0";

const NAO_E_SQLITE: &str = "O arquivo não é um banco deste aplicativo: não é um banco SQLite.";

fn nao_e_do_app(motivo: &str) -> String {
    format!("O arquivo é um banco SQLite, mas não é um banco deste aplicativo: {motivo}.")
}

/// Confere o arquivo importado. O registro de migrações dele é comparado com o
/// deste executável: na próxima abertura o plugin roda as migrações sobre ele,
/// e uma versão desconhecida ou um checksum diferente impediriam o app de
/// abrir — a recusa tem de vir agora, com o banco atual ainda no lugar.
async fn conferir_arquivo(pool: &sqlx::Pool<Sqlite>) -> Result<Resumo, String> {
    use sqlx::Row;

    let integro: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(pool)
        .await
        .map_err(|_| NAO_E_SQLITE.to_owned())?;
    if integro != "ok" {
        return Err("O arquivo é um banco SQLite, mas está corrompido.".into());
    }
    let tem_registro: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    if tem_registro.is_none() {
        return Err(nao_e_do_app("falta o registro de migrações"));
    }

    // O checksum é o que o plugin calcula: SHA-384 do SQL da migração.
    let conhecidas: Vec<sqlx::migrate::Migration> = migracoes()
        .into_iter()
        .map(|m| {
            sqlx::migrate::Migration::new(
                m.version,
                m.description.into(),
                sqlx::migrate::MigrationType::Simple,
                m.sql.into(),
                false,
            )
        })
        .collect();
    let aplicadas = sqlx::query("SELECT version, success, checksum FROM _sqlx_migrations")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    for linha in aplicadas {
        let versao: i64 = linha.try_get("version").map_err(|e| e.to_string())?;
        let sucesso: bool = linha.try_get("success").map_err(|e| e.to_string())?;
        let checksum: Vec<u8> = linha.try_get("checksum").map_err(|e| e.to_string())?;
        if !sucesso {
            return Err(format!(
                "Este banco não pode ser importado: a migração {versao} ficou pela metade."
            ));
        }
        match conhecidas.iter().find(|m| m.version == versao) {
            None => {
                return Err(format!(
                    "Este banco não pode ser importado: ele está na versão {versao} do esquema, \
                     mais nova que a deste executável. Atualize o aplicativo."
                ))
            }
            Some(m) if *m.checksum != checksum[..] => {
                return Err(format!(
                    "Este banco não pode ser importado: a migração {versao} dele é diferente \
                     da deste executável."
                ))
            }
            Some(_) => {}
        }
    }

    let mut contagens = [0i64; 3];
    for (i, tabela) in ["cursos", "professores", "disciplinas"].iter().enumerate() {
        contagens[i] = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {tabela}"))
            .fetch_one(pool)
            .await
            .map_err(|_| nao_e_do_app(&format!("falta a tabela {tabela}")))?;
    }
    Ok(Resumo {
        cursos: contagens[0],
        professores: contagens[1],
        disciplinas: contagens[2],
    })
}

/// Primeira metade da importação: grava o arquivo escolhido ao lado do banco
/// (`distribuicao.db.importado`), confere e devolve o que ele tem, para a
/// confirmação dizer o que vai entrar. O banco atual não é tocado. O corpo do
/// invoke é o próprio arquivo, em bytes.
#[tauri::command]
async fn conferir_importacao(
    app: AppHandle,
    estado: State<'_, Banco>,
    request: Request<'_>,
) -> Result<Resumo, String> {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("o arquivo não chegou em bytes".into());
    };
    if bytes.len() < 100 || &bytes[..16] != CABECALHO_SQLITE {
        return Err(NAO_E_SQLITE.into());
    }
    let mut copia = bytes.clone();
    // Bytes 18 e 19: modo de diário comum, não WAL — o arquivo chega sem o
    // `-wal` dele (o mesmo que o banco do navegador faz ao importar).
    copia[18] = 1;
    copia[19] = 1;
    let pendente = com_sufixo(&arquivo_do_banco(&app, &estado.0)?, ".importado");
    std::fs::write(&pendente, &copia).map_err(|e| e.to_string())?;

    let resumo = match SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(SqliteConnectOptions::new().filename(&pendente))
        .await
    {
        Err(_) => Err(NAO_E_SQLITE.to_owned()),
        Ok(pool) => {
            let r = conferir_arquivo(&pool).await;
            pool.close().await;
            r
        }
    };
    if resumo.is_err() {
        let _ = std::fs::remove_file(&pendente);
    }
    resumo
}

/// Segunda metade: fecha o banco, guarda o atual como
/// `distribuicao.db.anterior`, põe o importado no lugar e reinicia o app, que
/// abre o novo e roda as migrações que faltarem.
#[tauri::command]
async fn aplicar_importacao(
    app: AppHandle,
    instancias: State<'_, DbInstances>,
    estado: State<'_, Banco>,
) -> Result<(), String> {
    let arquivo = arquivo_do_banco(&app, &estado.0)?;
    let pendente = com_sufixo(&arquivo, ".importado");
    if !pendente.exists() {
        return Err("Nenhum arquivo conferido para importar.".into());
    }
    {
        // Fechar a pool grava o WAL no arquivo e solta os handles: no Windows
        // um arquivo aberto não pode ser renomeado.
        let mapa = instancias.0.write().await;
        for pool in mapa.values() {
            let DbPool::Sqlite(pool) = pool;
            pool.close().await;
        }
    }
    let anterior = com_sufixo(&arquivo, ".anterior");
    let _ = std::fs::remove_file(&anterior);
    if arquivo.exists() {
        std::fs::rename(&arquivo, &anterior).map_err(|e| e.to_string())?;
    }
    for sufixo in ["-wal", "-shm"] {
        let lado = com_sufixo(&arquivo, sufixo);
        if lado.exists() {
            let _ = std::fs::rename(&lado, com_sufixo(&anterior, sufixo));
        }
    }
    std::fs::rename(&pendente, &arquivo).map_err(|e| e.to_string())?;
    app.restart()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let url = url_do_banco();
    tauri::Builder::default()
        .manage(Banco(url.clone()))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&url, migracoes())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            transacao,
            banco,
            exportar_banco,
            conferir_importacao,
            aplicar_importacao
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
