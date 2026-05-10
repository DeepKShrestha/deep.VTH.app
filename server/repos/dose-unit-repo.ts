import type { InsertDoseUnit, DoseUnit } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "../db-query";

type DoseUnitRow = {
  id: number;
  name: string;
  created_at: string;
};

function toDoseUnit(row: DoseUnitRow): DoseUnit {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

const DOSE_UNIT_SELECT = sql`SELECT id, name, created_at FROM dose_units`;

export const doseUnitRepo = {
  async getDoseUnits(): Promise<DoseUnit[]> {
    const rows = await dbAll<DoseUnitRow>(
      sql`${DOSE_UNIT_SELECT} ORDER BY COALESCE(display_order, id) ASC, id ASC`,
    );
    return rows.map(toDoseUnit);
  },

  async getDoseUnit(id: number): Promise<DoseUnit | undefined> {
    const row = await dbGet<DoseUnitRow>(sql`${DOSE_UNIT_SELECT} WHERE id = ${id}`);
    return row ? toDoseUnit(row) : undefined;
  },

  async createDoseUnit(data: InsertDoseUnit): Promise<DoseUnit> {
    const maxOrder = await dbGet<{ max: number }>(
      sql`SELECT COALESCE(MAX(display_order), 0) as max FROM dose_units`,
    );
    const displayOrder = Number(maxOrder?.max ?? 0) + 1000;
    await dbRun(sql`INSERT INTO dose_units (name, display_order) VALUES (${data.name}, ${displayOrder})`);
    const created = await dbGet<DoseUnitRow>(sql`${DOSE_UNIT_SELECT} ORDER BY id DESC LIMIT 1`);
    if (!created) throw new Error("Failed to create dose unit");
    return toDoseUnit(created);
  },

  async updateDoseUnit(id: number, patch: Partial<InsertDoseUnit>): Promise<DoseUnit | undefined> {
    const existing = await this.getDoseUnit(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    await dbRun(sql`UPDATE dose_units SET name = ${next.name} WHERE id = ${id}`);
    return this.getDoseUnit(id);
  },

  async deleteDoseUnit(id: number): Promise<void> {
    await dbRun(sql`DELETE FROM dose_units WHERE id = ${id}`);
  },
};
