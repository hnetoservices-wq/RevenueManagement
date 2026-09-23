import { isTauri } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { PriceManagementConfig, PricePeriod } from "./types";

type SqlRow = Record<string, string | number | null>;
const STORAGE_KEY = "local-revenue-manager:price-management:v1";

function normalizeConfig(config: PriceManagementConfig): PriceManagementConfig {
  return { ...config, periods: Array.isArray(config.periods) ? config.periods : [] };
}

function browserConfigs(): PriceManagementConfig[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try { return (JSON.parse(raw) as PriceManagementConfig[]).map(normalizeConfig); } catch { return []; }
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
        periods_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      )`);
      const columns = await this.db.select<SqlRow[]>("PRAGMA table_info(price_management_config)");
      if (!columns.some((row) => String(row.name) === "periods_json")) {
        await this.db.execute("ALTER TABLE price_management_config ADD COLUMN periods_json TEXT NOT NULL DEFAULT '[]'");
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
    let periods: PricePeriod[] = [];
    try { basePricesCents = JSON.parse(String(row.base_prices_json ?? "{}")); } catch { basePricesCents = {}; }
    try { periods = JSON.parse(String(row.periods_json ?? "[]")); } catch { periods = []; }
    return {
      propertyId: String(row.property_id),
      referenceRoomTypeId: row.reference_room_type_id ? String(row.reference_room_type_id) : null,
      basePricesCents,
      periods: Array.isArray(periods) ? periods : [],
      updatedAt: String(row.updated_at),
    };
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
    await (await this.database()).execute(`INSERT INTO price_management_config (property_id,reference_room_type_id,base_prices_json,periods_json,updated_at)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT(property_id) DO UPDATE SET reference_room_type_id=excluded.reference_room_type_id,base_prices_json=excluded.base_prices_json,periods_json=excluded.periods_json,updated_at=excluded.updated_at`,
      [normalized.propertyId, normalized.referenceRoomTypeId, JSON.stringify(normalized.basePricesCents), JSON.stringify(normalized.periods), normalized.updatedAt]);
  }
}

export const priceManagementStore = new PriceManagementStore();
