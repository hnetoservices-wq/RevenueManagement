import { addDays, differenceInCalendarDays, format } from "date-fns";
import { enumerateDates, nightsBetween, parseIsoDate, shiftYear, toIsoDate } from "../../domain/dates";
import type { DashboardFilters, IsoDate, Property, Reservation, RevenueBasis } from "../../domain/models";

export type BookingComparisonMode = "previous_year" | "previous_period" | "none";
export type BookingGranularity = "Daily" | "Weekly" | "Monthly";

export interface BookingDateRange {
  startDate: IsoDate;
  endDate: IsoDate;
  revenueBasis: RevenueBasis;
}

export interface BookingCoverage {
  availabilityStartDate: IsoDate | null;
  availabilityEndDate: IsoDate | null;
  requestedStartDate: IsoDate;
  requestedEndDate: IsoDate;
  effectiveStartDate: IsoDate | null;
  effectiveEndDate: IsoDate | null;
  totalDays: number;
  coveredDays: number;
  coverage: number;
}

export interface BookingActivityMetrics {
  reservations: number;
  activeReservations: number;
  cancelledReservations: number;
  roomNightsBooked: number;
  roomRevenueCents: number;
  totalRevenueCents: number;
  extraRevenueCents: number;
  touristTaxCents: number;
  adrCents: number | null;
  averageLos: number | null;
  averageLeadTime: number | null;
}

export interface BookingProductionPoint {
  label: string;
  reservations: number;
  roomNightsBooked: number;
  roomRevenueCents: number;
}

export interface BookingStayMonthPoint {
  key: string;
  label: string;
  roomNightsBooked: number;
  roomRevenueCents: number;
}

export interface BookingChannelRow {
  channel: string;
  reservations: number;
  roomNightsBooked: number;
  roomRevenueCents: number;
  share: number | null;
  adrCents: number | null;
}

export interface BookingRoomTypeRow {
  roomType: string;
  roomNightsBooked: number;
  share: number | null;
}

export interface BookingActivityAnalysis {
  metrics: BookingActivityMetrics;
  comparison: BookingActivityMetrics | null;
  comparisonMode: BookingComparisonMode;
  comparisonRange: BookingDateRange | null;
  currentCoverage: BookingCoverage;
  comparisonCoverage: BookingCoverage | null;
  comparisonReliable: boolean;
  production: BookingProductionPoint[];
  stayMonths: BookingStayMonthPoint[];
  channels: BookingChannelRow[];
  roomTypes: BookingRoomTypeRow[];
  granularity: BookingGranularity;
  missingBookingDateCount: number;
}

const RELIABLE_COVERAGE = 0.8;

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function rangeDays(range: BookingDateRange): number {
  return Math.max(0, differenceInCalendarDays(parseIsoDate(range.endDate), parseIsoDate(range.startDate)) + 1);
}

export function bookingAvailability(reservations: Reservation[]): { start: IsoDate | null; end: IsoDate | null } {
  const dates = reservations
    .filter((reservation) => reservation.status !== "ignored" && reservation.bookedAt !== null)
    .map((reservation) => reservation.bookedAt!)
    .sort();
  return { start: dates[0] ?? null, end: dates.at(-1) ?? null };
}

export function bookingCoverage(range: BookingDateRange, availabilityStartDate: IsoDate | null, availabilityEndDate: IsoDate | null): BookingCoverage {
  const totalDays = rangeDays(range);
  if (!availabilityStartDate || !availabilityEndDate || totalDays === 0 || availabilityStartDate > range.endDate || availabilityEndDate < range.startDate) {
    return {
      availabilityStartDate,
      availabilityEndDate,
      requestedStartDate: range.startDate,
      requestedEndDate: range.endDate,
      effectiveStartDate: null,
      effectiveEndDate: null,
      totalDays,
      coveredDays: 0,
      coverage: 0,
    };
  }

  const effectiveStartDate = availabilityStartDate > range.startDate ? availabilityStartDate : range.startDate;
  const effectiveEndDate = availabilityEndDate < range.endDate ? availabilityEndDate : range.endDate;
  const coveredDays = effectiveStartDate <= effectiveEndDate
    ? differenceInCalendarDays(parseIsoDate(effectiveEndDate), parseIsoDate(effectiveStartDate)) + 1
    : 0;
  return {
    availabilityStartDate,
    availabilityEndDate,
    requestedStartDate: range.startDate,
    requestedEndDate: range.endDate,
    effectiveStartDate: coveredDays ? effectiveStartDate : null,
    effectiveEndDate: coveredDays ? effectiveEndDate : null,
    totalDays,
    coveredDays,
    coverage: totalDays ? coveredDays / totalDays : 0,
  };
}

function comparisonRange(range: BookingDateRange, mode: BookingComparisonMode): BookingDateRange | null {
  if (mode === "none") return null;
  if (mode === "previous_year") {
    return { ...range, startDate: shiftYear(range.startDate, -1), endDate: shiftYear(range.endDate, -1) };
  }
  const days = rangeDays(range);
  return {
    ...range,
    startDate: toIsoDate(addDays(parseIsoDate(range.startDate), -days)),
    endDate: toIsoDate(addDays(parseIsoDate(range.endDate), -days)),
  };
}

