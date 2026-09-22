import { addDays, differenceInCalendarDays, format } from "date-fns";
import { calculateMetrics } from "../../domain/analytics";
import { enumerateDates, parseIsoDate, shiftYear, toIsoDate } from "../../domain/dates";
import type { DailyPerformance, DashboardFilters, DashboardMetrics, IsoDate, Property, Reservation } from "../../domain/models";

export type PerformanceComparisonMode = "previous_year" | "previous_period" | "none";
export type PerformanceGranularity = "Daily" | "Weekly" | "Monthly";

export interface PerformanceTrendPoint {
  label: string;
  currentOccupancy: number | null;
  comparisonOccupancy: number | null;
  currentAdrCents: number | null;
  comparisonAdrCents: number | null;
  currentRevparCents: number | null;
  comparisonRevparCents: number | null;
}

export interface PerformanceMonthlyRow {
  label: string;
  startDate: IsoDate;
  endDate: IsoDate;
  comparisonStartDate: IsoDate | null;
  comparisonEndDate: IsoDate | null;
  current: DashboardMetrics;
  comparison: DashboardMetrics | null;
}

export interface PerformanceAnalysis {
  current: DashboardMetrics;
  comparison: DashboardMetrics | null;
  comparisonFilters: DashboardFilters | null;
  comparisonMode: PerformanceComparisonMode;
  comparisonLabel: string;
  granularity: PerformanceGranularity;
  trend: PerformanceTrendPoint[];
  monthly: PerformanceMonthlyRow[];
}

function selectedDayCount(filters: DashboardFilters): number {
  return differenceInCalendarDays(parseIsoDate(filters.endDate), parseIsoDate(filters.startDate)) + 1;
}

function shiftForComparison(date: IsoDate, filters: DashboardFilters, mode: PerformanceComparisonMode): IsoDate | null {
  if (mode === "none") return null;
  if (mode === "previous_year") return shiftYear(date, -1);
  return toIsoDate(addDays(parseIsoDate(date), -selectedDayCount(filters)));
}

export function getPerformanceComparisonFilters(
  filters: DashboardFilters,
  mode: PerformanceComparisonMode,
): DashboardFilters | null {
  const startDate = shiftForComparison(filters.startDate, filters, mode);
  const endDate = shiftForComparison(filters.endDate, filters, mode);
  if (!startDate || !endDate) return null;
  return { ...filters, startDate, endDate };
}

function aggregateDaily(days: DailyPerformance[]) {
  const roomNightsSold = days.reduce((sum, day) => sum + day.roomNightsSold, 0);
  const availableRoomNights = days.reduce((sum, day) => sum + day.availableRoomNights, 0);
  const roomRevenueCents = days.reduce((sum, day) => sum + day.roomRevenueCents, 0);
  return {
    occupancy: availableRoomNights ? roomNightsSold / availableRoomNights : null,
    adrCents: roomNightsSold ? roomRevenueCents / roomNightsSold : null,
    revparCents: availableRoomNights ? roomRevenueCents / availableRoomNights : null,
  };
}

function buildDailyTrend(
  current: DashboardMetrics,
  comparison: DashboardMetrics | null,
  filters: DashboardFilters,
  mode: PerformanceComparisonMode,
): PerformanceTrendPoint[] {
  const comparisonByDate = new Map((comparison?.daily ?? []).map((day) => [day.date, day]));
  return current.daily.map((day) => {
    const comparisonDate = shiftForComparison(day.date, filters, mode);
    const comparisonDay = comparisonDate ? comparisonByDate.get(comparisonDate) : undefined;
    return {
      label: format(parseIsoDate(day.date), "dd MMM"),
      currentOccupancy: day.occupancy,
      comparisonOccupancy: comparisonDay?.occupancy ?? null,
      currentAdrCents: day.adrCents,
      comparisonAdrCents: comparisonDay?.adrCents ?? null,
      currentRevparCents: day.revparCents,
      comparisonRevparCents: comparisonDay?.revparCents ?? null,
    };
  });
}

