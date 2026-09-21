import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { IsoDate } from "./models";

export function toIsoDate(value: Date): IsoDate {
  return format(value, "yyyy-MM-dd") as IsoDate;
}

export function parseIsoDate(value: IsoDate): Date {
  return parseISO(value);
}

export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  return differenceInCalendarDays(parseIsoDate(checkOut), parseIsoDate(checkIn));
}

export function enumerateDates(start: IsoDate, endInclusive: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  let cursor = parseIsoDate(start);
  const end = parseIsoDate(endInclusive);
  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function shiftYear(value: IsoDate, years: number): IsoDate {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(year + years, month - 1, day);
  if (shifted.getMonth() !== month - 1) {
    return `${year + years}-${String(month).padStart(2, "0")}-${String(day - 1).padStart(2, "0")}` as IsoDate;
  }
  return toIsoDate(shifted);
}
