import { addDays, differenceInCalendarDays, max, min } from "date-fns";
import { enumerateDates, nightsBetween, parseIsoDate, shiftYear, toIsoDate } from "./dates";
import type {
  CoverageQuality,
  DashboardFilters,
  DashboardMetrics,
  DashboardResult,
  IsoDate,
  LeadTimeCurveResult,
  LeadTimePaceComparisonResult,
  PickupChangeType,
  PickupDecompositionCategory,
  PickupDecompositionEntry,
  PickupDecompositionResult,
  Property,
  Reservation,
  SnapshotComparisonResult,
  SnapshotReservationSet,
} from "./models";

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function intersects(reservation: Reservation, start: IsoDate, end: IsoDate): boolean {
  return reservation.checkIn <= end && reservation.checkOut > start;
}

function overlapNights(reservation: Reservation, start: IsoDate, end: IsoDate): number {
  if (!intersects(reservation, start, end)) return 0;
  const overlapStart = max([parseIsoDate(reservation.checkIn), parseIsoDate(start)]);
  const periodEndExclusive = addDays(parseIsoDate(end), 1);
  const overlapEnd = min([parseIsoDate(reservation.checkOut), periodEndExclusive]);
  return Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart));
}

function inventoryForDate(property: Property, date: IsoDate): number {
  return property.roomTypes.reduce((sum, room) => {
    const active = (!room.activeFrom || room.activeFrom <= date) && (!room.activeTo || room.activeTo >= date);
    return sum + (active ? room.inventoryCount : 0);
  }, 0);
}

function latestSnapshotAtOrBefore(
  orderedSnapshots: SnapshotReservationSet[],
  targetDate: IsoDate,
): SnapshotReservationSet | null {
  for (let index = orderedSnapshots.length - 1; index >= 0; index -= 1) {
    if (orderedSnapshots[index].dataAsOf <= targetDate) return orderedSnapshots[index];
  }
  return null;
}

function roomSignature(reservation: Reservation): string {
  return [...reservation.rooms]
    .sort((a, b) => a.roomTypeName.localeCompare(b.roomTypeName))
    .map((room) => `${room.roomTypeName}:${room.quantity}`)
    .join("|");
}

function meaningfulChangedFields(before: Reservation, after: Reservation, filters: DashboardFilters): string[] {
  const fields: string[] = [];
  if (before.status !== after.status) fields.push("status");
  if (before.checkIn !== after.checkIn || before.checkOut !== after.checkOut) fields.push("stay dates");
  if (before.roomQuantity !== after.roomQuantity) fields.push("room quantity");
  if (roomSignature(before) !== roomSignature(after)) fields.push("room type");
  const beforeRoomRevenue = filters.revenueBasis === "inclusive" ? before.roomRevenueInclCents : before.roomRevenueExclCents;
  const afterRoomRevenue = filters.revenueBasis === "inclusive" ? after.roomRevenueInclCents : after.roomRevenueExclCents;
  if (beforeRoomRevenue !== afterRoomRevenue) fields.push("room revenue");
  const beforeExtras = filters.revenueBasis === "inclusive" ? before.extraRevenueInclCents : before.extraRevenueExclCents;
  const afterExtras = filters.revenueBasis === "inclusive" ? after.extraRevenueInclCents : after.extraRevenueExclCents;
  if (beforeExtras !== afterExtras) fields.push("extras");
  if (before.touristTaxCents !== after.touristTaxCents) fields.push("tourist tax");
  return fields;
}

export function coverageQuality(
  coverage: number,
  reliableCoverageThreshold = 0.8,
  partialCoverageThreshold = 0.5,
): CoverageQuality {
  if (coverage >= reliableCoverageThreshold) return "reliable";
  if (coverage >= partialCoverageThreshold) return "partial";
  return "insufficient";
}

