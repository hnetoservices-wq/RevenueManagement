import { format, isValid, parse } from "date-fns";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import type {
  ImportIssue,
  ImportPreview,
  IsoDate,
  NormalizedStatus,
  Property,
  Reservation,
  RoomAllocation,
} from "../../domain/models";

const REQUIRED_HEADERS = [
  "id",
  "Check-in",
  "Check-out",
  "Reservado",
  "Fonte",
  "Estado",
  "% quarto reservado",
  "Imposto municipal",
  "Extra (excl. impostos)",
  "Extra (incl. impostos)",
  "Receita de quartos (excl. impostos)",
  "Receita de quartos (incl. impostos)",
  "Preço total:",
  "Montante devido",
] as const;

type RawRow = Record<string, unknown>;

export function parsePortugueseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value !== "string") return null;

  let normalized = value.trim().replace(/\s|€|EUR/gi, "");
  if (!normalized) return 0;
  const negative = normalized.startsWith("(") && normalized.endsWith(")");
  normalized = normalized.replace(/[()]/g, "");

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (hasComma) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) * (negative ? -1 : 1);
}

export function parseAmenitizDate(value: unknown): IsoDate | null {
  if (value instanceof Date && isValid(value)) return format(value, "yyyy-MM-dd") as IsoDate;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10) as IsoDate;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const clean = value.trim().split(/[ T]/)[0];
  const formats = ["yyyy-MM-dd", "dd/MM/yyyy", "dd-MM-yyyy", "dd.MM.yyyy"];
  for (const dateFormat of formats) {
    const parsed = parse(clean, dateFormat, new Date(2000, 0, 1));
    if (isValid(parsed) && format(parsed, dateFormat) === clean) {
      return format(parsed, "yyyy-MM-dd") as IsoDate;
    }
  }
  return null;
}

export function inferDataAsOf(filename: string, fallback = new Date()): IsoDate {
  const match = filename.match(/(?:^|\D)(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{2,4})(?:\D|$)/);
  if (!match) return format(fallback, "yyyy-MM-dd") as IsoDate;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const candidate = new Date(year, month - 1, day);
  return isValid(candidate) && candidate.getMonth() === month - 1
    ? (format(candidate, "yyyy-MM-dd") as IsoDate)
    : (format(fallback, "yyyy-MM-dd") as IsoDate);
}

export function parseRoomAllocations(value: unknown): RoomAllocation[] | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const result: RoomAllocation[] = [];
  const pattern = /(\d+)\s*x\s*(.+?)(?=,\s*\d+\s*x\s*|$)/gi;
  let match: RegExpExecArray | null;
  let consumed = "";
  while ((match = pattern.exec(value)) !== null) {
    const quantity = Number(match[1]);
    const roomTypeName = match[2].trim();
    if (!Number.isInteger(quantity) || quantity <= 0 || !roomTypeName) return null;
    result.push({ quantity, roomTypeName });
    consumed += match[0];
  }
  const normalizedSource = value.replace(/,\s*/g, "").replace(/\s+/g, "").toLowerCase();
  const normalizedConsumed = consumed.replace(/,\s*/g, "").replace(/\s+/g, "").toLowerCase();
  return result.length > 0 && normalizedSource === normalizedConsumed ? result : null;
}

function findHeaderRow(rows: unknown[][]): number {
  return rows.findIndex((row) => {
    const cells = new Set(row.map((cell) => String(cell ?? "").trim()));
    return REQUIRED_HEADERS.every((header) => cells.has(header));
  });
}

function issue(row: number, severity: "warning" | "error", code: string, field: string | null, message: string): ImportIssue {
  return { row, severity, code, field, message };
}

