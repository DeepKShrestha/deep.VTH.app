import fs from "node:fs";
import path from "node:path";

const PG_TOOL_NAMES = {
  dump: process.platform === "win32" ? "pg_dump.exe" : "pg_dump",
  psql: process.platform === "win32" ? "psql.exe" : "psql",
} as const;

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Resolve pg_dump / psql for site backup & restore.
 * Honors PG_BIN when the binary exists; otherwise scans common install paths.
 */
export function resolvePgTool(tool: "dump" | "psql"): string {
  const name = PG_TOOL_NAMES[tool];
  const pgBin = process.env.PG_BIN?.trim();
  if (pgBin) {
    const fromEnv = path.join(pgBin, name);
    if (fileExists(fromEnv)) return fromEnv;
  }

  const candidates = [
    "/usr/lib/postgresql/18/bin",
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
    "/usr/bin",
    "/usr/local/bin",
  ];
  for (const dir of candidates) {
    const full = path.join(dir, name);
    if (fileExists(full)) return full;
  }

  if (pgBin) {
    throw new Error(
      `PG_BIN is set to ${pgBin} but ${name} was not found there. ` +
        `Install the PostgreSQL client on the server, e.g. sudo apt install postgresql-client-18, ` +
        `then run: ls /usr/lib/postgresql/*/bin/${name}`,
    );
  }

  return name;
}
