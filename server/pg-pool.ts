import { Pool } from "pg";

/**
 * Single shared pg.Pool for the whole server process.
 *
 * Why this exists:
 *   Previously the codebase created three independent `new Pool({...})`
 *   instances (one in `server/index.ts`, one in `server/db-query.ts`, one in
 *   `server/routes/context.ts`). That triples connection use against the same
 *   database and complicates clean shutdown. Everything Postgres-related now
 *   funnels through the helpers below.
 */

let pgPool: Pool | null = null;

export function getPgPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
  }
  if (!pgPool) {
    pgPool = new Pool({ connectionString: url });
  }
  return pgPool;
}

/** Closes the shared pool. Idempotent. Safe to call during graceful shutdown. */
export async function closePgPool(): Promise<void> {
  if (!pgPool) return;
  const toClose = pgPool;
  pgPool = null;
  try {
    await toClose.end();
  } catch {
    // Pool may already be ended or never used; swallow.
  }
}
