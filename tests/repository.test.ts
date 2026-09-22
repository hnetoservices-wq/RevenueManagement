import { beforeEach, describe, expect, it } from "vitest";
import { BrowserRepository } from "../src/data/browserRepository";
import { DuplicateImportError } from "../src/data/repository";
import type { ImportPreview, IsoDate, Reservation } from "../src/domain/models";

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

function preview(
  hash: string,
  options: { dataAsOf?: IsoDate; reservations?: Reservation[]; value?: number } = {},
): ImportPreview {
  const reservations = options.reservations ?? [{ ...reservation, roomRevenueInclCents: options.value ?? 21200 }];
  return {
    propertyId: "malmerendas", source: "Amenitiz", filename: `${hash}.xlsx`, dataAsOf: options.dataAsOf ?? "2026-05-15",
    fileHash: hash, rowCount: reservations.length, validRowCount: reservations.length, excludedRowCount: 0, warningCount: 0, issues: [],
    reservations,
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

  it("uses the newest data-as-of snapshot as the current reservation set", async () => {
    const repository = new BrowserRepository();
    await repository.initialize();

    const obsolete: Reservation = { ...reservation, reservationId: "R-OLD", roomRevenueInclCents: 30000 };
    await repository.saveImport(preview("newer", {
      dataAsOf: "2026-09-15",
      reservations: [{ ...reservation, roomRevenueInclCents: 25000 }],
    }));

    // Importing an older historical file later must not replace the current dashboard state.
    await repository.saveImport(preview("older-imported-later", {
      dataAsOf: "2026-08-01",
      reservations: [{ ...reservation, roomRevenueInclCents: 21200 }, obsolete],
    }));

    expect(await repository.listImports("malmerendas")).toHaveLength(2);
    const current = await repository.listCurrentReservations("malmerendas");
    expect(current).toHaveLength(1);
    expect(current[0].reservationId).toBe("R-100");
    expect(current[0].roomRevenueInclCents).toBe(25000);
    expect(current.some((item) => item.reservationId === "R-OLD")).toBe(false);
  });
});
