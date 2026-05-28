import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { dbAll, dbRun } from "./db-query";
import { getPasswordResetIdCardUploadDir } from "./services/backup-paths";
import {
  deletePasswordResetIdCardFile,
  ensurePasswordResetIdCardDir,
} from "./services/password-reset-id-card-store";

const DEFAULT_STALE_DAYS = 30;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

type PendingRow = {
  id: number;
  id_card_filename: string | null;
  created_at: string;
};

/** Remove files on disk that are not referenced by a pending request. */
export async function cleanupOrphanPasswordResetIdCards(): Promise<number> {
  await ensurePasswordResetIdCardDir();
  const dir = getPasswordResetIdCardUploadDir();
  if (!fs.existsSync(dir)) return 0;

  const pending = await dbAll<{ id_card_filename: string | null }>(
    sql`SELECT id_card_filename FROM password_reset_requests
        WHERE status = ${"pending"} AND id_card_filename IS NOT NULL`,
  );
  const allowed = new Set(
    pending
      .map((r) => r.id_card_filename)
      .filter((f): f is string => Boolean(f)),
  );

  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!allowed.has(name)) {
      await deletePasswordResetIdCardFile(name);
      removed += 1;
    }
  }
  return removed;
}

/** Auto-reject stale pending requests and delete their ID card files. */
export async function rejectStalePasswordResetRequests(): Promise<number> {
  const daysRaw = Number(process.env.PASSWORD_RESET_STALE_DAYS);
  const staleDays =
    Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : DEFAULT_STALE_DAYS;
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = await dbAll<PendingRow>(
    sql`SELECT id, id_card_filename, created_at
        FROM password_reset_requests
        WHERE status = ${"pending"} AND created_at < ${cutoff}`,
  );
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  for (const row of rows) {
    await deletePasswordResetIdCardFile(row.id_card_filename);
    await dbRun(
      sql`UPDATE password_reset_requests
          SET status = ${"rejected"},
              resolver_note = ${"Automatically rejected — request expired."},
              id_card_filename = NULL,
              resolved_at = ${now}
          WHERE id = ${row.id}`,
    );
  }
  return rows.length;
}

export async function runPasswordResetIdCardMaintenance(): Promise<void> {
  await rejectStalePasswordResetRequests();
  await cleanupOrphanPasswordResetIdCards();
}

export function schedulePasswordResetIdCardMaintenance(): void {
  const intervalRaw = Number(process.env.PASSWORD_RESET_ID_CARD_CLEANUP_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(intervalRaw) && intervalRaw >= 60_000
      ? intervalRaw
      : DEFAULT_INTERVAL_MS;

  const tick = () => {
    runPasswordResetIdCardMaintenance().catch((err) => {
      console.error(
        JSON.stringify({
          type: "password_reset_id_card_cleanup_error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  };

  tick();
  setInterval(tick, intervalMs).unref();
}
