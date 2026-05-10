import type { InsertVeterinarian, Veterinarian } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "../db-query";

type VeterinarianRow = {
  id: number;
  full_name: string;
  nvc_registration_number: string;
  department: string;
  display_order: number;
  created_at: string;
};

function toVeterinarian(row: VeterinarianRow): Veterinarian {
  return {
    id: row.id,
    fullName: row.full_name,
    nvcRegistrationNumber: row.nvc_registration_number,
    department: row.department,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

const VET_SELECT = sql`SELECT id, full_name, nvc_registration_number, department, display_order, created_at FROM veterinarians`;

export const veterinarianRepo = {
  async getVeterinarians(): Promise<Veterinarian[]> {
    const rows = await dbAll<VeterinarianRow>(
      sql`${VET_SELECT} ORDER BY COALESCE(display_order, id) ASC, id ASC`,
    );
    return rows.map(toVeterinarian);
  },

  async getVeterinarian(id: number): Promise<Veterinarian | undefined> {
    const row = await dbGet<VeterinarianRow>(sql`${VET_SELECT} WHERE id = ${id}`);
    return row ? toVeterinarian(row) : undefined;
  },

  async createVeterinarian(data: InsertVeterinarian): Promise<Veterinarian> {
    const maxOrder = await dbGet<{ max: number }>(
      sql`SELECT COALESCE(MAX(display_order), 0) as max FROM veterinarians`,
    );
    const displayOrder = Number(maxOrder?.max ?? 0) + 1000;
    const now = new Date().toISOString();
    await dbRun(
      sql`INSERT INTO veterinarians (full_name, nvc_registration_number, department, display_order, created_at)
          VALUES (${data.fullName}, ${data.nvcRegistrationNumber}, ${data.department}, ${displayOrder}, ${now})`,
    );
    const created = await dbGet<VeterinarianRow>(sql`${VET_SELECT} ORDER BY id DESC LIMIT 1`);
    if (!created) throw new Error("Failed to create veterinarian");
    return toVeterinarian(created);
  },

  async deleteVeterinarian(id: number): Promise<void> {
    await dbRun(sql`DELETE FROM veterinarians WHERE id = ${id}`);
  },
};
