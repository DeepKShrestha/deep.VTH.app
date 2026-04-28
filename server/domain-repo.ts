import type { Breakpoint, InsertBreakpoint } from "@shared/schema";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "./db-query";

type BreakpointRow = {
  id: number;
  antibiotic: string;
  symbol: string;
  content: string;
  sensitive_min: number;
  intermediate_low: number | null;
  intermediate_high: number | null;
  resistant_max: number;
  primary_targets: string | null;
  is_preset: number | boolean;
};

function toBreakpoint(row: BreakpointRow): Breakpoint {
  return {
    id: row.id,
    antibiotic: row.antibiotic,
    symbol: row.symbol,
    content: row.content,
    sensitiveMin: row.sensitive_min,
    intermediateLow: row.intermediate_low,
    intermediateHigh: row.intermediate_high,
    resistantMax: row.resistant_max,
    primaryTargets: row.primary_targets,
    isPreset: Boolean(row.is_preset),
  };
}

export const domainRepo = {
  async getBreakpoints(): Promise<Breakpoint[]> {
    const rows = await dbAll<BreakpointRow>(
      sql`SELECT id, antibiotic, symbol, content, sensitive_min, intermediate_low, intermediate_high, resistant_max, primary_targets, is_preset
          FROM breakpoints
          ORDER BY antibiotic ASC, symbol ASC`,
    );
    return rows.map(toBreakpoint);
  },

  async getBreakpoint(id: number): Promise<Breakpoint | undefined> {
    const row = await dbGet<BreakpointRow>(
      sql`SELECT id, antibiotic, symbol, content, sensitive_min, intermediate_low, intermediate_high, resistant_max, primary_targets, is_preset
          FROM breakpoints
          WHERE id = ${id}`,
    );
    return row ? toBreakpoint(row) : undefined;
  },

  async createBreakpoint(data: InsertBreakpoint): Promise<Breakpoint> {
    await dbRun(
      sql`INSERT INTO breakpoints
          (antibiotic, symbol, content, sensitive_min, intermediate_low, intermediate_high, resistant_max, primary_targets, is_preset)
          VALUES (
            ${data.antibiotic},
            ${data.symbol},
            ${data.content},
            ${data.sensitiveMin},
            ${data.intermediateLow ?? null},
            ${data.intermediateHigh ?? null},
            ${data.resistantMax},
            ${data.primaryTargets ?? null},
            ${data.isPreset ? 1 : 0}
          )`,
    );
    const created = await dbGet<BreakpointRow>(
      sql`SELECT id, antibiotic, symbol, content, sensitive_min, intermediate_low, intermediate_high, resistant_max, primary_targets, is_preset
          FROM breakpoints
          ORDER BY id DESC
          LIMIT 1`,
    );
    if (!created) {
      throw new Error("Failed to create breakpoint");
    }
    return toBreakpoint(created);
  },

  async updateBreakpoint(
    id: number,
    patch: Partial<InsertBreakpoint>,
  ): Promise<Breakpoint | undefined> {
    const existing = await this.getBreakpoint(id);
    if (!existing) return undefined;
    const next = {
      antibiotic: patch.antibiotic ?? existing.antibiotic,
      symbol: patch.symbol ?? existing.symbol,
      content: patch.content ?? existing.content,
      sensitiveMin: patch.sensitiveMin ?? existing.sensitiveMin,
      intermediateLow:
        patch.intermediateLow === undefined
          ? existing.intermediateLow
          : patch.intermediateLow,
      intermediateHigh:
        patch.intermediateHigh === undefined
          ? existing.intermediateHigh
          : patch.intermediateHigh,
      resistantMax: patch.resistantMax ?? existing.resistantMax,
      primaryTargets:
        patch.primaryTargets === undefined
          ? existing.primaryTargets
          : patch.primaryTargets,
      isPreset: patch.isPreset ?? existing.isPreset,
    };
    await dbRun(
      sql`UPDATE breakpoints
          SET antibiotic = ${next.antibiotic},
              symbol = ${next.symbol},
              content = ${next.content},
              sensitive_min = ${next.sensitiveMin},
              intermediate_low = ${next.intermediateLow ?? null},
              intermediate_high = ${next.intermediateHigh ?? null},
              resistant_max = ${next.resistantMax},
              primary_targets = ${next.primaryTargets ?? null},
              is_preset = ${next.isPreset ? 1 : 0}
          WHERE id = ${id}`,
    );
    return this.getBreakpoint(id);
  },

  async deleteBreakpoint(id: number): Promise<void> {
    await dbRun(sql`DELETE FROM breakpoints WHERE id = ${id}`);
  },
};
