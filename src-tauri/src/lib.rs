use serde::Deserialize;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode},
    Connection, SqliteConnection,
};
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PropertyPayload {
    id: String,
    name: String,
    currency: String,
    timezone: String,
    room_types: Vec<PropertyRoomTypePayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PropertyRoomTypePayload {
    id: String,
    property_id: String,
    canonical_name: String,
    inventory_count: i64,
    active_from: Option<String>,
    active_to: Option<String>,
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

fn database_error_at(stage: &str, error: sqlx::Error) -> String {
    let error = database_error(error);
    if error == "DUPLICATE_IMPORT" {
        error
    } else {
        format!("{stage}: {error}")
    }
}

async fn rollback_if_active(connection: &mut SqliteConnection) {
    if connection.is_in_transaction() {
        let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
    }
}

fn database_options(app: &tauri::AppHandle) -> Result<SqliteConnectOptions, String> {
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("revenue-manager.db");

    Ok(SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(false)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(30)))
}

#[tauri::command]
async fn save_property(app: tauri::AppHandle, property: PropertyPayload) -> Result<(), String> {
    if property.id.trim().is_empty() || property.name.trim().is_empty() {
        return Err("Property name is required".to_string());
    }
    if property.room_types.is_empty()
        || property.room_types.iter().map(|room| room.inventory_count).sum::<i64>() <= 0
    {
        return Err("At least one room must be configured".to_string());
    }
    if property
        .room_types
        .iter()
        .any(|room| room.property_id != property.id || room.canonical_name.trim().is_empty() || room.inventory_count <= 0)
    {
        return Err("Every configured room type must have a name and positive inventory".to_string());
    }

    let mut names = property
        .room_types
        .iter()
        .map(|room| room.canonical_name.trim().to_lowercase())
        .collect::<Vec<_>>();
    names.sort();
    if names.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err("Room type names must be unique within a property".to_string());
    }

    let options = database_options(&app)?;
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| database_error_at("open database", error))?;

    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut connection)
        .await
        .map_err(|error| database_error_at("begin property transaction", error))?;

    let property_result = sqlx::query(
        r#"INSERT INTO properties (id, name, currency, timezone)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             currency = excluded.currency,
             timezone = excluded.timezone"#,
    )
    .bind(&property.id)
    .bind(property.name.trim())
    .bind(property.currency.trim())
    .bind(property.timezone.trim())
    .execute(&mut connection)
    .await;

    if let Err(error) = property_result {
        let error = database_error_at("save property", error);
        rollback_if_active(&mut connection).await;
        return Err(error);
    }

    // Retire room types first; rows supplied below are immediately reactivated.
    // Historical reservation rows keep their foreign-key targets and old stay dates
    // still see the retired inventory up to the retirement date.
    if let Err(error) = sqlx::query(
        "UPDATE room_types SET active_to = COALESCE(active_to, date('now')) WHERE property_id = ?",
    )
    .bind(&property.id)
    .execute(&mut connection)
    .await
    {
        let error = database_error_at("retire previous room configuration", error);
        rollback_if_active(&mut connection).await;
        return Err(error);
    }

    for room in &property.room_types {
        let update_result = sqlx::query(
            r#"UPDATE room_types
               SET canonical_name = ?, inventory_count = ?, active_from = ?, active_to = ?
               WHERE id = ? AND property_id = ?"#,
        )
        .bind(room.canonical_name.trim())
        .bind(room.inventory_count)
        .bind(room.active_from.as_deref())
        .bind(room.active_to.as_deref())
        .bind(&room.id)
        .bind(&property.id)
        .execute(&mut connection)
        .await;

        let updated = match update_result {
            Ok(result) => result.rows_affected(),
            Err(error) => {
                let error = database_error_at(&format!("update room type '{}'", room.canonical_name), error);
                rollback_if_active(&mut connection).await;
                return Err(error);
            }
        };

        if updated == 0 {
            let insert_result = sqlx::query(
                r#"INSERT INTO room_types
                   (id, property_id, canonical_name, inventory_count, active_from, active_to)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(property_id, canonical_name) DO UPDATE SET
                     inventory_count = excluded.inventory_count,
                     active_from = excluded.active_from,
                     active_to = excluded.active_to"#,
            )
            .bind(&room.id)
            .bind(&property.id)
            .bind(room.canonical_name.trim())
            .bind(room.inventory_count)
            .bind(room.active_from.as_deref())
            .bind(room.active_to.as_deref())
            .execute(&mut connection)
            .await;

            if let Err(error) = insert_result {
                let error = database_error_at(&format!("insert room type '{}'", room.canonical_name), error);
                rollback_if_active(&mut connection).await;
                return Err(error);
            }
        }
    }

    for (source_status, normalized_status) in [
        ("confirmed", "active"),
        ("modified", "active"),
        ("cancelled", "cancelled"),
    ] {
        if let Err(error) = sqlx::query(
            r#"INSERT OR IGNORE INTO status_mappings
               (property_id, source, source_status, normalized_status)
               VALUES (?, 'Amenitiz', ?, ?)"#,
        )
        .bind(&property.id)
        .bind(source_status)
        .bind(normalized_status)
        .execute(&mut connection)
        .await
        {
            let error = database_error_at("save default Amenitiz status mappings", error);
            rollback_if_active(&mut connection).await;
            return Err(error);
        }
    }

    if let Err(error) = sqlx::query("COMMIT").execute(&mut connection).await {
        let error = database_error_at("commit property transaction", error);
        rollback_if_active(&mut connection).await;
        return Err(error);
    }

    Ok(())
}

