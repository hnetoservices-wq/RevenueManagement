use serde::Deserialize;
use sqlx::{sqlite::SqliteConnectOptions, Connection, SqliteConnection};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportPayload {
    summary: ImportSummary,
    reservations: Vec<ReservationPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportSummary {
    id: String,
    property_id: String,
    source: String,
    filename: String,
    imported_at: String,
    data_as_of: String,
    file_hash: String,
    row_count: i64,
    valid_row_count: i64,
    warning_count: i64,
    excluded_row_count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReservationPayload {
    property_id: String,
    reservation_id: String,
    check_in: String,
    check_out: String,
    booked_at: Option<String>,
    source: String,
    source_status: String,
    status: String,
    country: Option<String>,
    rooms: Vec<RoomPayload>,
    room_quantity: i64,
    tourist_tax_cents: i64,
    extra_revenue_excl_cents: i64,
    extra_revenue_incl_cents: i64,
    room_revenue_excl_cents: i64,
    room_revenue_incl_cents: i64,
    total_booking_value_cents: i64,
    amount_due_cents: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RoomPayload {
    room_type_name: String,
    quantity: i64,
}

fn database_error(error: sqlx::Error) -> String {
    let message = error.to_string();
    if message.contains(
        "UNIQUE constraint failed: import_snapshots.property_id, import_snapshots.file_hash",
    ) {
        "DUPLICATE_IMPORT".to_string()
    } else {
        message
    }
}

#[tauri::command]
async fn save_import_snapshot(
    app: tauri::AppHandle,
    payload: ImportPayload,
) -> Result<(), String> {
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("revenue-manager.db");
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(false)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(database_error)?;
    let mut transaction = connection.begin().await.map_err(database_error)?;
    let summary = &payload.summary;

    sqlx::query(
        r#"INSERT INTO import_snapshots
           (id, property_id, source, original_filename, imported_at, data_as_of, file_hash,
            row_count, valid_row_count, warning_count, excluded_row_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&summary.id)
    .bind(&summary.property_id)
    .bind(&summary.source)
    .bind(&summary.filename)
    .bind(&summary.imported_at)
    .bind(&summary.data_as_of)
    .bind(&summary.file_hash)
    .bind(summary.row_count)
    .bind(summary.valid_row_count)
    .bind(summary.warning_count)
    .bind(summary.excluded_row_count)
    .execute(&mut *transaction)
    .await
    .map_err(database_error)?;

    for reservation in &payload.reservations {
        sqlx::query(
            r#"INSERT INTO reservation_snapshots
               (snapshot_id, property_id, reservation_id, check_in, check_out, booked_at,
                source, source_status, normalized_status, country, room_quantity,
                tourist_tax_cents, extra_revenue_excl_cents, extra_revenue_incl_cents,
                room_revenue_excl_cents, room_revenue_incl_cents,
                total_booking_value_cents, amount_due_cents)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&summary.id)
        .bind(&reservation.property_id)
        .bind(&reservation.reservation_id)
        .bind(&reservation.check_in)
        .bind(&reservation.check_out)
        .bind(reservation.booked_at.as_deref())
        .bind(&reservation.source)
        .bind(&reservation.source_status)
        .bind(&reservation.status)
        .bind(reservation.country.as_deref())
        .bind(reservation.room_quantity)
        .bind(reservation.tourist_tax_cents)
        .bind(reservation.extra_revenue_excl_cents)
        .bind(reservation.extra_revenue_incl_cents)
        .bind(reservation.room_revenue_excl_cents)
        .bind(reservation.room_revenue_incl_cents)
        .bind(reservation.total_booking_value_cents)
        .bind(reservation.amount_due_cents)
        .execute(&mut *transaction)
        .await
        .map_err(database_error)?;

        for room in &reservation.rooms {
            let result = sqlx::query(
                r#"INSERT INTO reservation_room_snapshots
                   (snapshot_id, property_id, reservation_id, room_type_id, room_type_name, quantity)
                   SELECT ?, ?, ?, id, canonical_name, ? FROM room_types
                   WHERE property_id = ? AND lower(canonical_name) = lower(?)"#,
            )
            .bind(&summary.id)
            .bind(&reservation.property_id)
            .bind(&reservation.reservation_id)
            .bind(room.quantity)
            .bind(&reservation.property_id)
            .bind(&room.room_type_name)
            .execute(&mut *transaction)
            .await
            .map_err(database_error)?;

            if result.rows_affected() != 1 {
                return Err(format!("Unknown room type: {}", room.room_type_name));
            }
        }
    }

    transaction.commit().await.map_err(database_error)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial_revenue_management_schema",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:revenue-manager.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![save_import_snapshot])
        .run(tauri::generate_context!())
        .expect("error while running Local Revenue Manager");
}
