import type { PasswordResetRequest, User } from "@shared/schema";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { dbAll, dbRun } from "./db-query";
import { getPgPool } from "./pg-pool";
import {
  invalidateAll as invalidateAllCachedUsers,
  invalidateToken as invalidateCachedToken,
  invalidateUserId as invalidateCachedUserId,
} from "./current-user-cache";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

/** Sessions with no API activity for this long count as offline in admin presence. */
const ACTIVE_PRESENCE_MAX_IDLE_MS = 3 * 60 * 1000;

/** Throttle `last_seen_at` writes — one update per session per interval. */
export const SESSION_LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

type Provider = "sqlite" | "postgres";

function getProvider(): Provider {
  return (process.env.DB_PROVIDER || "sqlite").toLowerCase() === "postgres"
    ? "postgres"
    : "sqlite";
}

function mapPgUser(row: Record<string, unknown>): User {
  return {
    id: Number(row.id),
    fullName: String(row.full_name),
    address: String(row.address),
    phone: String(row.phone),
    email: String(row.email),
    designation: String(row.designation),
    studentBatch: row.student_batch == null ? null : Number(row.student_batch),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    role: String(row.role),
    approved: Boolean(row.approved),
    createdAt: String(row.created_at),
    failedLoginAttempts:
      row.failed_login_attempts == null ? 0 : Number(row.failed_login_attempts),
    lockedUntil: row.locked_until == null ? null : String(row.locked_until),
    totpSecret: row.totp_secret == null ? null : String(row.totp_secret),
    totpEnabled: Boolean(row.totp_enabled),
    totpEnforced: Boolean(row.totp_enforced),
    profilePhotoPath:
      row.profile_photo_path == null || row.profile_photo_path === ""
        ? null
        : String(row.profile_photo_path),
  };
}

function mapPgPasswordResetRequest(
  row: Record<string, unknown>,
): PasswordResetRequest {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    requestedByRole: String(row.requested_by_role),
    passwordHash: String(row.password_hash),
    reason: row.reason == null ? null : String(row.reason),
    status: String(row.status),
    resolvedBy: row.resolved_by == null ? null : Number(row.resolved_by),
    resolverNote: row.resolver_note == null ? null : String(row.resolver_note),
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
  };
}

