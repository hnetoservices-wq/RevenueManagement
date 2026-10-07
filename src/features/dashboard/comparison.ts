import { addYears, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import type { DashboardFilters, DashboardMetrics, IsoDate, Property, Reservation } from "../../domain/models";
import { calculateMetrics } from "../../domain/analytics";

/**
 * Reject incomplete native-date input and implausible ranges before running the
 * daily revenue calculations. A partially typed year such as 0002 would
 * otherwise produce hundreds of thousands of daily data points.
 */
export function isSafeDashboardDateRange(start: string, end: string): boolean {
  const validDate = (value: string): Date | null => {
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;
    const year = Number(value.slice(0, 4));
    if (year < 1900 || year > 2100) return null;
    const date = parseISO(value);
    return isValid(date) && format(date, "yyyy-MM-dd") === value ? date : null;
  };

  const startDate = validDate(start);
  const endDate = validDate(end);
  return Boolean(startDate && endDate
    && startDate <= endDate
    && differenceInCalendarDays(endDate, startDate) <= 3660);
}

export interface DashboardYearComparison {
  year: number;
  filters: DashboardFilters;
  metrics: DashboardMetrics;
}

export function comparisonFiltersForYear(filters: DashboardFilters, targetYear: number): DashboardFilters {
  const baseYear = Number(filters.startDate.slice(0, 4));
  const offset = targetYear - baseYear;
  return {
    ...filters,
    startDate: format(addYears(parseISO(filters.startDate), offset), "yyyy-MM-dd") as IsoDate,
    endDate: format(addYears(parseISO(filters.endDate), offset), "yyyy-MM-dd") as IsoDate,
  };
}

export function availableDashboardComparisonYears(reservations: Reservation[], filters: DashboardFilters): number[] {
  const baseYear = Number(filters.startDate.slice(0, 4));
  const years = new Set<number>();
  for (const reservation of reservations) {
    const checkInYear = Number(reservation.checkIn.slice(0, 4));
    const checkOutYear = Number(reservation.checkOut.slice(0, 4));
    if (Number.isFinite(checkInYear)) years.add(checkInYear);
    if (Number.isFinite(checkOutYear)) years.add(checkOutYear);
  }
  years.delete(baseYear);
  return [...years].sort((a, b) => b - a);
}

export function calculateDashboardYearComparisons(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters,
  years: number[],
): DashboardYearComparison[] {
  return years.map((year) => {
    const comparisonFilters = comparisonFiltersForYear(filters, year);
    return {
      year,
      filters: comparisonFilters,
      metrics: calculateMetrics(property, reservations, comparisonFilters),
    };
  });
}
