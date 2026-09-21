import { MALMERENDAS_PROPERTY } from "../domain/property";
import type { ImportPreview, ImportSnapshotSummary, Property, Reservation } from "../domain/models";
import { DuplicateImportError, type Repository } from "./repository";

interface StoredSnapshot {
  summary: ImportSnapshotSummary;
  reservations: Reservation[];
}

interface BrowserState {
  properties: Property[];
  snapshots: StoredSnapshot[];
}

const STORAGE_KEY = "local-revenue-manager:v1";

export class BrowserRepository implements Repository {
  private state: BrowserState = { properties: [MALMERENDAS_PROPERTY], snapshots: [] };

  async initialize(): Promise<void> {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) this.state = JSON.parse(existing) as BrowserState;
    else this.persist();
  }

  async listProperties(): Promise<Property[]> {
    return structuredClone(this.state.properties);
  }

  async listImports(propertyId: string): Promise<ImportSnapshotSummary[]> {
    return this.state.snapshots
      .filter((snapshot) => snapshot.summary.propertyId === propertyId)
      .map((snapshot) => structuredClone(snapshot.summary))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  }

  async listCurrentReservations(propertyId: string): Promise<Reservation[]> {
    const latest = new Map<string, { importedAt: string; reservation: Reservation }>();
    for (const snapshot of this.state.snapshots.filter((item) => item.summary.propertyId === propertyId)) {
      for (const reservation of snapshot.reservations) {
        const current = latest.get(reservation.reservationId);
        if (!current || current.importedAt <= snapshot.summary.importedAt) {
          latest.set(reservation.reservationId, { importedAt: snapshot.summary.importedAt, reservation });
        }
      }
    }
    return Array.from(latest.values()).map((item) => structuredClone(item.reservation));
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
