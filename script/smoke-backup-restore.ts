/**
 * Isolated SQLite backup/restore smoke test (temp DB + temp dirs).
 * Run: npx tsx script/smoke-backup-restore.ts
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import AdmZip from "adm-zip";

async function readSmokeValue(dbFile: string): Promise<string | undefined> {
  const Database = (await import("better-sqlite3")).default;
  const d = new Database(dbFile, { fileMustExist: true });
  try {
    const row = d.prepare("SELECT v FROM _smoke_br WHERE id = 1").get() as { v: string } | undefined;
    return row?.v;
  } finally {
    d.close();
  }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vth-br-smoke-"));
  process.env.DB_PROVIDER = "sqlite";
  process.env.DB_FILE = path.join(tmp, "smoke.db");
  process.env.BACKUP_LOCAL_DIR = path.join(tmp, "site-backups");
  process.env.CASE_ATTACHMENTS_DIR = path.join(tmp, "case-attachments");
  delete process.env.DATABASE_URL;

  const repoDataDb = path.join(process.cwd(), "data.db");
  if (!fs.existsSync(repoDataDb)) {
    throw new Error(
      "smoke-backup-restore needs ./data.db (a normal dev DB). Fresh migrations alone do not create all tables.",
    );
  }
  await fsp.copyFile(repoDataDb, process.env.DB_FILE);

  const { runPendingMigrations } = await import("../server/migration-runner.js");
  const { sql } = await import("drizzle-orm");
  const { dbRun } = await import("../server/db-query.js");
  const { runSiteBackup, listLocalBackupFiles } = await import("../server/services/backup-service.js");
  const { restoreSiteFromZip, RESTORE_CONFIRM_PHRASE } = await import("../server/services/restore-service.js");

  await runPendingMigrations();

  await dbRun(
    sql`CREATE TABLE IF NOT EXISTS _smoke_br (id INTEGER PRIMARY KEY, v TEXT NOT NULL)`,
  );
  await dbRun(sql`DELETE FROM _smoke_br`);
  await dbRun(sql`INSERT INTO _smoke_br (id, v) VALUES (1, 'alpha')`);

  const uploadDir = process.env.CASE_ATTACHMENTS_DIR!;
  await fsp.mkdir(uploadDir, { recursive: true });
  await fsp.writeFile(path.join(uploadDir, "marker.txt"), "upload-ok", "utf8");

  const backup = await runSiteBackup("manual");
  if (!fs.existsSync(backup.fullPath)) throw new Error("backup zip missing");
  const zip = new AdmZip(backup.fullPath);
  const names = zip.getEntries().map((e) => e.entryName.replace(/\\/g, "/"));
  for (const req of ["meta.json", "db/sqlite.db", "files/marker.txt"]) {
    if (!names.some((n) => n === req || n.endsWith("/" + req))) {
      throw new Error(`zip missing entry: ${req}, have: ${names.slice(0, 20).join(", ")}...`);
    }
  }
  const meta = JSON.parse(zip.readAsText("meta.json")) as { version: number; dbProvider: string };
  if (meta.version !== 1 || meta.dbProvider !== "sqlite") {
    throw new Error(`unexpected meta: ${JSON.stringify(meta)}`);
  }

  const listed = listLocalBackupFiles();
  if (!listed.some((f) => f.filename === backup.filename)) {
    throw new Error("listLocalBackupFiles missing new backup");
  }

  await dbRun(sql`UPDATE _smoke_br SET v = 'corrupted' WHERE id = 1`);
  if ((await readSmokeValue(process.env.DB_FILE!)) !== "corrupted") {
    throw new Error("expected DB to show corrupted after update");
  }

  try {
    await restoreSiteFromZip({
      zipBuffer: fs.readFileSync(backup.fullPath),
      confirmPhrase: "wrong",
    });
    throw new Error("restore should reject wrong phrase");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(RESTORE_CONFIRM_PHRASE)) throw e;
  }

  await restoreSiteFromZip({
    zipBuffer: fs.readFileSync(backup.fullPath),
    confirmPhrase: RESTORE_CONFIRM_PHRASE,
  });

  const v = await readSmokeValue(process.env.DB_FILE!);
  if (v !== "alpha") {
    throw new Error(`after restore expected v=alpha, got ${String(v)}`);
  }
  const marker = await fsp.readFile(path.join(uploadDir, "marker.txt"), "utf8");
  if (marker !== "upload-ok") {
    throw new Error(`upload restore mismatch: ${marker}`);
  }

  const { suspendSqliteForExternalDiskReplace } = await import("../server/db.js");
  suspendSqliteForExternalDiskReplace();
  await fsp.rm(tmp, { recursive: true, force: true });
  console.log("smoke-backup-restore: OK (backup zip layout, phrase gate, sqlite restore + files)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
