export type IsoDate = `${number}-${number}-${number}`;
export type NormalizedStatus = "active" | "cancelled" | "ignored";
export type RevenueBasis = "inclusive" | "exclusive";

export interface RoomType {
  id: string;
  propertyId: string;
  canonicalName: string;
  inventoryCount: number;
  activeFrom: IsoDate | null;
  activeTo: IsoDate | null;
}

export interface Property {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  roomTypes: RoomType[];
}

export interface RoomAllocation {
  roomTypeName: string;
  quantity: number;
}

export interface Reservation {
  propertyId: string;
  reservationId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
  bookedAt: IsoDate | null;
  source: string;
  sourceStatus: string;
  status: NormalizedStatus;
  country: string | null;
  rooms: RoomAllocation[];
  roomQuantity: number;
  touristTaxCents: number;
  extraRevenueExclCents: number;
  extraRevenueInclCents: number;
  roomRevenueExclCents: number;
  roomRevenueInclCents: number;
  totalBookingValueCents: number;
  amountDueCents: number;
}

export type IssueSeverity = "warning" | "error";

export interface ImportIssue {
  row: number;
  severity: IssueSeverity;
  code: string;
  field: string | null;
  message: string;
}

export interface ImportPreview {
  propertyId: string;
  source: "Amenitiz";
  filename: string;
  dataAsOf: IsoDate;
  fileHash: string;
  rowCount: number;
  validRowCount: number;
  excludedRowCount: number;
  warningCount: number;
  reservations: Reservation[];
  issues: ImportIssue[];
}

export interface ImportSnapshotSummary {
  id: string;
  propertyId: string;
  source: string;
  filename: string;
  importedAt: string;
  dataAsOf: IsoDate;
  fileHash: string;
  rowCount: number;
  validRowCount: number;
  warningCount: number;
  excludedRowCount: number;
}

export interface DashboardFilters {
  startDate: IsoDate;
  endDate: IsoDate;
  revenueBasis: RevenueBasis;
}

export interface MetricValue {
  value: number | null;
  comparisonValue: number | null;
  absoluteChange: number | null;
  relativeChange: number | null;
  percentagePointChange: number | null;
}

export interface DailyPerformance {
  date: IsoDate;
  roomNightsSold: number;
  availableRoomNights: number;
  occupancy: number | null;
  roomRevenueCents: number;
  adrCents: number | null;
  revparCents: number | null;
}

export interface ChannelPerformance {
  channel: string;
  reservations: number;
  roomNightsSold: number;
  roomRevenueCents: number;
}

export interface DashboardMetrics {
  occupancy: number | null;
  adrCents: number | null;
  revparCents: number | null;
  roomRevenueCents: number;
  totalRevenueCents: number;
  extraRevenueCents: number;
  touristTaxCents: number;
  roomNightsSold: number;
  availableRoomNights: number;
  reservations: number;
  averageLeadTime: number | null;
  medianLeadTime: number | null;
  averageLengthOfStay: number | null;
  medianLengthOfStay: number | null;
  cancellationRate: number | null;
  daily: DailyPerformance[];
  channels: ChannelPerformance[];
}

export interface DashboardResult {
  current: DashboardMetrics;
  previousYear: DashboardMetrics;
}

export interface SnapshotPickup {
  roomNightsSold: number;
  roomRevenueCents: number;
  totalRevenueCents: number;
  reservations: number;
  occupancyPercentagePoints: number | null;
  adrCents: number | null;
  revparCents: number | null;
}

export interface SnapshotComparisonResult {
  baseline: DashboardMetrics;
  current: DashboardMetrics;
  pickup: SnapshotPickup;
}
