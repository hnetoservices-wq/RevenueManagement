import { describe, expect, it } from "vitest";
import type { DashboardFilters, Reservation } from "../src/domain/models";
import { calculateDistributionCosts, matchCommissionRule } from "../src/features/channels/commission";
import type { ChannelCommissionRule } from "../src/features/channels/types";

const filters: DashboardFilters = {
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  revenueBasis: "inclusive",
};

function reservation(id: string, source: string, bookedAt: Reservation["bookedAt"], revenue: number): Reservation {
  return {
    propertyId: "malmerendas",
    reservationId: id,
    checkIn: "2026-06-10",
    checkOut: "2026-06-12",
    bookedAt,
    source,
    sourceStatus: "confirmed",
    status: "active",
    country: null,
    rooms: [{ roomTypeName: "Junior Suite", quantity: 1 }],
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

const rules: ChannelCommissionRule[] = [
  { id: "booking-old", propertyId: "malmerendas", name: "Booking.com", aliases: "Booking", groupName: "Booking.com", commissionRate: 15, validFrom: "2025-01-01", validTo: "2026-04-30", active: true },
  { id: "booking-new", propertyId: "malmerendas", name: "Booking.com", aliases: "Booking", groupName: "Booking.com", commissionRate: 18, validFrom: "2026-05-01", validTo: null, active: true },
  { id: "direct", propertyId: "malmerendas", name: "Direta", aliases: "Direct; Website", groupName: "Direto", commissionRate: 0, validFrom: null, validTo: null, active: true },
];

describe("channel commissions", () => {
  it("uses the rule effective on the reservation booking date", () => {
    expect(matchCommissionRule("Booking", "2026-04-15", rules)?.commissionRate).toBe(15);
    expect(matchCommissionRule("Booking.com", "2026-05-15", rules)?.commissionRate).toBe(18);
  });

  it("calculates gross, commission, net revenue and flags unconfigured channels", () => {
    const result = calculateDistributionCosts([
      reservation("b1", "Booking.com", "2026-05-10", 10000),
      reservation("d1", "Website", "2026-05-10", 5000),
      reservation("x1", "Unknown OTA", "2026-05-10", 4000),
    ], filters, rules);

    expect(result.grossRoomRevenueCents).toBe(19000);
    expect(result.commissionCents).toBe(1800);
    expect(result.netRoomRevenueCents).toBe(17200);
    expect(result.unconfiguredRevenueCents).toBe(4000);
    expect(result.rows.find((row) => row.groupName === "Booking.com")?.commissionCents).toBe(1800);
    expect(result.rows.find((row) => row.groupName === "Direto")?.commissionCents).toBe(0);
  });

  it("prorates commission when only part of a stay is selected", () => {
    const partial = { ...filters, startDate: "2026-06-10", endDate: "2026-06-10" } as DashboardFilters;
    const result = calculateDistributionCosts([reservation("b1", "Booking.com", "2026-05-10", 10000)], partial, rules);
    expect(result.grossRoomRevenueCents).toBe(5000);
    expect(result.commissionCents).toBe(900);
    expect(result.netRoomRevenueCents).toBe(4100);
  });
});
