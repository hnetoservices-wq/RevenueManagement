import type { RoomType } from "../../domain/models";
import type { PriceManagementConfig, PricePeriod } from "./types";

export interface RoomBasePriceRow {
  roomTypeId: string;
  roomName: string;
  inventoryCount: number;
  basePriceCents: number;
  isReference: boolean;
}

export function averageConfiguredBasePrice(roomTypes: RoomType[], basePricesCents: Record<string, number>): number | null {
  const values = roomTypes.map((room) => basePricesCents[room.id] ?? 0).filter((value) => value > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function configuredBasePriceRange(roomTypes: RoomType[], basePricesCents: Record<string, number>): { minCents: number; maxCents: number } | null {
  const values = roomTypes.map((room) => basePricesCents[room.id] ?? 0).filter((value) => value > 0);
  if (!values.length) return null;
  return { minCents: Math.min(...values), maxCents: Math.max(...values) };
}

export function buildRoomBasePriceRows(roomTypes: RoomType[], config: PriceManagementConfig): RoomBasePriceRow[] {
  return roomTypes.map((room) => ({
    roomTypeId: room.id,
    roomName: room.canonicalName,
    inventoryCount: room.inventoryCount,
    basePriceCents: config.basePricesCents[room.id] ?? 0,
    isReference: room.id === config.referenceRoomTypeId,
  }));
}

export function projectRoomPriceFromReference(targetReferencePriceCents: number, roomBasePriceCents: number, referenceBasePriceCents: number): number | null {
  if (targetReferencePriceCents <= 0 || roomBasePriceCents <= 0 || referenceBasePriceCents <= 0) return null;
  return Math.round(targetReferencePriceCents * roomBasePriceCents / referenceBasePriceCents);
}

export function projectPeriodRoomPrices(roomTypes: RoomType[], config: PriceManagementConfig, period: PricePeriod): Record<string, number | null> {
  const referenceBase = config.referenceRoomTypeId ? config.basePricesCents[config.referenceRoomTypeId] ?? 0 : 0;
  return Object.fromEntries(roomTypes.map((room) => [
    room.id,
    projectRoomPriceFromReference(period.directFlexReferenceCents, config.basePricesCents[room.id] ?? 0, referenceBase),
  ]));
}

export function pricePeriodsOverlap(a: PricePeriod, b: PricePeriod): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function validatePricePeriod(period: PricePeriod, existing: PricePeriod[]): string | null {
  if (!period.startDate || !period.endDate) return "Defina as datas de início e fim.";
  if (period.endDate < period.startDate) return "A data final não pode ser anterior à data inicial.";
  if (period.directFlexReferenceCents <= 0) return "Defina um preço Direct Flex superior a zero.";
  if (existing.some((item) => item.id !== period.id && pricePeriodsOverlap(period, item))) return "Este período sobrepõe-se a outro período já definido.";
  return null;
}
