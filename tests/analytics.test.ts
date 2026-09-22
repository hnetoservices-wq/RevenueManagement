import { describe, expect, it } from "vitest";
import { calculateMetrics, calculateSnapshotComparison } from "../src/domain/analytics";
import { MALMERENDAS_PROPERTY } from "../src/domain/property";
import type { Reservation } from "../src/domain/models";

const baseReservation: Reservation = {
  propertyId: "malmerendas",
  reservationId: "R-1",
  checkIn: "2026-01-10",
  checkOut: "2026-01-13",
  bookedAt: "2025-12-11",
  source: "Booking.com",
  sourceStatus: "confirmed",
  status: "active",
  country: "PT",
  rooms: [{ roomTypeName: "Deluxe Suite", quantity: 1 }],
  roomQuantity: 1,
  touristTaxCents: 1800,
  extraRevenueExclCents: 1000,
  extraRevenueInclCents: 1230,
  roomRevenueExclCents: 30000,
  roomRevenueInclCents: 31800,
  totalBookingValueCents: 34830,
  amountDueCents: 0,
};

describe("core analytics", () => {
  it("uses check-in nights and excludes check-out", () => {
    const result = calculateMetrics(MALMERENDAS_PROPERTY, [baseReservation], {
      startDate: "2026-01-10",
      endDate: "2026-01-13",
      revenueBasis: "inclusive",
    });
    expect(result.roomNightsSold).toBe(3);
    expect(result.availableRoomNights).toBe(24);
    expect(result.occupancy).toBeCloseTo(0.125);
    expect(result.roomRevenueCents).toBe(31800);
    expect(result.adrCents).toBe(10600);
    expect(result.revparCents).toBe(1325);
    expect(result.averageLeadTime).toBe(30);
    expect(result.averageLengthOfStay).toBe(3);
    expect(result.daily.at(-1)?.roomNightsSold).toBe(0);
  });

  it("counts multiple rooms as multiple room nights", () => {
    const multiRoom = { ...baseReservation, roomQuantity: 2, rooms: [
      { roomTypeName: "Deluxe Suite", quantity: 1 },
      { roomTypeName: "Junior Suite", quantity: 1 },
    ] };
    const result = calculateMetrics(MALMERENDAS_PROPERTY, [multiRoom], {
      startDate: "2026-01-10",
      endDate: "2026-01-12",
      revenueBasis: "inclusive",
    });
    expect(result.roomNightsSold).toBe(6);
    expect(result.adrCents).toBe(5300);
  });

  it("does not include cancelled reservations in sold nights or revenue", () => {
    const cancelled = { ...baseReservation, reservationId: "R-2", status: "cancelled" as const, sourceStatus: "cancelled" };
    const result = calculateMetrics(MALMERENDAS_PROPERTY, [baseReservation, cancelled], {
      startDate: "2026-01-10",
      endDate: "2026-01-12",
      revenueBasis: "inclusive",
    });
    expect(result.roomNightsSold).toBe(3);
    expect(result.reservations).toBe(1);
    expect(result.cancellationRate).toBe(0.5);
  });

  it("allocates revenue when the filter contains part of a stay", () => {
    const result = calculateMetrics(MALMERENDAS_PROPERTY, [baseReservation], {
      startDate: "2026-01-11",
      endDate: "2026-01-11",
      revenueBasis: "inclusive",
    });
    expect(result.roomNightsSold).toBe(1);
    expect(result.roomRevenueCents).toBe(10600);
  });

  it("calculates pickup between two snapshots for the same stay period", () => {
    const newReservation: Reservation = {
      ...baseReservation,
      reservationId: "R-2",
      checkIn: "2026-01-11",
      checkOut: "2026-01-13",
      roomRevenueInclCents: 24000,
      roomRevenueExclCents: 22642,
      touristTaxCents: 1200,
      extraRevenueInclCents: 0,
      extraRevenueExclCents: 0,
    };
    const result = calculateSnapshotComparison(
      MALMERENDAS_PROPERTY,
      [baseReservation],
      [baseReservation, newReservation],
      { startDate: "2026-01-10", endDate: "2026-01-12", revenueBasis: "inclusive" },
    );

    expect(result.baseline.roomNightsSold).toBe(3);
    expect(result.current.roomNightsSold).toBe(5);
    expect(result.pickup.roomNightsSold).toBe(2);
    expect(result.pickup.roomRevenueCents).toBe(24000);
    expect(result.pickup.reservations).toBe(1);
    expect(result.pickup.occupancyPercentagePoints).toBeCloseTo(100 / 9);
  });
});
