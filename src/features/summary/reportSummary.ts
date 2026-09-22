import { format } from "date-fns";
import { calculateMetrics, calculatePickupDecomposition, calculateSnapshotComparison } from "../../domain/analytics";
import { enumerateDates, parseIsoDate } from "../../domain/dates";
import type { DashboardFilters, DashboardMetrics, IsoDate, Property, Reservation } from "../../domain/models";

export interface ReportSummaryMonth {
  key: string;
  label: string;
  startDate: IsoDate;
  endDate: IsoDate;
  current: DashboardMetrics;
  baseline: DashboardMetrics;
  occupancyDeltaPercent: number | null;
  adrDeltaCents: number | null;
  roomRevenueDeltaCents: number;
  observation: string;
}

export interface ReportSummaryChannel {
  channel: string;
  occupancyContribution: number | null;
  baselineOccupancyContribution: number | null;
  roomRevenueCents: number;
  roomRevenueDeltaCents: number;
  adrCents: number | null;
  adrDeltaCents: number | null;
  reservations: number;
  roomNightsSold: number;
}

export interface ReportSummaryResult {
  baseline: DashboardMetrics;
  current: DashboardMetrics;
  pickup: ReturnType<typeof calculateSnapshotComparison>["pickup"];
  decomposition: ReturnType<typeof calculatePickupDecomposition>;
  months: ReportSummaryMonth[];
  channels: ReportSummaryChannel[];
}

function monthRanges(filters: DashboardFilters) {
  const grouped = new Map<string, IsoDate[]>();
  for (const date of enumerateDates(filters.startDate, filters.endDate)) {
    const key = date.slice(0, 7);
    const values = grouped.get(key) ?? [];
    values.push(date);
    grouped.set(key, values);
  }
  return Array.from(grouped.entries()).map(([key, dates]) => ({
    key,
    label: format(parseIsoDate(`${key}-01` as IsoDate), "MMM yyyy"),
    startDate: dates[0],
    endDate: dates.at(-1)!,
  }));
}

export function occupancyRelativeChange(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline === 0) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function observation(
  endDate: IsoDate,
  baselineAsOf: IsoDate,
  baselineOccupancy: number | null,
  currentOccupancy: number | null,
  occupancyDeltaPercent: number | null,
  roomRevenueDeltaCents: number,
) {
  if (endDate < baselineAsOf) return "Closed";
  if (baselineOccupancy === currentOccupancy && roomRevenueDeltaCents === 0) return "No change";
  if (baselineOccupancy === currentOccupancy) return "Occupancy unchanged";
  if (occupancyDeltaPercent === null) return "Occupancy changed (no % base)";
  return `${occupancyDeltaPercent > 0 ? "+" : ""}${occupancyDeltaPercent.toFixed(1)}% occupancy`;
}

export function calculateReportSummary(
  property: Property,
  baselineReservations: Reservation[],
  currentReservations: Reservation[],
  filters: DashboardFilters,
  baselineAsOf: IsoDate,
): ReportSummaryResult {
  const comparison = calculateSnapshotComparison(property, baselineReservations, currentReservations, filters);
  const decomposition = calculatePickupDecomposition(property, baselineReservations, currentReservations, filters);

  const months = monthRanges(filters).map(({ key, label, startDate, endDate }) => {
    const monthFilters: DashboardFilters = { ...filters, startDate, endDate };
    const baseline = calculateMetrics(property, baselineReservations, monthFilters);
    const current = calculateMetrics(property, currentReservations, monthFilters);
    const occupancyDeltaPercent = occupancyRelativeChange(current.occupancy, baseline.occupancy);
    const adrDeltaCents = baseline.adrCents === null || current.adrCents === null
      ? null
      : current.adrCents - baseline.adrCents;
    const roomRevenueDeltaCents = current.roomRevenueCents - baseline.roomRevenueCents;
    return {
      key,
      label,
      startDate,
      endDate,
      current,
      baseline,
      occupancyDeltaPercent,
      adrDeltaCents,
      roomRevenueDeltaCents,
      observation: observation(
        endDate,
        baselineAsOf,
        baseline.occupancy,
        current.occupancy,
        occupancyDeltaPercent,
        roomRevenueDeltaCents,
      ),
    };
  });

  const baselineChannels = new Map(comparison.baseline.channels.map((row) => [row.channel, row]));
  const currentChannels = new Map(comparison.current.channels.map((row) => [row.channel, row]));
  const channelNames = Array.from(new Set([...baselineChannels.keys(), ...currentChannels.keys()]));
  const channels = channelNames.map((channel) => {
    const baseline = baselineChannels.get(channel);
    const current = currentChannels.get(channel);
    const baselineAdr = baseline?.roomNightsSold ? baseline.roomRevenueCents / baseline.roomNightsSold : null;
    const currentAdr = current?.roomNightsSold ? current.roomRevenueCents / current.roomNightsSold : null;
    return {
      channel,
      occupancyContribution: comparison.current.availableRoomNights
        ? (current?.roomNightsSold ?? 0) / comparison.current.availableRoomNights
        : null,
      baselineOccupancyContribution: comparison.baseline.availableRoomNights
        ? (baseline?.roomNightsSold ?? 0) / comparison.baseline.availableRoomNights
        : null,
      roomRevenueCents: current?.roomRevenueCents ?? 0,
      roomRevenueDeltaCents: (current?.roomRevenueCents ?? 0) - (baseline?.roomRevenueCents ?? 0),
      adrCents: currentAdr,
      adrDeltaCents: currentAdr === null || baselineAdr === null ? null : currentAdr - baselineAdr,
      reservations: current?.reservations ?? 0,
      roomNightsSold: current?.roomNightsSold ?? 0,
    };
  }).sort((a, b) => b.roomRevenueCents - a.roomRevenueCents);

  return {
    baseline: comparison.baseline,
    current: comparison.current,
    pickup: comparison.pickup,
    decomposition,
    months,
    channels,
  };
}
