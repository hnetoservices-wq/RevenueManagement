export interface ChannelCommissionRule {
  id: string;
  propertyId: string;
  name: string;
  aliases: string;
  groupName: string;
  commissionRate: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
}

export interface ChannelNetRevenueRow {
  channel: string;
  groupName: string;
  reservations: number;
  roomNightsSold: number;
  grossRoomRevenueCents: number;
  commissionCents: number;
  netRoomRevenueCents: number;
  effectiveCommissionRate: number | null;
  adrCents: number | null;
  configured: boolean;
}

export interface DistributionCostSummary {
  grossRoomRevenueCents: number;
  commissionCents: number;
  netRoomRevenueCents: number;
  effectiveCommissionRate: number | null;
  unconfiguredRevenueCents: number;
  rows: ChannelNetRevenueRow[];
}