export const authSessionRepo = {
  async setSession(token: string, userId: number): Promise<void> {
    if (getProvider() === "sqlite") {
      await sessionsSqlite.set(token, userId);
      return;
    }

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await getPgPool().query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $3)
       ON CONFLICT(token) DO UPDATE SET
         user_id = excluded.user_id,
         expires_at = excluded.expires_at,
         last_seen_at = excluded.last_seen_at`,
      [token, userId, createdAt, expiresAt],
    );
  },

  async getSessionUserId(token: string): Promise<number | undefined> {
    if (getProvider() === "sqlite") {
      return sessionsSqlite.get(token);
    }

    const result = await getPgPool().query<{ user_id: number; expires_at: string }>(
      "SELECT user_id, expires_at FROM sessions WHERE token = $1",
      [token],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    if (Date.now() > new Date(row.expires_at).getTime()) {
      await this.deleteSession(token);
      return undefined;
    }
    const seen = new Date().toISOString();
    const throttleBefore = new Date(Date.now() - SESSION_LAST_SEEN_THROTTLE_MS).toISOString();
    await getPgPool().query(
      `UPDATE sessions SET last_seen_at = $1
       WHERE token = $2
         AND expires_at > NOW()
         AND (last_seen_at IS NULL OR last_seen_at < $3)`,
      [seen, token, throttleBefore],
    );
    return Number(row.user_id);
  },

  async getUserDisplayByIds(
    ids: number[],
  ): Promise<
    Map<
      number,
      { fullName: string; username: string; designation: string; role: string }
    >
  > {
    const unique = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
    if (unique.length === 0) return new Map();
    const rows = await dbAll<{
      id: number;
      full_name: string;
      username: string;
      designation: string;
      role: string;
    }>(
      sql`SELECT id, full_name, username, designation, role FROM users WHERE id IN (${sql.join(
        unique.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    return new Map(
      rows.map((r) => [
        r.id,
        {
          fullName: r.full_name,
          username: r.username,
          designation: r.designation,
          role: r.role,
        },
      ]),
    );
  },

  async deleteSession(token: string): Promise<void> {
    invalidateCachedToken(token);
    if (getProvider() === "sqlite") {
      await sessionsSqlite.delete(token);
      return;
    }
    await getPgPool().query("DELETE FROM sessions WHERE token = $1", [token]);
  },

  async clearSessions(): Promise<void> {
    invalidateAllCachedUsers();
    if (getProvider() === "sqlite") {
      await sessionsSqlite.clear();
      return;
    }
    await getPgPool().query("DELETE FROM sessions");
  },

  async deleteSessionsByUserId(userId: number): Promise<void> {
    invalidateCachedUserId(userId);
    if (getProvider() === "sqlite") {
      await sessionsSqlite.deleteByUserId(userId);
      return;
    }
    await getPgPool().query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  },

  async getActiveSessionUserIds(): Promise<number[]> {
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - ACTIVE_PRESENCE_MAX_IDLE_MS).toISOString();
    if (getProvider() === "sqlite") {
      const rows = await dbAll<{ user_id: number }>(
        sql`SELECT DISTINCT user_id
            FROM sessions
            WHERE expires_at > ${nowIso}
              AND last_seen_at IS NOT NULL
              AND last_seen_at > ${cutoffIso}`,
      );
      return rows.map((row) => Number(row.user_id));
    }
    const result = await getPgPool().query<{ user_id: number }>(
      `SELECT DISTINCT user_id FROM sessions
       WHERE expires_at > NOW()
         AND last_seen_at IS NOT NULL
         AND last_seen_at > $1`,
      [cutoffIso],
    );
    return result.rows.map((row) => Number(row.user_id));
  },

  async getUserById(id: number): Promise<User | undefined> {
    if (getProvider() === "sqlite") {
      return storage.getUserById(id);
    }
    const result = await getPgPool().query("SELECT * FROM users WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? mapPgUser(row) : undefined;
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    const normalized = username.trim();
    if (!normalized) return undefined;
    if (getProvider() === "sqlite") {
      return storage.getUserByUsername(normalized);
    }
    const result = await getPgPool().query(
      "SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
      [normalized],
    );
    const row = result.rows[0];
    return row ? mapPgUser(row) : undefined;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim();
    if (!normalized) return undefined;
    if (getProvider() === "sqlite") {
      return storage.getUserByEmail(normalized);
    }
    const result = await getPgPool().query(
      "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [normalized],
    );
    const row = result.rows[0];
    return row ? mapPgUser(row) : undefined;
  },

  async getUsers(): Promise<User[]> {
    if (getProvider() === "sqlite") {
      return storage.getUsers();
    }
    const result = await getPgPool().query("SELECT * FROM users ORDER BY created_at DESC");
    return result.rows.map((r) => mapPgUser(r as Record<string, unknown>));
  },

  async createUser(data: {
    fullName: string;
    address: string;
    phone: string;
    email: string;
    designation: string;
    studentBatch?: number | null;
    username: string;
    passwordHash: string;
    role: string;
    approved: boolean;
    profilePhotoPath?: string | null;
  }): Promise<User> {
    if (getProvider() === "sqlite") {
      return storage.createUser(data);
    }

    const createdAt = new Date().toISOString();
    const result = await getPgPool().query(
      `INSERT INTO users
      (full_name, address, phone, email, designation, student_batch, username, password_hash, role, approved, created_at, profile_photo_path)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        data.fullName,
        data.address,
        data.phone,
        data.email,
        data.designation,
        data.studentBatch ?? null,
        data.username,
        data.passwordHash,
        data.role,
        data.approved,
        createdAt,
        data.profilePhotoPath ?? null,
      ],
    );
    return mapPgUser(result.rows[0] as Record<string, unknown>);
  },

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    invalidateCachedUserId(id);
    if (getProvider() === "sqlite") {
      return storage.updateUser(id, data);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    const set = (column: string, value: unknown) => {
      updates.push(`${column} = $${index++}`);
      values.push(value);
    };

    if (data.fullName !== undefined) set("full_name", data.fullName);
    if (data.address !== undefined) set("address", data.address);
    if (data.phone !== undefined) set("phone", data.phone);
    if (data.email !== undefined) set("email", data.email);
    if (data.designation !== undefined) set("designation", data.designation);
    if (data.studentBatch !== undefined) set("student_batch", data.studentBatch);
    if (data.username !== undefined) set("username", data.username);
    if (data.passwordHash !== undefined) set("password_hash", data.passwordHash);
    if (data.role !== undefined) set("role", data.role);
    if (data.approved !== undefined) set("approved", data.approved);
    if (data.failedLoginAttempts !== undefined)
      set("failed_login_attempts", data.failedLoginAttempts);
    if (data.lockedUntil !== undefined) set("locked_until", data.lockedUntil);
    if (data.totpSecret !== undefined) set("totp_secret", data.totpSecret);
    if (data.totpEnabled !== undefined) set("totp_enabled", data.totpEnabled);
    if (data.totpEnforced !== undefined) set("totp_enforced", data.totpEnforced);
    if (data.profilePhotoPath !== undefined) set("profile_photo_path", data.profilePhotoPath);

    if (updates.length === 0) {
      return this.getUserById(id);
    }

    values.push(id);
    const result = await getPgPool().query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${index} RETURNING *`,
      values,
    );
    const row = result.rows[0];
    return row ? mapPgUser(row as Record<string, unknown>) : undefined;
  },

  async createPasswordResetRequest(data: {
    userId: number;
    requestedByRole: string;
    passwordHash: string;
    reason?: string | null;
  }): Promise<PasswordResetRequest> {
    if (getProvider() === "sqlite") {
      return storage.createPasswordResetRequest(data);
    }

    const result = await getPgPool().query(
      `INSERT INTO password_reset_requests
      (user_id, requested_by_role, password_hash, reason, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending', $5)
      RETURNING *`,
      [
        data.userId,
        data.requestedByRole,
        data.passwordHash,
        data.reason || null,
        new Date().toISOString(),
      ],
    );
    return mapPgPasswordResetRequest(result.rows[0] as Record<string, unknown>);
  },
};

const sessionsSqlite = {
  async set(token: string, userId: number): Promise<void> {
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    await dbRun(
      sql`INSERT INTO sessions (token, user_id, created_at, expires_at, last_seen_at)
        VALUES (${token}, ${userId}, ${nowIso}, ${expiresAt}, ${nowIso})
        ON CONFLICT(token) DO UPDATE SET
          user_id = excluded.user_id,
          expires_at = excluded.expires_at,
          last_seen_at = excluded.last_seen_at`,
    );
  },
  get(token: string): number | undefined {
    const row = db.get<{ user_id: number; expires_at: string }>(
      sql`SELECT user_id, expires_at FROM sessions WHERE token = ${token}`,
    );
    if (!row) return undefined;
    if (Date.now() > new Date(row.expires_at).getTime()) {
      void this.delete(token);
      return undefined;
    }
    try {
      const seen = new Date().toISOString();
      const throttleBefore = new Date(
        Date.now() - SESSION_LAST_SEEN_THROTTLE_MS,
      ).toISOString();
      db.run(
        sql`UPDATE sessions SET last_seen_at = ${seen}
            WHERE token = ${token}
              AND (last_seen_at IS NULL OR last_seen_at < ${throttleBefore})`,
      );
    } catch {
      // Pre-migration DB without last_seen_at — presence falls back until migrations run.
    }
    return row.user_id;
  },
  async delete(token: string): Promise<void> {
    await dbRun(sql`DELETE FROM sessions WHERE token = ${token}`);
  },
  async clear(): Promise<void> {
    await dbRun(sql`DELETE FROM sessions`);
  },
  async deleteByUserId(userId: number): Promise<void> {
    await dbRun(sql`DELETE FROM sessions WHERE user_id = ${userId}`);
  },
};
