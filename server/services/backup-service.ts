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
import { dbAll, dbRun } from "../db-query";
import { buildS3ObjectKey, isS3Configured, uploadSiteBackupToS3 } from "./backup-remote";
import { getBackupSettings } from "./backup-settings";
import { getCaseAttachmentUploadDir, getProfilePhotoUploadDir, getSiteBackupDir } from "./backup-paths";
import { resolvePgTool } from "../libpq-bin";

export type BackupKind = "manual" | "scheduled";

function timestampForFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Translate pg-driver-only SSL values in the URL to libpq equivalents that
 * `pg_dump` understands. `no-verify` (pg/Node) ≡ `require` (libpq, encrypted
 * but no chain validation).
 */
function libpqCompatibleDatabaseUrl(rawUrl: string): string {
  return rawUrl.replace(/sslmode=no-verify/gi, "sslmode=require");
}

/**
 * Build env for libpq subprocesses (pg_dump / psql) that prevents libpq from
 * auto-loading whatever happens to be at `$HOME/.postgresql/postgresql.crt`.
 *
 * Even with `sslmode=require`, libpq stats the default client-cert path; if a
 * file exists but the runtime user cannot read it (e.g. left behind by an
 * earlier `psql` invocation as root), the connection aborts with a confusing
 * "Permission denied" error. Pointing `HOME` at the OS tmpdir gives libpq a
 * dir with no `.postgresql/` to find, so it cleanly skips client-cert lookup.
 */
function formatPgDumpFailure(code: number | null, stderr: string, exe: string): string {
  const base = `pg_dump failed (${code ?? "?"}): ${stderr.trim() || "no stderr"}`;
  if (!/server version mismatch/i.test(stderr)) {
    return base;
  }
  return (
    `${base}\n\n` +
    `The pg_dump binary (${exe}) is newer than your managed Postgres server. ` +
    `Ubuntu's postgresql-client is often ahead of DigitalOcean Managed Postgres.\n\n` +
    `Fix (pick one):\n` +
    `Install a PostgreSQL client whose pg_dump version is >= the server version, e.g.\n` +
    `  sudo apt install postgresql-client-18\n` +
    `  pg_dump --version\n` +
    `Optional: set PG_BIN=/usr/lib/postgresql/18/bin in .env if not on PATH.`
  );
}

function libpqSubprocessEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: os.tmpdir(),
    PGSSLMODE: process.env.PGSSLMODE ?? "require",
  };
}

async function runPgDumpSql(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Postgres backup");
  const libpqUrl = libpqCompatibleDatabaseUrl(databaseUrl);
  const exe = resolvePgTool("dump");
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      exe,
      ["--format=p", "--clean", "--if-exists", "--no-owner", "--dbname", libpqUrl],
      {
        env: libpqSubprocessEnv(),
        windowsHide: true,
      },
    );
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    let errBuf = "";
    proc.stderr.on("data", (c: Buffer) => {
      errBuf += String(c);
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `${exe} not found. Install postgresql-client (match your DB version), e.g. ` +
              `sudo apt install postgresql-client-18, then restart vth-app.`,
          ),
        );
        return;
      }
      reject(err);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(formatPgDumpFailure(code, errBuf, exe)));
    });
  });
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Tables we surface row counts for in `backup-summary.txt`. Keep this list
 * conservative — every entry runs a COUNT(*) so very wide tables would slow
 * scheduled backups. Anything missing is still captured in the dump.
 */
const SUMMARY_TABLE_NAMES = [
  "users",
  "cases",
  "case_attachments",
  "breakpoints",
  "species_options",
  "breed_options",
  "form_sections",
  "custom_questions",
  "download_requests",
  "password_reset_requests",
  "notification_states",
  "backup_history",
  "admin_action_logs",
  "form_edit_audit_logs",
  "sessions",
  "user_preferences",
  "veterinarians",
  "medications",
] as const;

async function getTableRowCounts(): Promise<Array<{ table: string; rows: number | string }>> {
  const out: Array<{ table: string; rows: number | string }> = [];
  for (const name of SUMMARY_TABLE_NAMES) {
    try {
      const rows = await dbAll<{ n: number | string }>(
        sql.raw(`SELECT COUNT(*) AS n FROM "${name}"`),
      );
      out.push({ table: name, rows: Number(rows[0]?.n ?? 0) });
    } catch {
      out.push({ table: name, rows: "n/a" });
    }
  }
  return out;
}

type DirStats = { fileCount: number; totalBytes: number };

function statsForDir(dir: string): DirStats {
  if (!fs.existsSync(dir)) return { fileCount: 0, totalBytes: 0 };
  let fileCount = 0;
  let totalBytes = 0;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      try {
        const st = fs.statSync(full);
        fileCount += 1;
        totalBytes += st.size;
      } catch {
        // skip
      }
    }
  }
  return { fileCount, totalBytes };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildEnvKeysSnapshot(): string {
  const keys = Object.keys(process.env)
    .filter((k) => {
      // Skip noise that varies per process restart and never matters for recovery.
      return !/^(PWD|OLDPWD|SHLVL|_)$/i.test(k);
    })
    .sort();
  return (
    `# env-keys.txt — names only, never values.\n` +
    `# Captured at ${new Date().toISOString()} by vth-app site backup.\n` +
    `# Use this on a fresh deploy as a checklist of vars to set in /opt/vth-app/.env.\n\n` +
    keys.join("\n") +
    "\n"
  );
}

