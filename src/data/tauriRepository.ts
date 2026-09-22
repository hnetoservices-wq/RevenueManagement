import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { ImportPreview, ImportSnapshotSummary, InventoryClosure, Property, Reservation, RoomType } from "../domain/models";
import { DuplicateImportError, type Repository } from "./repository";

type SqlRow = Record<string, string | number | null>;

function rowsToReservations(rows: SqlRow[]): Reservation[] {
  const result = new Map<string, Reservation>();
  for (const row of rows) {
    const key = String(row.reservation_id);
    if (!result.has(key)) {
      result.set(key, {
        propertyId: String(row.property_id), reservationId: key,
        checkIn: String(row.check_in) as Reservation["checkIn"], checkOut: String(row.check_out) as Reservation["checkOut"],
        bookedAt: row.booked_at ? String(row.booked_at) as Reservation["bookedAt"] : null,
        source: String(row.source), sourceStatus: String(row.source_status), status: String(row.normalized_status) as Reservation["status"],
        country: row.country ? String(row.country) : null, rooms: [], roomQuantity: Number(row.room_quantity),
        touristTaxCents: Number(row.tourist_tax_cents), extraRevenueExclCents: Number(row.extra_revenue_excl_cents),
        extraRevenueInclCents: Number(row.extra_revenue_incl_cents), roomRevenueExclCents: Number(row.room_revenue_excl_cents),
        roomRevenueInclCents: Number(row.room_revenue_incl_cents), totalBookingValueCents: Number(row.total_booking_value_cents),
        amountDueCents: Number(row.amount_due_cents),
      });
    }
    if (row.room_type_name) {
      result.get(key)!.rooms.push({ roomTypeName: String(row.room_type_name), quantity: Number(row.quantity) });
    }
  }
  return Array.from(result.values());
}

function mergeHistoricalFinal(current: Reservation[], historical: Reservation[]): Reservation[] {
  if (!historical.length) return current;
  const coverageStart = historical.reduce((min, reservation) => reservation.checkIn < min ? reservation.checkIn : min, historical[0].checkIn);
  const coverageEndExclusive = historical.reduce((max, reservation) => reservation.checkOut > max ? reservation.checkOut : max, historical[0].checkOut);
  const outsideHistoricalCoverage = current.filter(
    (reservation) => reservation.checkOut <= coverageStart || reservation.checkIn >= coverageEndExclusive,
  );
  return [...historical, ...outsideHistoricalCoverage];
}

export class TauriRepository implements Repository {
  private database: Database | null = null;

  private async db(): Promise<Database> {
    if (!this.database) this.database = await Database.load("sqlite:revenue-manager.db");
    return this.database;
  }

  async initialize(): Promise<void> {
    const db = await this.db();
    await db.execute("PRAGMA journal_mode = WAL");
    await db.execute("PRAGMA synchronous = NORMAL");
  }

  async listProperties(): Promise<Property[]> {
    const db = await this.db();
    const [properties, rooms, closures] = await Promise.all([
      db.select<SqlRow[]>("SELECT id, name, currency, timezone FROM properties ORDER BY name"),
      db.select<SqlRow[]>(
        "SELECT id, property_id, canonical_name, inventory_count, active_from, active_to FROM room_types ORDER BY canonical_name",
      ),
      db.select<SqlRow[]>(
        `SELECT id, property_id, room_type_id, start_date, end_date, quantity, reason
         FROM inventory_closures ORDER BY start_date DESC, id`,
      ),
    ]);
    return properties.map((property) => ({
      id: String(property.id),
      name: String(property.name),
      currency: String(property.currency),
      timezone: String(property.timezone),
      roomTypes: rooms
        .filter((room) => room.property_id === property.id)
        .map((room): RoomType => ({
          id: String(room.id),
          propertyId: String(room.property_id),
          canonicalName: String(room.canonical_name),
          inventoryCount: Number(room.inventory_count),
          activeFrom: room.active_from ? String(room.active_from) as RoomType["activeFrom"] : null,
          activeTo: room.active_to ? String(room.active_to) as RoomType["activeTo"] : null,
        })),
      inventoryClosures: closures
        .filter((closure) => closure.property_id === property.id)
        .map((closure): InventoryClosure => ({
          id: String(closure.id),
          propertyId: String(closure.property_id),
          roomTypeId: String(closure.room_type_id),
          startDate: String(closure.start_date) as InventoryClosure["startDate"],
          endDate: String(closure.end_date) as InventoryClosure["endDate"],
          quantity: Number(closure.quantity),
          reason: String(closure.reason ?? ""),
        })),
    }));
  }

  async saveProperty(property: Property): Promise<Property> {
    await invoke("save_property", { property });
    return property;
  }

  async saveInventoryClosure(closure: InventoryClosure): Promise<InventoryClosure> {
    await invoke("save_inventory_closure", { closure });
    return closure;
  }

  async deleteInventoryClosure(propertyId: string, closureId: string): Promise<void> {
    await invoke("delete_inventory_closure", { propertyId, closureId });
  }

