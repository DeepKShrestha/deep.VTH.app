import fs from "node:fs";
import { sql } from "drizzle-orm";
import { dbAll, dbRun } from "./db-query";

const DEFAULT_MAX_AGE_HOURS = 72;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function cleanupStaleTempCaseAttachments(): Promise<number> {
  const hoursRaw = Number(process.env.TEMP_ATTACHMENTS_MAX_AGE_HOURS);
  const maxAgeHours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : DEFAULT_MAX_AGE_HOURS;
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  const rows = await dbAll<{ id: number; storage_path: string }>(
    sql`SELECT id, storage_path FROM case_attachments WHERE case_id IS NULL AND created_at < ${cutoff}`,
  );
  for (const row of rows) {
    try {
      if (row.storage_path && fs.existsSync(row.storage_path)) {
        fs.unlinkSync(row.storage_path);
      }
    } catch {
      // continue
    }
  }
  if (rows.length === 0) return 0;
  await dbRun(sql`DELETE FROM case_attachments WHERE case_id IS NULL AND created_at < ${cutoff}`);
  return rows.length;
}

export function scheduleTempCaseAttachmentCleanup(): void {
  const intervalRaw = Number(process.env.TEMP_ATTACHMENTS_CLEANUP_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(intervalRaw) && intervalRaw >= 60_000 ? intervalRaw : DEFAULT_INTERVAL_MS;
  const tick = () => {
    cleanupStaleTempCaseAttachments().catch((err) => {
      console.error(
        JSON.stringify({
          type: "temp_attachment_cleanup_error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  };
  tick();
  setInterval(tick, intervalMs).unref();
}
