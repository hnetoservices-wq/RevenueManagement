import type { IsoDate } from "../../domain/models";

export interface PricePeriod {
  id: string;
  startDate: IsoDate;
  endDate: IsoDate;
  directFlexReferenceCents: number;
}

export interface OtaPricingSettings {
  upliftPct: number;
  loyaltyDiscountPct: number;
  basicDealDiscountPct: number;
  nonRefundableDiscountPct: number;
}

export interface PriceManagementConfig {
  propertyId: string;
  referenceRoomTypeId: string | null;
  basePricesCents: Record<string, number>;
  otaSettings: OtaPricingSettings;
  periods: PricePeriod[];
  updatedAt: string;
}
