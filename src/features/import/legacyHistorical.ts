import { addDays, format, isValid, parseISO } from "date-fns";
import Papa from "papaparse";
import type { ImportIssue, ImportPreview, IsoDate, NormalizedStatus, Property, Reservation, RoomAllocation, RoomType } from "../../domain/models";
import { sha256 } from "./amenitizCore";

const REQUIRED_HEADERS = [
  "legacy_id",
  "booking_group_key",
  "booking_date",
  "check_in",
  "check_out",
  "raw_status",
  "status",
  "channel",
  "superior_king_studio_qty",
  "deluxe_suite_qty",
  "junior_suite_qty",
  "attic_loft_qty",
  "terrace_loft_qty",
  "garden_studio_qty",
  "room_revenue_eur",
] as const;

const ROOM_COLUMNS: Array<[string, string, string]> = [
  ["superior_king_studio_qty", "Superior King Studio", "SKS"],
  ["deluxe_suite_qty", "Deluxe Suite", "DS"],
  ["junior_suite_qty", "Junior Suite", "JS"],
  ["attic_loft_qty", "Attic Loft", "AL"],
  ["terrace_loft_qty", "Terrace Loft", "TL"],
  ["garden_studio_qty", "Garden Studio", "GS"],
];

type RawRow = Record<string, string | undefined>;

function issue(row: number, severity: "warning" | "error", code: string, field: string | null, message: string): ImportIssue {
  return { row, severity, code, field, message };
}

function isoDate(value: string | undefined): IsoDate | null {
  if (!value?.trim()) return null;
  const parsed = parseISO(value.trim());
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value.trim()
    ? value.trim() as IsoDate
    : null;
}