export function calculateMetrics(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters,
): DashboardMetrics {
  const dates = enumerateDates(filters.startDate, filters.endDate);
  const active = reservations.filter((reservation) => reservation.status === "active" && intersects(reservation, filters.startDate, filters.endDate));
  const allIntersecting = reservations.filter((reservation) => reservation.status !== "ignored" && intersects(reservation, filters.startDate, filters.endDate));
  const cancelledCount = allIntersecting.filter((reservation) => reservation.status === "cancelled").length;

  let roomNightsSold = 0;
  let roomRevenueCents = 0;
  let extraRevenueCents = 0;
  let touristTaxCents = 0;
  const channelMap = new Map<string, { reservations: number; roomNightsSold: number; roomRevenueCents: number }>();

  for (const reservation of active) {
    const selectedNights = overlapNights(reservation, filters.startDate, filters.endDate);
    const fullNights = nightsBetween(reservation.checkIn, reservation.checkOut);
    const allocation = fullNights > 0 ? selectedNights / fullNights : 0;
    const sold = selectedNights * reservation.roomQuantity;
    const roomRevenue = Math.round(
      (filters.revenueBasis === "inclusive" ? reservation.roomRevenueInclCents : reservation.roomRevenueExclCents) * allocation,
    );
    const extraRevenue = Math.round(
      (filters.revenueBasis === "inclusive" ? reservation.extraRevenueInclCents : reservation.extraRevenueExclCents) * allocation,
    );
    const tax = Math.round(reservation.touristTaxCents * allocation);

    roomNightsSold += sold;
    roomRevenueCents += roomRevenue;
    extraRevenueCents += extraRevenue;
    touristTaxCents += tax;
    const channel = channelMap.get(reservation.source) ?? { reservations: 0, roomNightsSold: 0, roomRevenueCents: 0 };
    channel.reservations += 1;
    channel.roomNightsSold += sold;
    channel.roomRevenueCents += roomRevenue;
    channelMap.set(reservation.source, channel);
  }

  const availableRoomNights = dates.reduce((sum, date) => sum + inventoryForDate(property, date), 0);
  const leadTimes = active
    .filter((reservation) => reservation.bookedAt !== null)
    .map((reservation) => differenceInCalendarDays(parseIsoDate(reservation.checkIn), parseIsoDate(reservation.bookedAt!)))
    .filter((value) => value >= 0);
  const lengthsOfStay = active.map((reservation) => nightsBetween(reservation.checkIn, reservation.checkOut));

  const daily = dates.map((date) => {
    const dayReservations = active.filter((reservation) => reservation.checkIn <= date && reservation.checkOut > date);
    const sold = dayReservations.reduce((sum, reservation) => sum + reservation.roomQuantity, 0);
    const available = inventoryForDate(property, date);
    const revenue = dayReservations.reduce((sum, reservation) => {
      const fullNights = nightsBetween(reservation.checkIn, reservation.checkOut);
      const total = filters.revenueBasis === "inclusive" ? reservation.roomRevenueInclCents : reservation.roomRevenueExclCents;
      return sum + (fullNights > 0 ? total / fullNights : 0);
    }, 0);
    return {
      date,
      roomNightsSold: sold,
      availableRoomNights: available,
      occupancy: available ? sold / available : null,
      roomRevenueCents: Math.round(revenue),
      adrCents: sold ? revenue / sold : null,
      revparCents: available ? revenue / available : null,
    };
  });

  return {
    occupancy: availableRoomNights ? roomNightsSold / availableRoomNights : null,
    adrCents: roomNightsSold ? roomRevenueCents / roomNightsSold : null,
    revparCents: availableRoomNights ? roomRevenueCents / availableRoomNights : null,
    roomRevenueCents,
    totalRevenueCents: roomRevenueCents + extraRevenueCents + touristTaxCents,
    extraRevenueCents,
    touristTaxCents,
    roomNightsSold,
    availableRoomNights,
    reservations: active.length,
    averageLeadTime: average(leadTimes),
    medianLeadTime: median(leadTimes),
    averageLengthOfStay: average(lengthsOfStay),
    medianLengthOfStay: median(lengthsOfStay),
    cancellationRate: allIntersecting.length ? cancelledCount / allIntersecting.length : null,
    daily,
    channels: Array.from(channelMap.entries())
      .map(([channel, values]) => ({ channel, ...values }))
      .sort((a, b) => b.roomRevenueCents - a.roomRevenueCents),
  };
}

export function calculateDashboard(
  property: Property,
  reservations: Reservation[],
  filters: DashboardFilters,
): DashboardResult {
  const previousFilters = {
    ...filters,
    startDate: shiftYear(filters.startDate, -1),
    endDate: shiftYear(filters.endDate, -1),
  };
  return {
    current: calculateMetrics(property, reservations, filters),
    previousYear: calculateMetrics(property, reservations, previousFilters),
  };
}

export function calculateSnapshotComparison(
  property: Property,
  baselineReservations: Reservation[],
  currentReservations: Reservation[],
  filters: DashboardFilters,
): SnapshotComparisonResult {
  const baseline = calculateMetrics(property, baselineReservations, filters);
  const current = calculateMetrics(property, currentReservations, filters);

  return {
    baseline,
    current,
    pickup: {
      roomNightsSold: current.roomNightsSold - baseline.roomNightsSold,
      roomRevenueCents: current.roomRevenueCents - baseline.roomRevenueCents,
      totalRevenueCents: current.totalRevenueCents - baseline.totalRevenueCents,
      reservations: current.reservations - baseline.reservations,
      occupancyPercentagePoints:
        current.occupancy === null || baseline.occupancy === null
          ? null
          : (current.occupancy - baseline.occupancy) * 100,
      adrCents:
        current.adrCents === null || baseline.adrCents === null
          ? null
          : current.adrCents - baseline.adrCents,
      revparCents:
        current.revparCents === null || baseline.revparCents === null
          ? null
          : current.revparCents - baseline.revparCents,
    },
  };
}

