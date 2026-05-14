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

type SqliteOpenOptions = ConstructorParameters<typeof Database>[1];

function openSqlite(
  target: string,
  options?: SqliteOpenOptions,
): InstanceType<typeof Database> {
  try {
    return options ? new Database(target, options) : new Database(target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    const message = err instanceof Error ? err.message : String(err);
    const isFileLock =
      /EBUSY|resource busy or locked|EPERM|being used by another process/i.test(message);
    const isAbiMismatch =
      !isFileLock &&
      (/NODE_MODULE_VERSION/.test(message) ||
        /was compiled against a different Node\.js version/i.test(message));
    if (isAbiMismatch) {
      const nodeVersion = process.versions.node;
      const abi = process.versions.modules;
      const hint =
        `better-sqlite3 native binary does not match this Node runtime ` +
        `(Node ${nodeVersion}, ABI ${abi}). ` +
        `Run \`npm rebuild better-sqlite3\` (or \`npm install\`) from the project root. ` +
        `\`npm run dev\` runs an ABI check first via \`script/dev-server.cjs\`; ` +
        `you can also run \`node script/ensure-sqlite-binary.cjs\` manually.`;
      const wrapped = new Error(hint);
      (wrapped as Error & { cause?: unknown }).cause = err;
      throw wrapped;
    }
    throw err;
  }
}

let sqliteDriver = openSqlite(DB_PROVIDER === "sqlite" ? DB_FILE : ":memory:");
sqliteDriver.pragma("journal_mode = WAL");
sqliteDriver.pragma("foreign_keys = ON");

/** Live binding so callers see a new instance after SQLite restore replaces the file on disk. */
export let db = drizzle(sqliteDriver, { schema });

/**
 * Hot-copy the live SQLite DB to another file using the same connection the app uses.
 * Prefer this over opening a second `better-sqlite3` handle to the same file (can SQLITE_BUSY on Windows).
 */
export async function backupLiveSqliteToFile(destPath: string): Promise<void> {
  if (DB_PROVIDER !== "sqlite") {
    throw new Error("backupLiveSqliteToFile is only available when DB_PROVIDER=sqlite");
  }
  await sqliteDriver.backup(destPath);
}

/** Close SQLite before overwriting `DB_FILE` (e.g. restore). Call `resumeSqliteAfterExternalDiskReplace` after the new file is in place. */
export function suspendSqliteForExternalDiskReplace(): void {
  if (DB_PROVIDER !== "sqlite") return;
  sqliteDriver.close();
}

export function resumeSqliteAfterExternalDiskReplace(): void {
  if (DB_PROVIDER !== "sqlite") return;
  sqliteDriver = openSqlite(DB_FILE, { fileMustExist: true });
  sqliteDriver.pragma("journal_mode = WAL");
  sqliteDriver.pragma("foreign_keys = ON");
  db = drizzle(sqliteDriver, { schema });
}