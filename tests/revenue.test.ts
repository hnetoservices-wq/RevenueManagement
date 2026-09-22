import { describe, expect, it } from "vitest";
import { MALMERENDAS_PROPERTY } from "../src/domain/property";
import type { Reservation } from "../src/domain/models";
import { calculateRevenueAnalysis } from "../src/features/revenue/revenue";

const booking: Reservation = {
  propertyId: "malmerendas",
  reservationId: "REV-1",
  checkIn: "2026-01-05",
  checkOut: "2026-01-07",
  bookedAt: "2025-12-01",
  source: "Booking.com",
  sourceStatus: "confirmed",
  status: "active",
  country: "PT",
  rooms: [{ roomTypeName: "Deluxe Suite", quantity: 1 }],
  roomQuantity: 1,
  touristTaxCents: 1200,
  extraRevenueExclCents: 2000,
  extraRevenueInclCents: 2460,
  roomRevenueExclCents: 20000,
  roomRevenueInclCents: 21200,
  totalBookingValueCents: 24860,
  amountDueCents: 0,
};

const expedia: Reservation = {
  ...booking,
  reservationId: "REV-2",
  checkIn: "2026-01-05",
  checkOut: "2026-01-06",
  source: "Expedia",
  touristTaxCents: 600,
  extraRevenueExclCents: 0,
  extraRevenueInclCents: 0,
  roomRevenueExclCents: 10000,
  roomRevenueInclCents: 10600,
  totalBookingValueCents: 11200,
};

describe("revenue analysis", () => {
  it("reconciles revenue mix and exact channel contribution", () => {
    const result = calculateRevenueAnalysis(
      MALMERENDAS_PROPERTY,
      [booking, expedia],
      { startDate: "2026-01-05", endDate: "2026-01-07", revenueBasis: "inclusive" },
      "none",
    );

    expect(result.current.roomRevenueCents).toBe(31800);
    expect(result.current.extraRevenueCents).toBe(2460);
    expect(result.current.touristTaxCents).toBe(1800);
    expect(result.current.totalRevenueCents).toBe(36060);
    expect(result.mix.reduce((sum, item) => sum + item.valueCents, 0)).toBe(36060);

    expect(result.channels[0].channel).toBe("Booking.com");
    expect(result.channels[0].roomRevenueCents).toBe(21200);
    expect(result.channels[0].roomNightsSold).toBe(2);
    expect(result.channels[0].adrCents).toBe(10600);
    expect(result.channels[0].share).toBeCloseTo(21200 / 31800);
    expect(result.channels[1].channel).toBe("Expedia");
  });

  it("suppresses headline comparison when prior-year history is incomplete", () => {
    const prior: Reservation = {
      ...booking,
      reservationId: "REV-PY",
      checkIn: "2025-11-17",
      checkOut: "2025-11-19",
      bookedAt: "2025-10-01",
    };
    const current: Reservation = {
      ...booking,
      reservationId: "REV-CURRENT",
      checkIn: "2026-06-10",
      checkOut: "2026-06-12",
    };

    const result = calculateRevenueAnalysis(
      MALMERENDAS_PROPERTY,
      [prior, current],
      { startDate: "2026-01-01", endDate: "2026-12-31", revenueBasis: "inclusive" },
      "previous_year",
      [prior, current],
    );

    expect(result.comparisonCoverage?.coverage).toBeLessThan(0.8);
    expect(result.comparisonReliable).toBe(false);
    expect(result.comparison).toBeNull();
  });

  it("ranks top stay dates by allocated room revenue", () => {
    const result = calculateRevenueAnalysis(
      MALMERENDAS_PROPERTY,
      [booking, expedia],
      { startDate: "2026-01-05", endDate: "2026-01-07", revenueBasis: "inclusive" },
      "none",
    );

    expect(result.topDates[0].date).toBe("2026-01-05");
    expect(result.topDates[0].roomRevenueCents).toBe(21200);
    expect(result.topDates[0].roomNightsSold).toBe(2);
    expect(result.topDates[1].date).toBe("2026-01-06");
    expect(result.topDates[1].roomRevenueCents).toBe(10600);
  });
});
