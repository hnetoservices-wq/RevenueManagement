import { describe, expect, it } from "vitest";
import { MALMERENDAS_PROPERTY } from "../src/domain/property";
import type { Reservation } from "../src/domain/models";
import { calculateOccupancyAnalysis } from "../src/features/occupancy/occupancy";

const reservation: Reservation = {
  propertyId: "malmerendas",
  reservationId: "OCC-1",
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
  extraRevenueExclCents: 0,
  extraRevenueInclCents: 0,
  roomRevenueExclCents: 20000,
  roomRevenueInclCents: 21200,
  totalBookingValueCents: 22400,
  amountDueCents: 0,
};

describe("occupancy analysis", () => {
  it("uses each room type's own inventory denominator", () => {
    const result = calculateOccupancyAnalysis(
      MALMERENDAS_PROPERTY,
      [reservation],
      { startDate: "2026-01-05", endDate: "2026-01-11", revenueBasis: "inclusive" },
      "none",
    );

    expect(result.current.roomNightsSold).toBe(2);
    expect(result.current.availableRoomNights).toBe(42);
    expect(result.current.occupancy).toBeCloseTo(2 / 42);

    const deluxe = result.roomTypes.find((row) => row.roomType === "Deluxe Suite");
    expect(deluxe?.roomNightsSold).toBe(2);
    expect(deluxe?.availableRoomNights).toBe(7);
    expect(deluxe?.occupancy).toBeCloseTo(2 / 7);
  });

  it("groups sold and available room nights by stay-night weekday", () => {
    const result = calculateOccupancyAnalysis(
      MALMERENDAS_PROPERTY,
      [reservation],
      { startDate: "2026-01-05", endDate: "2026-01-11", revenueBasis: "inclusive" },
      "none",
    );

    const monday = result.weekdays.find((row) => row.weekday === "Mon");
    const tuesday = result.weekdays.find((row) => row.weekday === "Tue");
    const wednesday = result.weekdays.find((row) => row.weekday === "Wed");
    expect(monday?.roomNightsSold).toBe(1);
    expect(monday?.availableRoomNights).toBe(6);
    expect(monday?.occupancy).toBeCloseTo(1 / 6);
    expect(tuesday?.roomNightsSold).toBe(1);
    expect(wednesday?.roomNightsSold).toBe(0);
  });

  it("suppresses aggregate PY deltas while allowing individually reliable trend segments", () => {
    const prior: Reservation = {
      ...reservation,
      reservationId: "OCC-PY",
      checkIn: "2025-11-17",
      checkOut: "2025-11-19",
      bookedAt: "2025-10-01",
    };
    const current: Reservation = {
      ...reservation,
      reservationId: "OCC-CURRENT",
      checkIn: "2026-06-10",
      checkOut: "2026-06-12",
    };

    const result = calculateOccupancyAnalysis(
      MALMERENDAS_PROPERTY,
      [prior, current],
      { startDate: "2026-01-01", endDate: "2026-12-31", revenueBasis: "inclusive" },
      "previous_year",
      [prior, current],
    );

    expect(result.comparisonCoverage?.coverage).toBeLessThan(0.8);
    expect(result.comparisonReliable).toBe(false);
    expect(result.comparison).toBeNull();
    expect(result.roomTypes.every((row) => row.comparisonOccupancy === null)).toBe(true);
    expect(result.demandTrend.slice(0, 11).every((row) => row.comparisonOccupancy === null)).toBe(true);
    expect(result.demandTrend[11].comparisonOccupancy).toBe(0);
  });

  it("counts high-demand and sold-out dates from daily OTB occupancy", () => {
    const soldOut: Reservation = {
      ...reservation,
      reservationId: "OCC-SOLDOUT",
      checkIn: "2026-01-05",
      checkOut: "2026-01-06",
      rooms: MALMERENDAS_PROPERTY.roomTypes.map((roomType) => ({ roomTypeName: roomType.canonicalName, quantity: 1 })),
      roomQuantity: 6,
    };

    const result = calculateOccupancyAnalysis(
      MALMERENDAS_PROPERTY,
      [soldOut],
      { startDate: "2026-01-05", endDate: "2026-01-06", revenueBasis: "inclusive" },
      "none",
    );

    expect(result.daysAtOrAbove80).toBe(1);
    expect(result.soldOutDays).toBe(1);
    expect(result.highestDates[0].date).toBe("2026-01-05");
    expect(result.highestDates[0].occupancy).toBe(1);
  });
});
