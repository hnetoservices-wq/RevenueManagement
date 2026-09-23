export interface PriceManagementConfig {
  propertyId: string;
  referenceRoomTypeId: string | null;
  basePricesCents: Record<string, number>;
  updatedAt: string;
}
