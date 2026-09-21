import { beforeEach, describe, expect, it } from "vitest";
import { BrowserRepository } from "../src/data/browserRepository";
import { DuplicateImportError } from "../src/data/repository";
import type { ImportPreview, Reservation } from "../src/domain/models";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const reservation: Reservation = {
  propertyId: "malmerendas", reservationId: "R-100", checkIn: "2026-06-01", checkOut: "2026-06-03",
  bookedAt: "2026-05-01", source: "Amenitiz", sourceStatus: "confirmed", status: "active", country: "PT",
  rooms: [{ roomTypeName: "Junior Suite", quantity: 1 }], roomQuantity: 1, touristTaxCents: 1200,
  extraRevenueExclCents: 0, extraRevenueInclCents: 0, roomRevenueExclCents: 20000,
  roomRevenueInclCents: 21200, totalBookingValueCents: 22400, amountDueCents: 0,
};

function preview(hash: string, value = 21200): ImportPreview {
  return {
    propertyId: "malmerendas", source: "Amenitiz", filename: `${hash}.xlsx`, dataAsOf: "2026-05-15",
    fileHash: hash, rowCount: 1, validRowCount: 1, excludedRowCount: 0, warningCount: 0, issues: [],
    reservations: [{ ...reservation, roomRevenueInclCents: value }],
  };
}

describe("snapshot repository", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
  });

  it("blocks importing the same file hash twice", async () => {
    const repository = new BrowserRepository();
    await repository.initialize();
    await repository.saveImport(preview("same-hash"));
    await expect(repository.saveImport(preview("same-hash"))).rejects.toBeInstanceOf(DuplicateImportError);
  });

  it("keeps history while returning only the latest reservation state", async () => {
    const repository = new BrowserRepository();
    await repository.initialize();
    await repository.saveImport(preview("first", 21200));
    await repository.saveImport(preview("second", 25000));
    expect(await repository.listImports("malmerendas")).toHaveLength(2);
    const current = await repository.listCurrentReservations("malmerendas");
    expect(current).toHaveLength(1);
    expect(current[0].roomRevenueInclCents).toBe(25000);
  });
});
