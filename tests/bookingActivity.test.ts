import { describe, expect, it } from "vitest";
import { MALMERENDAS_PROPERTY } from "../src/domain/property";
import type { Reservation } from "../src/domain/models";
import { calculateBookingActivity, defaultBookingRange } from "../src/features/booking/bookingActivity";

const base: Reservation = {
  propertyId: "malmerendas",
  reservationId: "B-1",
  checkIn: "2026-10-01",
  checkOut: "2026-10-04",
  bookedAt: "2026-09-05",
  source: "Booking.com",
  sourceStatus: "confirmed",
  status: "active",
  country: "PT",
  rooms: [{ roomTypeName: "Deluxe Suite", quantity: 1 }],
  roomQuantity: 1,
  touristTaxCents: 1200,
  extraRevenueExclCents: 2000,
  extraRevenueInclCents: 2460,
  roomRevenueExclCents: 30000,
  roomRevenueInclCents: 31800,
  totalBookingValueCents: 35460,
  amountDueCents: 0,
};

describe("booking activity", () => {
  it("attributes the full current booking value to the booking date rather than the stay period", () => {
    const outside: Reservation = { ...base, reservationId: "B-2", bookedAt: "2026-08-31" };
    const result = calculateBookingActivity(
      MALMERENDAS_PROPERTY,
      [base, outside],
      { startDate: "2026-09-01", endDate: "2026-09-30", revenueBasis: "inclusive" },
      "none",
      [base, outside],
    );

    expect(result.metrics.reservations).toBe(1);
    expect(result.metrics.roomNightsBooked).toBe(3);
    expect(result.metrics.roomRevenueCents).toBe(31800);
    expect(result.metrics.extraRevenueCents).toBe(2460);
    expect(result.metrics.touristTaxCents).toBe(1200);
    expect(result.metrics.totalRevenueCents).toBe(35460);
    expect(result.metrics.adrCents).toBe(10600);
  });

  it("allocates booked room nights and room revenue across the actual stay months", () => {
    const crossing: Reservation = {
      ...base,
      reservationId: "B-CROSS",
      checkIn: "2026-09-30",
      checkOut: "2026-10-02",
      bookedAt: "2026-09-10",
      roomRevenueInclCents: 20000,
      roomRevenueExclCents: 20000,
    };
    const result = calculateBookingActivity(
      MALMERENDAS_PROPERTY,
      [crossing],
      { startDate: "2026-09-01", endDate: "2026-09-30", revenueBasis: "inclusive" },
      "none",
      [crossing],
    );

    expect(result.stayMonths).toHaveLength(2);
    expect(result.stayMonths[0]).toMatchObject({ key: "2026-09", roomNightsBooked: 1, roomRevenueCents: 10000 });
    expect(result.stayMonths[1]).toMatchObject({ key: "2026-10", roomNightsBooked: 1, roomRevenueCents: 10000 });
  });

  it("keeps previous-year booking comparison suppressed when booking-date history does not cover it", () => {
    const earliest: Reservation = { ...base, reservationId: "EARLY", bookedAt: "2025-11-17", checkIn: "2025-12-10", checkOut: "2025-12-12" };
    const latest: Reservation = { ...base, reservationId: "LATEST", bookedAt: "2026-09-22" };
    const result = calculateBookingActivity(
      MALMERENDAS_PROPERTY,
      [earliest, latest],
      { startDate: "2026-09-01", endDate: "2026-09-22", revenueBasis: "inclusive" },
      "previous_year",
      [earliest, latest],
    );

    expect(result.currentCoverage.coverage).toBe(1);
    expect(result.comparisonCoverage?.coverage).toBe(0);
    expect(result.comparisonReliable).toBe(false);
    expect(result.comparison).toBeNull();
  });

  it("reports channel and room-type production that reconciles to booked room nights", () => {
    const direct: Reservation = {
      ...base,
      reservationId: "DIRECT",
      source: "Amenitiz",
      checkIn: "2026-11-01",
      checkOut: "2026-11-03",
      bookedAt: "2026-09-12",
      rooms: [{ roomTypeName: "Garden Studio", quantity: 1 }],
      roomRevenueInclCents: 22000,
      roomRevenueExclCents: 22000,
    };
    const result = calculateBookingActivity(
      MALMERENDAS_PROPERTY,
      [base, direct],
      { startDate: "2026-09-01", endDate: "2026-09-30", revenueBasis: "inclusive" },
      "none",
      [base, direct],
    );

    expect(result.channels.reduce((sum, row) => sum + row.roomRevenueCents, 0)).toBe(result.metrics.roomRevenueCents);
    expect(result.roomTypes.reduce((sum, row) => sum + row.roomNightsBooked, 0)).toBe(result.metrics.roomNightsBooked);
    expect(result.channels.reduce((sum, row) => sum + (row.share ?? 0), 0)).toBeCloseTo(1);
  });

  it("defaults to the last 30 observed booking dates instead of future calendar dates", () => {
    const earliest: Reservation = { ...base, reservationId: "RANGE-EARLY", bookedAt: "2026-07-01" };
    const latest: Reservation = { ...base, reservationId: "RANGE-LATEST", bookedAt: "2026-09-22" };
    const range = defaultBookingRange([earliest, latest]);
    expect(range.endDate).toBe("2026-09-22");
    expect(range.startDate).toBe("2026-08-24");
  });
});
