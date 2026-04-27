import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";

type DbProvider = "sqlite" | "postgres";
const rawProvider = (process.env.DB_PROVIDER || "sqlite").toLowerCase();
export const DB_PROVIDER: DbProvider =
  rawProvider === "postgres" ? "postgres" : "sqlite";

const DEFAULT_DB_FILE = path.resolve(process.cwd(), "data.db");
export const DB_FILE = process.env.DB_FILE || DEFAULT_DB_FILE;

if (DB_PROVIDER === "postgres") {
  throw new Error(
    "DB_PROVIDER=postgres runtime is not enabled yet. Keep DB_PROVIDER=sqlite for app runtime and use db:push:pg/check:pg for Postgres prep.",
  );
}

const sqlite = new Database(DB_FILE);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });