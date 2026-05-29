import { sql } from "drizzle-orm";
import { dbAll, dbRun } from "../db-query";

export type BackupSettingsClient = {
  autoBackupEnabled: boolean;
  autoIntervalHours: number;
  retentionCount: number;
  remoteUploadEnabled: boolean;
};

const KEYS = {
  auto_backup_enabled: "auto_backup_enabled",
  auto_interval_hours: "auto_interval_hours",
  retention_count: "retention_count",
  remote_upload_enabled: "remote_upload_enabled",
} as const;

export async function getBackupSettings(): Promise<BackupSettingsClient> {
  const rows = await dbAll<{ key: string; value: string }>(
    sql`SELECT key, value FROM backup_settings`,
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    autoBackupEnabled: map.get(KEYS.auto_backup_enabled) === "true",
    autoIntervalHours: Math.max(1, Number(map.get(KEYS.auto_interval_hours) ?? "24") || 24),
    retentionCount: Math.max(1, Math.min(100, Number(map.get(KEYS.retention_count) ?? "7") || 7)),
    remoteUploadEnabled: map.get(KEYS.remote_upload_enabled) === "true",
  };
}

/**
 * Updates only the keys present in `patch`. Each setting is written
 * independently so rapid UI changes (toggle + retention) cannot race and
 * overwrite each other with stale values read from the database.
 */
export async function updateBackupSettings(patch: Partial<BackupSettingsClient>): Promise<void> {
  if (patch.autoBackupEnabled !== undefined) {
    await dbRun(
      sql`UPDATE backup_settings SET value = ${patch.autoBackupEnabled ? "true" : "false"} WHERE key = ${KEYS.auto_backup_enabled}`,
    );
  }
  if (patch.autoIntervalHours !== undefined) {
    const hours = Math.max(1, Math.floor(patch.autoIntervalHours));
    await dbRun(
      sql`UPDATE backup_settings SET value = ${String(hours)} WHERE key = ${KEYS.auto_interval_hours}`,
    );
  }
  if (patch.retentionCount !== undefined) {
    const count = Math.max(1, Math.min(100, Math.floor(patch.retentionCount)));
    await dbRun(
      sql`UPDATE backup_settings SET value = ${String(count)} WHERE key = ${KEYS.retention_count}`,
    );
  }
  if (patch.remoteUploadEnabled !== undefined) {
    await dbRun(
      sql`UPDATE backup_settings SET value = ${patch.remoteUploadEnabled ? "true" : "false"} WHERE key = ${KEYS.remote_upload_enabled}`,
    );
  }
}
