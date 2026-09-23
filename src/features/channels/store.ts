import { isTauri } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { ChannelCommissionRule } from "./types";

type SqlRow = Record<string, string | number | null>;

const STORAGE_KEY = "local-revenue-manager:channels:v1";

function browserRules(): ChannelCommissionRule[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as ChannelCommissionRule[]; } catch { return []; }
}

function persistBrowser(rules: ChannelCommissionRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export class ChannelCommissionStore {
  private db: Database | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (isTauri()) {
      this.db = await Database.load("sqlite:revenue-manager.db");
      await this.db.execute(`CREATE TABLE IF NOT EXISTS channel_commission_rules (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        name TEXT NOT NULL,
        aliases TEXT NOT NULL DEFAULT '',
        group_name TEXT NOT NULL DEFAULT '',
        commission_rate REAL NOT NULL DEFAULT 0,
        valid_from TEXT,
        valid_to TEXT,
        active INTEGER NOT NULL DEFAULT 1
      )`);
      await this.db.execute("CREATE INDEX IF NOT EXISTS idx_channel_commission_rules_property ON channel_commission_rules(property_id, active, valid_from)");
    }
    this.initialized = true;
  }

  private async database(): Promise<Database> {
    await this.initialize();
    if (!this.db) throw new Error("Base de dados indisponível.");
    return this.db;
  }

  async list(propertyId: string): Promise<ChannelCommissionRule[]> {
    await this.initialize();
    if (!isTauri()) {
      return browserRules().filter((rule) => rule.propertyId === propertyId)
        .sort((a, b) => a.name.localeCompare(b.name) || (b.validFrom ?? "").localeCompare(a.validFrom ?? ""));
    }
    const rows = await (await this.database()).select<SqlRow[]>(
      "SELECT * FROM channel_commission_rules WHERE property_id=$1 ORDER BY name, COALESCE(valid_from,'') DESC",
      [propertyId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      propertyId: String(row.property_id),
      name: String(row.name),
      aliases: String(row.aliases ?? ""),
      groupName: String(row.group_name ?? ""),
      commissionRate: Number(row.commission_rate),
      validFrom: row.valid_from ? String(row.valid_from) : null,
      validTo: row.valid_to ? String(row.valid_to) : null,
      active: Boolean(row.active),
    }));
  }

  async save(rule: ChannelCommissionRule): Promise<void> {
    if (!rule.name.trim()) throw new Error("O nome do canal é obrigatório.");
    if (!Number.isFinite(rule.commissionRate) || rule.commissionRate < 0 || rule.commissionRate > 100) {
      throw new Error("A comissão tem de estar entre 0% e 100%.");
    }
    if (rule.validFrom && rule.validTo && rule.validTo < rule.validFrom) {
      throw new Error("A data final não pode ser anterior à data inicial.");
    }
    await this.initialize();
    if (!isTauri()) {
      const rules = browserRules();
      const index = rules.findIndex((item) => item.id === rule.id);
      if (index < 0) rules.push(rule); else rules[index] = rule;
      persistBrowser(rules);
      return;
    }
    await (await this.database()).execute(`INSERT INTO channel_commission_rules
      (id,property_id,name,aliases,group_name,commission_rate,valid_from,valid_to,active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, aliases=excluded.aliases, group_name=excluded.group_name,
        commission_rate=excluded.commission_rate, valid_from=excluded.valid_from,
        valid_to=excluded.valid_to, active=excluded.active`,
      [rule.id, rule.propertyId, rule.name.trim(), rule.aliases.trim(), rule.groupName.trim(), rule.commissionRate, rule.validFrom, rule.validTo, rule.active ? 1 : 0],
    );
  }

  async delete(propertyId: string, id: string): Promise<void> {
    await this.initialize();
    if (!isTauri()) {
      persistBrowser(browserRules().filter((rule) => !(rule.propertyId === propertyId && rule.id === id)));
      return;
    }
    await (await this.database()).execute("DELETE FROM channel_commission_rules WHERE property_id=$1 AND id=$2", [propertyId, id]);
  }
}

export const channelCommissionStore = new ChannelCommissionStore();
