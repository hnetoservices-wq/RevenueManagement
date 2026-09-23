import { isTauri } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { DEFAULT_NON_REFUNDABLE_DISCOUNT_PCT, DEFAULT_OTA_UPLIFT_PCT } from "./pricing";
import type { PriceDiscountEntry, PriceManagementConfig, PricePeriod } from "./types";

type SqlRow = Record<string, string | number | null>;
const STORAGE_KEY = "local-revenue-manager:price-management:v1";

interface LegacyOtaSettings {
  upliftPct?: number;
  loyaltyDiscountPct?: number;
  basicDealDiscountPct?: number;
  nonRefundableDiscountPct?: number;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeDiscount(raw: Partial<PriceDiscountEntry>, fallbackId: string): PriceDiscountEntry {
  return {
    id: String(raw.id ?? fallbackId),
    kind: raw.kind ?? "custom",
    name: String(raw.name ?? "Desconto"),
    discountPct: finiteOr(raw.discountPct, 0),
    active: raw.active !== false,
  };
}

function normalizePeriod(rawPeriod: Partial<PricePeriod>, index: number, legacy?: LegacyOtaSettings): PricePeriod {
  const periodId = String(rawPeriod.id ?? `period-${index + 1}`);
  let discounts = Array.isArray(rawPeriod.discounts)
    ? rawPeriod.discounts.map((item, discountIndex) => normalizeDiscount(item, `${periodId}-discount-${discountIndex + 1}`))
    : [];

  // Migration from the short-lived global OTA settings model. Existing periods keep
  // the old gross-up behaviour by receiving the former Fidelização and Basic Deal values.
  if (!Array.isArray(rawPeriod.discounts) && legacy) {
    const migrated: PriceDiscountEntry[] = [];
    if (finiteOr(legacy.loyaltyDiscountPct, 0) > 0) {
      migrated.push({ id: `${periodId}-legacy-loyalty`, kind: "loyalty", name: "Fidelização", discountPct: finiteOr(legacy.loyaltyDiscountPct, 0), active: true });
    }
    if (finiteOr(legacy.basicDealDiscountPct, 0) > 0) {
      migrated.push({ id: `${periodId}-legacy-basic`, kind: "basic_deal", name: "Basic Deal", discountPct: finiteOr(legacy.basicDealDiscountPct, 0), active: true });
    }
    discounts = migrated;
  }

  return {
    id: periodId,
    startDate: String(rawPeriod.startDate ?? "") as PricePeriod["startDate"],
    endDate: String(rawPeriod.endDate ?? "") as PricePeriod["endDate"],
    directFlexReferenceCents: finiteOr(rawPeriod.directFlexReferenceCents, 0),
    otaUpliftPct: finiteOr(rawPeriod.otaUpliftPct, finiteOr(legacy?.upliftPct, DEFAULT_OTA_UPLIFT_PCT)),
    nonRefundableDiscountPct: finiteOr(rawPeriod.nonRefundableDiscountPct, finiteOr(legacy?.nonRefundableDiscountPct, DEFAULT_NON_REFUNDABLE_DISCOUNT_PCT)),
    discounts,
  };
}

function normalizeConfig(raw: unknown, legacyOverride?: LegacyOtaSettings): PriceManagementConfig {
  const config = (raw ?? {}) as Partial<PriceManagementConfig> & { otaSettings?: LegacyOtaSettings };
  const legacy = legacyOverride ?? config.otaSettings;
  const periods = Array.isArray(config.periods)
    ? config.periods.map((period, index) => normalizePeriod(period, index, legacy))
    : [];
  return {
    propertyId: String(config.propertyId ?? ""),
    referenceRoomTypeId: config.referenceRoomTypeId ? String(config.referenceRoomTypeId) : null,
    basePricesCents: config.basePricesCents && typeof config.basePricesCents === "object" ? config.basePricesCents : {},
    periods,
    updatedAt: String(config.updatedAt ?? ""),
  };
}

function browserConfigs(): PriceManagementConfig[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.map((item) => normalizeConfig(item)) : [];
  } catch {
    return [];
  }
}

function persistBrowser(configs: PriceManagementConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

export class PriceManagementStore {
  private db: Database | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (isTauri()) {
      this.db = await Database.load("sqlite:revenue-manager.db");
      await this.db.execute(`CREATE TABLE IF NOT EXISTS price_management_config (
        property_id TEXT PRIMARY KEY,
        reference_room_type_id TEXT,
        base_prices_json TEXT NOT NULL DEFAULT '{}',
        ota_settings_json TEXT NOT NULL DEFAULT '{}',
        periods_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      )`);
      const columns = await this.db.select<SqlRow[]>("PRAGMA table_info(price_management_config)");
      if (!columns.some((row) => String(row.name) === "periods_json")) {
        await this.db.execute("ALTER TABLE price_management_config ADD COLUMN periods_json TEXT NOT NULL DEFAULT '[]'");
      }
      if (!columns.some((row) => String(row.name) === "ota_settings_json")) {
        await this.db.execute("ALTER TABLE price_management_config ADD COLUMN ota_settings_json TEXT NOT NULL DEFAULT '{}'");
      }
    }
    this.initialized = true;
  }

  private async database(): Promise<Database> {
    await this.initialize();
    if (!this.db) throw new Error("Base de dados indisponível.");
    return this.db;
  }

  async get(propertyId: string): Promise<PriceManagementConfig | null> {
    await this.initialize();
    if (!isTauri()) return browserConfigs().find((item) => item.propertyId === propertyId) ?? null;
    const rows = await (await this.database()).select<SqlRow[]>("SELECT * FROM price_management_config WHERE property_id=$1", [propertyId]);
    const row = rows[0];
    if (!row) return null;

    let basePricesCents: Record<string, number> = {};
    let rawPeriods: Partial<PricePeriod>[] = [];
    let legacy: LegacyOtaSettings | undefined;
    try { basePricesCents = JSON.parse(String(row.base_prices_json ?? "{}")); } catch { basePricesCents = {}; }
    try { rawPeriods = JSON.parse(String(row.periods_json ?? "[]")); } catch { rawPeriods = []; }
    try { legacy = JSON.parse(String(row.ota_settings_json ?? "{}")); } catch { legacy = undefined; }

    return normalizeConfig({
      propertyId: String(row.property_id),
      referenceRoomTypeId: row.reference_room_type_id ? String(row.reference_room_type_id) : null,
      basePricesCents,
      periods: rawPeriods as PricePeriod[],
      updatedAt: String(row.updated_at),
    }, legacy);
  }

  async save(config: PriceManagementConfig): Promise<void> {
    await this.initialize();
    const normalized = normalizeConfig(config);
    if (!isTauri()) {
      const configs = browserConfigs();
      const index = configs.findIndex((item) => item.propertyId === normalized.propertyId);
      if (index === -1) configs.push(normalized); else configs[index] = normalized;
      persistBrowser(configs);
      return;
    }
    await (await this.database()).execute(`INSERT INTO price_management_config (property_id,reference_room_type_id,base_prices_json,ota_settings_json,periods_json,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT(property_id) DO UPDATE SET reference_room_type_id=excluded.reference_room_type_id,base_prices_json=excluded.base_prices_json,ota_settings_json=excluded.ota_settings_json,periods_json=excluded.periods_json,updated_at=excluded.updated_at`,
      [normalized.propertyId, normalized.referenceRoomTypeId, JSON.stringify(normalized.basePricesCents), "{}", JSON.stringify(normalized.periods), normalized.updatedAt]);
  }
}

export const priceManagementStore = new PriceManagementStore();
