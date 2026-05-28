/** Archiver v8 exports `ZipArchive`; `@types/archiver` targets the older factory API. */
// @ts-expect-error ZipArchive is provided at runtime by archiver@8
import { ZipArchive } from "archiver";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import os from "node:os";
import { sql } from "drizzle-orm";
import { DB_PROVIDER, backupLiveSqliteToFile } from "../db";
import { dbRun } from "../db-query";
import { buildS3ObjectKey, isS3Configured, uploadSiteBackupToS3 } from "./backup-remote";
import { getBackupSettings } from "./backup-settings";
import { getCaseAttachmentUploadDir, getProfilePhotoUploadDir, getSiteBackupDir } from "./backup-paths";

export type BackupKind = "manual" | "scheduled";

function timestampForFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function pgDumpExecutable(): string {
  const pgBin = process.env.PG_BIN?.trim();
  const name = process.platform === "win32" ? "pg_dump.exe" : "pg_dump";
  return pgBin ? path.join(pgBin, name) : name;
}

/**
 * Translate pg-driver-only SSL values in the URL to libpq equivalents that
 * `pg_dump` understands. `no-verify` (pg/Node) ≡ `require` (libpq, encrypted
 * but no chain validation).
 */
function libpqCompatibleDatabaseUrl(rawUrl: string): string {
  return rawUrl.replace(/sslmode=no-verify/gi, "sslmode=require");
}

async function runPgDumpSql(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Postgres backup");
  const libpqUrl = libpqCompatibleDatabaseUrl(databaseUrl);
  const exe = pgDumpExecutable();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      exe,
      ["--format=p", "--clean", "--if-exists", "--no-owner", "--dbname", libpqUrl],
      {
        env: { ...process.env, PGSSLMODE: process.env.PGSSLMODE ?? "require" },
        windowsHide: true,
      },
    );
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    let errBuf = "";
    proc.stderr.on("data", (c: Buffer) => {
      errBuf += String(c);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump failed (${code}): ${errBuf || "no stderr"}`));
    });
  });
  return Buffer.concat(chunks).toString("utf8");
}

async function zipSiteBackup(meta: Record<string, unknown>, options: { sqlDump?: string; sqliteTemp?: string }): Promise<string> {
  const backupDir = getSiteBackupDir();
  await fsp.mkdir(backupDir, { recursive: true });
  const filename = `site-${timestampForFilename()}.zip`;
  const outPath = path.join(backupDir, filename);
  const uploadDir = getCaseAttachmentUploadDir();

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);

    archive.append(JSON.stringify(meta, null, 2), { name: "meta.json" });

    if (DB_PROVIDER === "postgres" && options.sqlDump != null) {
      archive.append(options.sqlDump, { name: "db/dump.sql" });
    }
    if (DB_PROVIDER === "sqlite" && options.sqliteTemp) {
      archive.file(options.sqliteTemp, { name: "db/sqlite.db" });
    }

    if (fs.existsSync(uploadDir)) {
      const entries = fs.readdirSync(uploadDir);
      if (entries.length > 0) {
        archive.directory(uploadDir, "files");
      }
    }

    const profileDir = getProfilePhotoUploadDir();
    if (fs.existsSync(profileDir)) {
      const profileEntries = fs.readdirSync(profileDir);
      if (profileEntries.length > 0) {
        archive.directory(profileDir, "profile-photos");
      }
    }

    archive.finalize().catch(reject);
  });

  return outPath;
}

async function applyRetention(keepLast: number): Promise<void> {
  const backupDir = getSiteBackupDir();
  if (!fs.existsSync(backupDir)) return;
  const names = fs
    .readdirSync(backupDir)
    .filter((n) => /^site-\d{8}-\d{6}\.zip$/i.test(n));
  if (names.length <= keepLast) return;
  const sorted = names.sort().reverse();
  const toRemove = sorted.slice(keepLast);
  for (const n of toRemove) {
    try {
      await fsp.unlink(path.join(backupDir, n));
    } catch {
      // ignore
    }
  }
}

export async function runSiteBackup(kind: BackupKind): Promise<{
  filename: string;
  fullPath: string;
  sizeBytes: number;
  remoteKey: string | null;
}> {
  const settings = await getBackupSettings();
  const createdAt = new Date().toISOString();
  const meta = {
    version: 1,
    app: "vth-app",
    createdAt,
    dbProvider: DB_PROVIDER,
    nodeEnv: process.env.NODE_ENV || "development",
  };

  let sqliteTemp: string | undefined;
  let sqlDump: string | undefined;

  try {
    if (DB_PROVIDER === "postgres") {
      sqlDump = await runPgDumpSql();
    } else {
      sqliteTemp = path.join(os.tmpdir(), `vth-sqlite-${Date.now()}.db`);
      await backupLiveSqliteToFile(sqliteTemp);
    }

    const fullPath = await zipSiteBackup(meta, { sqlDump, sqliteTemp });
    if (sqliteTemp) {
      await fsp.unlink(sqliteTemp).catch(() => {});
    }

    const stat = await fsp.stat(fullPath);
    const filename = path.basename(fullPath);

    let remoteKey: string | null = null;
    if (settings.remoteUploadEnabled && isS3Configured()) {
      remoteKey = buildS3ObjectKey(filename);
      await uploadSiteBackupToS3(fullPath, remoteKey);
    }

    await dbRun(
      sql`INSERT INTO backup_history (created_at, kind, status, filename, size_bytes, error_message, remote_key, db_provider)
          VALUES (${createdAt}, ${kind}, ${"success"}, ${filename}, ${stat.size}, ${null}, ${remoteKey}, ${DB_PROVIDER})`,
    );

    await applyRetention(settings.retentionCount);

    return { filename, fullPath, sizeBytes: stat.size, remoteKey };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await dbRun(
      sql`INSERT INTO backup_history (created_at, kind, status, filename, size_bytes, error_message, remote_key, db_provider)
          VALUES (${createdAt}, ${kind}, ${"failed"}, ${""}, ${0}, ${msg}, ${null}, ${DB_PROVIDER})`,
    );
    if (sqliteTemp) await fsp.unlink(sqliteTemp).catch(() => {});
    throw err;
  }
}

export type LocalBackupFileInfo = {
  filename: string;
  sizeBytes: number;
  modifiedAt: string;
};

export function listLocalBackupFiles(): LocalBackupFileInfo[] {
  const backupDir = getSiteBackupDir();
  if (!fs.existsSync(backupDir)) return [];
  const out: LocalBackupFileInfo[] = [];
  for (const name of fs.readdirSync(backupDir)) {
    if (!/^site-\d{8}-\d{6}\.zip$/i.test(name)) continue;
    const fp = path.join(backupDir, name);
    try {
      const st = fs.statSync(fp);
      out.push({
        filename: name,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => (a.filename < b.filename ? 1 : -1));
}
