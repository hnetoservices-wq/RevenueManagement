import { addDays, differenceInCalendarDays, format } from "date-fns";
import { parseIsoDate, shiftYear } from "../../domain/dates";
import type { DashboardFilters, DashboardMetrics, IsoDate, Property, Reservation } from "../../domain/models";
import {
  calculatePerformanceAnalysis,
  type PerformanceAnalysis,
  type PerformanceComparisonMode,
  type PerformanceCoverage,
  type PerformanceGranularity,
} from "../performance/performance";

export interface RevenueTrendPoint {
  label: string;
  roomRevenueCents: number;
  comparisonRoomRevenueCents: number | null;
  adrCents: number | null;
  comparisonAdrCents: number | null;
}

export interface RevenueMixItem {
  label: string;
  valueCents: number;
  share: number;
}

export interface ChannelRevenueRow {
  channel: string;
  reservations: number;
  roomNightsSold: number;
  roomRevenueCents: number;
  share: number;
  adrCents: number | null;
}

export interface RevenueDatePoint {
  date: IsoDate;
  roomRevenueCents: number;
  roomNightsSold: number;
  occupancy: number | null;
  adrCents: number | null;
}

export interface MonthlyRevenueRow {
  label: string;
  roomRevenueCents: number;
  comparisonRoomRevenueCents: number | null;
  totalRevenueCents: number;
  adrCents: number | null;
  revparCents: number | null;
  roomNightsSold: number;
  comparisonReliable: boolean;
  comparisonCoverage: PerformanceCoverage | null;
}

export interface RevenueAnalysis {
  performance: PerformanceAnalysis;
  current: DashboardMetrics;
  comparison: DashboardMetrics | null;
  comparisonMode: PerformanceComparisonMode;
  comparisonFilters: DashboardFilters | null;
  comparisonCoverage: PerformanceCoverage | null;
  comparisonReliable: boolean;
  granularity: PerformanceGranularity;
  trend: RevenueTrendPoint[];
  mix: RevenueMixItem[];
  channels: ChannelRevenueRow[];
  monthly: MonthlyRevenueRow[];
  topDates: RevenueDatePoint[];
}

const RELIABLE_COVERAGE_THRESHOLD = 0.8;

function comparisonDate(date: IsoDate, filters: DashboardFilters, mode: PerformanceComparisonMode): IsoDate | null {
  if (mode === "none") return null;
  if (mode === "previous_year") return shiftYear(date, -1);
  const days = differenceInCalendarDays(parseIsoDate(filters.endDate), parseIsoDate(filters.startDate)) + 1;
  return format(addDays(parseIsoDate(date), -days), "yyyy-MM-dd") as IsoDate;
}

function sumRevenue(days: DashboardMetrics["daily"]) {
  const roomRevenueCents = days.reduce((sum, day) => sum + day.roomRevenueCents, 0);
  const roomNightsSold = days.reduce((sum, day) => sum + day.roomNightsSold, 0);
  return {
    roomRevenueCents,
    adrCents: roomNightsSold ? roomRevenueCents / roomNightsSold : null,
  };
}

function buildTrend(performance: PerformanceAnalysis, filters: DashboardFilters, mode: PerformanceComparisonMode): RevenueTrendPoint[] {
  const current = performance.current.daily;
  const comparisonByDate = new Map((performance.comparison?.daily ?? []).map((day) => [day.date, day]));

  if (performance.granularity === "Daily") {
    return current.map((day) => {
      const compDate = comparisonDate(day.date, filters, mode);
      const comp = compDate ? comparisonByDate.get(compDate) : undefined;
      return {
        label: format(parseIsoDate(day.date), "dd MMM"),
        roomRevenueCents: day.roomRevenueCents,
        comparisonRoomRevenueCents: comp?.roomRevenueCents ?? null,
        adrCents: day.adrCents,
        comparisonAdrCents: comp?.adrCents ?? null,
      };
    });
  }

  if (performance.granularity === "Weekly") {
    const rows: RevenueTrendPoint[] = [];
    for (let index = 0; index < current.length; index += 7) {
      const currentDays = current.slice(index, index + 7);
      const comparisonDays = currentDays.flatMap((day) => {
        const compDate = comparisonDate(day.date, filters, mode);
        const comp = compDate ? comparisonByDate.get(compDate) : undefined;
        return comp ? [comp] : [];
      });
      const currentAggregate = sumRevenue(currentDays);
      const comparisonCoverage = currentDays.length ? comparisonDays.length / currentDays.length : 0;
      const comparisonAggregate = comparisonCoverage >= RELIABLE_COVERAGE_THRESHOLD ? sumRevenue(comparisonDays) : null;
      rows.push({
        label: currentDays.length === 1
          ? format(parseIsoDate(currentDays[0].date), "dd MMM")
          : `${format(parseIsoDate(currentDays[0].date), "dd MMM")}–${format(parseIsoDate(currentDays.at(-1)!.date), "dd MMM")}`,
        roomRevenueCents: currentAggregate.roomRevenueCents,
        comparisonRoomRevenueCents: comparisonAggregate?.roomRevenueCents ?? null,
        adrCents: currentAggregate.adrCents,
        comparisonAdrCents: comparisonAggregate?.adrCents ?? null,
      });
    }
    return rows;
  }

  return performance.monthly.map((row) => ({
    label: row.label,
    roomRevenueCents: row.currentReliable ? row.current.roomRevenueCents : 0,
    comparisonRoomRevenueCents: row.comparisonReliable ? row.comparison?.roomRevenueCents ?? null : null,
    adrCents: row.currentReliable ? row.current.adrCents : null,
    comparisonAdrCents: row.comparisonReliable ? row.comparison?.adrCents ?? null : null,
  }));
}