function wholeNumber(value: string | undefined): number | null {
  const parsed = Number(value ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function moneyCents(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function normalizedStatus(value: string | undefined): NormalizedStatus | null {
  const status = value?.trim().toLowerCase();
  return status === "active" || status === "cancelled" || status === "ignored" ? status : null;
}

function normalizedRoomName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findConfiguredRoom(property: Property, canonicalName: string, legacyCode: string): RoomType | null {
  const canonicalKey = normalizedRoomName(canonicalName);
  const codeKey = normalizedRoomName(legacyCode);
  return property.roomTypes.find((room) => {
    const roomKey = normalizedRoomName(room.canonicalName);
    return roomKey === canonicalKey || roomKey === codeKey;
  }) ?? null;
}

function roomsForRow(row: RawRow, sourceRow: number, property: Property, issues: ImportIssue[]): RoomAllocation[] {
  const rooms: RoomAllocation[] = [];
  for (const [column, canonicalName, legacyCode] of ROOM_COLUMNS) {
    const quantity = wholeNumber(row[column]);
    if (quantity === null) {
      issues.push(issue(sourceRow, "error", "invalid_room_quantity", column, `${column} must be a whole number.`));
      continue;
    }
    if (!quantity) continue;
    const configuredRoom = findConfiguredRoom(property, canonicalName, legacyCode);
    if (!configuredRoom) {
      const available = property.roomTypes.map((room) => room.canonicalName).join(", ") || "none configured";
      issues.push(issue(
        sourceRow,
        "error",
        "unknown_room_type",
        column,
        `Historical room ${canonicalName} (${legacyCode}) does not match this property's configured room types: ${available}.`,
      ));
      continue;
    }
    rooms.push({ roomTypeName: configuredRoom.canonicalName, quantity });
  }
  if (!rooms.length) issues.push(issue(sourceRow, "error", "missing_room_assignment", null, "No room is assigned to this historical stay line."));
  return rooms;
}

function zeroValidRowsMessage(issues: ImportIssue[]): string {
  const errors = issues.filter((item) => item.severity === "error");
  if (!errors.length) return "No valid historical stays were found in the CSV.";
  const counts = new Map<string, { count: number; example: ImportIssue }>();
  for (const error of errors) {
    const current = counts.get(error.code);
    if (current) current.count += 1;
    else counts.set(error.code, { count: 1, example: error });
  }
  const summary = Array.from(counts.values())
    .slice(0, 4)
    .map(({ count, example }) => `${count} × ${example.message} (row ${example.row})`)
    .join("; ");
  return `No valid historical stays were found in the CSV. Validation errors: ${summary}`;
}

export async function parseLegacyHistoricalFile(
  bytes: Uint8Array,
  filename: string,
  property: Property,
): Promise<ImportPreview> {
  if (!filename.toLowerCase().endsWith(".csv")) throw new Error("Historical imports must use the normalized legacy CSV format.");
  const parsed = Papa.parse<RawRow>(new TextDecoder().decode(bytes), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`Historical CSV parsing failed: ${parsed.errors[0].message}`);
  const headers = new Set(parsed.meta.fields ?? []);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missingHeaders.length) throw new Error(`Historical CSV is missing required columns: ${missingHeaders.join(", ")}.`);
  if (!parsed.data.length) throw new Error("The historical CSV contains no rows.");

  const groupCounts = new Map<string, number>();
  for (const row of parsed.data) {
    const group = row.booking_group_key?.trim();
    if (group) groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }

  const reservations: Reservation[] = [];
  const issues: ImportIssue[] = [];
  const seenIds = new Set<string>();
  let earliestCheckIn: IsoDate | null = null;
  let latestCheckOut: IsoDate | null = null;

  parsed.data.forEach((row, index) => {
    const sourceRow = index + 2;
    const legacyId = row.legacy_id?.trim() ?? "";
    const bookingGroup = row.booking_group_key?.trim() ?? "";
    const checkIn = isoDate(row.check_in);
    const checkOut = isoDate(row.check_out);
    const bookedAt = isoDate(row.booking_date);
    const status = normalizedStatus(row.status);
    const rooms = roomsForRow(row, sourceRow, property, issues);
    const revenue = moneyCents(row.room_revenue_eur);
    const channel = row.channel?.trim() || "Desconhecido";

    if (!legacyId) issues.push(issue(sourceRow, "error", "missing_legacy_id", "legacy_id", "Historical line identifier is missing."));
    if (!bookingGroup) issues.push(issue(sourceRow, "warning", "missing_booking_group", "booking_group_key", "Booking group is missing; this line will be counted independently."));
    if (!checkIn) issues.push(issue(sourceRow, "error", "invalid_check_in", "check_in", "Check-in date is missing or invalid."));
    if (!checkOut) issues.push(issue(sourceRow, "error", "invalid_check_out", "check_out", "Check-out date is missing or invalid."));
    if (checkIn && checkOut && checkOut <= checkIn) issues.push(issue(sourceRow, "error", "invalid_stay_dates", "check_out", "Check-out must be after check-in."));
    if (!bookedAt) issues.push(issue(sourceRow, "warning", "missing_booking_date", "booking_date", "Booking date is unavailable; lead time will be unavailable."));
    if (!status) issues.push(issue(sourceRow, "error", "invalid_status", "status", `Unsupported historical status: ${row.status || "(blank)"}.`));
    if (revenue === null && status === "active") issues.push(issue(sourceRow, "warning", "missing_historical_revenue", "room_revenue_eur", "Room revenue is unavailable for this active historical stay; revenue metrics will treat this line as zero."));

    const flags = (row.data_quality_flags ?? "").split("|").map((value) => value.trim()).filter(Boolean);
    for (const flag of flags) {
      if (flag === "missing_active_revenue") continue;
      issues.push(issue(sourceRow, "warning", `legacy_${flag}`, "data_quality_flags", `Source data quality flag: ${flag}.`));
    }

    if (issues.some((item) => item.row === sourceRow && item.severity === "error") || !checkIn || !checkOut || !status || !rooms.length || !legacyId) return;

    const groupBase = bookingGroup || legacyId;
    const reservationId = (groupCounts.get(bookingGroup) ?? 0) > 1
      ? `legacy:${groupBase}::segment:${legacyId}`
      : `legacy:${groupBase}`;
    if (seenIds.has(reservationId)) {
      issues.push(issue(sourceRow, "error", "duplicate_historical_id", "legacy_id", `Historical identifier ${reservationId} appears more than once.`));
      return;
    }
    seenIds.add(reservationId);

    earliestCheckIn = earliestCheckIn === null || checkIn < earliestCheckIn ? checkIn : earliestCheckIn;
    latestCheckOut = latestCheckOut === null || checkOut > latestCheckOut ? checkOut : latestCheckOut;
    const roomRevenue = revenue ?? 0;
    reservations.push({
      propertyId: property.id,
      reservationId,
      checkIn,
      checkOut,
      bookedAt,
      source: channel,
      sourceStatus: row.raw_status?.trim() || row.status?.trim() || "historical",
      status,
      country: null,
      rooms,
      roomQuantity: rooms.reduce((sum, room) => sum + room.quantity, 0),
      touristTaxCents: 0,
      extraRevenueExclCents: 0,
      extraRevenueInclCents: 0,
      roomRevenueExclCents: roomRevenue,
      roomRevenueInclCents: roomRevenue,
      totalBookingValueCents: roomRevenue,
      amountDueCents: 0,
    });
  });

  if (!reservations.length || !earliestCheckIn || !latestCheckOut) throw new Error(zeroValidRowsMessage(issues));
  const coverageEnd = format(addDays(parseISO(latestCheckOut), -1), "yyyy-MM-dd") as IsoDate;
  issues.unshift(issue(1, "warning", "historical_final_dataset", null, `Historical final data covers stays from ${earliestCheckIn} to ${coverageEnd}. It will not be used as a booking-position snapshot.`));

  return {
    propertyId: property.id,
    source: "LegacyHistorical",
    filename,
    dataAsOf: coverageEnd,
    fileHash: await sha256(bytes),
    rowCount: parsed.data.length,
    validRowCount: reservations.length,
    excludedRowCount: parsed.data.length - reservations.length,
    warningCount: issues.filter((item) => item.severity === "warning").length,
    reservations,
    issues,
  };
}