function normalizeRow(
  row: RawRow,
  sourceRow: number,
  property: Property,
  statusMapping: ReadonlyMap<string, NormalizedStatus>,
): { reservation: Reservation | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const reservationId = String(row.id ?? "").trim();
  const checkIn = parseAmenitizDate(row["Check-in"]);
  const checkOut = parseAmenitizDate(row["Check-out"]);
  const bookedAt = parseAmenitizDate(row.Reservado);
  const sourceStatus = String(row.Estado ?? "").trim().toLowerCase();
  const status = statusMapping.get(sourceStatus) ?? null;
  const rooms = parseRoomAllocations(row["% quarto reservado"]);

  if (!reservationId) issues.push(issue(sourceRow, "error", "missing_reservation_id", "id", "Reservation ID is missing."));
  if (!checkIn) issues.push(issue(sourceRow, "error", "invalid_check_in", "Check-in", "Check-in date is missing or invalid."));
  if (!checkOut) issues.push(issue(sourceRow, "error", "invalid_check_out", "Check-out", "Check-out date is missing or invalid."));
  if (checkIn && checkOut && checkOut <= checkIn) {
    issues.push(issue(sourceRow, "error", "invalid_stay_dates", "Check-out", "Check-out must be after check-in."));
  }
  if (!bookedAt) issues.push(issue(sourceRow, "warning", "missing_booking_date", "Reservado", "Booking date is missing; lead time will be unavailable."));
  if (!status) issues.push(issue(sourceRow, "error", "unknown_status", "Estado", `Unknown Amenitiz status: ${sourceStatus || "(blank)"}.`));
  if (!rooms) issues.push(issue(sourceRow, "error", "invalid_room_assignment", "% quarto reservado", "Room assignment is missing or cannot be parsed."));

  const knownRooms = new Set(property.roomTypes.map((room) => room.canonicalName.toLowerCase()));
  for (const room of rooms ?? []) {
    if (!knownRooms.has(room.roomTypeName.toLowerCase())) {
      issues.push(issue(sourceRow, "error", "unknown_room_type", "% quarto reservado", `Unknown room type: ${room.roomTypeName}.`));
    }
  }

  const moneyFields = {
    touristTaxCents: ["Imposto municipal", parsePortugueseMoney(row["Imposto municipal"])],
    extraRevenueExclCents: ["Extra (excl. impostos)", parsePortugueseMoney(row["Extra (excl. impostos)"])],
    extraRevenueInclCents: ["Extra (incl. impostos)", parsePortugueseMoney(row["Extra (incl. impostos)"])],
    roomRevenueExclCents: ["Receita de quartos (excl. impostos)", parsePortugueseMoney(row["Receita de quartos (excl. impostos)"])],
    roomRevenueInclCents: ["Receita de quartos (incl. impostos)", parsePortugueseMoney(row["Receita de quartos (incl. impostos)"])],
    totalBookingValueCents: ["Preço total:", parsePortugueseMoney(row["Preço total:"])],
    amountDueCents: ["Montante devido", parsePortugueseMoney(row["Montante devido"])],
  } as const;

  for (const [, [field, value]] of Object.entries(moneyFields)) {
    if (value === null) issues.push(issue(sourceRow, "error", "invalid_money", field, `${field} is not a valid monetary value.`));
    else if (value < 0) issues.push(issue(sourceRow, "warning", "negative_money", field, `${field} contains an unusual negative value.`));
  }

  if (
    moneyFields.totalBookingValueCents[1] === 0 &&
    moneyFields.roomRevenueInclCents[1] === 0 &&
    status !== "cancelled"
  ) {
    issues.push(issue(sourceRow, "warning", "zero_value_reservation", "Preço total:", "Active reservation has zero booking value."));
  }

  if (issues.some((item) => item.severity === "error") || !checkIn || !checkOut || !status || !rooms) {
    return { reservation: null, issues };
  }

  const reservation: Reservation = {
    propertyId: property.id,
    reservationId,
    checkIn,
    checkOut,
    bookedAt,
    source: String(row.Fonte ?? "Unknown").trim() || "Unknown",
    sourceStatus,
    status,
    country: String(row["País"] ?? "").trim().toUpperCase() || null,
    rooms,
    roomQuantity: rooms.reduce((total, room) => total + room.quantity, 0),
    touristTaxCents: moneyFields.touristTaxCents[1] ?? 0,
    extraRevenueExclCents: moneyFields.extraRevenueExclCents[1] ?? 0,
    extraRevenueInclCents: moneyFields.extraRevenueInclCents[1] ?? 0,
    roomRevenueExclCents: moneyFields.roomRevenueExclCents[1] ?? 0,
    roomRevenueInclCents: moneyFields.roomRevenueInclCents[1] ?? 0,
    totalBookingValueCents: moneyFields.totalBookingValueCents[1] ?? 0,
    amountDueCents: moneyFields.amountDueCents[1] ?? 0,
  };

  return { reservation, issues };
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", stableBytes.buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function parseAmenitizFile(
  bytes: Uint8Array,
  filename: string,
  property: Property,
  statusMapping: ReadonlyMap<string, NormalizedStatus>,
): Promise<ImportPreview> {
  const extension = filename.toLowerCase().split(".").pop();
  let rows: unknown[][];
  if (extension === "xlsx") {
    const stableBytes = new Uint8Array(bytes);
    rows = await readSheet(new Blob([stableBytes]));
  } else if (extension === "csv") {
    const parsed = Papa.parse<unknown[]>(new TextDecoder().decode(bytes), { skipEmptyLines: true });
    if (parsed.errors.length) throw new Error(`CSV parsing failed: ${parsed.errors[0].message}`);
    rows = parsed.data;
  } else {
    throw new Error("Unsupported file type. Choose an Amenitiz .xlsx or .csv report.");
  }
  if (!rows.length) throw new Error("The report contains no rows.");
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) throw new Error("Amenitiz headers were not found. Confirm this is a reservation report.");

  const headers = rows[headerIndex].map((value) => String(value ?? "").trim());
  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell !== null && cell !== ""));
  const reservations: Reservation[] = [];
  const issues: ImportIssue[] = [];
  const seenIds = new Set<string>();

  dataRows.forEach((cells, index) => {
    const raw = Object.fromEntries(headers.map((header, column) => [header, cells[column]]));
    const sourceRow = headerIndex + index + 2;
    const normalized = normalizeRow(raw, sourceRow, property, statusMapping);
    issues.push(...normalized.issues);
    if (!normalized.reservation) return;
    if (seenIds.has(normalized.reservation.reservationId)) {
      issues.push(issue(sourceRow, "error", "duplicate_reservation_id", "id", `Reservation ${normalized.reservation.reservationId} appears more than once in this file.`));
      return;
    }
    seenIds.add(normalized.reservation.reservationId);
    reservations.push(normalized.reservation);
  });

  return {
    propertyId: property.id,
    source: "Amenitiz",
    filename,
    dataAsOf: inferDataAsOf(filename),
    fileHash: await sha256(bytes),
    rowCount: dataRows.length,
    validRowCount: reservations.length,
    excludedRowCount: dataRows.length - reservations.length,
    warningCount: issues.filter((item) => item.severity === "warning").length,
    reservations,
    issues,
  };
}