  async listImports(propertyId: string): Promise<ImportSnapshotSummary[]> {
    const db = await this.db();
    const rows = await db.select<SqlRow[]>(
      `SELECT id, property_id, source, original_filename, imported_at, data_as_of, file_hash,
              row_count, valid_row_count, warning_count, excluded_row_count
       FROM import_snapshots
       WHERE property_id = $1 AND source = 'Amenitiz'
       ORDER BY data_as_of DESC, imported_at DESC`,
      [propertyId],
    );
    return rows.map((row) => ({
      id: String(row.id), propertyId: String(row.property_id), source: String(row.source),
      filename: String(row.original_filename), importedAt: String(row.imported_at),
      dataAsOf: String(row.data_as_of) as ImportSnapshotSummary["dataAsOf"], fileHash: String(row.file_hash),
      rowCount: Number(row.row_count), validRowCount: Number(row.valid_row_count),
      warningCount: Number(row.warning_count), excludedRowCount: Number(row.excluded_row_count),
    }));
  }

  async listHistoricalReservations(propertyId: string): Promise<Reservation[]> {
    const db = await this.db();
    const rows = await db.select<SqlRow[]>(
      `SELECT r.*, rr.room_type_name, rr.quantity
       FROM reservation_snapshots r
       JOIN import_snapshots i ON i.id = r.snapshot_id
       LEFT JOIN reservation_room_snapshots rr
         ON rr.snapshot_id = r.snapshot_id AND rr.reservation_id = r.reservation_id
       WHERE r.property_id = $1
         AND i.source = 'LegacyHistorical'
         AND i.id = (
           SELECT latest.id FROM import_snapshots latest
           WHERE latest.property_id = $1 AND latest.source = 'LegacyHistorical'
           ORDER BY latest.imported_at DESC, latest.rowid DESC
           LIMIT 1
         )
       ORDER BY r.reservation_id, rr.room_type_name`,
      [propertyId],
    );
    return rowsToReservations(rows);
  }

  async listCurrentReservations(propertyId: string): Promise<Reservation[]> {
    const db = await this.db();
    const rows = await db.select<SqlRow[]>(
      `SELECT r.*, rr.room_type_name, rr.quantity
       FROM reservation_snapshots r
       JOIN import_snapshots i ON i.id = r.snapshot_id
       LEFT JOIN reservation_room_snapshots rr
         ON rr.snapshot_id = r.snapshot_id AND rr.reservation_id = r.reservation_id
       WHERE r.property_id = $1
         AND i.source = 'Amenitiz'
         AND i.id = (
           SELECT latest.id FROM import_snapshots latest
           WHERE latest.property_id = $1 AND latest.source = 'Amenitiz'
           ORDER BY latest.data_as_of DESC, latest.imported_at DESC, latest.rowid DESC
           LIMIT 1
         )
       ORDER BY r.reservation_id, rr.room_type_name`,
      [propertyId],
    );
    const current = rowsToReservations(rows);
    const historical = await this.listHistoricalReservations(propertyId);
    return mergeHistoricalFinal(current, historical);
  }

  async listSnapshotReservations(propertyId: string, snapshotId: string): Promise<Reservation[]> {
    const db = await this.db();
    const rows = await db.select<SqlRow[]>(
      `SELECT r.*, rr.room_type_name, rr.quantity
       FROM reservation_snapshots r
       JOIN import_snapshots i ON i.id = r.snapshot_id
       LEFT JOIN reservation_room_snapshots rr
         ON rr.snapshot_id = r.snapshot_id AND rr.reservation_id = r.reservation_id
       WHERE r.property_id = $1 AND r.snapshot_id = $2 AND i.source = 'Amenitiz'
       ORDER BY r.reservation_id, rr.room_type_name`,
      [propertyId, snapshotId],
    );
    return rowsToReservations(rows);
  }

  async saveImport(preview: ImportPreview): Promise<ImportSnapshotSummary> {
    const db = await this.db();
    const duplicate = await db.select<SqlRow[]>(
      "SELECT id FROM import_snapshots WHERE property_id = $1 AND file_hash = $2 LIMIT 1",
      [preview.propertyId, preview.fileHash],
    );
    if (duplicate.length) throw new DuplicateImportError();

    const summary: ImportSnapshotSummary = {
      id: crypto.randomUUID(), propertyId: preview.propertyId, source: preview.source,
      filename: preview.filename, importedAt: new Date().toISOString(), dataAsOf: preview.dataAsOf,
      fileHash: preview.fileHash, rowCount: preview.rowCount, validRowCount: preview.validRowCount,
      warningCount: preview.warningCount, excludedRowCount: preview.excludedRowCount,
    };

    try {
      await invoke("save_import_snapshot", {
        payload: { summary, reservations: preview.reservations },
      });
      return summary;
    } catch (error) {
      if (String(error).includes("DUPLICATE_IMPORT")) {
        throw new DuplicateImportError();
      }
      throw error;
    }
  }
}
