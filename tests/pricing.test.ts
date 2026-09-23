import { describe, expect, it } from "vitest";
import type { RoomType } from "../src/domain/models";
import {
  DEFAULT_OTA_PRICING_SETTINGS,
  averageConfiguredBasePrice,
  buildRoomBasePriceRows,
  calculatePeriodReferenceRates,
  projectPeriodRoomPrices,
  projectPeriodRoomRateRows,
  validatePricePeriod,
} from "../src/features/pricing/pricing";
import type { PriceManagementConfig, PricePeriod } from "../src/features/pricing/types";

const rooms: RoomType[] = [
  { id: "js", propertyId: "mm", canonicalName: "Junior Suite", inventoryCount: 1, activeFrom: null, activeTo: null },
  { id: "ds", propertyId: "mm", canonicalName: "Deluxe Suite", inventoryCount: 1, activeFrom: null, activeTo: null },
  { id: "al", propertyId: "mm", canonicalName: "Attic Loft", inventoryCount: 1, activeFrom: null, activeTo: null },
];

const config: PriceManagementConfig = {
  propertyId: "mm",
  referenceRoomTypeId: "js",
  basePricesCents: { js: 14500, ds: 15500, al: 16500 },
  otaSettings: { ...DEFAULT_OTA_PRICING_SETTINGS },
  periods: [],
  updatedAt: "",
};

describe("price management", () => {
  it("keeps the base-price table focused on room prices without exposing coefficients", () => {
    const rows = buildRoomBasePriceRows(rooms, config);
    expect(rows[0]).toMatchObject({ roomName: "Junior Suite", basePriceCents: 14500, isReference: true });
    expect(rows[1]).toMatchObject({ roomName: "Deluxe Suite", basePriceCents: 15500, isReference: false });
  });

  it("projects Sheet1-style Direct Flex prices for every room from the period reference price", () => {
    const period: PricePeriod = { id: "winter", startDate: "2026-11-01", endDate: "2026-12-23", directFlexReferenceCents: 8800 };
    const projected = projectPeriodRoomPrices(rooms, config, period);
    expect(projected.js).toBe(8800);
    expect(projected.ds).toBe(9407);
    expect(projected.al).toBe(10014);
  });

  it("reproduces Sheet1 OTA gross-up and NR logic for the reference room", () => {
    const period: PricePeriod = { id: "winter", startDate: "2026-11-01", endDate: "2026-12-23", directFlexReferenceCents: 8800 };
    const rates = calculatePeriodReferenceRates(period, config.otaSettings);
    expect(rates).toEqual({
      directFlexCents: 8800,
      directNonRefundableCents: 7920,
      otaFlexCents: 15529,
      otaNonRefundableCents: 13976,
      otaAfterBaseDiscountsCents: 10560,
    });
  });

  it("applies the same Sheet1 pricing structure to every room without exposing coefficients", () => {
    const period: PricePeriod = { id: "winter", startDate: "2026-11-01", endDate: "2026-12-23", directFlexReferenceCents: 8800 };
    const rows = projectPeriodRoomRateRows(rooms, config, period);
    expect(rows.find((row) => row.roomTypeId === "ds")).toMatchObject({
      directFlexCents: 9407,
      directNonRefundableCents: 8466,
      otaFlexCents: 16600,
      otaNonRefundableCents: 14940,
      otaAfterBaseDiscountsCents: 11288,
    });
  });

  it("rejects overlapping pricing periods", () => {
    const existing: PricePeriod[] = [{ id: "a", startDate: "2026-11-01", endDate: "2026-12-23", directFlexReferenceCents: 8800 }];
    expect(validatePricePeriod({ id: "b", startDate: "2026-12-20", endDate: "2026-12-29", directFlexReferenceCents: 13500 }, existing)).toMatch(/sobrepõe/);
    expect(validatePricePeriod({ id: "b", startDate: "2026-12-24", endDate: "2026-12-29", directFlexReferenceCents: 13500 }, existing)).toBeNull();
  });

  it("calculates the unweighted average of configured room-type base prices", () => {
    expect(averageConfiguredBasePrice(rooms, { js: 14500, ds: 15500, al: 16500 })).toBe(15500);
  });
});
