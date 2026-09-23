import { describe, expect, it } from "vitest";
import type { RoomType } from "../src/domain/models";
import { averageConfiguredBasePrice, buildRoomBasePriceRows, projectRoomPriceFromReference } from "../src/features/pricing/pricing";

const rooms: RoomType[] = [
  { id: "js", propertyId: "mm", canonicalName: "Junior Suite", inventoryCount: 1, activeFrom: null, activeTo: null },
  { id: "ds", propertyId: "mm", canonicalName: "Deluxe Suite", inventoryCount: 1, activeFrom: null, activeTo: null },
  { id: "al", propertyId: "mm", canonicalName: "Attic Loft", inventoryCount: 1, activeFrom: null, activeTo: null },
];

describe("price management base ladder", () => {
  it("calculates coefficients relative to the selected reference room", () => {
    const config = { propertyId: "mm", referenceRoomTypeId: "js", basePricesCents: { js: 14500, ds: 15500, al: 16500 }, updatedAt: "" };
    const rows = buildRoomBasePriceRows(rooms, config);
    expect(rows[0].coefficient).toBe(1);
    expect(rows[1].coefficient).toBeCloseTo(155 / 145, 6);
    expect(rows[2].differenceFromReferenceCents).toBe(2000);
  });

  it("projects other room prices from a target reference price using the same base relationship", () => {
    expect(projectRoomPriceFromReference(8800, 15500, 14500)).toBe(9407);
  });

  it("calculates the unweighted average of configured room-type base prices", () => {
    expect(averageConfiguredBasePrice(rooms, { js: 14500, ds: 15500, al: 16500 })).toBe(15500);
  });
});
