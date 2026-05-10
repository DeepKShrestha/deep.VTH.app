import type { Duration, InsertDuration } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "../db-query";

type DurationRow = {
  id: number;
  name: string;
  value: number | null;
  created_at: string;
};

function toDuration(row: DurationRow): Duration {
  return {
    id: row.id,
    name: row.name,
    value: row.value,
    createdAt: row.created_at,
  };
}

const DURATION_SELECT = sql`SELECT id, name, value, created_at FROM durations`;

export const durationRepo = {
  async getDurations(): Promise<Duration[]> {
    const rows = await dbAll<DurationRow>(sql`${DURATION_SELECT} ORDER BY name ASC`);
    return rows.map(toDuration);
  },

  async getDuration(id: number): Promise<Duration | undefined> {
    const row = await dbGet<DurationRow>(sql`${DURATION_SELECT} WHERE id = ${id}`);
    return row ? toDuration(row) : undefined;
  },

  async createDuration(data: InsertDuration): Promise<Duration> {
    await dbRun(
      sql`INSERT INTO durations (name, value) VALUES (${data.name}, ${data.value ?? null})`,
    );
    const created = await dbGet<DurationRow>(sql`${DURATION_SELECT} ORDER BY id DESC LIMIT 1`);
    if (!created) throw new Error("Failed to create duration");
    return toDuration(created);
  },

  async updateDuration(id: number, patch: Partial<InsertDuration>): Promise<Duration | undefined> {
    const existing = await this.getDuration(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    await dbRun(
      sql`UPDATE durations SET name = ${next.name}, value = ${next.value ?? null} WHERE id = ${id}`,
    );
    return this.getDuration(id);
  },

  async deleteDuration(id: number): Promise<void> {
    await dbRun(sql`DELETE FROM durations WHERE id = ${id}`);
  },
};
