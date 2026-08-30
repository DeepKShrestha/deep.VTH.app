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
  // otplib's `epochTolerance` is in seconds (period defaults to 30s). 30
  // ≈ accepts the current step plus one on either side, which mirrors
  // common authenticator-app drift. Tighter than this rejects legitimate
  // codes near step boundaries; looser raises brute-force odds.
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

/** Unified login failure text — same for wrong password, active lock, and fresh lockout. */
export const LOGIN_FAILURE_MESSAGE =
  "Sign-in failed. Check your username and password. If you tried too many times, wait about 15 minutes or use Forgot password.";

/** User-facing message while an active account lock is in effect (internal/admin use). */
export function accountLockMessage(lockedUntil: string): string {
  const remainingMs = Date.parse(lockedUntil) - Date.now();
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const unit = minutes === 1 ? "minute" : "minutes";
  return `This account is temporarily locked after too many failed sign-in attempts. Try again in about ${minutes} ${unit}.`;
}

/** Message shown exactly when the 5th failed attempt in a window triggers a new lock. */
export const ACCOUNT_JUST_LOCKED_MESSAGE =
  "Too many failed attempts. This account is now locked for 15 minutes. You can retry after that window or contact an administrator.";

/**
 * If the account is not actively locked, clear a stale failure window so the
 * next wrong password shows "Invalid credentials" instead of instantly re-locking.
 */
export async function resetLoginFailureWindowIfUnlocked(
  userId: number,
  lockedUntil: string | null | undefined,
  failedAttempts: number,
): Promise<void> {
  if (isUserLocked(lockedUntil)) return;
  const lockExpired = Boolean(lockedUntil) && !isUserLocked(lockedUntil);
  const staleHighCount =
    failedAttempts >= LOCKOUT_MAX_ATTEMPTS && !isUserLocked(lockedUntil);
  if (lockExpired || staleHighCount) {
    await clearLoginFailures(userId);
  }
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
    const before = await getPgPool().query<{
      locked_until: string | null;
      failed_login_attempts: number;
    }>(`SELECT locked_until, failed_login_attempts FROM users WHERE id = $1`, [userId]);
    const row = before.rows[0];
    await resetLoginFailureWindowIfUnlocked(
      userId,
      row?.locked_until ?? null,
      Number(row?.failed_login_attempts ?? 0),
    );

    await getPgPool().query(
      `UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = $1`,
      [userId],
    );
    const r = await getPgPool().query<{ c: number }>(
      `SELECT failed_login_attempts AS c FROM users WHERE id = $1`,
      [userId],
    );
    const c = Number(r.rows[0]?.c ?? 0);
    if (c >= LOCKOUT_MAX_ATTEMPTS) {
      const until = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      await getPgPool().query(`UPDATE users SET locked_until = $1 WHERE id = $2`, [
        until,
        userId,
      ]);
    }
    return c;
  }

  const before = await dbGet<{ locked_until: string | null; failed_login_attempts: number }>(
    sql`SELECT locked_until, failed_login_attempts FROM users WHERE id = ${userId}`,
  );
  await resetLoginFailureWindowIfUnlocked(
    userId,
    before?.locked_until ?? null,
    Number(before?.failed_login_attempts ?? 0),
  );

  await dbRun(
    sql`UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = ${userId}`,
  );
  const row = await dbGet<{ c: number }>(
    sql`SELECT failed_login_attempts AS c FROM users WHERE id = ${userId}`,
  );
  const c = Number(row?.c ?? 0);
  if (c >= LOCKOUT_MAX_ATTEMPTS) {
    const until = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    await dbRun(sql`UPDATE users SET locked_until = ${until} WHERE id = ${userId}`);
  }
  return c;
}

export async function saveTotpConfiguration(
  userId: number,
  secret: string | null,
  modes: { loginEnabled: boolean; recoveryEnabled: boolean },
): Promise<void> {
  const enabled = secret != null && (modes.loginEnabled || modes.recoveryEnabled);
  if (DB_PROVIDER === "postgres") {
    await getPgPool().query(
      `UPDATE users SET totp_secret = $1, totp_enabled = $2, totp_login_enabled = $3, totp_recovery_enabled = $4 WHERE id = $5`,
      [secret, enabled, modes.loginEnabled, modes.recoveryEnabled, userId],
    );
    return;
  }
  await dbRun(
    sql`UPDATE users SET totp_secret = ${secret}, totp_enabled = ${enabled ? 1 : 0}, totp_login_enabled = ${modes.loginEnabled ? 1 : 0}, totp_recovery_enabled = ${modes.recoveryEnabled ? 1 : 0} WHERE id = ${userId}`,
  );
}

/** @deprecated Use saveTotpConfiguration */
export async function saveTotpSecret(
  userId: number,
  secret: string | null,
  enabled: boolean,
): Promise<void> {
  await saveTotpConfiguration(userId, secret, {
    loginEnabled: enabled,
    recoveryEnabled: enabled,
  });
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