function buildBackupSummary(args: {
  meta: Record<string, unknown>;
  rowCounts: Array<{ table: string; rows: number | string }>;
  uploads: DirStats;
  profiles: DirStats;
  dbDumpBytes: number | null;
  sqliteBytes: number | null;
}): string {
  const lines: string[] = [];
  lines.push(`# backup-summary.txt`);
  lines.push(`Created at:  ${args.meta.createdAt}`);
  lines.push(`DB provider: ${args.meta.dbProvider}`);
  lines.push(`Node env:    ${args.meta.nodeEnv}`);
  lines.push("");
  lines.push("## Database");
  if (args.dbDumpBytes != null) {
    lines.push(`Postgres dump: ${formatBytes(args.dbDumpBytes)}`);
  }
  if (args.sqliteBytes != null) {
    lines.push(`SQLite file:   ${formatBytes(args.sqliteBytes)}`);
  }
  lines.push("");
  lines.push("Row counts (table → rows):");
  const longest = Math.max(...args.rowCounts.map((r) => r.table.length), 0);
  for (const r of args.rowCounts) {
    lines.push(`  ${r.table.padEnd(longest, " ")}  ${r.rows}`);
  }
  lines.push("");
  lines.push("## Uploads");
  lines.push(
    `Case attachments: ${args.uploads.fileCount} files, ${formatBytes(args.uploads.totalBytes)} (treatment photos; DB rows in case_attachments table)`,
  );
  lines.push(
    "Hospital clinical JSON (custom_fields, treatment_details, form_questions) is in the database dump.",
  );
  lines.push(
    `Profile photos:   ${args.profiles.fileCount} files, ${formatBytes(args.profiles.totalBytes)}`,
  );
  lines.push("");
  lines.push("## Excluded (intentional)");
  lines.push("  - .env / secrets (see env-keys.txt for the name list)");
  lines.push("  - Forgot-password ID card uploads (ephemeral PII)");
  lines.push("  - OS / journal logs, code, node_modules, dist");
  lines.push("");
  return lines.join("\n");
}

function buildRestoreReadme(): string {
  return `VTH Management System — Site backup
===================================

This zip contains a point-in-time snapshot of the VTH app:

  meta.json            Format version + when this backup was created
  db/dump.sql          Full Postgres dump (or db/sqlite.db on SQLite)
  files/               Case attachments (PDFs, images uploaded to cases)
  profile-photos/      Per-user profile and ID photos
  backup-summary.txt   Row counts and upload sizes (sanity check)
  env-keys.txt         Names of env vars that were set when this was made
                       (no values — safe to share)

How to restore
--------------
1. Stand up a fresh VTH deploy (Droplet + Postgres) per
   docs/DIGITALOCEAN-DEPLOYMENT.md, including /opt/vth-app/.env.
2. Make sure the Postgres major version on the server matches what is
   recorded in meta.json (run \`psql -c "SHOW server_version;"\`).
3. In the running app, sign in as a superadmin.
4. Open Admin → Backup → Restore from zip.
5. Upload this zip file.
6. Type the confirmation phrase exactly: RESTORE_SITE_DATA
7. Click Restore. The current DB and uploads are wiped and replaced.
8. Restart the service so DB connections refresh:
       sudo systemctl restart vth-app

Notes
-----
- Restore does not bring back active sessions (everyone has to log in).
- Restore does not overwrite the current backup_settings — it keeps
  your live schedule and retention so you do not lose them by accident.
- All users / cases / breakpoints / form layouts / audit logs / etc. ARE
  restored from the dump.
- Hospital registration data in cases.custom_fields (history, vitals,
  vaccination history, tests, etc.) and cases.treatment_details are
  part of the database dump — not stored separately.
- Case photo uploads under files/ are included when present.
`;
}

async function zipSiteBackup(
  meta: Record<string, unknown>,
  options: {
    sqlDump?: string;
    sqliteTemp?: string;
    rowCounts: Array<{ table: string; rows: number | string }>;
  },
): Promise<string> {
  const backupDir = getSiteBackupDir();
  await fsp.mkdir(backupDir, { recursive: true });
  const filename = `site-${timestampForFilename()}.zip`;
  const outPath = path.join(backupDir, filename);
  const uploadDir = getCaseAttachmentUploadDir();
  const profileDir = getProfilePhotoUploadDir();

  const uploads = statsForDir(uploadDir);
  const profiles = statsForDir(profileDir);
  const dbDumpBytes = options.sqlDump != null ? Buffer.byteLength(options.sqlDump) : null;
  const sqliteBytes =
    options.sqliteTemp && fs.existsSync(options.sqliteTemp)
      ? fs.statSync(options.sqliteTemp).size
      : null;

  const summary = buildBackupSummary({
    meta,
    rowCounts: options.rowCounts,
    uploads,
    profiles,
    dbDumpBytes,
    sqliteBytes,
  });
  const readme = buildRestoreReadme();
  const envKeys = buildEnvKeysSnapshot();

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);

    archive.append(JSON.stringify(meta, null, 2), { name: "meta.json" });
    archive.append(summary, { name: "backup-summary.txt" });
    archive.append(readme, { name: "README.txt" });
    archive.append(envKeys, { name: "env-keys.txt" });

    if (DB_PROVIDER === "postgres" && options.sqlDump != null) {
      archive.append(options.sqlDump, { name: "db/dump.sql" });
    }
    if (DB_PROVIDER === "sqlite" && options.sqliteTemp) {
      archive.file(options.sqliteTemp, { name: "db/sqlite.db" });
    }

    if (uploads.fileCount > 0) {
      archive.directory(uploadDir, "files");
    }
    if (profiles.fileCount > 0) {
      archive.directory(profileDir, "profile-photos");
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

    const rowCounts = await getTableRowCounts();
    const fullPath = await zipSiteBackup(meta, { sqlDump, sqliteTemp, rowCounts });
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
