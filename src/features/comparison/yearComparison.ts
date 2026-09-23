import { addYears, format, parseISO } from "date-fns";
import type { DashboardFilters, IsoDate, Reservation } from "../../domain/models";

export function comparisonFiltersForYear(filters: DashboardFilters, targetYear: number): DashboardFilters {
  const baseYear = Number(filters.startDate.slice(0, 4));
  const offset = targetYear - baseYear;
  return {
    ...filters,
    startDate: format(addYears(parseISO(filters.startDate), offset), "yyyy-MM-dd") as IsoDate,
    endDate: format(addYears(parseISO(filters.endDate), offset), "yyyy-MM-dd") as IsoDate,
  };
}

export function availableComparisonYears(reservations: Reservation[], filters: DashboardFilters): number[] {
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

export function comparisonYearsFromDates(dates: string[], baseYear: number): number[] {
  const years = new Set<number>();
  for (const date of dates) {
    const year = Number(date.slice(0, 4));
    if (Number.isFinite(year) && year !== baseYear) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export function keepAvailableComparisonYears(selected: number[], available: number[]): number[] {
  return selected.filter((year) => available.includes(year));
}