export function calculatePickupDecomposition(
  property: Property,
  baselineReservations: Reservation[],
  currentReservations: Reservation[],
  filters: DashboardFilters,
): PickupDecompositionResult {
  const baselineById = new Map(baselineReservations.map((reservation) => [reservation.reservationId, reservation]));
  const currentById = new Map(currentReservations.map((reservation) => [reservation.reservationId, reservation]));
  const reservationIds = new Set([...baselineById.keys(), ...currentById.keys()]);
  const entries: PickupDecompositionEntry[] = [];

  for (const reservationId of reservationIds) {
    const before = baselineById.get(reservationId) ?? null;
    const after = currentById.get(reservationId) ?? null;
    const beforeRelevant = before?.status === "active" && intersects(before, filters.startDate, filters.endDate);
    const afterRelevant = after?.status === "active" && intersects(after, filters.startDate, filters.endDate);
    if (!beforeRelevant && !afterRelevant) continue;

    let type: PickupChangeType;
    let changedFields: string[];
    if (!before && after) {
      type = "new";
      changedFields = ["new reservation"];
    } else if (before && !after) {
      type = "removed";
      changedFields = ["removed from later report"];
    } else if (before && after && before.status === "active" && after.status === "cancelled") {
      type = "cancelled";
      changedFields = meaningfulChangedFields(before, after, filters);
    } else if (before && after) {
      changedFields = meaningfulChangedFields(before, after, filters);
      if (!changedFields.length) continue;
      type = "modified";
    } else {
      continue;
    }

    const beforeMetrics = before ? calculateMetrics(property, [before], filters) : null;
    const afterMetrics = after ? calculateMetrics(property, [after], filters) : null;
    const beforeRoomNights = beforeMetrics?.roomNightsSold ?? 0;
    const afterRoomNights = afterMetrics?.roomNightsSold ?? 0;
    const beforeRoomRevenue = beforeMetrics?.roomRevenueCents ?? 0;
    const afterRoomRevenue = afterMetrics?.roomRevenueCents ?? 0;
    const beforeTotalRevenue = beforeMetrics?.totalRevenueCents ?? 0;
    const afterTotalRevenue = afterMetrics?.totalRevenueCents ?? 0;

    entries.push({
      reservationId,
      type,
      beforeStatus: before?.status ?? null,
      afterStatus: after?.status ?? null,
      beforeCheckIn: before?.checkIn ?? null,
      beforeCheckOut: before?.checkOut ?? null,
      afterCheckIn: after?.checkIn ?? null,
      afterCheckOut: after?.checkOut ?? null,
      roomNightsDelta: afterRoomNights - beforeRoomNights,
      roomRevenueCentsDelta: afterRoomRevenue - beforeRoomRevenue,
      totalRevenueCentsDelta: afterTotalRevenue - beforeTotalRevenue,
      changedFields,
    });
  }

  entries.sort((a, b) => {
    const revenueDifference = Math.abs(b.roomRevenueCentsDelta) - Math.abs(a.roomRevenueCentsDelta);
    if (revenueDifference !== 0) return revenueDifference;
    return Math.abs(b.roomNightsDelta) - Math.abs(a.roomNightsDelta);
  });

  const categoryOrder: PickupChangeType[] = ["new", "cancelled", "modified", "removed"];
  const categories: PickupDecompositionCategory[] = categoryOrder.map((type) => {
    const categoryEntries = entries.filter((entry) => entry.type === type);
    return {
      type,
      reservations: categoryEntries.length,
      roomNightsDelta: categoryEntries.reduce((sum, entry) => sum + entry.roomNightsDelta, 0),
      roomRevenueCentsDelta: categoryEntries.reduce((sum, entry) => sum + entry.roomRevenueCentsDelta, 0),
      totalRevenueCentsDelta: categoryEntries.reduce((sum, entry) => sum + entry.totalRevenueCentsDelta, 0),
    };
  });

  const baselineMetrics = calculateMetrics(property, baselineReservations, filters);
  const currentMetrics = calculateMetrics(property, currentReservations, filters);

  return {
    categories,
    entries,
    net: {
      roomNightsDelta: currentMetrics.roomNightsSold - baselineMetrics.roomNightsSold,
      roomRevenueCentsDelta: currentMetrics.roomRevenueCents - baselineMetrics.roomRevenueCents,
      totalRevenueCentsDelta: currentMetrics.totalRevenueCents - baselineMetrics.totalRevenueCents,
    },
  };
}

