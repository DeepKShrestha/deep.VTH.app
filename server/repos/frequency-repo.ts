import type { Frequency, InsertFrequency } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "../db-query";

type FrequencyRow = {
  id: number;
  name: string;
  short_code: string | null;
  created_at: string;
};

function toFrequency(row: FrequencyRow): Frequency {
  return {
    id: row.id,
    name: row.name,
    shortCode: row.short_code,
    createdAt: row.created_at,
  };
}

const FREQUENCY_SELECT = sql`
  SELECT
    id,
    name,
    COALESCE(NULLIF(TRIM(short_code), ''), name) AS short_code,
    created_at
  FROM frequencies
`;

export const frequencyRepo = {
  async getFrequencies(): Promise<Frequency[]> {
    const rows = await dbAll<FrequencyRow>(
      sql`${FREQUENCY_SELECT} ORDER BY COALESCE(display_order, id) ASC, id ASC`,
    );
    return rows.map(toFrequency);
  },

  async getFrequency(id: number): Promise<Frequency | undefined> {
    const row = await dbGet<FrequencyRow>(sql`${FREQUENCY_SELECT} WHERE id = ${id}`);
    return row ? toFrequency(row) : undefined;
  },

  async createFrequency(data: InsertFrequency): Promise<Frequency> {
    const maxOrder = await dbGet<{ max: number }>(
      sql`SELECT COALESCE(MAX(display_order), 0) as max FROM frequencies`,
    );
    const displayOrder = Number(maxOrder?.max ?? 0) + 1000;
    await dbRun(
      sql`INSERT INTO frequencies (name, short_code, display_order) VALUES (${data.name}, ${data.shortCode ?? null}, ${displayOrder})`,
    );
    const created = await dbGet<FrequencyRow>(sql`${FREQUENCY_SELECT} ORDER BY id DESC LIMIT 1`);
    if (!created) throw new Error("Failed to create frequency");
    return toFrequency(created);
  },

  async updateFrequency(id: number, patch: Partial<InsertFrequency>): Promise<Frequency | undefined> {
    const existing = await this.getFrequency(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    await dbRun(
      sql`UPDATE frequencies SET name = ${next.name}, short_code = ${next.shortCode ?? null} WHERE id = ${id}`,
    );
    return this.getFrequency(id);
  },

  async deleteFrequency(id: number): Promise<void> {
    await dbRun(sql`DELETE FROM frequencies WHERE id = ${id}`);
  },
};
