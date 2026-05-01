import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { DB_PROVIDER } from "./db";
import { dbAll, dbRun } from "./db-query";

function splitSqlStatements(script: string): string[] {
  return script
    .split(/;\s*(?:\r?\n|$)/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ensureMigrationTable() {
  await dbRun(sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
}

export async function runPendingMigrations() {
  await ensureMigrationTable();
  const folder =
    DB_PROVIDER === "postgres"
      ? path.resolve(process.cwd(), "migrations-pg")
      : path.resolve(process.cwd(), "migrations");
  if (!fs.existsSync(folder)) return;

  const files = fs
    .readdirSync(folder)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const appliedRows = await dbAll<{ id: string }>(sql`SELECT id FROM schema_migrations`);
  const applied = new Set(appliedRows.map((r) => r.id));

  for (const file of files) {
    if (applied.has(file)) continue;
    const script = fs.readFileSync(path.join(folder, file), "utf8");
    const statements = splitSqlStatements(script);
    for (const statement of statements) {
      await dbRun(sql.raw(statement));
    }
    await dbRun(
      sql`INSERT INTO schema_migrations (id, applied_at) VALUES (${file}, ${new Date().toISOString()})`,
    );
  }
}

