import { describe, expect, it } from "vitest";
import type { RoomType } from "../src/domain/models";
import {
  averageConfiguredBasePrice,
  buildRoomBasePriceRows,
  calculateDiscountRateResults,
  calculatePeriodReferenceRates,
  orderPeriodDiscounts,
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

const sheet1Period: PricePeriod = {
  id: "winter",
  startDate: "2026-11-01",
  endDate: "2026-12-23",
  directFlexReferenceCents: 8800,
  otaUpliftPct: 20,
  nonRefundableDiscountPct: 10,
  discounts: [
    { id: "loy10", kind: "loyalty", name: "Fidelização 10%", discountPct: 10, active: true },
    { id: "loy15", kind: "loyalty", name: "Fidelização 15%", discountPct: 15, active: true },
    { id: "mobile", kind: "mobile", name: "Móveis", discountPct: 10, active: true },
    { id: "basic", kind: "basic_deal", name: "Basic Deal", discountPct: 20, active: true },
    { id: "booking", kind: "booking_campaign", name: "BK Camp - Est, Min. 2", discountPct: 29, active: true },
    { id: "expedia", kind: "expedia_campaign", name: "Exp Camp - Est, Min. 2", discountPct: 39.65, active: false },
    { id: "ltd", kind: "limited_time_deal", name: "Limited Time Deal", discountPct: 43, active: true },
    { id: "direct-lm", kind: "direct_last_minute", name: "Directa - Last Minute", discountPct: 10, active: true },
    { id: "ota-lm", kind: "ota_last_minute", name: "OTAs - Last Minute", discountPct: 10, active: true },
  ],
};

const config: PriceManagementConfig = {
  propertyId: "mm",
  referenceRoomTypeId: "js",
  basePricesCents: { js: 14500, ds: 15500, al: 16500 },
  periods: [sheet1Period],
  updatedAt: "",
};

describe("price management", () => {
  it("keeps the base-price table focused on room prices without exposing coefficients", () => {
    const rows = buildRoomBasePriceRows(rooms, config);
    expect(rows[0]).toMatchObject({ roomName: "Junior Suite", basePriceCents: 14500, isReference: true });
    expect(rows[1]).toMatchObject({ roomName: "Deluxe Suite", basePriceCents: 15500, isReference: false });
  });

  it("projects Sheet1-style Direct Flex prices for every room from the period reference price", () => {
    const projected = projectPeriodRoomPrices(rooms, config, sheet1Period);
    expect(projected.js).toBe(8800);
    expect(projected.ds).toBe(9407);
    expect(projected.al).toBe(10014);
  });

  it("grosses up the OTA public rate using the active highest loyalty tier and Basic Deal", () => {
    const rates = calculatePeriodReferenceRates(sheet1Period);
    expect(rates).toEqual({
      directFlexCents: 8800,
      directNonRefundableCents: 7920,
      otaFlexCents: 15529,
      otaNonRefundableCents: 13976,
    });
  });

  it("reproduces the Sheet1 stacking relationships", () => {
    const rates = calculatePeriodReferenceRates(sheet1Period)!;
    const results = calculateDiscountRateResults(sheet1Period, rates.otaFlexCents, rates.directNonRefundableCents);
    const byId = Object.fromEntries(results.map((item) => [item.discountId, item]));

    expect(byId.loy10).toMatchObject({ bookingFlexCents: 13976, bookingNonRefundableCents: 12578 });
    expect(byId.loy15).toMatchObject({ bookingFlexCents: 13200, bookingNonRefundableCents: 11880 });
    expect(byId.mobile).toMatchObject({ bookingFlexCents: 11880, bookingNonRefundableCents: 10692 });
    expect(byId.basic).toMatchObject({ bookingFlexCents: 9504, bookingNonRefundableCents: 8554 });
    expect(byId.booking).toMatchObject({ bookingFlexCents: 9372, bookingNonRefundableCents: 8435, expediaFlexCents: null });
    expect(byId.expedia).toMatchObject({ active: false, expediaFlexCents: null });
    expect(byId.ltd).toMatchObject({ bookingFlexCents: 8852, bookingNonRefundableCents: 7967, expediaFlexCents: 8852 });
    expect(byId["direct-lm"]).toMatchObject({ directCents: 7128 });
    expect(byId["ota-lm"]).toMatchObject({ bookingFlexCents: 7170, expediaFlexCents: 7170 });
  });

  it("applies the same period logic to every room", () => {
    const rows = projectPeriodRoomRateRows(rooms, config, sheet1Period);
    expect(rows.find((row) => row.roomTypeId === "ds")).toMatchObject({
      directFlexCents: 9407,
      directNonRefundableCents: 8466,
      otaFlexCents: 16600,
      otaNonRefundableCents: 14940,
    });
  });

  it("allows different OTA increments and discount sets in different periods", () => {
    const noPromoPeriod: PricePeriod = {
      id: "christmas",
      startDate: "2026-12-24",
      endDate: "2026-12-29",
      directFlexReferenceCents: 13500,
      otaUpliftPct: 8,
      nonRefundableDiscountPct: 12,
      discounts: [],
    };
    expect(calculatePeriodReferenceRates(noPromoPeriod)).toEqual({
      directFlexCents: 13500,
      directNonRefundableCents: 11880,
      otaFlexCents: 14580,
      otaNonRefundableCents: 12830,
    });
  });

  it("tracks independent consecutive DIR adjustments without rounding drift", () => {
    const period: PricePeriod = {
      ...sheet1Period,
      directFlexReferenceCents: 9750,
      otaUpliftPct: 20,
      discounts: [
        { id: "dir1", kind: "direct_price_adjustment", name: "Ajuste de Preço DIR", discountPct: 5, active: true },
        { id: "dir2", kind: "direct_price_adjustment", name: "Ajuste de Preço DIR", discountPct: 5, active: true },
      ],
    };
    const original = calculatePeriodReferenceRates(period)!;
    expect(original.directFlexCents).toBe(9750);
    expect(original.directNonRefundableCents).toBe(8775);
    const adjustments = calculateDiscountRateResults(period, original.otaFlexCents, original.directNonRefundableCents);
    expect(adjustments.map((row) => [row.directCents, row.directNonRefundableCents])).toEqual([
      [9263, 8336],
      [8799, 7919],
    ]);
    expect(adjustments.every((row) => row.bookingFlexCents === null && row.expediaFlexCents === null)).toBe(true);
    expect(projectPeriodRoomRateRows(rooms, config, period)[0]).toMatchObject({
      directFlexCents: 8799, directNonRefundableCents: 7919,
    });
  });

  it("tracks OTA adjustments separately and rebases following promotions", () => {
    const period: PricePeriod = {
      ...sheet1Period,
      directFlexReferenceCents: 9750,
      discounts: [
        { id: "ota1", kind: "ota_price_adjustment", name: "Ajuste de Preço OTA", discountPct: 5, active: true },
        { id: "loyalty", kind: "loyalty", name: "Fidelização", discountPct: 10, active: true },
        { id: "ota2", kind: "ota_price_adjustment", name: "Ajuste de Preço OTA", discountPct: 5, active: true },
      ],
    };
    const original = calculatePeriodReferenceRates(period)!;
    const result = calculateDiscountRateResults(period, original.otaFlexCents, original.directNonRefundableCents);
    const firstOta = Math.round(original.otaFlexCents * 0.95);
    const initialOtaNr = original.otaNonRefundableCents;
    expect(result[0]).toMatchObject({
      directCents: null,
      bookingFlexCents: firstOta,
      bookingNonRefundableCents: Math.round(initialOtaNr * 0.95),
      expediaFlexCents: firstOta,
      expediaNonRefundableCents: Math.round(initialOtaNr * 0.95),
    });
    expect(result.map((row) => row.discountId)).toEqual(["ota1", "ota2", "loyalty"]);
    expect(result[1]).toMatchObject({
      bookingFlexCents: Math.round(original.otaFlexCents * 0.95 * 0.95),
      expediaFlexCents: Math.round(original.otaFlexCents * 0.95 * 0.95),
      bookingNonRefundableCents: Math.round(initialOtaNr * 0.95 * 0.95),
    });
    expect(result[2]).toMatchObject({
      bookingFlexCents: Math.round(Math.round(original.otaFlexCents * 0.95 * 0.95) * 0.9),
      expediaFlexCents: Math.round(Math.round(original.otaFlexCents * 0.95 * 0.95) * 0.9),
    });
  });

  it("places both revisions above promotions while preserving each group's order", () => {
    const loyalty = { id: "loyalty", kind: "loyalty" as const, name: "Fidelização", discountPct: 10, active: true };
    const mobile = { id: "mobile", kind: "mobile" as const, name: "Móveis", discountPct: 10, active: true };
    const dir = { id: "dir", kind: "direct_price_adjustment" as const, name: "Ajuste de Preço DIR", discountPct: 5, active: true };
    const ota = { id: "ota", kind: "ota_price_adjustment" as const, name: "Ajuste de Preço OTA", discountPct: 5, active: true };
    const period: PricePeriod = {
      ...sheet1Period,
      directFlexReferenceCents: 9750,
      discounts: [loyalty, mobile, dir, ota],
    };
    expect(orderPeriodDiscounts(period.discounts).map((item) => item.id)).toEqual(["dir", "ota", "loyalty", "mobile"]);
    const original = calculatePeriodReferenceRates(period)!;
    const result = calculateDiscountRateResults(period, original.otaFlexCents, original.directNonRefundableCents);
    expect(result.map((item) => item.discountId)).toEqual(["dir", "ota", "loyalty", "mobile"]);
    expect(result[0]).toMatchObject({ directCents: 9263, directNonRefundableCents: 8336 });
    const adjustedOta = Math.round(original.otaFlexCents * 0.95);
    expect(result[1]).toMatchObject({ bookingFlexCents: adjustedOta, expediaFlexCents: adjustedOta });
    expect(result[2]).toMatchObject({ bookingFlexCents: Math.round(adjustedOta * 0.9) });
    expect(result[3]).toMatchObject({ bookingFlexCents: Math.round(adjustedOta * 0.9 * 0.9) });
  });

  it("applies all later OTA revisions before even an earlier-listed booking promotion", () => {
    const period: PricePeriod = {
      ...sheet1Period,
      discounts: [
        { id: "basic", kind: "basic_deal", name: "Basic Deal", discountPct: 20, active: true },
        { id: "booking", kind: "booking_campaign", name: "Booking", discountPct: 10, active: true },
        { id: "ota1", kind: "ota_price_adjustment", name: "Ajuste de Preço OTA", discountPct: 5, active: true },
        { id: "ota2", kind: "ota_price_adjustment", name: "Ajuste de Preço OTA", discountPct: 5, active: true },
      ],
    };
    const original = calculatePeriodReferenceRates(period)!;
    const result = calculateDiscountRateResults(period, original.otaFlexCents, original.directNonRefundableCents);
    const revised = Math.round(original.otaFlexCents * 0.95 * 0.95);
    expect(result.map((row) => row.discountId)).toEqual(["ota1", "ota2", "basic", "booking"]);
    expect(result[2].bookingFlexCents).toBe(Math.round(revised * 0.8));
    expect(result[3].bookingFlexCents).toBe(Math.round(revised * 0.9));
  });

  it("does not apply DIR adjustments to OTA or OTA adjustments to DIR", () => {
    const baseline: PricePeriod = { ...sheet1Period, discounts: [] };
    const adjusted: PricePeriod = {
      ...baseline,
      discounts: [
        { id: "dir", kind: "direct_price_adjustment", name: "Ajuste DIR", discountPct: 5, active: true },
        { id: "ota", kind: "ota_price_adjustment", name: "Ajuste OTA", discountPct: 10, active: true },
      ],
    };
    const baselineRow = projectPeriodRoomRateRows(rooms, config, baseline)[0];
    const result = calculateDiscountRateResults(adjusted, calculatePeriodReferenceRates(adjusted)!.otaFlexCents, calculatePeriodReferenceRates(adjusted)!.directNonRefundableCents);
    expect(result[0].bookingFlexCents).toBeNull();
    expect(result[1].directCents).toBeNull();
    const adjustedRow = projectPeriodRoomRateRows(rooms, config, adjusted)[0];
    expect(adjustedRow.directFlexCents).toBe(Math.round(baselineRow.directFlexCents * 0.95));
    expect(adjustedRow.otaFlexCents).toBe(Math.round(baselineRow.otaFlexCents * 0.9));
  });

  it("allows overlapping pricing periods so the UI can warn about them", () => {
    expect(validatePricePeriod({ ...sheet1Period, id: "b", startDate: "2026-12-20", endDate: "2026-12-29" }, [sheet1Period])).toBeNull();
    expect(validatePricePeriod({ ...sheet1Period, id: "b", startDate: "2026-12-24", endDate: "2026-12-29" }, [sheet1Period])).toBeNull();
  });

  it("calculates the unweighted average of configured room-type base prices", () => {
    expect(averageConfiguredBasePrice(rooms, { js: 14500, ds: 15500, al: 16500 })).toBe(15500);
  });
});
