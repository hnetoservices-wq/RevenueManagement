import { addDays, differenceInCalendarDays, max, min } from "date-fns";
import { parseIsoDate } from "../../domain/dates";
import type { DashboardFilters, Reservation } from "../../domain/models";
import type { ChannelCommissionRule, ChannelNetRevenueRow, DistributionCostSummary } from "./types";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function aliases(rule: ChannelCommissionRule): string[] {
  return [rule.name, ...rule.aliases.split(/[;,]/)]
    .map(normalize)
    .filter(Boolean);
}

function ruleAppliesOnDate(rule: ChannelCommissionRule, date: string): boolean {
  return rule.active && (!rule.validFrom || rule.validFrom <= date) && (!rule.validTo || rule.validTo >= date);
}

export function matchCommissionRule(
  source: string,
  effectiveDate: string,
  rules: ChannelCommissionRule[],
): ChannelCommissionRule | null {
  const sourceName = normalize(source);
  return rules
    .filter((rule) => ruleAppliesOnDate(rule, effectiveDate) && aliases(rule).includes(sourceName))
    .sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? "") || a.id.localeCompare(b.id))[0] ?? null;
}

function overlapNights(reservation: Reservation, filters: DashboardFilters): number {
  if (reservation.checkIn > filters.endDate || reservation.checkOut <= filters.startDate) return 0;
  const start = max([parseIsoDate(reservation.checkIn), parseIsoDate(filters.startDate)]);
  const endExclusive = min([parseIsoDate(reservation.checkOut), addDays(parseIsoDate(filters.endDate), 1)]);
  return Math.max(0, differenceInCalendarDays(endExclusive, start));
}

export function calculateDistributionCosts(
  reservations: Reservation[],
  filters: DashboardFilters,
  rules: ChannelCommissionRule[],
): DistributionCostSummary {
  const rows = new Map<string, ChannelNetRevenueRow>();

  for (const reservation of reservations) {
    if (reservation.status !== "active") continue;
    const selectedNights = overlapNights(reservation, filters);
    const fullNights = differenceInCalendarDays(parseIsoDate(reservation.checkOut), parseIsoDate(reservation.checkIn));
    if (selectedNights <= 0 || fullNights <= 0) continue;

    const allocation = selectedNights / fullNights;
    const totalRoomRevenue = filters.revenueBasis === "inclusive"
      ? reservation.roomRevenueInclCents
      : reservation.roomRevenueExclCents;
    const grossRoomRevenueCents = Math.round(totalRoomRevenue * allocation);
    const effectiveDate = reservation.bookedAt ?? reservation.checkIn;
    const rule = matchCommissionRule(reservation.source, effectiveDate, rules);
    const commissionCents = Math.round(grossRoomRevenueCents * ((rule?.commissionRate ?? 0) / 100));
    const groupName = rule?.groupName.trim() || rule?.name.trim() || reservation.source;
    const key = normalize(groupName);
    const current = rows.get(key) ?? {
      channel: reservation.source,
      groupName,
      reservations: 0,
      roomNightsSold: 0,
      grossRoomRevenueCents: 0,
      commissionCents: 0,
      netRoomRevenueCents: 0,
      effectiveCommissionRate: null,
      adrCents: null,
      configured: true,
    };
    current.reservations += 1;
    current.roomNightsSold += selectedNights * reservation.roomQuantity;
    current.grossRoomRevenueCents += grossRoomRevenueCents;
    current.commissionCents += commissionCents;
    current.netRoomRevenueCents += grossRoomRevenueCents - commissionCents;
    current.configured = current.configured && Boolean(rule);
    rows.set(key, current);
  }

  const resultRows = Array.from(rows.values()).map((row) => ({
    ...row,
    effectiveCommissionRate: row.grossRoomRevenueCents ? row.commissionCents / row.grossRoomRevenueCents : null,
    adrCents: row.roomNightsSold ? row.grossRoomRevenueCents / row.roomNightsSold : null,
  })).sort((a, b) => b.grossRoomRevenueCents - a.grossRoomRevenueCents || a.groupName.localeCompare(b.groupName));

  const grossRoomRevenueCents = resultRows.reduce((sum, row) => sum + row.grossRoomRevenueCents, 0);
  const commissionCents = resultRows.reduce((sum, row) => sum + row.commissionCents, 0);
  const unconfiguredRevenueCents = resultRows.filter((row) => !row.configured).reduce((sum, row) => sum + row.grossRoomRevenueCents, 0);

  return {
    grossRoomRevenueCents,
    commissionCents,
    netRoomRevenueCents: grossRoomRevenueCents - commissionCents,
    effectiveCommissionRate: grossRoomRevenueCents ? commissionCents / grossRoomRevenueCents : null,
    unconfiguredRevenueCents,
    rows: resultRows,
  };
}
