import { Pool } from "pg";
import type { PasswordResetRequest, User } from "@shared/schema";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

type Provider = "sqlite" | "postgres";

function getProvider(): Provider {
  return (process.env.DB_PROVIDER || "sqlite").toLowerCase() === "postgres"
    ? "postgres"
    : "sqlite";
}

let pgPool: Pool | null = null;
function getPgPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required when DB_PROVIDER=postgres for auth/session operations",
    );
  }
  if (!pgPool) {
    pgPool = new Pool({ connectionString: url });
  }
  return pgPool;
}

function mapPgUser(row: Record<string, unknown>): User {
  return {
    id: Number(row.id),
    fullName: String(row.full_name),
    address: String(row.address),
    phone: String(row.phone),
    email: String(row.email),
    designation: String(row.designation),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    role: String(row.role),
    approved: Boolean(row.approved),
    createdAt: String(row.created_at),
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
      sessionsSqlite.set(token, userId);
      return;
    }

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await getPgPool().query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(token) DO UPDATE SET
         user_id = excluded.user_id,
         expires_at = excluded.expires_at`,
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
    return Number(row.user_id);
  },

  async deleteSession(token: string): Promise<void> {
    if (getProvider() === "sqlite") {
      sessionsSqlite.delete(token);
      return;
    }
    await getPgPool().query("DELETE FROM sessions WHERE token = $1", [token]);
  },

  async clearSessions(): Promise<void> {
    if (getProvider() === "sqlite") {
      sessionsSqlite.clear();
      return;
    }
    await getPgPool().query("DELETE FROM sessions");
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
    if (getProvider() === "sqlite") {
      return storage.getUserByUsername(username);
    }
    const result = await getPgPool().query(
      "SELECT * FROM users WHERE username = $1 LIMIT 1",
      [username],
    );
    const row = result.rows[0];
    return row ? mapPgUser(row) : undefined;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (getProvider() === "sqlite") {
      return storage.getUserByEmail(email);
    }
    const result = await getPgPool().query(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      [email],
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
    username: string;
    passwordHash: string;
    role: string;
    approved: boolean;
  }): Promise<User> {
    if (getProvider() === "sqlite") {
      return storage.createUser(data);
    }

    const createdAt = new Date().toISOString();
    const result = await getPgPool().query(
      `INSERT INTO users
      (full_name, address, phone, email, designation, username, password_hash, role, approved, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.fullName,
        data.address,
        data.phone,
        data.email,
        data.designation,
        data.username,
        data.passwordHash,
        data.role,
        data.approved,
        createdAt,
      ],
    );
    return mapPgUser(result.rows[0] as Record<string, unknown>);
  },

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
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
    if (data.username !== undefined) set("username", data.username);
    if (data.passwordHash !== undefined) set("password_hash", data.passwordHash);
    if (data.role !== undefined) set("role", data.role);
    if (data.approved !== undefined) set("approved", data.approved);

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
  set(token: string, userId: number): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    db.run(
      sql`INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (${token}, ${userId}, ${now.toISOString()}, ${expiresAt})
        ON CONFLICT(token) DO UPDATE SET
          user_id = excluded.user_id,
          expires_at = excluded.expires_at`,
    );
  },
  get(token: string): number | undefined {
    const row = db.get<{ user_id: number; expires_at: string }>(
      sql`SELECT user_id, expires_at FROM sessions WHERE token = ${token}`,
    );
    if (!row) return undefined;
    if (Date.now() > new Date(row.expires_at).getTime()) {
      this.delete(token);
      return undefined;
    }
    return row.user_id;
  },
  delete(token: string): void {
    db.run(sql`DELETE FROM sessions WHERE token = ${token}`);
  },
  clear(): void {
    db.run(sql`DELETE FROM sessions`);
  },
};
