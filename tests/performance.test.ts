import { describe, expect, it } from "vitest";
import {
  calculatePerformanceAnalysis,
  getDataAvailabilityStart,
  getPerformanceComparisonFilters,
  getPerformanceCoverage,
} from "../src/features/performance/performance";
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

  it("infers a conservative stay-data availability boundary", () => {
    const prior: Reservation = {
      ...reservation,
      reservationId: "PERF-PY",
      checkIn: "2025-11-15",
      checkOut: "2025-11-17",
      bookedAt: "2025-10-01",
    };
    expect(getDataAvailabilityStart([reservation, prior])).toBe("2025-11-15");

    const coverage = getPerformanceCoverage({
      ...filters,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    }, "2025-11-15");
    expect(coverage.coveredDays).toBe(47);
    expect(coverage.totalDays).toBe(365);
    expect(coverage.coverage).toBeCloseTo(47 / 365);
    expect(coverage.quality).toBe("insufficient");
  });

  it("does not treat unavailable prior-year months as zero performance", () => {
    const prior: Reservation = {
      ...reservation,
      reservationId: "PERF-PY",
      checkIn: "2025-11-15",
      checkOut: "2025-11-17",
      bookedAt: "2025-10-01",
      roomRevenueInclCents: 18000,
      roomRevenueExclCents: 16981,
    };
    const result = calculatePerformanceAnalysis(MALMERENDAS_PROPERTY, [prior, reservation], {
      ...filters,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    }, "previous_year");

    expect(result.dataAvailabilityStartDate).toBe("2025-11-15");
    expect(result.comparisonCoverage?.coveredDays).toBe(47);
    expect(result.comparisonReliable).toBe(false);
    expect(result.monthly[0].comparisonCoverage?.coverage).toBe(0);
    expect(result.monthly[0].comparisonReliable).toBe(false);
    expect(result.monthly[10].comparisonCoverage?.coverage).toBeCloseTo(16 / 30);
    expect(result.monthly[10].comparisonReliable).toBe(false);
    expect(result.monthly[11].comparisonCoverage?.coverage).toBe(1);
    expect(result.monthly[11].comparisonReliable).toBe(true);
    expect(result.trend[0].comparisonOccupancy).toBeNull();
    expect(result.trend[10].comparisonOccupancy).toBeNull();
    expect(result.trend[11].comparisonOccupancy).toBe(0);
  });

  it("keeps availability coverage based on raw data when the analytical subset starts later", () => {
    const historicalRaw: Reservation = {
      ...reservation,
      reservationId: "RAW-HISTORY",
      checkIn: "2025-11-15",
      checkOut: "2025-11-16",
      bookedAt: "2025-10-01",
      source: "Amenitiz",
    };
    const filteredOnly: Reservation = {
      ...reservation,
      reservationId: "FILTERED-CURRENT",
      checkIn: "2026-03-10",
      checkOut: "2026-03-11",
      source: "Expedia",
    };

    const result = calculatePerformanceAnalysis(
      MALMERENDAS_PROPERTY,
      [filteredOnly],
      { ...filters, startDate: "2026-01-01", endDate: "2026-12-31" },
      "previous_year",
      [historicalRaw, filteredOnly],
    );

    expect(result.dataAvailabilityStartDate).toBe("2025-11-15");
    expect(result.comparisonCoverage?.coveredDays).toBe(47);
  });
});
