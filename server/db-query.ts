import { type SQL } from "drizzle-orm";
import { db, DB_PROVIDER } from "./db";
import { Pool } from "pg";

let pgPool: Pool | null = null;

function getPgPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
  }
  if (!pgPool) {
    pgPool = new Pool({ connectionString: url });
  }
  return pgPool;
}

function pgSqlToText(query: SQL): { text: string; values: unknown[] } {
  let index = 0;
  const built = query.toQuery({
    escapeName: (name: string) => name,
    escapeParam: () => `$${++index}`,
    escapeString: (value: string) => `'${value.replace(/'/g, "''")}'`,
  } as any);
  return { text: built.sql, values: built.params };
}

export async function dbRun(query: SQL): Promise<{ changes: number }> {
  if (DB_PROVIDER === "postgres") {
    const { text, values } = pgSqlToText(query);
    const result = await getPgPool().query(text, values);
    return { changes: result.rowCount ?? 0 };
  }
  const result = db.run(query);
  return { changes: result.changes ?? 0 };
}

export async function dbGet<T>(query: SQL): Promise<T | undefined> {
  if (DB_PROVIDER === "postgres") {
    const { text, values } = pgSqlToText(query);
    const result = await getPgPool().query(text, values);
    return (result.rows[0] as T | undefined) ?? undefined;
  }
  return db.get<T>(query);
}

export async function dbAll<T>(query: SQL): Promise<T[]> {
  if (DB_PROVIDER === "postgres") {
    const { text, values } = pgSqlToText(query);
    const result = await getPgPool().query(text, values);
    return result.rows as T[];
  }
  return db.all<T>(query);
}
