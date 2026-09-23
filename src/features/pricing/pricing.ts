import type { RoomType } from "../../domain/models";
import type { OtaPricingSettings, PriceManagementConfig, PricePeriod } from "./types";

export const DEFAULT_OTA_PRICING_SETTINGS: OtaPricingSettings = {
  upliftPct: 20,
  loyaltyDiscountPct: 15,
  basicDealDiscountPct: 20,
  nonRefundableDiscountPct: 10,
};

export interface RoomBasePriceRow {
  roomTypeId: string;
  roomName: string;
  inventoryCount: number;
  basePriceCents: number;
  isReference: boolean;
}

export interface PeriodReferenceRates {
  directFlexCents: number;
  directNonRefundableCents: number;
  otaFlexCents: number;
  otaNonRefundableCents: number;
  otaAfterBaseDiscountsCents: number;
}

export interface PeriodRoomRateRow extends PeriodReferenceRates {
  roomTypeId: string;
  roomName: string;
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

function discountFactor(percent: number): number {
  return 1 - percent / 100;
}

export function validateOtaPricingSettings(settings: OtaPricingSettings): string | null {
  const values = [settings.upliftPct, settings.loyaltyDiscountPct, settings.basicDealDiscountPct, settings.nonRefundableDiscountPct];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return "Os parâmetros OTA não podem conter valores negativos.";
  if (settings.loyaltyDiscountPct >= 100 || settings.basicDealDiscountPct >= 100 || settings.nonRefundableDiscountPct >= 100) return "Os descontos têm de ser inferiores a 100%.";
  return null;
}

export function calculatePeriodReferenceRates(period: PricePeriod, settings: OtaPricingSettings): PeriodReferenceRates | null {
  if (period.directFlexReferenceCents <= 0 || validateOtaPricingSettings(settings)) return null;
  const loyaltyFactor = discountFactor(settings.loyaltyDiscountPct);
  const basicFactor = discountFactor(settings.basicDealDiscountPct);
  const nrFactor = discountFactor(settings.nonRefundableDiscountPct);
  const otaFlexCents = Math.round(
    period.directFlexReferenceCents * (1 + settings.upliftPct / 100) / (loyaltyFactor * basicFactor),
  );
  return {
    directFlexCents: period.directFlexReferenceCents,
    directNonRefundableCents: Math.round(period.directFlexReferenceCents * nrFactor),
    otaFlexCents,
    otaNonRefundableCents: Math.round(otaFlexCents * nrFactor),
    otaAfterBaseDiscountsCents: Math.round(otaFlexCents * loyaltyFactor * basicFactor),
  };
}

export function projectPeriodRoomRateRows(roomTypes: RoomType[], config: PriceManagementConfig, period: PricePeriod): PeriodRoomRateRow[] {
  const referenceBaseCents = config.referenceRoomTypeId ? config.basePricesCents[config.referenceRoomTypeId] ?? 0 : 0;
  const settings = config.otaSettings;
  if (referenceBaseCents <= 0 || validateOtaPricingSettings(settings)) return [];

  const loyaltyFactor = discountFactor(settings.loyaltyDiscountPct);
  const basicFactor = discountFactor(settings.basicDealDiscountPct);
  const nrFactor = discountFactor(settings.nonRefundableDiscountPct);
  const directScale = period.directFlexReferenceCents / referenceBaseCents;
  const otaReferenceCents = period.directFlexReferenceCents * (1 + settings.upliftPct / 100) / (loyaltyFactor * basicFactor);
  const otaScale = otaReferenceCents / referenceBaseCents;

  return roomTypes.map((room) => {
    const basePriceCents = config.basePricesCents[room.id] ?? 0;
    const directFlexCents = basePriceCents > 0 ? Math.round(basePriceCents * directScale) : 0;
    const otaFlexCents = basePriceCents > 0 ? Math.round(basePriceCents * otaScale) : 0;
    return {
      roomTypeId: room.id,
      roomName: room.canonicalName,
      basePriceCents,
      isReference: room.id === config.referenceRoomTypeId,
      directFlexCents,
      directNonRefundableCents: directFlexCents > 0 ? Math.round(directFlexCents * nrFactor) : 0,
      otaFlexCents,
      otaNonRefundableCents: otaFlexCents > 0 ? Math.round(otaFlexCents * nrFactor) : 0,
      otaAfterBaseDiscountsCents: otaFlexCents > 0 ? Math.round(otaFlexCents * loyaltyFactor * basicFactor) : 0,
    };
  });
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
