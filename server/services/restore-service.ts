import AdmZip from "adm-zip";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  DB_PROVIDER,
  DB_FILE,
  suspendSqliteForExternalDiskReplace,
  resumeSqliteAfterExternalDiskReplace,
} from "../db";
import { getCaseAttachmentUploadDir, getProfilePhotoUploadDir } from "./backup-paths";
import { resolvePgTool } from "../libpq-bin";
import { getBackupSettings, type BackupSettingsClient } from "./backup-settings";

export const RESTORE_CONFIRM_PHRASE = "RESTORE_SITE_DATA";

type BackupMeta = {
  version: number;
  dbProvider?: string;
};

function libpqCompatibleDatabaseUrl(rawUrl: string): string {
  return rawUrl.replace(/sslmode=no-verify/gi, "sslmode=require");
}

/**
 * Match `backup-service.ts#libpqSubprocessEnv`: HOME is overridden so libpq
 * cannot try to auto-load an unreadable cert in the service user's home dir.
 */
function libpqSubprocessEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: os.tmpdir(),
    PGSSLMODE: process.env.PGSSLMODE ?? "require",
  };
}

async function runPsqlFile(dumpPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Postgres restore");
  const libpqUrl = libpqCompatibleDatabaseUrl(databaseUrl);
  const exe = resolvePgTool("psql");
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(exe, ["--dbname", libpqUrl, "-v", "ON_ERROR_STOP=1", "-f", dumpPath], {
      env: libpqSubprocessEnv(),
      windowsHide: true,
    });
    let err = "";
    proc.stderr.on("data", (c: Buffer) => {
      err += String(c);
    });
    proc.stdout.on("data", () => {});
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql exited ${code}: ${err || "unknown error"}`));
    });
  });
}

function pgLiteralString(value: string): string {
  // Use E'' escape form so a single backslash also escapes safely.
  return `E'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * Post-restore SQL that runs via psql (avoiding stale prepared statements in
 * the live pg pool). Wipes per-device session state and the prior owner's
 * backup history, then restores the *current* backup_settings so the user's
 * automatic-backup schedule and retention survive the restore.
 */
function buildPostRestoreSql(captured: BackupSettingsClient): string {
  const set = (key: string, value: string) =>
    `INSERT INTO backup_settings (key, value) VALUES (${pgLiteralString(key)}, ${pgLiteralString(value)})\n  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`;
  return [
    "-- vth-app post-restore cleanup",
    "TRUNCATE TABLE sessions;",
    "TRUNCATE TABLE backup_history;",
    set("auto_backup_enabled", captured.autoBackupEnabled ? "true" : "false"),
    set("auto_interval_hours", String(captured.autoIntervalHours)),
    set("retention_count", String(captured.retentionCount)),
    set("remote_upload_enabled", captured.remoteUploadEnabled ? "true" : "false"),
  ].join("\n");
}

async function runPostRestoreCleanupPostgres(captured: BackupSettingsClient): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return;
  const sqlText = buildPostRestoreSql(captured);
  const tmp = path.join(os.tmpdir(), `vth-restore-cleanup-${Date.now()}.sql`);
  await fsp.writeFile(tmp, sqlText, "utf8");
  try {
    const libpqUrl = libpqCompatibleDatabaseUrl(databaseUrl);
    const exe = resolvePgTool("psql");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(exe, ["--dbname", libpqUrl, "-v", "ON_ERROR_STOP=1", "-f", tmp], {
        env: libpqSubprocessEnv(),
        windowsHide: true,
      });
      let err = "";
      proc.stderr.on("data", (c: Buffer) => {
        err += String(c);
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`psql post-restore cleanup exited ${code}: ${err || "unknown"}`));
      });
    });
  } finally {
    await fsp.unlink(tmp).catch(() => {});
  }
}

