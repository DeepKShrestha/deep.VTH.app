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

export const RESTORE_CONFIRM_PHRASE = "RESTORE_SITE_DATA";

type BackupMeta = {
  version: number;
  dbProvider?: string;
};

function psqlExecutable(): string {
  const pgBin = process.env.PG_BIN?.trim();
  const name = process.platform === "win32" ? "psql.exe" : "psql";
  return pgBin ? path.join(pgBin, name) : name;
}

async function runPsqlFile(dumpPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Postgres restore");
  const exe = psqlExecutable();
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(exe, ["--dbname", databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", dumpPath], {
      env: process.env,
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
      await runPsqlFile(dumpPath);
    } else {
      const sqlitePath = path.join(dbDir, "sqlite.db");
      if (!fs.existsSync(sqlitePath)) {
        throw new Error("Backup is missing db/sqlite.db (required for SQLite restore)");
      }
      suspendSqliteForExternalDiskReplace();
      try {
        await fsp.unlink(`${DB_FILE}-wal`).catch(() => {});
        await fsp.unlink(`${DB_FILE}-shm`).catch(() => {});
        await fsp.copyFile(sqlitePath, DB_FILE);
      } finally {
        resumeSqliteAfterExternalDiskReplace();
      }
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
          ? "Database SQL was applied and uploads restored where present. If errors persist, restart the Node process so DB connections refresh."
          : "SQLite file was replaced and uploads restored where present. Restart the Node process so all modules reload the database.",
    };
  } finally {
    await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
