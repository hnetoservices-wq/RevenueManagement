import type { Reservation } from "./models";

const SEGMENT_MARKER = "::segment:";

export function logicalReservationId(reservation: Pick<Reservation, "reservationId">): string {
  const marker = reservation.reservationId.indexOf(SEGMENT_MARKER);
  return marker >= 0 ? reservation.reservationId.slice(0, marker) : reservation.reservationId;
}

export function uniqueReservationCount(reservations: Array<Pick<Reservation, "reservationId">>): number {
  return new Set(reservations.map(logicalReservationId)).size;
}
