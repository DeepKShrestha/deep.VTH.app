import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";
import fs from "fs";

type DbProvider = "sqlite" | "postgres";
const rawProvider = (process.env.DB_PROVIDER || "sqlite").toLowerCase();
export const DB_PROVIDER: DbProvider =
  rawProvider === "postgres" ? "postgres" : "sqlite";

const DEFAULT_DB_FILE = path.resolve(process.cwd(), "data.db");
export const DB_FILE = process.env.DB_FILE || DEFAULT_DB_FILE;

if (DB_PROVIDER === "sqlite") {
  const dbDir = path.dirname(DB_FILE);
  if (dbDir && dbDir !== "." && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

let sqliteDriver = new Database(DB_PROVIDER === "sqlite" ? DB_FILE : ":memory:");
sqliteDriver.pragma("journal_mode = WAL");

/** Live binding so callers see a new instance after SQLite restore replaces the file on disk. */
export let db = drizzle(sqliteDriver, { schema });

/** Close SQLite before overwriting `DB_FILE` (e.g. restore). Call `resumeSqliteAfterExternalDiskReplace` after the new file is in place. */
export function suspendSqliteForExternalDiskReplace(): void {
  if (DB_PROVIDER !== "sqlite") return;
  sqliteDriver.close();
}

export function resumeSqliteAfterExternalDiskReplace(): void {
  if (DB_PROVIDER !== "sqlite") return;
  sqliteDriver = new Database(DB_FILE, { fileMustExist: true });
  sqliteDriver.pragma("journal_mode = WAL");
  db = drizzle(sqliteDriver, { schema });
}