import { addDays, differenceInCalendarDays, format } from "date-fns";
import { calculateMetrics, coverageQuality } from "../../domain/analytics";
import { enumerateDates, parseIsoDate, shiftYear, toIsoDate } from "../../domain/dates";
import type { CoverageQuality, DailyPerformance, DashboardFilters, DashboardMetrics, IsoDate, Property, Reservation } from "../../domain/models";

export type PerformanceComparisonMode = "previous_year" | "previous_period" | "none";
export type PerformanceGranularity = "Daily" | "Weekly" | "Monthly";

export interface PerformanceCoverage {
  availabilityStartDate: IsoDate | null;
  requestedStartDate: IsoDate;
  requestedEndDate: IsoDate;
  effectiveStartDate: IsoDate | null;
  effectiveEndDate: IsoDate | null;
  totalDays: number;
  coveredDays: number;
  coverage: number;
  quality: CoverageQuality;
}

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
  currentCoverage: PerformanceCoverage;
  comparisonCoverage: PerformanceCoverage | null;
  currentReliable: boolean;
  comparisonReliable: boolean;
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
  dataAvailabilityStartDate: IsoDate | null;
  currentCoverage: PerformanceCoverage;
  comparisonCoverage: PerformanceCoverage | null;
  currentReliable: boolean;
  comparisonReliable: boolean;
  reliableCoverageThreshold: number;
}

const RELIABLE_COVERAGE_THRESHOLD = 0.8;
const PARTIAL_COVERAGE_THRESHOLD = 0.5;

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

export function getDataAvailabilityStart(reservations: Reservation[]): IsoDate | null {
  const dates = reservations
    .filter((reservation) => reservation.status !== "ignored")
    .map((reservation) => reservation.checkIn)
    .sort();
  return dates[0] ?? null;
}

export function getPerformanceCoverage(
  filters: DashboardFilters,
  availabilityStartDate: IsoDate | null,
): PerformanceCoverage {
  const totalDays = Math.max(0, selectedDayCount(filters));
  if (!availabilityStartDate || totalDays === 0 || availabilityStartDate > filters.endDate) {
    return {
      availabilityStartDate,
      requestedStartDate: filters.startDate,
      requestedEndDate: filters.endDate,
      effectiveStartDate: null,
      effectiveEndDate: null,
      totalDays,
      coveredDays: 0,
      coverage: 0,
      quality: "insufficient",
    };
  }

  const effectiveStartDate = availabilityStartDate > filters.startDate ? availabilityStartDate : filters.startDate;
  const coveredDays = differenceInCalendarDays(parseIsoDate(filters.endDate), parseIsoDate(effectiveStartDate)) + 1;
  const coverage = totalDays ? Math.max(0, Math.min(1, coveredDays / totalDays)) : 0;
  return {
    availabilityStartDate,
    requestedStartDate: filters.startDate,
    requestedEndDate: filters.endDate,
    effectiveStartDate,
    effectiveEndDate: filters.endDate,
    totalDays,
    coveredDays,
    coverage,
    quality: coverageQuality(coverage, RELIABLE_COVERAGE_THRESHOLD, PARTIAL_COVERAGE_THRESHOLD),
  };
}

function effectiveFilters(filters: DashboardFilters, coverage: PerformanceCoverage): DashboardFilters {
  return coverage.effectiveStartDate && coverage.effectiveEndDate
    ? { ...filters, startDate: coverage.effectiveStartDate, endDate: coverage.effectiveEndDate }
    : filters;
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
    const comparisonCoverage = currentDays.length ? comparisonDays.length / currentDays.length : 0;
    const comparisonAggregate = comparisonCoverage >= RELIABLE_COVERAGE_THRESHOLD
      ? aggregateDaily(comparisonDays)
      : null;
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
  availabilityStartDate: IsoDate | null,
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
    const currentCoverage = getPerformanceCoverage(currentFilters, availabilityStartDate);
    const currentMetrics = calculateMetrics(property, reservations, effectiveFilters(currentFilters, currentCoverage));
    const comparisonStartDate = shiftForComparison(startDate, filters, mode);
    const comparisonEndDate = shiftForComparison(endDate, filters, mode);
    const comparisonFilters = comparisonStartDate && comparisonEndDate
      ? { ...filters, startDate: comparisonStartDate, endDate: comparisonEndDate }
      : null;
    const comparisonCoverage = comparisonFilters
      ? getPerformanceCoverage(comparisonFilters, availabilityStartDate)
      : null;
    const comparisonMetrics = comparisonFilters && comparisonCoverage?.coveredDays
      ? calculateMetrics(property, reservations, effectiveFilters(comparisonFilters, comparisonCoverage))
      : null;

    return {
      label: format(parseIsoDate(startDate), "MMM yyyy"),
      startDate,
      endDate,
      comparisonStartDate,
      comparisonEndDate,
      current: currentMetrics,
      comparison: comparisonMetrics,
      currentCoverage,
      comparisonCoverage,
      currentReliable: currentCoverage.coverage >= RELIABLE_COVERAGE_THRESHOLD,
      comparisonReliable: Boolean(comparisonCoverage && comparisonCoverage.coverage >= RELIABLE_COVERAGE_THRESHOLD),
    };
  });
}

function buildMonthlyTrend(rows: PerformanceMonthlyRow[]): PerformanceTrendPoint[] {
  return rows.map((row) => ({
    label: row.label,
    currentOccupancy: row.currentReliable ? row.current.occupancy : null,
    comparisonOccupancy: row.comparisonReliable ? row.comparison?.occupancy ?? null : null,
    currentAdrCents: row.currentReliable ? row.current.adrCents : null,
    comparisonAdrCents: row.comparisonReliable ? row.comparison?.adrCents ?? null : null,
    currentRevparCents: row.currentReliable ? row.current.revparCents : null,
    comparisonRevparCents: row.comparisonReliable ? row.comparison?.revparCents ?? null : null,
  }));
}

export function calculatePerformanceAnalysis(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters,
  comparisonMode: PerformanceComparisonMode,
  availabilityReservations: Reservation[] = reservations,
): PerformanceAnalysis {
  const dataAvailabilityStartDate = getDataAvailabilityStart(availabilityReservations);
  const currentCoverage = getPerformanceCoverage(filters, dataAvailabilityStartDate);
  const current = calculateMetrics(property, reservations, effectiveFilters(filters, currentCoverage));
  const comparisonFilters = getPerformanceComparisonFilters(filters, comparisonMode);
  const comparisonCoverage = comparisonFilters
    ? getPerformanceCoverage(comparisonFilters, dataAvailabilityStartDate)
    : null;
  const comparison = comparisonFilters && comparisonCoverage?.coveredDays
    ? calculateMetrics(property, reservations, effectiveFilters(comparisonFilters, comparisonCoverage))
    : null;
  const monthly = buildMonthlyRows(property, reservations, filters, comparisonMode, dataAvailabilityStartDate);
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
    dataAvailabilityStartDate,
    currentCoverage,
    comparisonCoverage,
    currentReliable: currentCoverage.coverage >= RELIABLE_COVERAGE_THRESHOLD,
    comparisonReliable: Boolean(comparisonCoverage && comparisonCoverage.coverage >= RELIABLE_COVERAGE_THRESHOLD),
    reliableCoverageThreshold: RELIABLE_COVERAGE_THRESHOLD,
  };
}