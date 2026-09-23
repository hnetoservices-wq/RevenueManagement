import { addYears, format, parseISO } from "date-fns";
import type { DashboardFilters, DashboardMetrics, IsoDate, Property, Reservation } from "../../domain/models";
import { calculateMetrics } from "../../domain/analytics";

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