#[tauri::command]
async fn save_import_snapshot(
    app: tauri::AppHandle,
    payload: ImportPayload,
) -> Result<(), String> {
    let options = database_options(&app)?;
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| database_error_at("open database", error))?;

    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut connection)
        .await
        .map_err(|error| database_error_at("begin import transaction", error))?;

    let summary = &payload.summary;

    let snapshot_result = sqlx::query(
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
    .execute(&mut connection)
    .await;

    if let Err(error) = snapshot_result {
        let error = database_error_at("insert import snapshot", error);
        rollback_if_active(&mut connection).await;
        return Err(error);
    }

    for reservation in &payload.reservations {
        let reservation_result = sqlx::query(
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
        .execute(&mut connection)
        .await;

        if let Err(error) = reservation_result {
            let error = database_error_at(
                &format!("insert reservation {}", reservation.reservation_id),
                error,
            );
            rollback_if_active(&mut connection).await;
            return Err(error);
        }

        for room in &reservation.rooms {
            let room_result = sqlx::query(
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
            .execute(&mut connection)
            .await;

            let result = match room_result {
                Ok(result) => result,
                Err(error) => {
                    let error = database_error_at(
                        &format!(
                            "insert room '{}' for reservation {}",
                            room.room_type_name, reservation.reservation_id
                        ),
                        error,
                    );
                    rollback_if_active(&mut connection).await;
                    return Err(error);
                }
            };

            if result.rows_affected() != 1 {
                rollback_if_active(&mut connection).await;
                return Err(format!(
                    "Unknown room type '{}' for reservation {}",
                    room.room_type_name, reservation.reservation_id
                ));
            }
        }
    }

    if let Err(error) = sqlx::query("COMMIT").execute(&mut connection).await {
        let error = database_error_at("commit import transaction", error);
        rollback_if_active(&mut connection).await;
        return Err(error);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial_revenue_management_schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "current_reservations_from_latest_snapshot",
            sql: include_str!("../migrations/002_current_snapshot.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:revenue-manager.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![save_property, save_import_snapshot])
        .run(tauri::generate_context!())
        .expect("error while running Local Revenue Manager");
}
