import { MALMERENDAS_PROPERTY } from "../domain/property";
import { validateInventoryClosure } from "../domain/inventory";
import type { ImportPreview, ImportSnapshotSummary, InventoryClosure, Property, Reservation } from "../domain/models";
import { DuplicateImportError, type Repository } from "./repository";

interface StoredSnapshot {
  summary: ImportSnapshotSummary;
  reservations: Reservation[];
}

interface BrowserState {
  properties: Property[];
  snapshots: StoredSnapshot[];
  inventoryClosures?: InventoryClosure[];
}

const STORAGE_KEY = "local-revenue-manager:v1";

function propertyWithoutClosures(property: Property): Property {
  const stored = structuredClone(property);
  delete stored.inventoryClosures;
  return stored;
}

function mergeHistoricalFinal(current: Reservation[], historical: Reservation[]): Reservation[] {
  if (!historical.length) return structuredClone(current);
  const coverageStart = historical.reduce((min, reservation) => reservation.checkIn < min ? reservation.checkIn : min, historical[0].checkIn);
  const coverageEndExclusive = historical.reduce((max, reservation) => reservation.checkOut > max ? reservation.checkOut : max, historical[0].checkOut);
  const outsideHistoricalCoverage = current.filter(
    (reservation) => reservation.checkOut <= coverageStart || reservation.checkIn >= coverageEndExclusive,
  );
  return structuredClone([...historical, ...outsideHistoricalCoverage]);
}

export class BrowserRepository implements Repository {
  private state: BrowserState = { properties: [propertyWithoutClosures(MALMERENDAS_PROPERTY)], snapshots: [], inventoryClosures: [] };

  async initialize(): Promise<void> {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) this.state = JSON.parse(existing) as BrowserState;
    this.state.inventoryClosures ??= [];
    if (!existing) this.persist();
  }

  async listProperties(): Promise<Property[]> {
    const closures = this.state.inventoryClosures ?? [];
    return this.state.properties.map((property) => ({
      ...structuredClone(property),
      inventoryClosures: structuredClone(closures.filter((closure) => closure.propertyId === property.id)),
    }));
  }

  async saveProperty(property: Property): Promise<Property> {
    const storedProperty = propertyWithoutClosures(property);
    const existingIndex = this.state.properties.findIndex((item) => item.id === property.id);
    if (existingIndex === -1) {
      this.state.properties.push(storedProperty);
    } else {
      const existing = this.state.properties[existingIndex];
      const suppliedIds = new Set(property.roomTypes.map((room) => room.id));
      const retiredAt = new Date().toISOString().slice(0, 10) as Property["roomTypes"][number]["activeTo"];
      const retired = existing.roomTypes
        .filter((room) => !suppliedIds.has(room.id))
        .map((room) => ({ ...room, activeTo: room.activeTo ?? retiredAt }));
      this.state.properties[existingIndex] = structuredClone({
        ...storedProperty,
        roomTypes: [...storedProperty.roomTypes, ...retired],
      });
    }
    this.state.properties.sort((a, b) => a.name.localeCompare(b.name));
    this.persist();
    return structuredClone(property);
  }

  async saveInventoryClosure(closure: InventoryClosure): Promise<InventoryClosure> {
    const properties = await this.listProperties();
    const property = properties.find((item) => item.id === closure.propertyId);
    if (!property) throw new Error("Property not found.");
    const issues = validateInventoryClosure(property, closure, property.inventoryClosures ?? []);
    if (issues.length) throw new Error(issues[0]);

    const closures = this.state.inventoryClosures ?? (this.state.inventoryClosures = []);
    const existingIndex = closures.findIndex((item) => item.id === closure.id && item.propertyId === closure.propertyId);
    if (existingIndex === -1) closures.push(structuredClone(closure));
    else closures[existingIndex] = structuredClone(closure);
    closures.sort((a, b) => b.startDate.localeCompare(a.startDate) || a.roomTypeId.localeCompare(b.roomTypeId));
    this.persist();
    return structuredClone(closure);
  }

  async deleteInventoryClosure(propertyId: string, closureId: string): Promise<void> {
    const closures = this.state.inventoryClosures ?? [];
    this.state.inventoryClosures = closures.filter((item) => !(item.propertyId === propertyId && item.id === closureId));
    this.persist();
  }

  async listImports(propertyId: string): Promise<ImportSnapshotSummary[]> {
    return this.state.snapshots
      .filter((snapshot) => snapshot.summary.propertyId === propertyId && snapshot.summary.source === "Amenitiz")
      .map((snapshot) => structuredClone(snapshot.summary))
      .sort((a, b) => b.dataAsOf.localeCompare(a.dataAsOf) || b.importedAt.localeCompare(a.importedAt));
  }

  async listHistoricalReservations(propertyId: string): Promise<Reservation[]> {
    const historical = this.state.snapshots
      .filter((item) => item.summary.propertyId === propertyId && item.summary.source === "LegacyHistorical")
      .sort((a, b) => b.summary.importedAt.localeCompare(a.summary.importedAt));
    return historical.length ? structuredClone(historical[0].reservations) : [];
  }

  async listCurrentReservations(propertyId: string): Promise<Reservation[]> {
    const snapshots = this.state.snapshots
      .filter((item) => item.summary.propertyId === propertyId && item.summary.source === "Amenitiz")
      .sort((a, b) => b.summary.dataAsOf.localeCompare(a.summary.dataAsOf) || b.summary.importedAt.localeCompare(a.summary.importedAt));
    const current = snapshots.length ? snapshots[0].reservations : [];
    const historical = await this.listHistoricalReservations(propertyId);
    return mergeHistoricalFinal(current, historical);
  }

  async listSnapshotReservations(propertyId: string, snapshotId: string): Promise<Reservation[]> {
    const snapshot = this.state.snapshots.find(
      (item) => item.summary.propertyId === propertyId && item.summary.id === snapshotId && item.summary.source === "Amenitiz",
    );
    return snapshot ? structuredClone(snapshot.reservations) : [];
  }

  async saveImport(preview: ImportPreview): Promise<ImportSnapshotSummary> {
    if (this.state.snapshots.some((snapshot) => snapshot.summary.propertyId === preview.propertyId && snapshot.summary.fileHash === preview.fileHash)) {
      throw new DuplicateImportError();
    }
    const summary: ImportSnapshotSummary = {
      id: crypto.randomUUID(),
      propertyId: preview.propertyId,
      source: preview.source,
      filename: preview.filename,
      importedAt: new Date().toISOString(),
      dataAsOf: preview.dataAsOf,
      fileHash: preview.fileHash,
      rowCount: preview.rowCount,
      validRowCount: preview.validRowCount,
      warningCount: preview.warningCount,
      excludedRowCount: preview.excludedRowCount,
    };
    this.state.snapshots.push({ summary, reservations: preview.reservations });
    this.persist();
    return summary;
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }
}
