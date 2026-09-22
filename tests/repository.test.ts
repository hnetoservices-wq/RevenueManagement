import { beforeEach, describe, expect, it } from "vitest";
import { BrowserRepository } from "../src/data/browserRepository";
import { DuplicateImportError } from "../src/data/repository";
import type { ImportPreview, IsoDate, Property, Reservation } from "../src/domain/models";

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

function historicalPreview(hash: string, reservations: Reservation[]): ImportPreview {
  return {
    propertyId: "malmerendas", source: "LegacyHistorical", filename: `${hash}.csv`, dataAsOf: "2025-12-31",
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

  it("uses historical final data for its covered stay dates without exposing it as a booking snapshot", async () => {
    const repository = new BrowserRepository();
    await repository.initialize();

    const amenitiz2025: Reservation = {
      ...reservation,
      reservationId: "AM-2025",
      checkIn: "2025-06-10",
      checkOut: "2025-06-12",
      bookedAt: "2025-05-10",
    };
    const amenitiz2026: Reservation = { ...reservation, reservationId: "AM-2026" };
    await repository.saveImport(preview("live", {
      dataAsOf: "2026-09-22",
      reservations: [amenitiz2025, amenitiz2026],
    }));

    const legacy2025: Reservation = {
      ...reservation,
      reservationId: "legacy:2025-B-1",
      checkIn: "2025-01-01",
      checkOut: "2026-01-01",
      bookedAt: "2024-12-01",
      source: "Booking.com",
      country: null,
      touristTaxCents: 0,
      roomRevenueInclCents: 12345,
      roomRevenueExclCents: 12345,
    };
    await repository.saveImport(historicalPreview("legacy", [legacy2025]));

    expect(await repository.listImports("malmerendas")).toHaveLength(1);
    expect(await repository.listHistoricalReservations("malmerendas")).toHaveLength(1);
    const combined = await repository.listCurrentReservations("malmerendas");
    expect(combined.map((item) => item.reservationId).sort()).toEqual(["AM-2026", "legacy:2025-B-1"]);
    expect(combined.some((item) => item.reservationId === "AM-2025")).toBe(false);
  });

  it("persists a second property's room configuration independently", async () => {
    const repository = new BrowserRepository();
    await repository.initialize();
    const property: Property = {
      id: "fonte-santa",
      name: "Fonte Santa",
      currency: "EUR",
      timezone: "Europe/Lisbon",
      roomTypes: [
        { id: "fs-1", propertyId: "fonte-santa", canonicalName: "Casa da Estufa", inventoryCount: 2, activeFrom: null, activeTo: null },
        { id: "fs-2", propertyId: "fonte-santa", canonicalName: "Suite Conselheiro", inventoryCount: 1, activeFrom: null, activeTo: null },
        { id: "fs-3", propertyId: "fonte-santa", canonicalName: "Quarto Junior", inventoryCount: 2, activeFrom: null, activeTo: null },
      ],
    };

    await repository.saveProperty(property);
    const properties = await repository.listProperties();
    expect(properties).toHaveLength(2);
    const saved = properties.find((item) => item.id === "fonte-santa")!;
    expect(saved.roomTypes.reduce((sum, room) => sum + room.inventoryCount, 0)).toBe(5);
    expect(saved.roomTypes.map((room) => room.canonicalName)).toContain("Casa da Estufa");
  });
});
