import type { RoomType } from "../../domain/models";
import type { PriceManagementConfig } from "./types";

export interface RoomBasePriceRow {
  roomTypeId: string;
  roomName: string;
  inventoryCount: number;
  basePriceCents: number;
  coefficient: number | null;
  differenceFromReferenceCents: number | null;
  isReference: boolean;
}

export function averageConfiguredBasePrice(roomTypes: RoomType[], basePricesCents: Record<string, number>): number | null {
  const values = roomTypes
    .map((room) => basePricesCents[room.id] ?? 0)
    .filter((value) => value > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function configuredBasePriceRange(roomTypes: RoomType[], basePricesCents: Record<string, number>): { minCents: number; maxCents: number } | null {
  const values = roomTypes
    .map((room) => basePricesCents[room.id] ?? 0)
    .filter((value) => value > 0);
  if (!values.length) return null;
  return { minCents: Math.min(...values), maxCents: Math.max(...values) };
}

export function buildRoomBasePriceRows(roomTypes: RoomType[], config: PriceManagementConfig): RoomBasePriceRow[] {
  const referencePrice = config.referenceRoomTypeId ? config.basePricesCents[config.referenceRoomTypeId] ?? 0 : 0;
  return roomTypes.map((room) => {
    const basePrice = config.basePricesCents[room.id] ?? 0;
    return {
      roomTypeId: room.id,
      roomName: room.canonicalName,
      inventoryCount: room.inventoryCount,
      basePriceCents: basePrice,
      coefficient: referencePrice > 0 && basePrice > 0 ? basePrice / referencePrice : null,
      differenceFromReferenceCents: referencePrice > 0 && basePrice > 0 ? basePrice - referencePrice : null,
      isReference: room.id === config.referenceRoomTypeId,
    };
  });
}

export function projectRoomPriceFromReference(
  targetReferencePriceCents: number,
  roomBasePriceCents: number,
  referenceBasePriceCents: number,
): number | null {
  if (targetReferencePriceCents <= 0 || roomBasePriceCents <= 0 || referenceBasePriceCents <= 0) return null;
  return Math.round(targetReferencePriceCents * (roomBasePriceCents / referenceBasePriceCents));
}
