import { sql } from "drizzle-orm";
import { dbRun } from "./db-query";

/**
 * Prune sessions when the app boots.
 * Default: delete only expired rows so deploys do not log everyone out.
 * Set WIPE_SESSIONS_ON_BOOT=true to force a full session wipe.
 */
export async function pruneSessionsOnBoot(): Promise<void> {
  if (process.env.WIPE_SESSIONS_ON_BOOT === "true") {
    console.warn(
      "[sessions] WIPE_SESSIONS_ON_BOOT=true — deleting ALL sessions; every user must log in again.",
    );
    await dbRun(sql`DELETE FROM sessions`);
    return;
  }
  await dbRun(
    sql`DELETE FROM sessions WHERE expires_at <= ${new Date().toISOString()}`,
  );
}
