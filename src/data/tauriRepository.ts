import Database from "@tauri-apps/plugin-sql";
import type { ImportPreview, ImportSnapshotSummary, Property, Reservation, RoomAllocation, RoomType } from "../domain/models";
import { DuplicateImportError, type Repository } from "./repository";

type SqlRow = Record<string, string | number | null>;

export class TauriRepository implements Repository {
  private database: Database | null = null;

  private async db(): Promise<Database> {
    if (!this.database) this.database = await Database.load("sqlite:revenue-manager.db");
    return this.database;
  }

  async initialize(): Promise<void> {
    await this.db();
  }

  async listProperties(): Promise<Property[]> {
    const db = await this.db();
    const properties = await db.select<SqlRow[]>("SELECT id, name, currency, timezone FROM properties ORDER BY name");
    const rooms = await db.select<SqlRow[]>(
      "SELECT id, property_id, canonical_name, inventory_count, active_from, active_to FROM room_types ORDER BY canonical_name",
    );
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
    }));
  }

  async listImports(propertyId: string): Promise<ImportSnapshotSummary[]> {
    const db = await this.db();
    const rows = await db.select<SqlRow[]>(
      `SELECT id, property_id, source, original_filename, imported_at, data_as_of, file_hash,
              row_count, valid_row_count, warning_count, excluded_row_count
       FROM import_snapshots WHERE property_id = $1 ORDER BY imported_at DESC`,
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

  async listCurrentReservations(propertyId: string): Promise<Reservation[]> {
    const db = await this.db();
    const rows = await db.select<SqlRow[]>(
      `SELECT r.*, rr.room_type_name, rr.quantity
       FROM current_reservations r
       LEFT JOIN reservation_room_snapshots rr
         ON rr.snapshot_id = r.snapshot_id AND rr.reservation_id = r.reservation_id
       WHERE r.property_id = $1
       ORDER BY r.reservation_id, rr.room_type_name`,
      [propertyId],
    );
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

    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute(
        `INSERT INTO import_snapshots
         (id, property_id, source, original_filename, imported_at, data_as_of, file_hash, row_count, valid_row_count, warning_count, excluded_row_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [summary.id, summary.propertyId, summary.source, summary.filename, summary.importedAt, summary.dataAsOf,
          summary.fileHash, summary.rowCount, summary.validRowCount, summary.warningCount, summary.excludedRowCount],
      );
      for (const reservation of preview.reservations) {
        await this.insertReservation(db, summary.id, reservation);
      }
      await db.execute("COMMIT");
      return summary;
    } catch (error) {
      await db.execute("ROLLBACK");
      if (String(error).includes("UNIQUE constraint failed: import_snapshots.property_id, import_snapshots.file_hash")) {
        throw new DuplicateImportError();
      }
      throw error;
    }
  }

  private async insertReservation(db: Database, snapshotId: string, reservation: Reservation) {
    await db.execute(
      `INSERT INTO reservation_snapshots
       (snapshot_id, property_id, reservation_id, check_in, check_out, booked_at, source, source_status, normalized_status,
        country, room_quantity, tourist_tax_cents, extra_revenue_excl_cents, extra_revenue_incl_cents,
        room_revenue_excl_cents, room_revenue_incl_cents, total_booking_value_cents, amount_due_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [snapshotId, reservation.propertyId, reservation.reservationId, reservation.checkIn, reservation.checkOut,
        reservation.bookedAt, reservation.source, reservation.sourceStatus, reservation.status, reservation.country,
        reservation.roomQuantity, reservation.touristTaxCents, reservation.extraRevenueExclCents,
        reservation.extraRevenueInclCents, reservation.roomRevenueExclCents, reservation.roomRevenueInclCents,
        reservation.totalBookingValueCents, reservation.amountDueCents],
    );
    for (const room of reservation.rooms) await this.insertRoom(db, snapshotId, reservation, room);
  }

  private async insertRoom(db: Database, snapshotId: string, reservation: Reservation, room: RoomAllocation) {
    await db.execute(
      `INSERT INTO reservation_room_snapshots
       (snapshot_id, property_id, reservation_id, room_type_id, room_type_name, quantity)
       SELECT $1, $2, $3, id, canonical_name, $5 FROM room_types
       WHERE property_id = $2 AND lower(canonical_name) = lower($4)`,
      [snapshotId, reservation.propertyId, reservation.reservationId, room.roomTypeName, room.quantity],
    );
  }
}
