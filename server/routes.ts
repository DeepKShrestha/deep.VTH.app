import type { Express } from "express";
import type { Server } from "http";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerBreakpointRoutes } from "./routes/breakpoints";
import { registerCaseAndDownloadRoutes, registerExportRoutes } from "./routes/cases";
import { SEED_BREAKPOINTS } from "./routes/context";

export async function registerRoutes(_httpServer: Server, app: Express) {
  db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    designation TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pending',
    approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`);
  db.run(sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)`);
  db.run(sql`CREATE TABLE IF NOT EXISTS password_reset_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    requested_by_role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_by INTEGER,
    resolver_note TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS password_reset_requests_user_id_idx ON password_reset_requests(user_id)`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS password_reset_requests_status_idx ON password_reset_requests(status)`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS breakpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    antibiotic TEXT NOT NULL,
    symbol TEXT NOT NULL,
    content TEXT NOT NULL,
    sensitive_min INTEGER NOT NULL,
    intermediate_low INTEGER,
    intermediate_high INTEGER,
    resistant_max INTEGER NOT NULL,
    primary_targets TEXT,
    is_preset INTEGER NOT NULL DEFAULT 0
  )`);

  try {
    db.run(sql`SELECT is_preset FROM breakpoints LIMIT 1`);
  } catch {
    db.run(
      sql`ALTER TABLE breakpoints ADD COLUMN is_preset INTEGER NOT NULL DEFAULT 0`,
    );
  }

  db.run(sql`CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT NOT NULL,
    bill_number TEXT,
    daily_number INTEGER,
    monthly_number INTEGER,
    date TEXT NOT NULL,
    date_ad TEXT,
    owner_name TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT NOT NULL,
    animal_name TEXT,
    age TEXT,
    sex TEXT,
    sample_type TEXT,
    sample_date TEXT,
    sample_date_ad TEXT,
    culture_result TEXT,
    ast_results TEXT,
    remarks TEXT,
    registered_by INTEGER,
    created_at TEXT NOT NULL,
    last_updated_by INTEGER,
    last_updated_by_name TEXT,
    updated_at TEXT
  )`);
  db.run(sql`CREATE INDEX IF NOT EXISTS cases_created_at_idx ON cases(created_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS cases_date_idx ON cases(date)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS cases_case_number_idx ON cases(case_number)`);
  try {
    db.run(sql`SELECT last_updated_by FROM cases LIMIT 1`);
  } catch {
    db.run(sql`ALTER TABLE cases ADD COLUMN last_updated_by INTEGER`);
  }

  try {
    db.run(
      sql`CREATE INDEX IF NOT EXISTS download_requests_created_at_idx ON download_requests(created_at)`,
    );
    db.run(
      sql`CREATE INDEX IF NOT EXISTS download_requests_user_id_idx ON download_requests(user_id)`,
    );
  } catch {
    // download_requests table may not exist on old DBs until migration is applied
  }
  try {
    db.run(sql`SELECT last_updated_by_name FROM cases LIMIT 1`);
  } catch {
    db.run(sql`ALTER TABLE cases ADD COLUMN last_updated_by_name TEXT`);
  }
  try {
    db.run(sql`SELECT updated_at FROM cases LIMIT 1`);
  } catch {
    db.run(sql`ALTER TABLE cases ADD COLUMN updated_at TEXT`);
  }

  const existingBps = storage.getBreakpoints();
  if (existingBps.length === 0) {
    for (const bp of SEED_BREAKPOINTS) {
      storage.createBreakpoint(bp);
    }
  }

  const existingUsers = storage.getUsers();
  if (existingUsers.length === 0) {
    const shouldSeedAdmin =
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEFAULT_ADMIN === "true";
    if (shouldSeedAdmin) {
      const hash = bcrypt.hashSync("admin123", 10);
      storage.createUser({
        fullName: "Super Admin",
        address: "VTH",
        phone: "0000000000",
        email: "admin@vth.edu.np",
        designation: "veterinarian",
        username: "admin",
        passwordHash: hash,
        role: "superadmin",
        approved: true,
      });
    }
  } else {
    const hasSuperAdmin = existingUsers.some((u) => u.role === "superadmin");
    if (!hasSuperAdmin) {
      const adminUser = existingUsers.find(
        (u) => u.username === "admin" && u.role === "admin",
      );
      if (adminUser) {
        storage.updateUserRole(adminUser.id, "superadmin");
      }
    }
  }

  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerCaseAndDownloadRoutes(app);
  registerExportRoutes(app);
  registerBreakpointRoutes(app);
}