function reservationsInRange(reservations: Reservation[], range: BookingDateRange, coverage: BookingCoverage): Reservation[] {
  if (!coverage.effectiveStartDate || !coverage.effectiveEndDate) return [];
  return reservations.filter((reservation) =>
    reservation.status !== "ignored" &&
    reservation.bookedAt !== null &&
    reservation.bookedAt >= coverage.effectiveStartDate! &&
    reservation.bookedAt <= coverage.effectiveEndDate!,
  );
}

function roomRevenue(reservation: Reservation, basis: RevenueBasis): number {
  return basis === "inclusive" ? reservation.roomRevenueInclCents : reservation.roomRevenueExclCents;
}

function extraRevenue(reservation: Reservation, basis: RevenueBasis): number {
  return basis === "inclusive" ? reservation.extraRevenueInclCents : reservation.extraRevenueExclCents;
}

function calculateBookingMetrics(reservations: Reservation[], basis: RevenueBasis): BookingActivityMetrics {
  let roomNightsBooked = 0;
  let roomRevenueCents = 0;
  let extraRevenueCents = 0;
  let touristTaxCents = 0;
  const los: number[] = [];
  const leadTimes: number[] = [];

  for (const reservation of reservations) {
    const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
    roomNightsBooked += nights * reservation.roomQuantity;
    roomRevenueCents += roomRevenue(reservation, basis);
    extraRevenueCents += extraRevenue(reservation, basis);
    touristTaxCents += reservation.touristTaxCents;
    if (nights >= 0) los.push(nights);
    if (reservation.bookedAt) {
      const lead = differenceInCalendarDays(parseIsoDate(reservation.checkIn), parseIsoDate(reservation.bookedAt));
      if (lead >= 0) leadTimes.push(lead);
    }
  }

  return {
    reservations: reservations.length,
    activeReservations: reservations.filter((reservation) => reservation.status === "active").length,
    cancelledReservations: reservations.filter((reservation) => reservation.status === "cancelled").length,
    roomNightsBooked,
    roomRevenueCents,
    totalRevenueCents: roomRevenueCents + extraRevenueCents + touristTaxCents,
    extraRevenueCents,
    touristTaxCents,
    adrCents: roomNightsBooked ? roomRevenueCents / roomNightsBooked : null,
    averageLos: average(los),
    averageLeadTime: average(leadTimes),
  };
}

function granularityFor(range: BookingDateRange): BookingGranularity {
  const days = rangeDays(range);
  return days <= 45 ? "Daily" : days <= 180 ? "Weekly" : "Monthly";
}

function buildProduction(selected: Reservation[], range: BookingDateRange, coverage: BookingCoverage): BookingProductionPoint[] {
  if (!coverage.effectiveStartDate || !coverage.effectiveEndDate) return [];
  const granularity = granularityFor(range);
  const dates = enumerateDates(coverage.effectiveStartDate, coverage.effectiveEndDate);
  const byDate = new Map<string, BookingProductionPoint>();
  for (const date of dates) byDate.set(date, { label: date, reservations: 0, roomNightsBooked: 0, roomRevenueCents: 0 });

  for (const reservation of selected) {
    const day = byDate.get(reservation.bookedAt!);
    if (!day) continue;
    const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
    day.reservations += 1;
    day.roomNightsBooked += nights * reservation.roomQuantity;
    day.roomRevenueCents += roomRevenue(reservation, range.revenueBasis);
  }

  const daily = Array.from(byDate.entries()).map(([date, point]) => ({
    ...point,
    label: format(parseIsoDate(date as IsoDate), "dd MMM"),
  }));
  if (granularity === "Daily") return daily;

  if (granularity === "Weekly") {
    const result: BookingProductionPoint[] = [];
    for (let index = 0; index < dates.length; index += 7) {
      const sliceDates = dates.slice(index, index + 7);
      const slice = sliceDates.map((date) => byDate.get(date)!);
      result.push({
        label: sliceDates.length === 1
          ? format(parseIsoDate(sliceDates[0]), "dd MMM")
          : `${format(parseIsoDate(sliceDates[0]), "dd MMM")}–${format(parseIsoDate(sliceDates.at(-1)!), "dd MMM")}`,
        reservations: slice.reduce((sum, row) => sum + row.reservations, 0),
        roomNightsBooked: slice.reduce((sum, row) => sum + row.roomNightsBooked, 0),
        roomRevenueCents: slice.reduce((sum, row) => sum + row.roomRevenueCents, 0),
      });
    }
    return result;
  }

  const months = new Map<string, BookingProductionPoint>();
  for (const date of dates) {
    const key = date.slice(0, 7);
    const day = byDate.get(date)!;
    const row = months.get(key) ?? { label: format(parseIsoDate(`${key}-01` as IsoDate), "MMM yyyy"), reservations: 0, roomNightsBooked: 0, roomRevenueCents: 0 };
    row.reservations += day.reservations;
    row.roomNightsBooked += day.roomNightsBooked;
    row.roomRevenueCents += day.roomRevenueCents;
    months.set(key, row);
  }
  return Array.from(months.values());
}

