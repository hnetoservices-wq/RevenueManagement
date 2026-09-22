import { describe, expect, it } from "vitest";
import { calculateMetrics } from "../src/domain/analytics";
import {
  availableInventoryForDate,
  unavailableInventoryForDate,
  validateInventoryClosure,
} from "../src/domain/inventory";
import type { InventoryClosure, Property } from "../src/domain/models";
import { applyAnalysisFilters, ALL_CHANNELS } from "../src/features/filters/analysisFilters";

const property: Property = {
  id: "test-property",
  name: "Test Property",
  currency: "EUR",
  timezone: "Europe/Lisbon",
  roomTypes: [
    {
      id: "double",
      propertyId: "test-property",
      canonicalName: "Casa da Estufa",
      inventoryCount: 2,
      activeFrom: null,
      activeTo: null,
    },
    {
      id: "suite",
      propertyId: "test-property",
      canonicalName: "Suite Conselheiro",
      inventoryCount: 1,
      activeFrom: null,
      activeTo: null,
    },
  ],
  inventoryClosures: [
    {
      id: "closure-1",
      propertyId: "test-property",
      roomTypeId: "double",
      startDate: "2026-01-10",
      endDate: "2026-01-11",
      quantity: 1,
      reason: "Manutenção",
    },
  ],
};

describe("inventory closures", () => {
  it("subtracts unavailable rooms from sellable inventory on inclusive closure dates", () => {
    expect(availableInventoryForDate(property, "2026-01-09")).toBe(3);
    expect(availableInventoryForDate(property, "2026-01-10")).toBe(2);
    expect(availableInventoryForDate(property, "2026-01-11")).toBe(2);
    expect(availableInventoryForDate(property, "2026-01-12")).toBe(3);
    expect(unavailableInventoryForDate(property, "2026-01-10")).toBe(1);
  });

  it("uses sellable inventory in occupancy and RevPAR denominators", () => {
    const result = calculateMetrics(property, [], {
      startDate: "2026-01-10",
      endDate: "2026-01-12",
      revenueBasis: "inclusive",
    });

    expect(result.availableRoomNights).toBe(7);
    expect(result.unavailableRoomNights).toBe(2);
    expect(result.daily.map((day) => day.availableRoomNights)).toEqual([2, 2, 3]);
    expect(result.daily.map((day) => day.unavailableRoomNights)).toEqual([1, 1, 0]);
  });

  it("prevents overlapping closures from exceeding room-type inventory", () => {
    const existing = property.inventoryClosures ?? [];
    const allowed: InventoryClosure = {
      id: "closure-2",
      propertyId: property.id,
      roomTypeId: "double",
      startDate: "2026-01-11",
      endDate: "2026-01-12",
      quantity: 1,
      reason: "Bloqueio operacional",
    };
    const rejected: InventoryClosure = {
      ...allowed,
      id: "closure-3",
      quantity: 2,
    };

    expect(validateInventoryClosure(property, allowed, existing)).toEqual([]);
    expect(validateInventoryClosure(property, rejected, existing).some((issue) => issue.includes("Too many"))).toBe(true);
  });

  it("keeps room-type closure denominators when the room-type filter is applied", () => {
    const filtered = applyAnalysisFilters(property, [], {
      channel: ALL_CHANNELS,
      roomType: "Casa da Estufa",
      status: "all",
    });
    const result = calculateMetrics(filtered.property, filtered.reservations, {
      startDate: "2026-01-10",
      endDate: "2026-01-11",
      revenueBasis: "inclusive",
    });

    expect(result.availableRoomNights).toBe(2);
    expect(result.unavailableRoomNights).toBe(2);
  });
});
