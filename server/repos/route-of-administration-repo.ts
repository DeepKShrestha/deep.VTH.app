import type { RouteOfAdministration, InsertRouteOfAdministration } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "../db-query";

type RouteOfAdministrationRow = {
  id: number;
  name: string;
  abbreviation: string;
  created_at: string;
};

function toRouteOfAdministration(row: RouteOfAdministrationRow): RouteOfAdministration {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    createdAt: row.created_at,
  };
}

const ROUTE_OF_ADMINISTRATION_SELECT = sql`
  SELECT
    id,
    name,
    COALESCE(NULLIF(TRIM(abbreviation), ''), name) AS abbreviation,
    created_at
  FROM routes_of_administration
`;

export const routeOfAdministrationRepo = {
  async getRoutesOfAdministration(): Promise<RouteOfAdministration[]> {
    const rows = await dbAll<RouteOfAdministrationRow>(
      sql`${ROUTE_OF_ADMINISTRATION_SELECT} ORDER BY COALESCE(display_order, id) ASC, id ASC`,
    );
    return rows.map(toRouteOfAdministration);
  },

  async getRouteOfAdministration(id: number): Promise<RouteOfAdministration | undefined> {
    const row = await dbGet<RouteOfAdministrationRow>(sql`${ROUTE_OF_ADMINISTRATION_SELECT} WHERE id = ${id}`);
    return row ? toRouteOfAdministration(row) : undefined;
  },

  async createRouteOfAdministration(data: InsertRouteOfAdministration): Promise<RouteOfAdministration> {
    const maxOrder = await dbGet<{ max: number }>(
      sql`SELECT COALESCE(MAX(display_order), 0) as max FROM routes_of_administration`,
    );
    const displayOrder = Number(maxOrder?.max ?? 0) + 1000;
    await dbRun(
      sql`INSERT INTO routes_of_administration (name, abbreviation, display_order)
          VALUES (${data.name}, ${data.abbreviation}, ${displayOrder})`,
    );
    const created = await dbGet<RouteOfAdministrationRow>(sql`${ROUTE_OF_ADMINISTRATION_SELECT} ORDER BY id DESC LIMIT 1`);
    if (!created) throw new Error("Failed to create route of administration");
    return toRouteOfAdministration(created);
  },

  async updateRouteOfAdministration(id: number, patch: Partial<InsertRouteOfAdministration>): Promise<RouteOfAdministration | undefined> {
    const existing = await this.getRouteOfAdministration(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch };
    await dbRun(
      sql`UPDATE routes_of_administration
          SET name = ${next.name},
              abbreviation = ${next.abbreviation}
          WHERE id = ${id}`,
    );
    return this.getRouteOfAdministration(id);
  },

  async deleteRouteOfAdministration(id: number): Promise<void> {
    await dbRun(sql`DELETE FROM routes_of_administration WHERE id = ${id}`);
  },
};
