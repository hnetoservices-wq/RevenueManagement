import { describe, expect, it } from "vitest";
import { MALMERENDAS_PROPERTY } from "../src/domain/property";
import type { Reservation } from "../src/domain/models";
import { calculateReportSummary } from "../src/features/summary/reportSummary";

function reservation(id: string, checkIn: Reservation["checkIn"], checkOut: Reservation["checkOut"], revenue: number, source = "Booking.com"): Reservation {
  return {
    propertyId: "malmerendas",
    reservationId: id,
    checkIn,
    checkOut,
    bookedAt: "2026-06-01",
    source,
    sourceStatus: "confirmed",
    status: "active",
    country: "PT",
    rooms: [{ roomTypeName: "Deluxe Suite", quantity: 1 }],
    roomQuantity: 1,
    touristTaxCents: 0,
    extraRevenueExclCents: 0,
    extraRevenueInclCents: 0,
    roomRevenueExclCents: revenue,
    roomRevenueInclCents: revenue,
    totalBookingValueCents: revenue,
    amountDueCents: 0,
  };
}

describe("report summary", () => {
  it("compares each stay month between a baseline snapshot and the latest report", () => {
    const baseline = [
      reservation("JAN", "2026-01-05", "2026-01-06", 10000),
      reservation("SEP", "2026-09-05", "2026-09-06", 12000),
    ];
    const current = [
      ...baseline,
      reservation("SEP-NEW", "2026-09-10", "2026-09-12", 30000, "Amenitiz"),
    ];
    const result = calculateReportSummary(
      MALMERENDAS_PROPERTY,
      baseline,
      current,
      { startDate: "2026-01-01", endDate: "2026-12-31", revenueBasis: "inclusive" },
      "2026-08-01",
    );

    const january = result.months.find((row) => row.key === "2026-01")!;
    const september = result.months.find((row) => row.key === "2026-09")!;
    expect(january.observation).toBe("Closed");
    expect(january.roomRevenueDeltaCents).toBe(0);
    expect(september.roomRevenueDeltaCents).toBe(30000);
    expect(september.occupancyDeltaPoints).toBeGreaterThan(0);
    expect(result.pickup.roomNightsSold).toBe(2);
    expect(result.pickup.roomRevenueCents).toBe(30000);
  });

  it("reconciles channel current revenue and pickup decomposition to the headline change", () => {
    const baseline = [reservation("A", "2026-09-05", "2026-09-06", 10000)];
    const current = [
      ...baseline,
      reservation("B", "2026-10-01", "2026-10-03", 24000, "Amenitiz"),
    ];
    const result = calculateReportSummary(
      MALMERENDAS_PROPERTY,
      baseline,
      current,
      { startDate: "2026-09-01", endDate: "2026-12-31", revenueBasis: "inclusive" },
      "2026-09-15",
    );

    expect(result.channels.reduce((sum, row) => sum + row.roomRevenueCents, 0)).toBe(result.current.roomRevenueCents);
    expect(result.decomposition.net.roomRevenueCentsDelta).toBe(result.pickup.roomRevenueCents);
    expect(result.decomposition.categories.find((row) => row.type === "new")?.reservations).toBe(1);
  });
});
