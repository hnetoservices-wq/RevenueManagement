import type { ImportPreview, ImportSnapshotSummary, InventoryClosure, Property, Reservation } from "../domain/models";

export interface Repository {
  initialize(): Promise<void>;
  listProperties(): Promise<Property[]>;
  saveProperty(property: Property): Promise<Property>;
  saveInventoryClosure(closure: InventoryClosure): Promise<InventoryClosure>;
  deleteInventoryClosure(propertyId: string, closureId: string): Promise<void>;
  listImports(propertyId: string): Promise<ImportSnapshotSummary[]>;
  listCurrentReservations(propertyId: string): Promise<Reservation[]>;
  listHistoricalReservations(propertyId: string): Promise<Reservation[]>;
  listSnapshotReservations(propertyId: string, snapshotId: string): Promise<Reservation[]>;
  saveImport(preview: ImportPreview): Promise<ImportSnapshotSummary>;
}

export class DuplicateImportError extends Error {
  constructor() {
    super("This exact file has already been imported for the selected property.");
    this.name = "DuplicateImportError";
  }
}
