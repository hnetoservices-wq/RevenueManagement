import type { ImportPreview, NormalizedStatus, Property } from "../../domain/models";
import { parseAmenitizCoreFile } from "./amenitizCore";

export {
  inferDataAsOf,
  parseAmenitizDate,
  parsePortugueseMoney,
  parseRoomAllocations,
  sha256,
} from "./amenitizCore";

function looksLikeLegacyHistoricalCsv(bytes: Uint8Array, filename: string): boolean {
  if (!filename.toLowerCase().endsWith(".csv")) return false;
  const firstLine = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 4096))).split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes("legacy_id") && firstLine.includes("booking_group_key") && firstLine.includes("room_revenue_eur");
}

export async function parseAmenitizFile(
  bytes: Uint8Array,
  filename: string,
  property: Property,
  statusMapping: ReadonlyMap<string, NormalizedStatus>,
): Promise<ImportPreview> {
  if (looksLikeLegacyHistoricalCsv(bytes, filename)) {
    const { parseLegacyHistoricalFile } = await import("./legacyHistorical");
    return parseLegacyHistoricalFile(bytes, filename, property);
  }
  return parseAmenitizCoreFile(bytes, filename, property, statusMapping);
}
