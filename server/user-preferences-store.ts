import { sql } from "drizzle-orm";
import { DB_PROVIDER } from "./db";
import { dbGet, dbRun } from "./db-query";
import { getPgPool } from "./pg-pool";

/** Toggle JSON blobs only (UI language feature removed). */
export type UserUiPreferences = {
  astToggleDefaults: Record<string, unknown> | null;
  hospitalToggleDefaults: Record<string, unknown> | null;
};

const DEFAULT_PREFS: UserUiPreferences = {
  astToggleDefaults: null,
  hospitalToggleDefaults: null,
};

const DB_LOCALE = "en";

export async function getUserPreferences(userId: number): Promise<UserUiPreferences> {
  if (DB_PROVIDER === "postgres") {
    const r = await getPgPool().query<{
      ast_toggle_defaults_json: string | null;
      hospital_toggle_defaults_json: string | null;
    }>(
      `SELECT ast_toggle_defaults_json, hospital_toggle_defaults_json
       FROM user_preferences WHERE user_id = $1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) return { ...DEFAULT_PREFS };
    return {
      astToggleDefaults: safeJson(row.ast_toggle_defaults_json),
      hospitalToggleDefaults: safeJson(row.hospital_toggle_defaults_json),
    };
  }
  const row = await dbGet<{
    ast_toggle_defaults_json: string | null;
    hospital_toggle_defaults_json: string | null;
  }>(
    sql`SELECT ast_toggle_defaults_json, hospital_toggle_defaults_json
        FROM user_preferences WHERE user_id = ${userId}`,
  );
  if (!row) return { ...DEFAULT_PREFS };
  return {
    astToggleDefaults: safeJson(row.ast_toggle_defaults_json),
    hospitalToggleDefaults: safeJson(row.hospital_toggle_defaults_json),
  };
}

function safeJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function upsertUserPreferences(
  userId: number,
  patch: Partial<{
    astToggleDefaults: Record<string, unknown> | null;
    hospitalToggleDefaults: Record<string, unknown> | null;
  }>,
): Promise<UserUiPreferences> {
  const existing = await getUserPreferences(userId);
  const next: UserUiPreferences = {
    astToggleDefaults:
      patch.astToggleDefaults !== undefined ? patch.astToggleDefaults : existing.astToggleDefaults,
    hospitalToggleDefaults:
      patch.hospitalToggleDefaults !== undefined
        ? patch.hospitalToggleDefaults
        : existing.hospitalToggleDefaults,
  };
  const astJson = next.astToggleDefaults ? JSON.stringify(next.astToggleDefaults) : null;
  const hospJson = next.hospitalToggleDefaults ? JSON.stringify(next.hospitalToggleDefaults) : null;
  const now = new Date().toISOString();

  if (DB_PROVIDER === "postgres") {
    await getPgPool().query(
      `INSERT INTO user_preferences (user_id, locale, ast_toggle_defaults_json, hospital_toggle_defaults_json, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         locale = EXCLUDED.locale,
         ast_toggle_defaults_json = EXCLUDED.ast_toggle_defaults_json,
         hospital_toggle_defaults_json = EXCLUDED.hospital_toggle_defaults_json,
         updated_at = EXCLUDED.updated_at`,
      [userId, DB_LOCALE, astJson, hospJson, now],
    );
    return next;
  }
  await dbRun(
    sql`INSERT INTO user_preferences (user_id, locale, ast_toggle_defaults_json, hospital_toggle_defaults_json, updated_at)
        VALUES (${userId}, ${DB_LOCALE}, ${astJson}, ${hospJson}, ${now})
        ON CONFLICT(user_id) DO UPDATE SET
          locale = excluded.locale,
          ast_toggle_defaults_json = excluded.ast_toggle_defaults_json,
          hospital_toggle_defaults_json = excluded.hospital_toggle_defaults_json,
          updated_at = excluded.updated_at`,
  );
  return next;
}