export function calculateLeadTimeCurve(
  property: Property,
  snapshots: SnapshotReservationSet[],
  filters: DashboardFilters,
  targetDays: number[] = [180, 90, 60, 30, 14, 7, 3, 0],
  maxSnapshotLagDays = 14,
): LeadTimeCurveResult {
  const stayDates = enumerateDates(filters.startDate, filters.endDate);
  const orderedSnapshots = [...snapshots].sort((a, b) => a.dataAsOf.localeCompare(b.dataAsOf));

  const points = targetDays.map((daysBeforeArrival) => {
    let roomNightsSold = 0;
    let availableRoomNights = 0;
    let roomRevenueCents = 0;
    let coveredStayDates = 0;
    let totalSnapshotLagDays = 0;

    for (const stayDate of stayDates) {
      const targetDate = addDays(parseIsoDate(stayDate), -daysBeforeArrival);
      const targetIso = toIsoDate(targetDate);
      const snapshot = latestSnapshotAtOrBefore(orderedSnapshots, targetIso);
      if (!snapshot) continue;

      const lagDays = differenceInCalendarDays(targetDate, parseIsoDate(snapshot.dataAsOf));
      if (lagDays < 0 || lagDays > maxSnapshotLagDays) continue;

      const dayMetrics = calculateMetrics(property, snapshot.reservations, {
        startDate: stayDate,
        endDate: stayDate,
        revenueBasis: filters.revenueBasis,
      });

      roomNightsSold += dayMetrics.roomNightsSold;
      availableRoomNights += dayMetrics.availableRoomNights;
      roomRevenueCents += dayMetrics.roomRevenueCents;
      coveredStayDates += 1;
      totalSnapshotLagDays += lagDays;
    }

    return {
      daysBeforeArrival,
      label: `D-${daysBeforeArrival}`,
      roomNightsSold,
      availableRoomNights,
      occupancy: availableRoomNights ? roomNightsSold / availableRoomNights : null,
      roomRevenueCents,
      adrCents: roomNightsSold ? roomRevenueCents / roomNightsSold : null,
      revparCents: availableRoomNights ? roomRevenueCents / availableRoomNights : null,
      coveredStayDates,
      totalStayDates: stayDates.length,
      coverage: stayDates.length ? coveredStayDates / stayDates.length : 0,
      averageSnapshotLagDays: coveredStayDates ? totalSnapshotLagDays / coveredStayDates : null,
    };
  });

  return { points, maxSnapshotLagDays };
}

export function calculateLeadTimePaceComparison(
  property: Property,
  snapshots: SnapshotReservationSet[],
  filters: DashboardFilters,
  targetDays: number[] = [180, 90, 60, 30, 14, 7, 3, 0],
  maxSnapshotLagDays = 14,
  reliableCoverageThreshold = 0.8,
  partialCoverageThreshold = 0.5,
): LeadTimePaceComparisonResult {
  const current = calculateLeadTimeCurve(property, snapshots, filters, targetDays, maxSnapshotLagDays);
  const previousYearFilters: DashboardFilters = {
    ...filters,
    startDate: shiftYear(filters.startDate, -1),
    endDate: shiftYear(filters.endDate, -1),
  };
  const previousYear = calculateLeadTimeCurve(property, snapshots, previousYearFilters, targetDays, maxSnapshotLagDays);

  const points = current.points.map((currentPoint, index) => {
    const previousYearPoint = previousYear.points[index];
    const currentQuality = coverageQuality(currentPoint.coverage, reliableCoverageThreshold, partialCoverageThreshold);
    const previousYearQuality = coverageQuality(previousYearPoint.coverage, reliableCoverageThreshold, partialCoverageThreshold);
    const occupancyPercentagePointChange =
      currentQuality === "reliable" &&
      previousYearQuality === "reliable" &&
      currentPoint.occupancy !== null &&
      previousYearPoint.occupancy !== null
        ? (currentPoint.occupancy - previousYearPoint.occupancy) * 100
        : null;

    return {
      daysBeforeArrival: currentPoint.daysBeforeArrival,
      label: currentPoint.label,
      current: currentPoint,
      previousYear: previousYearPoint,
      currentQuality,
      previousYearQuality,
      occupancyPercentagePointChange,
    };
  });

  return {
    points,
    current,
    previousYear,
    reliableCoverageThreshold,
    partialCoverageThreshold,
  };
}

export function comparison(current: number | null, previous: number | null, rate = false) {
  const absoluteChange = current === null || previous === null ? null : current - previous;
  return {
    value: current,
    comparisonValue: previous,
    absoluteChange,
    relativeChange: absoluteChange === null || previous === null || previous === 0 ? null : absoluteChange / Math.abs(previous),
    percentagePointChange: rate && absoluteChange !== null ? absoluteChange : null,
  };
}
