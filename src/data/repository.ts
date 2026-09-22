import type { ImportPreview, ImportSnapshotSummary, Property, Reservation } from "../domain/models";

export interface Repository {
  initialize(): Promise<void>;
  listProperties(): Promise<Property[]>;
  listImports(propertyId: string): Promise<ImportSnapshotSummary[]>;
  listCurrentReservations(propertyId: string): Promise<Reservation[]>;
  listSnapshotReservations(propertyId: string, snapshotId: string): Promise<Reservation[]>;
  saveImport(preview: ImportPreview): Promise<ImportSnapshotSummary>;
}

export class DuplicateImportError extends Error {
  constructor() {
    super("This exact file has already been imported for the selected property.");
    this.name = "DuplicateImportError";
  }
}
