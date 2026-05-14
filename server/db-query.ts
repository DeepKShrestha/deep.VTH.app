import { type SQL } from "drizzle-orm";
import { db, DB_PROVIDER } from "./db";
import { getPgPool } from "./pg-pool";

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

/**
 * Run an INSERT and return the new row's `id`, atomically.
 *
 * Avoids the race window of "INSERT … then SELECT ORDER BY id DESC LIMIT 1",
 * which can return the wrong row under concurrent inserts. Uses
 * `lastInsertRowid` on SQLite and appends `RETURNING id` on Postgres.
 *
 * The INSERT statement passed in MUST NOT already contain a RETURNING clause.
 */
export async function dbInsertReturningId(query: SQL): Promise<number> {
  if (DB_PROVIDER === "postgres") {
    const { text, values } = pgSqlToText(query);
    const result = await getPgPool().query<{ id: number | string }>(
      `${text} RETURNING id`,
      values,
    );
    const id = result.rows[0]?.id;
    if (id == null) {
      throw new Error("INSERT … RETURNING id produced no row");
    }
    return Number(id);
  }
  const result = db.run(query);
  const id = result.lastInsertRowid;
  if (id == null) {
    throw new Error("INSERT did not return a lastInsertRowid");
  }
  return Number(id);
}