function buildMix(metrics: DashboardMetrics): RevenueMixItem[] {
  const items = [
    { label: "Room revenue", valueCents: metrics.roomRevenueCents },
    { label: "Extras", valueCents: metrics.extraRevenueCents },
    { label: "Tourist tax", valueCents: metrics.touristTaxCents },
  ];
  const total = items.reduce((sum, item) => sum + item.valueCents, 0);
  return items.map((item) => ({ ...item, share: total ? item.valueCents / total : 0 }));
}

function buildChannels(metrics: DashboardMetrics): ChannelRevenueRow[] {
  const total = metrics.roomRevenueCents;
  return [...metrics.channels]
    .sort((a, b) => b.roomRevenueCents - a.roomRevenueCents || a.channel.localeCompare(b.channel))
    .map((channel) => ({
      channel: channel.channel,
      reservations: channel.reservations,
      roomNightsSold: channel.roomNightsSold,
      roomRevenueCents: channel.roomRevenueCents,
      share: total ? channel.roomRevenueCents / total : 0,
      adrCents: channel.roomNightsSold ? channel.roomRevenueCents / channel.roomNightsSold : null,
    }));
}

function buildTopDates(metrics: DashboardMetrics): RevenueDatePoint[] {
  return metrics.daily
    .filter((day) => day.roomRevenueCents > 0 || day.roomNightsSold > 0)
    .map((day) => ({
      date: day.date,
      roomRevenueCents: day.roomRevenueCents,
      roomNightsSold: day.roomNightsSold,
      occupancy: day.occupancy,
      adrCents: day.adrCents,
    }))
    .sort((a, b) => b.roomRevenueCents - a.roomRevenueCents || a.date.localeCompare(b.date))
    .slice(0, 10);
}

export function calculateRevenueAnalysis(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters,
  comparisonMode: PerformanceComparisonMode,
  coverageReservations: Reservation[] = reservations,
): RevenueAnalysis {
  const performance = calculatePerformanceAnalysis(
    property,
    reservations,
    filters,
    comparisonMode,
    coverageReservations,
  );

  return {
    performance,
    current: performance.current,
    comparison: performance.comparisonReliable ? performance.comparison : null,
    comparisonMode,
    comparisonFilters: performance.comparisonFilters,
    comparisonCoverage: performance.comparisonCoverage,
    comparisonReliable: performance.comparisonReliable,
    granularity: performance.granularity,
    trend: buildTrend(performance, filters, comparisonMode),
    mix: buildMix(performance.current),
    channels: buildChannels(performance.current),
    monthly: performance.monthly.map((row) => ({
      label: row.label,
      roomRevenueCents: row.current.roomRevenueCents,
      comparisonRoomRevenueCents: row.comparisonReliable ? row.comparison?.roomRevenueCents ?? null : null,
      totalRevenueCents: row.current.totalRevenueCents,
      adrCents: row.current.adrCents,
      revparCents: row.current.revparCents,
      roomNightsSold: row.current.roomNightsSold,
      comparisonReliable: row.comparisonReliable,
      comparisonCoverage: row.comparisonCoverage,
    })),
    topDates: buildTopDates(performance.current),
  };
}
