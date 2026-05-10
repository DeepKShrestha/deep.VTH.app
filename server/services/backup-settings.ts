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

export async function updateBackupSettings(patch: Partial<BackupSettingsClient>): Promise<void> {
  const current = await getBackupSettings();
  const next = { ...current, ...patch };
  const entries: [string, string][] = [
    [KEYS.auto_backup_enabled, next.autoBackupEnabled ? "true" : "false"],
    [KEYS.auto_interval_hours, String(next.autoIntervalHours)],
    [KEYS.retention_count, String(next.retentionCount)],
    [KEYS.remote_upload_enabled, next.remoteUploadEnabled ? "true" : "false"],
  ];
  for (const [key, value] of entries) {
    await dbRun(sql`UPDATE backup_settings SET value = ${value} WHERE key = ${key}`);
  }
}
