import { describe, expect, it } from "vitest";
import { calculatePerformanceAnalysis, getPerformanceComparisonFilters } from "../src/features/performance/performance";
import { MALMERENDAS_PROPERTY } from "../src/domain/property";
import type { DashboardFilters, Reservation } from "../src/domain/models";

const reservation: Reservation = {
  propertyId: "malmerendas",
  reservationId: "PERF-1",
  checkIn: "2026-03-10",
  checkOut: "2026-03-12",
  bookedAt: "2026-02-01",
  source: "Booking.com",
  sourceStatus: "confirmed",
  status: "active",
  country: "PT",
  rooms: [{ roomTypeName: "Deluxe Suite", quantity: 1 }],
  roomQuantity: 1,
  touristTaxCents: 1200,
  extraRevenueExclCents: 0,
  extraRevenueInclCents: 0,
  roomRevenueExclCents: 20000,
  roomRevenueInclCents: 21200,
  totalBookingValueCents: 22400,
  amountDueCents: 0,
};

const filters: DashboardFilters = {
  startDate: "2026-03-01",
  endDate: "2026-03-31",
  revenueBasis: "inclusive",
};

describe("performance analysis", () => {
  it("maps previous-year comparison to equivalent dates", () => {
    expect(getPerformanceComparisonFilters(filters, "previous_year")).toEqual({
      ...filters,
      startDate: "2025-03-01",
      endDate: "2025-03-31",
    });
  });

  it("maps previous-period comparison to the immediately preceding equal-length range", () => {
    expect(getPerformanceComparisonFilters(filters, "previous_period")).toEqual({
      ...filters,
      startDate: "2026-01-29",
      endDate: "2026-02-28",
    });
  });

  it("builds daily, weekly, and monthly trend granularity from range length", () => {
    const daily = calculatePerformanceAnalysis(MALMERENDAS_PROPERTY, [reservation], filters, "none");
    expect(daily.granularity).toBe("Daily");
    expect(daily.monthly).toHaveLength(1);

    const weekly = calculatePerformanceAnalysis(MALMERENDAS_PROPERTY, [reservation], {
      ...filters,
      startDate: "2026-01-01",
      endDate: "2026-04-30",
    }, "none");
    expect(weekly.granularity).toBe("Weekly");

    const monthly = calculatePerformanceAnalysis(MALMERENDAS_PROPERTY, [reservation], {
      ...filters,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    }, "none");
    expect(monthly.granularity).toBe("Monthly");
    expect(monthly.monthly).toHaveLength(12);
  });

  it("keeps monthly previous-period rows aligned by the selected period offset", () => {
    const result = calculatePerformanceAnalysis(MALMERENDAS_PROPERTY, [reservation], {
      ...filters,
      startDate: "2026-03-01",
      endDate: "2026-04-30",
    }, "previous_period");

    expect(result.monthly[0].comparisonStartDate).toBe("2025-12-30");
    expect(result.monthly[0].comparisonEndDate).toBe("2026-01-29");
    expect(result.monthly[1].comparisonStartDate).toBe("2026-01-30");
    expect(result.monthly[1].comparisonEndDate).toBe("2026-02-28");
  });
});
