import type { IsoDate } from "../../domain/models";

export type PriceDiscountKind =
  | "loyalty"
  | "mobile"
  | "basic_deal"
  | "booking_campaign"
  | "expedia_campaign"
  | "limited_time_deal"
  | "direct_last_minute"
  | "ota_last_minute"
  | "custom";

export interface PriceDiscountEntry {
  id: string;
  kind: PriceDiscountKind;
  name: string;
  discountPct: number;
  active: boolean;
}

export interface PricePeriod {
  id: string;
  startDate: IsoDate;
  endDate: IsoDate;
  directFlexReferenceCents: number;
  otaUpliftPct: number;
  nonRefundableDiscountPct: number;
  discounts: PriceDiscountEntry[];
}

export interface PriceManagementConfig {
  propertyId: string;
  referenceRoomTypeId: string | null;
  basePricesCents: Record<string, number>;
  periods: PricePeriod[];
  updatedAt: string;
}
