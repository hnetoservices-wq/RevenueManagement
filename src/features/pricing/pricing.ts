import type { RoomType } from "../../domain/models";
import type { PriceDiscountEntry, PriceDiscountKind, PriceManagementConfig, PricePeriod } from "./types";

export const DEFAULT_OTA_UPLIFT_PCT = 20;
export const DEFAULT_NON_REFUNDABLE_DISCOUNT_PCT = 10;

export const DISCOUNT_KIND_LABELS: Record<PriceDiscountKind, string> = {
  loyalty: "Fidelização",
  mobile: "Móveis",
  basic_deal: "Basic Deal",
  booking_campaign: "Campanha Booking",
  expedia_campaign: "Campanha Expedia",
  limited_time_deal: "Limited Time Deal",
  direct_last_minute: "Directa - Last Minute",
  ota_last_minute: "OTAs - Last Minute",
  custom: "Personalizado",
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
}

export interface DiscountRateResult {
  discountId: string;
  name: string;
  kind: PriceDiscountKind;
  discountPct: number;
  active: boolean;
  stackDescription: string;
  directCents: number | null;
  bookingFlexCents: number | null;
  bookingNonRefundableCents: number | null;
  expediaFlexCents: number | null;
  expediaNonRefundableCents: number | null;
}

export interface PeriodRoomRateRow extends PeriodReferenceRates {
  roomTypeId: string;
  roomName: string;
  basePriceCents: number;
  isReference: boolean;
  lowestBookingCents: number;
  lowestExpediaCents: number;
}

function discountFactor(percent: number): number {
  return 1 - percent / 100;
}

function highestActive(discounts: PriceDiscountEntry[], kind: PriceDiscountKind): PriceDiscountEntry | null {
  return discounts
    .filter((item) => item.active && item.kind === kind)
    .sort((a, b) => b.discountPct - a.discountPct)[0] ?? null;
}

function activeBaseAbsorptionDiscounts(period: PricePeriod): PriceDiscountEntry[] {
  const loyalty = highestActive(period.discounts, "loyalty");
  const basicDeal = highestActive(period.discounts, "basic_deal");
  return [loyalty, basicDeal].filter((item): item is PriceDiscountEntry => Boolean(item));
}

