import { format, getDay } from "date-fns";
import { calculateMetrics } from "../../domain/analytics";
import { parseIsoDate } from "../../domain/dates";
import type { DashboardFilters, DashboardMetrics, DailyPerformance, IsoDate, Property, Reservation } from "../../domain/models";
import {
  ALL_CHANNELS,
  ALL_ROOM_TYPES,
  applyAnalysisFilters,
} from "../filters/analysisFilters";
import {
  calculatePerformanceAnalysis,
  type PerformanceAnalysis,
  type PerformanceComparisonMode,
  type PerformanceCoverage,
  type PerformanceGranularity,
} from "../performance/performance";

export interface RoomTypeOccupancy {
  roomType: string;
  roomNightsSold: number;
  availableRoomNights: number;
  occupancy: number | null;
  comparisonRoomNightsSold: number | null;
  comparisonOccupancy: number | null;
}

export interface WeekdayOccupancy {
  weekday: string;
  weekdayIndex: number;
  roomNightsSold: number;
  availableRoomNights: number;
  occupancy: number | null;
}

export interface OccupancyDemandPoint {
  label: string;
  roomNightsSold: number;
  availableRoomNights: number;
  occupancy: number | null;
  comparisonOccupancy: number | null;
}

export interface OccupancyDatePoint {
  date: IsoDate;
  roomNightsSold: number;
  availableRoomNights: number;
  occupancy: number | null;
}

