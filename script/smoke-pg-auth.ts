import { Client } from "pg";
import bcrypt from "bcryptjs";

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        designation TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'pending',
        approved BOOLEAN NOT NULL DEFAULT false,
        created_at TEXT NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);

    const username = `smoke_${Date.now()}`;
    const email = `${username}@example.test`;
    const passwordHash = bcrypt.hashSync("smoke123", 10);
    const createdAt = new Date().toISOString();

    const userResult = await client.query<{ id: number }>(
      `INSERT INTO users
      (full_name, address, phone, email, designation, username, password_hash, role, approved, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`,
      [
        "Smoke User",
        "Smoke Address",
        "9800000000",
        email,
        "veterinarian",
        username,
        passwordHash,
        "admin",
        true,
        createdAt,
      ],
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) throw new Error("Failed to create smoke user");

    const token = `smoke-token-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();
    await client.query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(token) DO UPDATE SET
      user_id = excluded.user_id,
      expires_at = excluded.expires_at`,
      [token, userId, createdAt, expiresAt],
    );

    const sessionResult = await client.query<{ user_id: number }>(
      "SELECT user_id FROM sessions WHERE token = $1",
      [token],
    );
    if (sessionResult.rows[0]?.user_id !== userId) {
      throw new Error("Session readback failed");
    }

    await client.query("ROLLBACK");
    console.log("Postgres auth/session smoke OK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("Postgres auth/session smoke failed:", error);
  process.exit(1);
});
