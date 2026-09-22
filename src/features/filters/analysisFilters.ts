import type { Property, Reservation } from "../../domain/models";

export type AnalysisStatusFilter = "all" | "active" | "cancelled";

export interface AnalysisFilters {
  channel: string;
  roomType: string;
  status: AnalysisStatusFilter;
}

export interface AnalysisFilterResult {
  property: Property;
  reservations: Reservation[];
  roomTypeRevenueEstimated: boolean;
  estimatedReservationCount: number;
}

export const ALL_CHANNELS = "__all_channels__";
export const ALL_ROOM_TYPES = "__all_room_types__";

export const DEFAULT_ANALYSIS_FILTERS: AnalysisFilters = {
  channel: ALL_CHANNELS,
  roomType: ALL_ROOM_TYPES,
  status: "all",
};

export function analysisChannels(reservations: Reservation[]): string[] {
  return Array.from(new Set(reservations.map((reservation) => reservation.source).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
}

export function analysisRoomTypes(property: Property): string[] {
  return property.roomTypes
    .filter((roomType) => roomType.inventoryCount > 0 && roomType.activeTo === null)
    .map((roomType) => roomType.canonicalName)
    .sort((a, b) => a.localeCompare(b));
}

function scaled(value: number, ratio: number): number {
  return Math.round(value * ratio);
}

function projectReservationToRoomType(reservation: Reservation, roomTypeName: string): { reservation: Reservation; estimated: boolean } | null {
  const selectedRooms = reservation.rooms.filter((room) => room.roomTypeName === roomTypeName);
  const selectedQuantity = selectedRooms.reduce((sum, room) => sum + room.quantity, 0);
  if (!selectedQuantity) return null;

  const totalQuantity = reservation.roomQuantity || reservation.rooms.reduce((sum, room) => sum + room.quantity, 0);
  if (!totalQuantity) return null;
  const ratio = selectedQuantity / totalQuantity;
  const estimated = selectedQuantity !== totalQuantity || reservation.rooms.some((room) => room.roomTypeName !== roomTypeName);

  return {
    estimated,
    reservation: {
      ...reservation,
      rooms: selectedRooms.map((room) => ({ ...room })),
      roomQuantity: selectedQuantity,
      touristTaxCents: scaled(reservation.touristTaxCents, ratio),
      extraRevenueExclCents: scaled(reservation.extraRevenueExclCents, ratio),
      extraRevenueInclCents: scaled(reservation.extraRevenueInclCents, ratio),
      roomRevenueExclCents: scaled(reservation.roomRevenueExclCents, ratio),
      roomRevenueInclCents: scaled(reservation.roomRevenueInclCents, ratio),
      totalBookingValueCents: scaled(reservation.totalBookingValueCents, ratio),
      amountDueCents: scaled(reservation.amountDueCents, ratio),
    },
  };
}

export function applyAnalysisFilters(
  property: Property,
  reservations: Reservation[],
  filters: AnalysisFilters,
): AnalysisFilterResult {
  let selected = reservations.filter((reservation) => {
    if (filters.channel !== ALL_CHANNELS && reservation.source !== filters.channel) return false;
    if (filters.status !== "all" && reservation.status !== filters.status) return false;
    return true;
  });

  let filteredProperty = property;
  let roomTypeRevenueEstimated = false;
  let estimatedReservationCount = 0;

  if (filters.roomType !== ALL_ROOM_TYPES) {
    const projected: Reservation[] = [];
    for (const reservation of selected) {
      const result = projectReservationToRoomType(reservation, filters.roomType);
      if (!result) continue;
      projected.push(result.reservation);
      if (result.estimated) {
        roomTypeRevenueEstimated = true;
        estimatedReservationCount += 1;
      }
    }
    selected = projected;
    filteredProperty = {
      ...property,
      roomTypes: property.roomTypes.filter((roomType) => roomType.canonicalName === filters.roomType),
    };
  }

  return {
    property: filteredProperty,
    reservations: selected,
    roomTypeRevenueEstimated,
    estimatedReservationCount,
  };
}

export function hasActiveAnalysisFilters(filters: AnalysisFilters): boolean {
  return filters.channel !== ALL_CHANNELS || filters.roomType !== ALL_ROOM_TYPES || filters.status !== "all";
}