function otaGrossUpFactor(period: PricePeriod): number | null {
  if (!Number.isFinite(period.otaUpliftPct) || period.otaUpliftPct < 0) return null;
  const absorbed = activeBaseAbsorptionDiscounts(period);
  const denominator = absorbed.reduce((factor, item) => factor * discountFactor(item.discountPct), 1);
  if (denominator <= 0) return null;
  return (1 + period.otaUpliftPct / 100) / denominator;
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

export function defaultDiscountName(kind: PriceDiscountKind): string {
  return DISCOUNT_KIND_LABELS[kind];
}

export function discountStackDescription(kind: PriceDiscountKind): string {
  switch (kind) {
    case "loyalty": return "Não acumula com outra Fidelização";
    case "mobile": return "Fidelização";
    case "basic_deal": return "Fidelização + Móveis";
    case "booking_campaign": return "Fidelização";
    case "expedia_campaign": return "Não acumula";
    case "limited_time_deal": return "Não acumula";
    case "direct_last_minute": return "Sobre Direct NR";
    case "ota_last_minute": return "Sobre o menor preço OTA NR ativo";
    default: return "Sem acumulação automática";
  }
}

export function validateDiscountEntry(discount: PriceDiscountEntry): string | null {
  if (!discount.name.trim()) return "Todos os descontos precisam de um nome.";
  if (!Number.isFinite(discount.discountPct) || discount.discountPct < 0 || discount.discountPct >= 100) {
    return `O desconto “${discount.name}” tem de estar entre 0% e 100%.`;
  }
  return null;
}

export function validatePricePeriod(period: PricePeriod, existing: PricePeriod[]): string | null {
  if (!period.startDate || !period.endDate) return "Defina as datas de início e fim.";
  if (period.endDate < period.startDate) return "A data final não pode ser anterior à data inicial.";
  if (period.directFlexReferenceCents <= 0) return "Defina um preço Direct Flex superior a zero.";
  if (!Number.isFinite(period.otaUpliftPct) || period.otaUpliftPct < 0) return "O incremento OTA não pode ser negativo.";
  if (!Number.isFinite(period.nonRefundableDiscountPct) || period.nonRefundableDiscountPct < 0 || period.nonRefundableDiscountPct >= 100) {
    return "O desconto Não Reembolsável tem de estar entre 0% e 100%.";
  }
  for (const discount of period.discounts) {
    const error = validateDiscountEntry(discount);
    if (error) return error;
  }
  if (existing.some((item) => item.id !== period.id && pricePeriodsOverlap(period, item))) return "Este período sobrepõe-se a outro período já definido.";
  return null;
}

export function calculatePeriodReferenceRates(period: PricePeriod): PeriodReferenceRates | null {
  const validation = validatePricePeriod(period, []);
  if (validation) return null;
  const grossUp = otaGrossUpFactor(period);
  if (grossUp === null) return null;
  const nrFactor = discountFactor(period.nonRefundableDiscountPct);
  const otaFlexCents = Math.round(period.directFlexReferenceCents * grossUp);
  return {
    directFlexCents: period.directFlexReferenceCents,
    directNonRefundableCents: Math.round(period.directFlexReferenceCents * nrFactor),
    otaFlexCents,
    otaNonRefundableCents: Math.round(otaFlexCents * nrFactor),
  };
}

function stackedLoyaltyFactor(period: PricePeriod): number {
  const loyalty = highestActive(period.discounts, "loyalty");
  return loyalty ? discountFactor(loyalty.discountPct) : 1;
}

function stackedMobileFactor(period: PricePeriod): number {
  const mobile = highestActive(period.discounts, "mobile");
  return mobile ? discountFactor(mobile.discountPct) : 1;
}

function resultForOtaFlex(flexCents: number, nrFactor: number): { flex: number; nr: number } {
  const flex = Math.round(flexCents);
  return { flex, nr: Math.round(flex * nrFactor) };
}

export function calculateDiscountRateResults(period: PricePeriod, otaFlexCents: number, directNrCents: number): DiscountRateResult[] {
  if (otaFlexCents <= 0) return [];
  const nrFactor = discountFactor(period.nonRefundableDiscountPct);
  const loyaltyStack = stackedLoyaltyFactor(period);
  const mobileStack = stackedMobileFactor(period);
  const rows: DiscountRateResult[] = [];
  const bookingNrCandidates: number[] = [Math.round(otaFlexCents * nrFactor)];
  const expediaNrCandidates: number[] = [Math.round(otaFlexCents * nrFactor)];

  for (const discount of period.discounts.filter((item) => item.kind !== "direct_last_minute" && item.kind !== "ota_last_minute")) {
    const base: DiscountRateResult = {
      discountId: discount.id,
      name: discount.name,
      kind: discount.kind,
      discountPct: discount.discountPct,
      active: discount.active,
      stackDescription: discountStackDescription(discount.kind),
      directCents: null,
      bookingFlexCents: null,
      bookingNonRefundableCents: null,
      expediaFlexCents: null,
      expediaNonRefundableCents: null,
    };
    if (!discount.active) {
      rows.push(base);
      continue;
    }

    const ownFactor = discountFactor(discount.discountPct);
    let bookingFactor: number | null = null;
    let expediaFactor: number | null = null;
    switch (discount.kind) {
      case "loyalty":
        bookingFactor = ownFactor;
        expediaFactor = ownFactor;
        break;
      case "mobile":
        bookingFactor = ownFactor * loyaltyStack;
        expediaFactor = ownFactor * loyaltyStack;
        break;
      case "basic_deal":
        bookingFactor = ownFactor * loyaltyStack * mobileStack;
        expediaFactor = ownFactor * loyaltyStack * mobileStack;
        break;
      case "booking_campaign":
        bookingFactor = ownFactor * loyaltyStack;
        break;
      case "expedia_campaign":
        expediaFactor = ownFactor;
        break;
      case "limited_time_deal":
      case "custom":
        bookingFactor = ownFactor;
        expediaFactor = ownFactor;
        break;
      default:
        break;
    }

    if (bookingFactor !== null) {
      const calculated = resultForOtaFlex(otaFlexCents * bookingFactor, nrFactor);
      base.bookingFlexCents = calculated.flex;
      base.bookingNonRefundableCents = calculated.nr;
      bookingNrCandidates.push(calculated.nr);
    }
    if (expediaFactor !== null) {
      const calculated = resultForOtaFlex(otaFlexCents * expediaFactor, nrFactor);
      base.expediaFlexCents = calculated.flex;
      base.expediaNonRefundableCents = calculated.nr;
      expediaNrCandidates.push(calculated.nr);
    }
    rows.push(base);
  }

  for (const discount of period.discounts.filter((item) => item.kind === "direct_last_minute")) {
    rows.push({
      discountId: discount.id,
      name: discount.name,
      kind: discount.kind,
      discountPct: discount.discountPct,
      active: discount.active,
      stackDescription: discountStackDescription(discount.kind),
      directCents: discount.active ? Math.round(directNrCents * discountFactor(discount.discountPct)) : null,
      bookingFlexCents: null,
      bookingNonRefundableCents: null,
      expediaFlexCents: null,
      expediaNonRefundableCents: null,
    });
  }

  for (const discount of period.discounts.filter((item) => item.kind === "ota_last_minute")) {
    const factor = discountFactor(discount.discountPct);
    const booking = discount.active ? Math.round(Math.min(...bookingNrCandidates) * factor) : null;
    const expedia = discount.active ? Math.round(Math.min(...expediaNrCandidates) * factor) : null;
    rows.push({
      discountId: discount.id,
      name: discount.name,
      kind: discount.kind,
      discountPct: discount.discountPct,
      active: discount.active,
      stackDescription: discountStackDescription(discount.kind),
      directCents: null,
      bookingFlexCents: booking,
      bookingNonRefundableCents: null,
      expediaFlexCents: expedia,
      expediaNonRefundableCents: null,
    });
  }

  return rows;
}

function lowestPositive(values: Array<number | null | undefined>, fallback: number): number {
  const positive = values.filter((value): value is number => typeof value === "number" && value > 0);
  return positive.length ? Math.min(...positive) : fallback;
}

export function projectPeriodRoomRateRows(roomTypes: RoomType[], config: PriceManagementConfig, period: PricePeriod): PeriodRoomRateRow[] {
  const referenceBaseCents = config.referenceRoomTypeId ? config.basePricesCents[config.referenceRoomTypeId] ?? 0 : 0;
  const grossUp = otaGrossUpFactor(period);
  if (referenceBaseCents <= 0 || grossUp === null) return [];
  const nrFactor = discountFactor(period.nonRefundableDiscountPct);
  const directScale = period.directFlexReferenceCents / referenceBaseCents;
  const otaScale = period.directFlexReferenceCents * grossUp / referenceBaseCents;

  return roomTypes.map((room) => {
    const basePriceCents = config.basePricesCents[room.id] ?? 0;
    const directFlexCents = basePriceCents > 0 ? Math.round(basePriceCents * directScale) : 0;
    const directNonRefundableCents = directFlexCents > 0 ? Math.round(directFlexCents * nrFactor) : 0;
    const otaFlexCents = basePriceCents > 0 ? Math.round(basePriceCents * otaScale) : 0;
    const otaNonRefundableCents = otaFlexCents > 0 ? Math.round(otaFlexCents * nrFactor) : 0;
    const discountRows = calculateDiscountRateResults(period, otaFlexCents, directNonRefundableCents);
    const lowestBookingCents = lowestPositive(
      discountRows.flatMap((item) => [item.bookingFlexCents, item.bookingNonRefundableCents]),
      otaNonRefundableCents,
    );
    const lowestExpediaCents = lowestPositive(
      discountRows.flatMap((item) => [item.expediaFlexCents, item.expediaNonRefundableCents]),
      otaNonRefundableCents,
    );
    return {
      roomTypeId: room.id,
      roomName: room.canonicalName,
      basePriceCents,
      isReference: room.id === config.referenceRoomTypeId,
      directFlexCents,
      directNonRefundableCents,
      otaFlexCents,
      otaNonRefundableCents,
      lowestBookingCents,
      lowestExpediaCents,
    };
  });
}

export function pricePeriodsOverlap(a: PricePeriod, b: PricePeriod): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
