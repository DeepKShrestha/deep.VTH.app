import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";

// Use different DB file in production (Render) vs local
const DB_FILE =
  process.env.NODE_ENV === "production" ? "data-prod.db" : "data.db";

const sqlite = new Database(DB_FILE);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });