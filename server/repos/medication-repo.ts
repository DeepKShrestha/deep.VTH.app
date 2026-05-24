import type { Medication, InsertMedication } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbInsertReturningId, dbRun } from "../db-query";

type MedicationRow = {
  id: number;
  name: string;
  description: string | null;
  medication_class: string | null;
  created_at: string;
};

function toMedication(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    medicationClass: row.medication_class,
    createdAt: row.created_at,
  };
}

const MEDICATION_SELECT = sql`SELECT id, name, description, medication_class, created_at FROM medications`;

export const medicationRepo = {
  async getMedications(): Promise<Medication[]> {
    const rows = await dbAll<MedicationRow>(
      sql`${MEDICATION_SELECT} ORDER BY COALESCE(display_order, id) ASC, id ASC`,
    );
    return rows.map(toMedication);
  },

  async getMedication(id: number): Promise<Medication | undefined> {
    const row = await dbGet<MedicationRow>(sql`${MEDICATION_SELECT} WHERE id = ${id}`);
    return row ? toMedication(row) : undefined;
  },

  async getMedicationByExactName(name: string): Promise<Medication | undefined> {
    const row = await dbGet<MedicationRow>(sql`${MEDICATION_SELECT} WHERE name = ${name}`);
    return row ? toMedication(row) : undefined;
  },

  async createMedication(data: InsertMedication): Promise<Medication> {
    const maxOrder = await dbGet<{ max: number }>(
      sql`SELECT COALESCE(MAX(display_order), 0) as max FROM medications`,
    );
    const displayOrder = Number(maxOrder?.max ?? 0) + 1000;
    const id = await dbInsertReturningId(
      sql`INSERT INTO medications (name, description, medication_class, display_order) VALUES (${data.name}, ${data.description ?? null}, ${data.medicationClass ?? null}, ${displayOrder})`,
    );
    const created = await dbGet<MedicationRow>(sql`${MEDICATION_SELECT} WHERE id = ${id}`);
    if (!created) throw new Error("Failed to create medication");
    return toMedication(created);
  },

  async updateMedication(id: number, patch: Partial<InsertMedication>): Promise<Medication | undefined> {
    const existing = await this.getMedication(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    await dbRun(
      sql`UPDATE medications SET name = ${next.name}, description = ${next.description ?? null}, medication_class = ${next.medicationClass ?? null} WHERE id = ${id}`,
    );
    return this.getMedication(id);
  },

  async deleteMedication(id: number): Promise<void> {
    await dbRun(sql`DELETE FROM medications WHERE id = ${id}`);
  },
};
