import { describe, expect, it } from "vitest";
import { DEFAULT_STATUS_MAPPING, MALMERENDAS_PROPERTY } from "../src/domain/property";
import { inferDataAsOf, parseAmenitizDate, parseAmenitizFile, parsePortugueseMoney, parseRoomAllocations } from "../src/features/import/amenitiz";

describe("Amenitiz parsing", () => {
  it("parses Portuguese and international money formats into cents", () => {
    expect(parsePortugueseMoney("451,80")).toBe(45180);
    expect(parsePortugueseMoney("1.234,56 €")).toBe(123456);
    expect(parsePortugueseMoney("1,234.56")).toBe(123456);
    expect(parsePortugueseMoney("0,00")).toBe(0);
    expect(parsePortugueseMoney("(12,50)")).toBe(-1250);
    expect(parsePortugueseMoney("not money")).toBeNull();
  });

  it("parses Amenitiz dates without timezone shifts", () => {
    expect(parseAmenitizDate("2026-04-01 00:00:00")).toBe("2026-04-01");
    expect(parseAmenitizDate("01/04/2026")).toBe("2026-04-01");
    expect(parseAmenitizDate(new Date(2026, 3, 1))).toBe("2026-04-01");
    expect(parseAmenitizDate(46113)).toBe("2026-04-01");
  });

  it("parses one or several room allocations", () => {
    expect(parseRoomAllocations("1 x Deluxe Suite")).toEqual([{ quantity: 1, roomTypeName: "Deluxe Suite" }]);
    expect(parseRoomAllocations("1 x Deluxe Suite, 1 x Junior Suite")).toEqual([
      { quantity: 1, roomTypeName: "Deluxe Suite" },
      { quantity: 1, roomTypeName: "Junior Suite" },
    ]);
    expect(parseRoomAllocations("bad room data")).toBeNull();
  });

  it("infers the data-as-of date from the real filename pattern", () => {
    expect(inferDataAsOf("Malmerendas Reservation Report 15.09.26.xlsx")).toBe("2026-09-15");
  });

  it("imports a semicolon-delimited Amenitiz CSV and excludes unknown rooms", async () => {
    const header = ["id", "Check-in", "Check-out", "Reservado", "Fonte", "Estado", "% quarto reservado", "Imposto municipal", "Extra (excl. impostos)", "Extra (incl. impostos)", "Receita de quartos (excl. impostos)", "Receita de quartos (incl. impostos)", "Preço total:", "Montante devido", "País"].join(";");
    const valid = ["A-1", "2026-06-01", "2026-06-03", "2026-05-01", "Booking.com", "confirmed", "1 x Deluxe Suite", "12,00", "0,00", "0,00", "200,00", "212,00", "224,00", "0,00", "PT"].join(";");
    const unknown = ["A-2", "2026-06-04", "2026-06-05", "2026-05-02", "Amenitiz", "confirmed", "1 x Mystery Room", "6,00", "0,00", "0,00", "100,00", "106,00", "112,00", "0,00", "ES"].join(";");
    const bytes = new TextEncoder().encode(`${header}\n${valid}\n${unknown}`);
    const result = await parseAmenitizFile(bytes, "report-15.05.26.csv", MALMERENDAS_PROPERTY, DEFAULT_STATUS_MAPPING);
    expect(result.rowCount).toBe(2);
    expect(result.validRowCount).toBe(1);
    expect(result.excludedRowCount).toBe(1);
    expect(result.reservations[0].roomRevenueInclCents).toBe(21200);
    expect(result.issues.some((item) => item.code === "unknown_room_type")).toBe(true);
  });
});
