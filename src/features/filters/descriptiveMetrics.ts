import { differenceInCalendarDays } from "date-fns";
import { nightsBetween, parseIsoDate } from "../../domain/dates";
import type { DashboardFilters, Reservation } from "../../domain/models";

export interface ReservationDescriptiveMetrics {
  reservations: number;
  averageLeadTime: number | null;
  medianLeadTime: number | null;
  averageLengthOfStay: number | null;
  medianLengthOfStay: number | null;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function intersects(reservation: Reservation, filters: DashboardFilters): boolean {
  return reservation.checkIn <= filters.endDate && reservation.checkOut > filters.startDate;
}

export function calculateReservationDescriptiveMetrics(
  reservations: Reservation[],
  filters: DashboardFilters,
): ReservationDescriptiveMetrics {
  const selected = reservations.filter((reservation) => reservation.status === "cancelled" && intersects(reservation, filters));
  const leadTimes = selected
    .filter((reservation) => reservation.bookedAt !== null)
    .map((reservation) => differenceInCalendarDays(parseIsoDate(reservation.checkIn), parseIsoDate(reservation.bookedAt!)))
    .filter((value) => value >= 0);
  const lengthsOfStay = selected.map((reservation) => nightsBetween(reservation.checkIn, reservation.checkOut));

  return {
    reservations: selected.length,
    averageLeadTime: average(leadTimes),
    medianLeadTime: median(leadTimes),
    averageLengthOfStay: average(lengthsOfStay),
    medianLengthOfStay: median(lengthsOfStay),
  };
}