/**
 * Resolve a zip entry path safely under `root`. Rejects:
 *   - absolute paths ("/foo", "C:\foo")
 *   - paths whose resolved location escapes `root` via "..", embedded
 *     null bytes, or platform-specific tricks ("\\?\")
 *   - paths that resolve to `root` itself
 *
 * Returns the resolved absolute target path on success.
 * Throws on any zip-slip attempt — the audit flagged this as critical.
 */
function safeJoin(root: string, entryName: string): string {
  if (typeof entryName !== "string" || entryName.includes("\0")) {
    throw new Error(`Backup archive contains an invalid entry name`);
  }
  // AdmZip normalizes to forward slashes; we still defend against backslash
  // sneaking in (Windows-built zips occasionally carry them).
  const normalized = entryName.replace(/\\/g, "/").replace(/^\/+/, "");
  if (path.isAbsolute(entryName) || /^[a-zA-Z]:[\\/]/.test(entryName)) {
    throw new Error(`Backup archive rejected absolute entry: ${entryName}`);
  }
  const target = path.resolve(root, normalized);
  const rootResolved = path.resolve(root) + path.sep;
  if (!target.startsWith(rootResolved) && target !== path.resolve(root)) {
    throw new Error(`Backup archive contains unsafe path: ${entryName}`);
  }
  return target;
}

async function writeTempBuffer(buf: Buffer, destRoot: string): Promise<string> {
  const tmpPath = path.join(destRoot, "__incoming.zip");
  await fsp.writeFile(tmpPath, buf);
  return tmpPath;
}

