import { sql } from "drizzle-orm";
import { dbRun } from "./db-query";

/**
 * Prune sessions when the app boots.
 *
 * Default (since May 2026): wipe ALL session rows on every restart, so that a
 * server restart effectively logs everyone out. This is the safer posture for
 * a single-tenant clinic deployment — it makes restarts a natural credential
 * checkpoint and avoids long-lived sessions surviving across upgrades.
 *
 * To opt OUT of this behaviour (e.g. for a development laptop where you don't
 * want to log in every nodemon restart), set `WIPE_SESSIONS_ON_BOOT=false`.
 * Any other value, or leaving it unset, keeps the safe default.
 */
export async function pruneSessionsOnBoot(): Promise<void> {
  const optOut = process.env.WIPE_SESSIONS_ON_BOOT === "false";
  if (optOut) {
    // Conservative mode: only prune expired rows so active users stay logged in.
    await dbRun(
      sql`DELETE FROM sessions WHERE expires_at <= ${new Date().toISOString()}`,
    );
    return;
  }
  console.warn(
    "[sessions] Wiping all sessions on boot — every user must log in again. " +
      "Set WIPE_SESSIONS_ON_BOOT=false to keep active sessions across restarts.",
  );
  await dbRun(sql`DELETE FROM sessions`);
}
