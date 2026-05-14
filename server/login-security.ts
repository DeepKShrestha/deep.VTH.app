import crypto from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import { sql } from "drizzle-orm";
import { DB_PROVIDER } from "./db";
import { dbGet, dbRun } from "./db-query";
import { getPgPool } from "./pg-pool";

export const LOCKOUT_MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
export const PENDING_2FA_TTL_MS = 5 * 60 * 1000;

export function generateTotpSecret(): string {
  return generateSecret();
}

export function buildTotpAuthUrl(params: {
  secret: string;
  issuer: string;
  accountName: string;
}): string {
  return generateURI({
    issuer: params.issuer,
    label: params.accountName,
    secret: params.secret,
  });
}

export function verifyTotpToken(secret: string, token: string): boolean {
  const cleaned = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const result = verifySync({
    secret,
    token: cleaned,
    epochTolerance: 30,
  });
  return result.valid === true;
}

export function isUserLocked(lockedUntil: string | null | undefined): boolean {
  if (!lockedUntil) return false;
  const t = Date.parse(lockedUntil);
  return Number.isFinite(t) && t > Date.now();
}

export async function clearLoginFailures(userId: number): Promise<void> {
  if (DB_PROVIDER === "postgres") {
    await getPgPool().query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [userId],
    );
    return;
  }
  await dbRun(
    sql`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ${userId}`,
  );
}

/**
 * Increments failed_login_attempts and sets locked_until when threshold hit.
 * Returns the new attempt count after increment.
 */
export async function recordLoginFailure(userId: number): Promise<number> {
  if (DB_PROVIDER === "postgres") {
    await getPgPool().query(
      `UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = $1`,
      [userId],
    );
    const r = await getPgPool().query<{ c: number; locked_until: string | null }>(
      `SELECT failed_login_attempts AS c, locked_until FROM users WHERE id = $1`,
      [userId],
    );
    const row = r.rows[0];
    const c = Number(row?.c ?? 0);
    if (c >= LOCKOUT_MAX_ATTEMPTS) {
      const until = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      await getPgPool().query(`UPDATE users SET locked_until = $1 WHERE id = $2`, [
        until,
        userId,
      ]);
    }
    return c;
  }
  await dbRun(
    sql`UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = ${userId}`,
  );
  const row = await dbGet<{ c: number; locked_until: string | null }>(
    sql`SELECT failed_login_attempts AS c, locked_until FROM users WHERE id = ${userId}`,
  );
  const c = Number(row?.c ?? 0);
  if (c >= LOCKOUT_MAX_ATTEMPTS) {
    const until = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    await dbRun(sql`UPDATE users SET locked_until = ${until} WHERE id = ${userId}`);
  }
  return c;
}

export async function saveTotpSecret(
  userId: number,
  secret: string | null,
  enabled: boolean,
): Promise<void> {
  if (DB_PROVIDER === "postgres") {
    await getPgPool().query(
      `UPDATE users SET totp_secret = $1, totp_enabled = $2 WHERE id = $3`,
      [secret, enabled, userId],
    );
    return;
  }
  await dbRun(
    sql`UPDATE users SET totp_secret = ${secret}, totp_enabled = ${enabled ? 1 : 0} WHERE id = ${userId}`,
  );
}

export async function createPendingTwoFactorToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PENDING_2FA_TTL_MS).toISOString();
  if (DB_PROVIDER === "postgres") {
    await getPgPool().query(
      `INSERT INTO pending_two_factor_login (token, user_id, expires_at) VALUES ($1, $2, $3)`,
      [token, userId, expiresAt],
    );
    return token;
  }
  await dbRun(
    sql`INSERT INTO pending_two_factor_login (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAt})`,
  );
  return token;
}

/** Returns userId if token valid, else undefined. Deletes the row on success. */
export async function consumePendingTwoFactorToken(token: string): Promise<number | undefined> {
  if (!token.trim()) return undefined;
  if (DB_PROVIDER === "postgres") {
    const r = await getPgPool().query<{ user_id: number; expires_at: string }>(
      `SELECT user_id, expires_at FROM pending_two_factor_login WHERE token = $1`,
      [token],
    );
    const row = r.rows[0];
    if (!row) return undefined;
    if (Date.now() > new Date(row.expires_at).getTime()) {
      await getPgPool().query(`DELETE FROM pending_two_factor_login WHERE token = $1`, [token]);
      return undefined;
    }
    await getPgPool().query(`DELETE FROM pending_two_factor_login WHERE token = $1`, [token]);
    return Number(row.user_id);
  }
  const row = await dbGet<{ user_id: number; expires_at: string }>(
    sql`SELECT user_id, expires_at FROM pending_two_factor_login WHERE token = ${token}`,
  );
  if (!row) return undefined;
  if (Date.now() > new Date(row.expires_at).getTime()) {
    await dbRun(sql`DELETE FROM pending_two_factor_login WHERE token = ${token}`);
    return undefined;
  }
  await dbRun(sql`DELETE FROM pending_two_factor_login WHERE token = ${token}`);
  return Number(row.user_id);
}

export async function pruneExpiredPendingTwoFactor(): Promise<void> {
  const iso = new Date().toISOString();
  if (DB_PROVIDER === "postgres") {
    await getPgPool().query(`DELETE FROM pending_two_factor_login WHERE expires_at < $1`, [iso]);
    return;
  }
  await dbRun(sql`DELETE FROM pending_two_factor_login WHERE expires_at < ${iso}`);
}