function buildStayMonths(selected: Reservation[], basis: RevenueBasis): BookingStayMonthPoint[] {
  const months = new Map<string, BookingStayMonthPoint>();
  for (const reservation of selected) {
    const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
    if (nights <= 0) continue;
    const nightlyRevenue = roomRevenue(reservation, basis) / nights;
    for (const date of enumerateDates(reservation.checkIn, toIsoDate(addDays(parseIsoDate(reservation.checkOut), -1)))) {
      const key = date.slice(0, 7);
      const row = months.get(key) ?? { key, label: format(parseIsoDate(`${key}-01` as IsoDate), "MMM yyyy"), roomNightsBooked: 0, roomRevenueCents: 0 };
      row.roomNightsBooked += reservation.roomQuantity;
      row.roomRevenueCents += nightlyRevenue;
      months.set(key, row);
    }
  }
  return Array.from(months.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({ ...row, roomRevenueCents: Math.round(row.roomRevenueCents) }));
}

function buildChannels(selected: Reservation[], basis: RevenueBasis): BookingChannelRow[] {
  const rows = new Map<string, Omit<BookingChannelRow, "share" | "adrCents">>();
  for (const reservation of selected) {
    const nights = nightsBetween(reservation.checkIn, reservation.checkOut) * reservation.roomQuantity;
    const row = rows.get(reservation.source) ?? { channel: reservation.source, reservations: 0, roomNightsBooked: 0, roomRevenueCents: 0 };
    row.reservations += 1;
    row.roomNightsBooked += nights;
    row.roomRevenueCents += roomRevenue(reservation, basis);
    rows.set(reservation.source, row);
  }
  const totalRevenue = Array.from(rows.values()).reduce((sum, row) => sum + row.roomRevenueCents, 0);
  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      share: totalRevenue ? row.roomRevenueCents / totalRevenue : null,
      adrCents: row.roomNightsBooked ? row.roomRevenueCents / row.roomNightsBooked : null,
    }))
    .sort((a, b) => b.roomRevenueCents - a.roomRevenueCents);
}

function buildRoomTypes(property: Property, selected: Reservation[]): BookingRoomTypeRow[] {
  const rows = new Map(property.roomTypes.map((roomType) => [roomType.canonicalName, 0]));
  for (const reservation of selected) {
    const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
    for (const room of reservation.rooms) rows.set(room.roomTypeName, (rows.get(room.roomTypeName) ?? 0) + nights * room.quantity);
  }
  const total = Array.from(rows.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(rows.entries())
    .map(([roomType, roomNightsBooked]) => ({ roomType, roomNightsBooked, share: total ? roomNightsBooked / total : null }))
    .sort((a, b) => b.roomNightsBooked - a.roomNightsBooked);
}

export function calculateBookingActivity(
  property: Property,
  reservations: Reservation[],
  range: BookingDateRange,
  comparisonMode: BookingComparisonMode,
  coverageReservations: Reservation[] = reservations,
): BookingActivityAnalysis {
  const availability = bookingAvailability(coverageReservations);
  const currentCoverage = bookingCoverage(range, availability.start, availability.end);
  const currentReservations = reservationsInRange(reservations, range, currentCoverage);
  const metrics = calculateBookingMetrics(currentReservations, range.revenueBasis);

  const requestedComparisonRange = comparisonRange(range, comparisonMode);
  const comparisonCoverage = requestedComparisonRange
    ? bookingCoverage(requestedComparisonRange, availability.start, availability.end)
    : null;
  const comparisonReservations = requestedComparisonRange && comparisonCoverage
    ? reservationsInRange(reservations, requestedComparisonRange, comparisonCoverage)
    : [];
  const comparisonReliable = Boolean(comparisonCoverage && comparisonCoverage.coverage >= RELIABLE_COVERAGE);

  return {
    metrics,
    comparison: comparisonReliable && requestedComparisonRange ? calculateBookingMetrics(comparisonReservations, requestedComparisonRange.revenueBasis) : null,
    comparisonMode,
    comparisonRange: requestedComparisonRange,
    currentCoverage,
    comparisonCoverage,
    comparisonReliable,
    production: buildProduction(currentReservations, range, currentCoverage),
    stayMonths: buildStayMonths(currentReservations, range.revenueBasis),
    channels: buildChannels(currentReservations, range.revenueBasis),
    roomTypes: buildRoomTypes(property, currentReservations),
    granularity: granularityFor(range),
    missingBookingDateCount: coverageReservations.filter((reservation) => reservation.status !== "ignored" && reservation.bookedAt === null).length,
  };
}

export function defaultBookingRange(reservations: Reservation[], basis: RevenueBasis = "inclusive"): BookingDateRange {
  const availability = bookingAvailability(reservations);
  const endDate = availability.end ?? toIsoDate(new Date());
  const startDate = availability.start && availability.start > toIsoDate(addDays(parseIsoDate(endDate), -29))
    ? availability.start
    : toIsoDate(addDays(parseIsoDate(endDate), -29));
  return { startDate, endDate, revenueBasis: basis };
}