async function extractZipSafely(zipPath: string, destRoot: string): Promise<void> {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  for (const entry of entries) {
    // AdmZip flags directory entries with `isDirectory`. We still validate
    // them through safeJoin so a malicious "../" directory entry can't be
    // created above destRoot.
    const target = safeJoin(destRoot, entry.entryName);
    if (entry.isDirectory) {
      await fsp.mkdir(target, { recursive: true });
      continue;
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const data = entry.getData();
    await fsp.writeFile(target, data);
  }
}

export async function restoreSiteFromZip(params: {
  /** Full path to the uploaded zip on disk. Prefer this over an in-memory buffer. */
  zipPath?: string;
  /** Deprecated: in-memory buffer (kept for back-compat with older callers). */
  zipBuffer?: Buffer;
  confirmPhrase: string;
}): Promise<{ detail: string }> {
  if (params.confirmPhrase !== RESTORE_CONFIRM_PHRASE) {
    throw new Error(`Type the confirmation phrase exactly: ${RESTORE_CONFIRM_PHRASE}`);
  }

  const zipSource: Buffer | string | undefined = params.zipPath ?? params.zipBuffer;
  if (!zipSource) {
    throw new Error("restoreSiteFromZip requires zipPath or zipBuffer");
  }

  const zip = new AdmZip(zipSource as never);
  const metaEntry = zip.getEntry("meta.json");
  if (!metaEntry) throw new Error("Invalid backup archive: missing meta.json");

  let meta: BackupMeta;
  try {
    meta = JSON.parse(metaEntry.getData().toString("utf8")) as BackupMeta;
  } catch {
    throw new Error("Invalid backup archive: meta.json is not valid JSON");
  }
  if (meta.version !== 1) throw new Error(`Unsupported backup format version: ${meta.version}`);
  const backedProvider = String(meta.dbProvider || "").toLowerCase();
  if (backedProvider !== DB_PROVIDER) {
    throw new Error(
      `This backup was created on ${meta.dbProvider ?? "?"} but this server uses ${DB_PROVIDER}. Restore must match.`,
    );
  }

  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "vth-restore-"));
  try {
    await extractZipSafely(
      typeof zipSource === "string" ? zipSource : await writeTempBuffer(zipSource, tmpRoot),
      tmpRoot,
    );

    const dbDir = path.join(tmpRoot, "db");

    if (DB_PROVIDER === "postgres") {
      const dumpPath = path.join(dbDir, "dump.sql");
      if (!fs.existsSync(dumpPath)) {
        throw new Error("Backup is missing db/dump.sql (required for Postgres restore)");
      }
      // Capture the current backup schedule + retention BEFORE the dump
      // overwrites it so we can re-apply it post-restore. Falls back silently
      // if the live DB is in a bad state — defaults will be re-seeded.
      let capturedSettings: BackupSettingsClient | null = null;
      try {
        capturedSettings = await getBackupSettings();
      } catch {
        capturedSettings = null;
      }
      await runPsqlFile(dumpPath);
      // Post-restore: wipe sessions + backup_history that came from the dump,
      // and re-apply this server's backup_settings.
      const settingsToApply: BackupSettingsClient = capturedSettings ?? {
        autoBackupEnabled: false,
        autoIntervalHours: 24,
        retentionCount: 7,
        remoteUploadEnabled: false,
      };
      await runPostRestoreCleanupPostgres(settingsToApply);
    } else {
      const sqlitePath = path.join(dbDir, "sqlite.db");
      if (!fs.existsSync(sqlitePath)) {
        throw new Error("Backup is missing db/sqlite.db (required for SQLite restore)");
      }
      let capturedSettings: BackupSettingsClient | null = null;
      try {
        capturedSettings = await getBackupSettings();
      } catch {
        capturedSettings = null;
      }
      suspendSqliteForExternalDiskReplace();
      try {
        await fsp.unlink(`${DB_FILE}-wal`).catch(() => {});
        await fsp.unlink(`${DB_FILE}-shm`).catch(() => {});
        await fsp.copyFile(sqlitePath, DB_FILE);
      } finally {
        resumeSqliteAfterExternalDiskReplace();
      }
      // SQLite equivalent of the Postgres cleanup. Use dbRun against the
      // freshly re-opened connection.
      const { dbRun } = await import("../db-query");
      const { sql: drizzleSql } = await import("drizzle-orm");
      const settingsToApply: BackupSettingsClient = capturedSettings ?? {
        autoBackupEnabled: false,
        autoIntervalHours: 24,
        retentionCount: 7,
        remoteUploadEnabled: false,
      };
      await dbRun(drizzleSql`DELETE FROM sessions`).catch(() => {});
      await dbRun(drizzleSql`DELETE FROM backup_history`).catch(() => {});
      const upsert = async (key: string, value: string) => {
        await dbRun(
          drizzleSql`INSERT INTO backup_settings (key, value) VALUES (${key}, ${value})
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).catch(() => {});
      };
      await upsert("auto_backup_enabled", settingsToApply.autoBackupEnabled ? "true" : "false");
      await upsert("auto_interval_hours", String(settingsToApply.autoIntervalHours));
      await upsert("retention_count", String(settingsToApply.retentionCount));
      await upsert("remote_upload_enabled", settingsToApply.remoteUploadEnabled ? "true" : "false");
    }

    const filesDir = path.join(tmpRoot, "files");
    const uploadDir = getCaseAttachmentUploadDir();
    if (fs.existsSync(filesDir)) {
      await fsp.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
      await fsp.mkdir(uploadDir, { recursive: true });
      await fsp.cp(filesDir, uploadDir, { recursive: true });
    }

    const profileExtractDir = path.join(tmpRoot, "profile-photos");
    const profileDest = getProfilePhotoUploadDir();
    if (fs.existsSync(profileExtractDir)) {
      await fsp.rm(profileDest, { recursive: true, force: true }).catch(() => {});
      await fsp.mkdir(profileDest, { recursive: true });
      await fsp.cp(profileExtractDir, profileDest, { recursive: true });
    }

    return {
      detail:
        DB_PROVIDER === "postgres"
          ? "Database SQL was applied and uploads restored. Active sessions and prior backup history were cleared; your live backup schedule was preserved. If errors persist, restart the Node process so DB connections refresh."
          : "SQLite file was replaced and uploads restored. Active sessions and prior backup history were cleared; your live backup schedule was preserved. Restart the Node process so all modules reload the database.",
    };
  } finally {
    await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
