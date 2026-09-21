import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportPreview } from "../src/domain/models";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  load: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: class MockDatabase {
    static load = mocks.load;
  },
}));

import { TauriRepository } from "../src/data/tauriRepository";

const preview: ImportPreview = {
  propertyId: "malmerendas",
  source: "Amenitiz",
  filename: "reservations.xlsx",
  dataAsOf: "2026-09-15",
  fileHash: "file-hash",
  rowCount: 1,
  validRowCount: 1,
  excludedRowCount: 0,
  warningCount: 0,
  issues: [],
  reservations: [{
    propertyId: "malmerendas",
    reservationId: "R-100",
    checkIn: "2026-09-20",
    checkOut: "2026-09-22",
    bookedAt: "2026-08-01",
    source: "Amenitiz",
    sourceStatus: "confirmed",
    status: "active",
    country: "PT",
    rooms: [{ roomTypeName: "Junior Suite", quantity: 1 }],
    roomQuantity: 1,
    touristTaxCents: 800,
    extraRevenueExclCents: 0,
    extraRevenueInclCents: 0,
    roomRevenueExclCents: 20000,
    roomRevenueInclCents: 21200,
    totalBookingValueCents: 22000,
    amountDueCents: 0,
  }],
};

describe("Tauri snapshot repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockResolvedValue([]);
    mocks.load.mockResolvedValue({ select: mocks.select });
    mocks.invoke.mockResolvedValue(undefined);
  });

  it("delegates the complete import to one native transaction", async () => {
    const repository = new TauriRepository();

    const summary = await repository.saveImport(preview);

    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("save_import_snapshot", {
      payload: {
        summary: expect.objectContaining({
          id: expect.any(String),
          propertyId: "malmerendas",
          fileHash: "file-hash",
        }),
        reservations: preview.reservations,
      },
    });
    expect(summary.fileHash).toBe("file-hash");
  });
});
