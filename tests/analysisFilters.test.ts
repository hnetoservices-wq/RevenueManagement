import { describe, expect, it } from "vitest";
import { MALMERENDAS_PROPERTY } from "../src/domain/property";
import type { Reservation } from "../src/domain/models";
import {
  ALL_CHANNELS,
  ALL_ROOM_TYPES,
  applyAnalysisFilters,
} from "../src/features/filters/analysisFilters";

const reservation: Reservation = {
  propertyId: "malmerendas",
  reservationId: "FILTER-1",
  checkIn: "2026-10-10",
  checkOut: "2026-10-12",
  bookedAt: "2026-08-01",
  source: "Booking.com",
  sourceStatus: "confirmed",
  status: "active",
  country: "PT",
  rooms: [{ roomTypeName: "Deluxe Suite", quantity: 1 }],
  roomQuantity: 1,
  touristTaxCents: 1200,
  extraRevenueExclCents: 1000,
  extraRevenueInclCents: 1230,
  roomRevenueExclCents: 20000,
  roomRevenueInclCents: 21200,
  totalBookingValueCents: 23630,
  amountDueCents: 0,
};

describe("analysis filters", () => {
  it("filters reservations by channel and status", () => {
    const cancelled = { ...reservation, reservationId: "FILTER-2", source: "Expedia", status: "cancelled" as const };
    const result = applyAnalysisFilters(MALMERENDAS_PROPERTY, [reservation, cancelled], {
      channel: "Expedia",
      roomType: ALL_ROOM_TYPES,
      status: "cancelled",
    });

    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0].reservationId).toBe("FILTER-2");
    expect(result.property.roomTypes).toHaveLength(MALMERENDAS_PROPERTY.roomTypes.length);
  });

  it("projects inventory and room quantity exactly for a selected room type", () => {
    const result = applyAnalysisFilters(MALMERENDAS_PROPERTY, [reservation], {
      channel: ALL_CHANNELS,
      roomType: "Deluxe Suite",
      status: "all",
    });

    expect(result.property.roomTypes).toHaveLength(1);
    expect(result.property.roomTypes[0].canonicalName).toBe("Deluxe Suite");
    expect(result.reservations[0].roomQuantity).toBe(1);
    expect(result.roomTypeRevenueEstimated).toBe(false);
  });

  it("proportionally allocates revenue and flags mixed multi-room bookings as estimated", () => {
    const mixed: Reservation = {
      ...reservation,
      reservationId: "FILTER-MIXED",
      rooms: [
        { roomTypeName: "Deluxe Suite", quantity: 1 },
        { roomTypeName: "Junior Suite", quantity: 1 },
      ],
      roomQuantity: 2,
      roomRevenueExclCents: 40000,
      roomRevenueInclCents: 42400,
      touristTaxCents: 2400,
      extraRevenueExclCents: 2000,
      extraRevenueInclCents: 2460,
      totalBookingValueCents: 47260,
    };

    const result = applyAnalysisFilters(MALMERENDAS_PROPERTY, [mixed], {
      channel: ALL_CHANNELS,
      roomType: "Deluxe Suite",
      status: "all",
    });

    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0].roomQuantity).toBe(1);
    expect(result.reservations[0].roomRevenueInclCents).toBe(21200);
    expect(result.reservations[0].touristTaxCents).toBe(1200);
    expect(result.roomTypeRevenueEstimated).toBe(true);
    expect(result.estimatedReservationCount).toBe(1);
  });
});
