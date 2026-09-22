import { describe, expect, it } from "vitest";
import { MALMERENDAS_PROPERTY, DEFAULT_STATUS_MAPPING } from "../src/domain/property";
import type { Property } from "../src/domain/models";
import { parseAmenitizFile } from "../src/features/import/amenitiz";

const header = [
  "legacy_id",
  "booking_group_key",
  "source_year",
  "source_row",
  "source_code",
  "booking_date",
  "check_in",
  "check_out",
  "raw_status",
  "status",
  "channel_code",
  "channel",
  "superior_king_studio_qty",
  "deluxe_suite_qty",
  "junior_suite_qty",
  "attic_loft_qty",
  "terrace_loft_qty",
  "garden_studio_qty",
  "room_count",
  "stay_nights",
  "room_nights",
  "lead_time_days",
  "room_revenue_eur",
  "rate_plan",
  "payment_method",
  "data_quality_flags",
].join(",");

function csvRow(values: string[]) {
  return values.map((value) => value.includes(",") ? `"${value.replaceAll('"', '""')}"` : value).join(",");
}

describe("legacy historical import", () => {
  it("auto-detects the normalized CSV and keeps multi-line bookings as exact stay segments", async () => {
    const rows = [
      csvRow(["legacy-2025-0100", "2025|B|7327|2025-05-02", "2025", "100", "7327", "2025-05-02", "2025-06-01", "2025-06-04", "C/O", "active", "B", "Booking.com", "1", "0", "0", "0", "0", "0", "1", "3", "3", "30", "331.44", "FLEX", "CCV", ""]),
      csvRow(["legacy-2025-0101", "2025|B|7327|2025-05-02", "2025", "101", "7327", "2025-05-02", "2025-06-01", "2025-06-04", "C/O", "active", "B", "Booking.com", "0", "0", "0", "0", "0", "1", "1", "3", "3", "30", "350.25", "FLEX", "CCV", ""]),
      csvRow(["legacy-2025-0767", "2025|D|9999|2025-11-01", "2025", "767", "9999", "2025-11-01", "2025-12-30", "2026-01-01", "C/O", "active", "D", "Direta", "0", "1", "0", "0", "0", "0", "1", "2", "2", "59", "", "", "", "missing_active_revenue"]),
    ];
    const bytes = new TextEncoder().encode(`\uFEFF${header}\r\n${rows.join("\r\n")}`);
    const preview = await parseAmenitizFile(bytes, "malmerendas_legacy_history_2024_2025.csv", MALMERENDAS_PROPERTY, DEFAULT_STATUS_MAPPING);

    expect(preview.source).toBe("LegacyHistorical");
    expect(preview.rowCount).toBe(3);
    expect(preview.validRowCount).toBe(3);
    expect(preview.dataAsOf).toBe("2025-12-31");
    expect(preview.reservations[0].reservationId).toContain("::segment:");
    expect(preview.reservations[1].reservationId).toContain("::segment:");
    expect(preview.reservations[0].rooms).toEqual([{ roomTypeName: "Superior King Studio", quantity: 1 }]);
    expect(preview.reservations[1].rooms).toEqual([{ roomTypeName: "Garden Studio", quantity: 1 }]);
    expect(preview.reservations[2].roomRevenueInclCents).toBe(0);
    expect(preview.issues.some((item) => item.code === "missing_historical_revenue")).toBe(true);
    expect(preview.issues.some((item) => item.code === "historical_final_dataset")).toBe(true);
  });

  it("matches persisted room names despite case and harmless spacing differences", async () => {
    const persistedProperty: Property = {
      ...MALMERENDAS_PROPERTY,
      roomTypes: MALMERENDAS_PROPERTY.roomTypes.map((room) => ({
        ...room,
        canonicalName: `  ${room.canonicalName.toUpperCase()}  `,
      })),
    };
    const row = csvRow([
      "legacy-2024-0003", "2024|B|803867|2023-11-10", "2024", "3", "803867",
      "2023-11-10", "2024-01-01", "2024-01-05", "C/O", "active", "B", "Booking.com",
      "0", "0", "0", "0", "1", "0", "1", "4", "4", "52", "438.84", "", "", "",
    ]);
    const bytes = new TextEncoder().encode(`\uFEFF${header}\r\n${row}`);
    const preview = await parseAmenitizFile(bytes, "history.csv", persistedProperty, DEFAULT_STATUS_MAPPING);

    expect(preview.validRowCount).toBe(1);
    expect(preview.reservations[0].rooms).toEqual([{ roomTypeName: "  TERRACE LOFT  ", quantity: 1 }]);
  });

  it("includes useful validation details when every row is rejected", async () => {
    const incompatibleProperty: Property = {
      ...MALMERENDAS_PROPERTY,
      roomTypes: [{ ...MALMERENDAS_PROPERTY.roomTypes[0], canonicalName: "Completely Different Room" }],
    };
    const row = csvRow([
      "legacy-2024-0003", "2024|B|803867|2023-11-10", "2024", "3", "803867",
      "2023-11-10", "2024-01-01", "2024-01-05", "C/O", "active", "B", "Booking.com",
      "0", "0", "0", "0", "1", "0", "1", "4", "4", "52", "438.84", "", "", "",
    ]);
    const bytes = new TextEncoder().encode(`\uFEFF${header}\r\n${row}`);

    await expect(parseAmenitizFile(bytes, "history.csv", incompatibleProperty, DEFAULT_STATUS_MAPPING))
      .rejects.toThrow(/Historical room Terrace Loft/);
  });
});