export interface OccupancyAnalysis {
  performance: PerformanceAnalysis;
  current: DashboardMetrics;
  comparison: DashboardMetrics | null;
  comparisonMode: PerformanceComparisonMode;
  comparisonFilters: DashboardFilters | null;
  comparisonCoverage: PerformanceCoverage | null;
  comparisonReliable: boolean;
  granularity: PerformanceGranularity;
  roomTypes: RoomTypeOccupancy[];
  weekdays: WeekdayOccupancy[];
  demandTrend: OccupancyDemandPoint[];
  highestDates: OccupancyDatePoint[];
  lowestDates: OccupancyDatePoint[];
  daysAtOrAbove80: number;
  soldOutDays: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function effectiveFilters(filters: DashboardFilters, coverage: PerformanceCoverage): DashboardFilters | null {
  if (!coverage.effectiveStartDate || !coverage.effectiveEndDate || coverage.coveredDays === 0) return null;
  return {
    ...filters,
    startDate: coverage.effectiveStartDate,
    endDate: coverage.effectiveEndDate,
  };
}

function roomTypeMetrics(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters | null,
): Map<string, DashboardMetrics> {
  const result = new Map<string, DashboardMetrics>();
  if (!filters) return result;

  for (const roomType of property.roomTypes) {
    const projected = applyAnalysisFilters(property, reservations, {
      channel: ALL_CHANNELS,
      roomType: roomType.canonicalName,
      status: "all",
    });
    result.set(roomType.canonicalName, calculateMetrics(projected.property, projected.reservations, filters));
  }
  return result;
}

function buildWeekdays(daily: DailyPerformance[]): WeekdayOccupancy[] {
  const grouped = WEEKDAYS.map((weekday, weekdayIndex) => ({
    weekday,
    weekdayIndex,
    roomNightsSold: 0,
    availableRoomNights: 0,
  }));

  for (const day of daily) {
    const index = getDay(parseIsoDate(day.date));
    grouped[index].roomNightsSold += day.roomNightsSold;
    grouped[index].availableRoomNights += day.availableRoomNights;
  }

  return grouped.map((row) => ({
    ...row,
    occupancy: row.availableRoomNights ? row.roomNightsSold / row.availableRoomNights : null,
  }));
}

function aggregateDays(days: DailyPerformance[]) {
  const roomNightsSold = days.reduce((sum, day) => sum + day.roomNightsSold, 0);
  const availableRoomNights = days.reduce((sum, day) => sum + day.availableRoomNights, 0);
  return {
    roomNightsSold,
    availableRoomNights,
    occupancy: availableRoomNights ? roomNightsSold / availableRoomNights : null,
  };
}

function buildDemandTrend(performance: PerformanceAnalysis): OccupancyDemandPoint[] {
  const current = performance.current.daily;
  const comparison = performance.trend;

  if (performance.granularity === "Daily") {
    return current.map((day, index) => ({
      label: performance.trend[index]?.label ?? format(parseIsoDate(day.date), "dd MMM"),
      roomNightsSold: day.roomNightsSold,
      availableRoomNights: day.availableRoomNights,
      occupancy: day.occupancy,
      comparisonOccupancy: performance.trend[index]?.comparisonOccupancy ?? null,
    }));
  }

  if (performance.granularity === "Weekly") {
    const rows: OccupancyDemandPoint[] = [];
    for (let index = 0, trendIndex = 0; index < current.length; index += 7, trendIndex += 1) {
      const aggregate = aggregateDays(current.slice(index, index + 7));
      rows.push({
        label: performance.trend[trendIndex]?.label ?? `Week ${trendIndex + 1}`,
        ...aggregate,
        comparisonOccupancy: performance.trend[trendIndex]?.comparisonOccupancy ?? null,
      });
    }
    return rows;
  }

  const grouped = new Map<string, DailyPerformance[]>();
  for (const day of current) {
    const key = day.date.slice(0, 7);
    const days = grouped.get(key) ?? [];
    days.push(day);
    grouped.set(key, days);
  }

  return Array.from(grouped.entries()).map(([key, days], index) => ({
    label: performance.trend[index]?.label ?? format(parseIsoDate(`${key}-01` as IsoDate), "MMM yyyy"),
    ...aggregateDays(days),
    comparisonOccupancy: performance.trend[index]?.comparisonOccupancy ?? null,
  }));
}

function demandDates(daily: DailyPerformance[]): OccupancyDatePoint[] {
  return daily
    .filter((day) => day.availableRoomNights > 0)
    .map((day) => ({
      date: day.date,
      roomNightsSold: day.roomNightsSold,
      availableRoomNights: day.availableRoomNights,
      occupancy: day.occupancy,
    }));
}

export function calculateOccupancyAnalysis(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters,
  comparisonMode: PerformanceComparisonMode,
  coverageReservations: Reservation[] = reservations,
): OccupancyAnalysis {
  const performance = calculatePerformanceAnalysis(
    property,
    reservations,
    filters,
    comparisonMode,
    coverageReservations,
  );

  const currentFilters = effectiveFilters(filters, performance.currentCoverage);
  const comparisonFilters = performance.comparisonFilters && performance.comparisonCoverage
    ? effectiveFilters(performance.comparisonFilters, performance.comparisonCoverage)
    : null;

  const currentByRoom = roomTypeMetrics(property, reservations, currentFilters);
  const comparisonByRoom = performance.comparisonReliable
    ? roomTypeMetrics(property, reservations, comparisonFilters)
    : new Map<string, DashboardMetrics>();

  const roomTypes = property.roomTypes.map((roomType) => {
    const current = currentByRoom.get(roomType.canonicalName);
    const comparison = comparisonByRoom.get(roomType.canonicalName);
    return {
      roomType: roomType.canonicalName,
      roomNightsSold: current?.roomNightsSold ?? 0,
      availableRoomNights: current?.availableRoomNights ?? 0,
      occupancy: current?.occupancy ?? null,
      comparisonRoomNightsSold: comparison?.roomNightsSold ?? null,
      comparisonOccupancy: comparison?.occupancy ?? null,
    };
  });

  const dates = demandDates(performance.current.daily);
  const byHigh = [...dates].sort((a, b) =>
    (b.occupancy ?? -1) - (a.occupancy ?? -1) ||
    b.roomNightsSold - a.roomNightsSold ||
    a.date.localeCompare(b.date),
  );
  const byLow = [...dates].sort((a, b) =>
    (a.occupancy ?? 2) - (b.occupancy ?? 2) ||
    a.roomNightsSold - b.roomNightsSold ||
    a.date.localeCompare(b.date),
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
    roomTypes,
    weekdays: buildWeekdays(performance.current.daily),
    demandTrend: buildDemandTrend(performance),
    highestDates: byHigh.slice(0, 5),
    lowestDates: byLow.slice(0, 5),
    daysAtOrAbove80: dates.filter((day) => (day.occupancy ?? 0) >= 0.8).length,
    soldOutDays: dates.filter((day) => (day.occupancy ?? 0) >= 1).length,
  };
}