function buildWeeklyTrend(
  current: DashboardMetrics,
  comparison: DashboardMetrics | null,
  filters: DashboardFilters,
  mode: PerformanceComparisonMode,
): PerformanceTrendPoint[] {
  const comparisonByDate = new Map((comparison?.daily ?? []).map((day) => [day.date, day]));
  const result: PerformanceTrendPoint[] = [];
  for (let index = 0; index < current.daily.length; index += 7) {
    const currentDays = current.daily.slice(index, index + 7);
    const comparisonDays = currentDays.flatMap((day) => {
      const comparisonDate = shiftForComparison(day.date, filters, mode);
      const comparisonDay = comparisonDate ? comparisonByDate.get(comparisonDate) : undefined;
      return comparisonDay ? [comparisonDay] : [];
    });
    const currentAggregate = aggregateDaily(currentDays);
    const comparisonAggregate = comparisonDays.length ? aggregateDaily(comparisonDays) : null;
    result.push({
      label: currentDays.length === 1
        ? format(parseIsoDate(currentDays[0].date), "dd MMM")
        : `${format(parseIsoDate(currentDays[0].date), "dd MMM")}–${format(parseIsoDate(currentDays.at(-1)!.date), "dd MMM")}`,
      currentOccupancy: currentAggregate.occupancy,
      comparisonOccupancy: comparisonAggregate?.occupancy ?? null,
      currentAdrCents: currentAggregate.adrCents,
      comparisonAdrCents: comparisonAggregate?.adrCents ?? null,
      currentRevparCents: currentAggregate.revparCents,
      comparisonRevparCents: comparisonAggregate?.revparCents ?? null,
    });
  }
  return result;
}

function buildMonthlyRows(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters,
  mode: PerformanceComparisonMode,
): PerformanceMonthlyRow[] {
  const monthDates = new Map<string, IsoDate[]>();
  for (const date of enumerateDates(filters.startDate, filters.endDate)) {
    const key = date.slice(0, 7);
    const dates = monthDates.get(key) ?? [];
    dates.push(date);
    monthDates.set(key, dates);
  }

  return Array.from(monthDates.values()).map((dates) => {
    const startDate = dates[0];
    const endDate = dates.at(-1)!;
    const currentFilters: DashboardFilters = { ...filters, startDate, endDate };
    const comparisonStartDate = shiftForComparison(startDate, filters, mode);
    const comparisonEndDate = shiftForComparison(endDate, filters, mode);
    const comparisonFilters = comparisonStartDate && comparisonEndDate
      ? { ...filters, startDate: comparisonStartDate, endDate: comparisonEndDate }
      : null;
    return {
      label: format(parseIsoDate(startDate), "MMM yyyy"),
      startDate,
      endDate,
      comparisonStartDate,
      comparisonEndDate,
      current: calculateMetrics(property, reservations, currentFilters),
      comparison: comparisonFilters ? calculateMetrics(property, reservations, comparisonFilters) : null,
    };
  });
}

function buildMonthlyTrend(rows: PerformanceMonthlyRow[]): PerformanceTrendPoint[] {
  return rows.map((row) => ({
    label: row.label,
    currentOccupancy: row.current.occupancy,
    comparisonOccupancy: row.comparison?.occupancy ?? null,
    currentAdrCents: row.current.adrCents,
    comparisonAdrCents: row.comparison?.adrCents ?? null,
    currentRevparCents: row.current.revparCents,
    comparisonRevparCents: row.comparison?.revparCents ?? null,
  }));
}

export function calculatePerformanceAnalysis(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters,
  comparisonMode: PerformanceComparisonMode,
): PerformanceAnalysis {
  const current = calculateMetrics(property, reservations, filters);
  const comparisonFilters = getPerformanceComparisonFilters(filters, comparisonMode);
  const comparison = comparisonFilters ? calculateMetrics(property, reservations, comparisonFilters) : null;
  const monthly = buildMonthlyRows(property, reservations, filters, comparisonMode);
  const days = selectedDayCount(filters);
  const granularity: PerformanceGranularity = days <= 45 ? "Daily" : days <= 180 ? "Weekly" : "Monthly";
  const trend = granularity === "Daily"
    ? buildDailyTrend(current, comparison, filters, comparisonMode)
    : granularity === "Weekly"
      ? buildWeeklyTrend(current, comparison, filters, comparisonMode)
      : buildMonthlyTrend(monthly);

  return {
    current,
    comparison,
    comparisonFilters,
    comparisonMode,
    comparisonLabel: comparisonMode === "previous_year" ? "Previous year" : comparisonMode === "previous_period" ? "Previous period" : "No comparison",
    granularity,
    trend,
    monthly,
  };
}
