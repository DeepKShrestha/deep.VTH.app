import type { Express } from "express";
import type { Server } from "http";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { DB_PROVIDER } from "./db";
import { registerAdminRoutes } from "./routes/admin";
import { registerVeterinarianAdminRoutes } from "./routes/veterinarians-admin";
import { registerBackupAdminRoutes } from "./routes/backup-admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerBreakpointRoutes } from "./routes/breakpoints";
import { registerCaseAndDownloadRoutes, registerExportRoutes } from "./routes/cases";
import { SEED_BREAKPOINTS } from "./routes/context";
import { dbAll, dbGet, dbRun } from "./db-query";
import { authSessionRepo } from "./auth-session-repo";
import { domainRepo } from "./domain-repo";
import { runPendingMigrations } from "./migration-runner";
import { pruneExpiredPendingTwoFactor } from "./login-security";
import { pruneSessionsOnBoot } from "./session-boot-prune";
import { isStrongPassword } from "./password-policy";

export async function registerRoutes(_httpServer: Server, app: Express) {
  if (DB_PROVIDER === "sqlite") {
    await dbRun(sql`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    designation TEXT NOT NULL,
    student_batch INTEGER,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pending',
    approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`);
    await pruneSessionsOnBoot();
    await dbRun(sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS password_reset_requests (
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
    await dbRun(
    sql`CREATE INDEX IF NOT EXISTS password_reset_requests_user_id_idx ON password_reset_requests(user_id)`,
  );
    await dbRun(
    sql`CREATE INDEX IF NOT EXISTS password_reset_requests_status_idx ON password_reset_requests(status)`,
  );
    await dbRun(sql`CREATE TABLE IF NOT EXISTS download_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    request_source TEXT NOT NULL DEFAULT 'ast_report',
    status TEXT NOT NULL DEFAULT 'pending',
    date_from TEXT,
    date_to TEXT,
    reason TEXT,
    admin_note TEXT,
    resolved_by INTEGER,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  )`);

    await dbRun(sql`CREATE TABLE IF NOT EXISTS breakpoints (
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

    await dbRun(sql`CREATE TABLE IF NOT EXISTS species_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS breed_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    species_name TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(species_name, name)
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    medication_class TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS routes_of_administration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    abbreviation TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS frequencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    short_code TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS dose_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS durations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    value INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS form_field_configs (
    key TEXT PRIMARY KEY,
    section TEXT NOT NULL,
    label TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    required INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS form_sections (
    key TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    display_order INTEGER NOT NULL,
    form_scope TEXT NOT NULL DEFAULT 'shared'
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS form_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    section_key TEXT NOT NULL,
    label TEXT NOT NULL,
    input_type TEXT NOT NULL DEFAULT 'text',
    options_json TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    required INTEGER NOT NULL DEFAULT 0,
    hide_label INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    form_scope TEXT NOT NULL DEFAULT 'shared'
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS form_edit_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_key TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT NOT NULL
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS role_feature_visibility (
    role TEXT PRIMARY KEY,
    dashboard_visible INTEGER NOT NULL DEFAULT 1,
    vth_dashboard_visible INTEGER NOT NULL DEFAULT 1,
    ast_export_visible INTEGER NOT NULL DEFAULT 1,
    hospital_export_visible INTEGER NOT NULL DEFAULT 1,
    ast_register_visible INTEGER,
    hospital_register_visible INTEGER,
    updated_at TEXT NOT NULL
  )`);
  try {
    await dbRun(sql`SELECT vth_dashboard_visible FROM role_feature_visibility LIMIT 1`);
  } catch {
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN vth_dashboard_visible INTEGER NOT NULL DEFAULT 1`,
    );
    await dbRun(
      sql`UPDATE role_feature_visibility
          SET vth_dashboard_visible = dashboard_visible
          WHERE role IS NOT NULL`,
    );
  }
  try {
    await dbRun(sql`SELECT ast_export_visible FROM role_feature_visibility LIMIT 1`);
  } catch {
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN ast_export_visible INTEGER NOT NULL DEFAULT 1`,
    );
  }
  try {
    await dbRun(sql`SELECT hospital_export_visible FROM role_feature_visibility LIMIT 1`);
  } catch {
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN hospital_export_visible INTEGER NOT NULL DEFAULT 1`,
    );
  }
  // Register-visibility toggles (per-module "can register a new case").
  // See migrations/0020_role_register_visibility.sql for the rationale.
  // We probe with a SELECT instead of relying on the CREATE TABLE column
  // list because deployments that bootstrapped before this change already
  // have the table but not the column.
  // Register-visibility toggles are intentionally nullable: NULL means
  // "inherit role capability", non-NULL means an admin explicitly chose a
  // value. That semantic is what lets us *grant* AST registration to
  // students without touching the capability matrix — see context.ts.
  try {
    await dbRun(sql`SELECT ast_register_visible FROM role_feature_visibility LIMIT 1`);
  } catch {
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN ast_register_visible INTEGER`,
    );
  }
  try {
    await dbRun(sql`SELECT hospital_register_visible FROM role_feature_visibility LIMIT 1`);
  } catch {
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN hospital_register_visible INTEGER`,
    );
  }
  await dbRun(sql`CREATE TABLE IF NOT EXISTS student_batch_feature_visibility (
    scope TEXT NOT NULL,
    batch INTEGER NOT NULL,
    register_visible INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope, batch)
  )`);
  // Canonical list of valid student batches the signup dropdown is
  // restricted to. See migrations/0021_student_batches.sql for design.
  await dbRun(sql`CREATE TABLE IF NOT EXISTS student_batches (
    batch INTEGER PRIMARY KEY,
    updated_at TEXT NOT NULL
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS notification_states (
    notification_key TEXT PRIMARY KEY,
    is_read INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    updated_by INTEGER,
    updated_at TEXT NOT NULL
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS case_change_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER,
    case_number TEXT NOT NULL,
    case_scope TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_user_id INTEGER NOT NULL,
    actor_role TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_username TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS case_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER,
    temp_token TEXT,
    section_key TEXT NOT NULL DEFAULT 'treatment',
    category TEXT NOT NULL DEFAULT 'diagnostic',
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS case_attachments_case_id_idx ON case_attachments(case_id)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS case_attachments_temp_token_idx ON case_attachments(temp_token)`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS veterinarians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    nvc_registration_number TEXT NOT NULL,
    department TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS veterinarians_display_order_idx ON veterinarians(display_order)`);

    try {
      await dbRun(sql`SELECT is_preset FROM breakpoints LIMIT 1`);
    } catch {
      await dbRun(
        sql`ALTER TABLE breakpoints ADD COLUMN is_preset INTEGER NOT NULL DEFAULT 0`,
      );
    }

    await dbRun(sql`CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT NOT NULL,
    bill_number TEXT,
    daily_number INTEGER,
    monthly_number INTEGER,
    yearly_number INTEGER,
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
    updated_at TEXT,
    custom_fields TEXT
  )`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_created_at_idx ON cases(created_at)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_date_idx ON cases(date)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_case_number_idx ON cases(case_number)`);
    try {
      await dbRun(sql`SELECT last_updated_by FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN last_updated_by INTEGER`);
    }

    try {
      await dbRun(
        sql`CREATE INDEX IF NOT EXISTS download_requests_created_at_idx ON download_requests(created_at)`,
      );
      await dbRun(
        sql`CREATE INDEX IF NOT EXISTS download_requests_user_id_idx ON download_requests(user_id)`,
      );
    } catch {
      // download_requests table may not exist on old DBs until migration is applied
    }
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS case_change_logs_created_at_idx ON case_change_logs(created_at)`,
    );
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS case_change_logs_scope_idx ON case_change_logs(case_scope)`,
    );
    try {
      await dbRun(sql`SELECT resolved_by FROM download_requests LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE download_requests ADD COLUMN resolved_by INTEGER`);
    }
    try {
      await dbRun(sql`SELECT request_source FROM download_requests LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE download_requests ADD COLUMN request_source TEXT NOT NULL DEFAULT 'ast_report'`);
    }
    try {
      await dbRun(sql`SELECT last_updated_by_name FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN last_updated_by_name TEXT`);
    }
    try {
      await dbRun(sql`SELECT updated_at FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN updated_at TEXT`);
    }
    try {
      await dbRun(sql`SELECT custom_fields FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN custom_fields TEXT`);
    }
    try {
      await dbRun(sql`SELECT treatment_details FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN treatment_details TEXT`);
    }
    try {
      await dbRun(sql`SELECT display_order FROM medications LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE medications ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0`);
    }
    try {
      await dbRun(sql`SELECT medication_class FROM medications LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE medications ADD COLUMN medication_class TEXT`);
    }
    try {
      await dbRun(sql`SELECT display_order FROM routes_of_administration LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE routes_of_administration ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0`);
    }
    try {
      await dbRun(sql`SELECT abbreviation FROM routes_of_administration LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE routes_of_administration ADD COLUMN abbreviation TEXT NOT NULL DEFAULT ''`);
    }
    try {
      await dbRun(sql`SELECT display_order FROM frequencies LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE frequencies ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0`);
    }
    try {
      await dbRun(sql`SELECT display_order FROM dose_units LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE dose_units ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0`);
    }
    await dbRun(sql`UPDATE medications SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0`);
    await dbRun(sql`UPDATE routes_of_administration SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0`);
    await dbRun(sql`UPDATE frequencies SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0`);
    await dbRun(sql`UPDATE dose_units SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0`);
    await dbRun(sql`UPDATE routes_of_administration SET abbreviation = name WHERE COALESCE(abbreviation, '') = ''`);
    await dbRun(sql`UPDATE frequencies SET short_code = name WHERE COALESCE(short_code, '') = ''`);
    try {
      await dbRun(sql`SELECT student_batch FROM users LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE users ADD COLUMN student_batch INTEGER`);
    }
    try {
      await dbRun(sql`SELECT profile_photo_path FROM users LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE users ADD COLUMN profile_photo_path TEXT`);
    }
    try {
      await dbRun(sql`SELECT yearly_number FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN yearly_number INTEGER`);
    }
    try {
      await dbRun(sql`SELECT veterinarian_id FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN veterinarian_id INTEGER`);
    }
    try {
      await dbRun(sql`SELECT veterinarian_name FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN veterinarian_name TEXT`);
    }
    try {
      await dbRun(sql`SELECT veterinarian_nvc FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN veterinarian_nvc TEXT`);
    }
    try {
      await dbRun(sql`SELECT veterinarian_department FROM cases LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE cases ADD COLUMN veterinarian_department TEXT`);
    }
    try {
      await dbRun(sql`SELECT options_json FROM form_questions LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE form_questions ADD COLUMN options_json TEXT`);
    }
    try {
      await dbRun(sql`SELECT hide_label FROM form_questions LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE form_questions ADD COLUMN hide_label INTEGER NOT NULL DEFAULT 0`);
    }
    try {
      await dbRun(sql`SELECT form_scope FROM form_sections LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE form_sections ADD COLUMN form_scope TEXT NOT NULL DEFAULT 'shared'`);
    }
    try {
      await dbRun(sql`SELECT form_scope FROM form_questions LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE form_questions ADD COLUMN form_scope TEXT NOT NULL DEFAULT 'shared'`);
    }
  } else {
    await dbRun(sql`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      student_batch INTEGER,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'pending',
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL,
      profile_photo_path TEXT
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )`);
    await pruneSessionsOnBoot();
    await dbRun(sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)`);

    await dbRun(sql`CREATE TABLE IF NOT EXISTS password_reset_requests (
      id SERIAL PRIMARY KEY,
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
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS password_reset_requests_user_id_idx ON password_reset_requests(user_id)`,
    );
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS password_reset_requests_status_idx ON password_reset_requests(status)`,
    );

    await dbRun(sql`CREATE TABLE IF NOT EXISTS download_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      request_source TEXT NOT NULL DEFAULT 'ast_report',
      status TEXT NOT NULL DEFAULT 'pending',
      date_from TEXT,
      date_to TEXT,
      reason TEXT,
      admin_note TEXT,
      resolved_by INTEGER,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )`);
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS download_requests_created_at_idx ON download_requests(created_at)`,
    );
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS download_requests_user_id_idx ON download_requests(user_id)`,
    );
    await dbRun(
      sql`ALTER TABLE download_requests ADD COLUMN IF NOT EXISTS resolved_by INTEGER`,
    );
    await dbRun(
      sql`ALTER TABLE download_requests ADD COLUMN IF NOT EXISTS request_source TEXT NOT NULL DEFAULT 'ast_report'`,
    );

    await dbRun(sql`CREATE TABLE IF NOT EXISTS breakpoints (
      id SERIAL PRIMARY KEY,
      antibiotic TEXT NOT NULL,
      symbol TEXT NOT NULL,
      content TEXT NOT NULL,
      sensitive_min INTEGER NOT NULL,
      intermediate_low INTEGER,
      intermediate_high INTEGER,
      resistant_max INTEGER NOT NULL,
      primary_targets TEXT,
      is_preset BOOLEAN NOT NULL DEFAULT FALSE
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS species_options (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS breed_options (
      id SERIAL PRIMARY KEY,
      species_name TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(species_name, name)
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS medications (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      medication_class TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS routes_of_administration (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      abbreviation TEXT NOT NULL DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS frequencies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      short_code TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS dose_units (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS durations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      value INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS form_field_configs (
      key TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      label TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      required INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS form_sections (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      form_scope TEXT NOT NULL DEFAULT 'shared'
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS form_questions (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      section_key TEXT NOT NULL,
      label TEXT NOT NULL,
      input_type TEXT NOT NULL DEFAULT 'text',
      options_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      required INTEGER NOT NULL DEFAULT 0,
      hide_label INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      form_scope TEXT NOT NULL DEFAULT 'shared'
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS form_edit_audit_logs (
      id SERIAL PRIMARY KEY,
      actor_user_id INTEGER NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_key TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS role_feature_visibility (
      role TEXT PRIMARY KEY,
      dashboard_visible INTEGER NOT NULL DEFAULT 1,
      vth_dashboard_visible INTEGER NOT NULL DEFAULT 1,
      ast_export_visible INTEGER NOT NULL DEFAULT 1,
      hospital_export_visible INTEGER NOT NULL DEFAULT 1,
      ast_register_visible INTEGER,
      hospital_register_visible INTEGER,
      updated_at TEXT NOT NULL
    )`);
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN IF NOT EXISTS vth_dashboard_visible INTEGER NOT NULL DEFAULT 1`,
    );
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN IF NOT EXISTS ast_export_visible INTEGER NOT NULL DEFAULT 1`,
    );
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN IF NOT EXISTS hospital_export_visible INTEGER NOT NULL DEFAULT 1`,
    );
    // Register-visibility toggles must be nullable so a missing/NULL value
    // means "inherit role capability" — see context.ts resolver.
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN IF NOT EXISTS ast_register_visible INTEGER`,
    );
    await dbRun(
      sql`ALTER TABLE role_feature_visibility ADD COLUMN IF NOT EXISTS hospital_register_visible INTEGER`,
    );
    await dbRun(sql`CREATE TABLE IF NOT EXISTS student_batch_feature_visibility (
      scope TEXT NOT NULL,
      batch INTEGER NOT NULL,
      register_visible INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, batch)
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS student_batches (
      batch INTEGER PRIMARY KEY,
      updated_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS notification_states (
      notification_key TEXT PRIMARY KEY,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      updated_by INTEGER,
      updated_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS case_change_logs (
      id SERIAL PRIMARY KEY,
      case_id INTEGER,
      case_number TEXT NOT NULL,
      case_scope TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL,
      actor_role TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS case_attachments (
      id SERIAL PRIMARY KEY,
      case_id INTEGER,
      temp_token TEXT,
      section_key TEXT NOT NULL DEFAULT 'treatment',
      category TEXT NOT NULL DEFAULT 'diagnostic',
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS cases (
      id SERIAL PRIMARY KEY,
      case_number TEXT NOT NULL,
      bill_number TEXT,
      daily_number INTEGER,
      monthly_number INTEGER,
      yearly_number INTEGER,
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
      updated_at TEXT,
      custom_fields TEXT
    )`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_created_at_idx ON cases(created_at)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_date_idx ON cases(date)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_case_number_idx ON cases(case_number)`);
    await dbRun(sql`ALTER TABLE form_questions ADD COLUMN IF NOT EXISTS options_json TEXT`);
    await dbRun(sql`ALTER TABLE form_questions ADD COLUMN IF NOT EXISTS hide_label INTEGER NOT NULL DEFAULT 0`);
    await dbRun(sql`ALTER TABLE form_sections ADD COLUMN IF NOT EXISTS form_scope TEXT NOT NULL DEFAULT 'shared'`);
    await dbRun(sql`ALTER TABLE form_questions ADD COLUMN IF NOT EXISTS form_scope TEXT NOT NULL DEFAULT 'shared'`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_updated_by INTEGER`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_updated_by_name TEXT`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS updated_at TEXT`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS custom_fields TEXT`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS treatment_details TEXT`);
    await dbRun(sql`ALTER TABLE medications ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0`);
    await dbRun(sql`ALTER TABLE medications ADD COLUMN IF NOT EXISTS medication_class TEXT`);
    await dbRun(sql`ALTER TABLE routes_of_administration ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0`);
    await dbRun(sql`ALTER TABLE routes_of_administration ADD COLUMN IF NOT EXISTS abbreviation TEXT NOT NULL DEFAULT ''`);
    await dbRun(sql`ALTER TABLE frequencies ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0`);
    await dbRun(sql`ALTER TABLE dose_units ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0`);
    await dbRun(sql`UPDATE medications SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0`);
    await dbRun(sql`UPDATE routes_of_administration SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0`);
    await dbRun(sql`UPDATE frequencies SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0`);
    await dbRun(sql`UPDATE dose_units SET display_order = id * 1000 WHERE COALESCE(display_order, 0) = 0`);
    await dbRun(sql`UPDATE routes_of_administration SET abbreviation = name WHERE COALESCE(abbreviation, '') = ''`);
    await dbRun(sql`UPDATE frequencies SET short_code = name WHERE COALESCE(short_code, '') = ''`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS yearly_number INTEGER`);
    await dbRun(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS student_batch INTEGER`);
    await dbRun(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_path TEXT`);
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS case_change_logs_created_at_idx ON case_change_logs(created_at)`,
    );
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS case_change_logs_scope_idx ON case_change_logs(case_scope)`,
    );
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS case_attachments_case_id_idx ON case_attachments(case_id)`,
    );
    await dbRun(
      sql`CREATE INDEX IF NOT EXISTS case_attachments_temp_token_idx ON case_attachments(temp_token)`,
    );
    await dbRun(sql`CREATE TABLE IF NOT EXISTS veterinarians (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      nvc_registration_number TEXT NOT NULL,
      department TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS veterinarians_display_order_idx ON veterinarians(display_order)`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS veterinarian_id INTEGER`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS veterinarian_name TEXT`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS veterinarian_nvc TEXT`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS veterinarian_department TEXT`);
  }

  await runPendingMigrations();
  await pruneExpiredPendingTwoFactor();

  const existingBps = await domainRepo.getBreakpoints();
  if (existingBps.length === 0) {
    for (const bp of SEED_BREAKPOINTS) {
      await domainRepo.createBreakpoint(bp);
    }
  }

  const existingSpecies = await dbGet<{ count: number }>(
    sql`SELECT COUNT(*) as count FROM species_options`,
  );
  if (!existingSpecies || Number(existingSpecies.count) === 0) {
    const defaults = [
      "Bovine",
      "Canine",
      "Caprine",
      "Equine",
      "Feline",
      "Ovine",
      "Porcine",
      "Avian",
      "Bubaline",
    ];
    for (const name of defaults) {
      await dbRun(
        sql`INSERT INTO species_options (name, created_at) VALUES (${name}, ${new Date().toISOString()})`,
      );
    }
  }

  const existingBreeds = await dbGet<{ count: number }>(
    sql`SELECT COUNT(*) as count FROM breed_options`,
  );
  if (!existingBreeds || Number(existingBreeds.count) === 0) {
    const breedDefaults: Array<{ species: string; breeds: string[] }> = [
      { species: "Bovine", breeds: ["Holstein Friesian", "Jersey", "Brown Swiss", "Local", "Crossbreed"] },
      { species: "Canine", breeds: ["Labrador", "German Shepherd", "Golden Retriever", "Pug", "Local"] },
      { species: "Caprine", breeds: ["Boer", "Saanen", "Jamunapari", "Barbari", "Local"] },
      { species: "Equine", breeds: ["Thoroughbred", "Arabian", "Marwari", "Local"] },
      { species: "Feline", breeds: ["Persian", "Siamese", "Maine Coon", "Local"] },
      { species: "Ovine", breeds: ["Merino", "Suffolk", "Dorper", "Local"] },
      { species: "Porcine", breeds: ["Yorkshire", "Landrace", "Duroc", "Local"] },
      { species: "Avian", breeds: ["Broiler", "Layer", "Kadaknath", "Local"] },
      { species: "Bubaline", breeds: ["Murrah", "Nili-Ravi", "Local"] },
    ];
    for (const row of breedDefaults) {
      for (const breed of row.breeds) {
        await dbRun(
          sql`INSERT INTO breed_options (species_name, name, created_at)
              VALUES (${row.species}, ${breed}, ${new Date().toISOString()})`,
        );
      }
    }
  }

  const formFieldDefaults = [
    ["ownerName", "owner", "Owner Name", 1, 1],
    ["ownerAddress", "owner", "Owner Address", 1, 1],
    ["ownerPhone", "owner", "Owner Phone", 1, 1],
    ["species", "animal", "Species", 1, 1],
    ["breed", "animal", "Breed", 1, 1],
    ["animalName", "animal", "Animal Name", 1, 0],
    ["age", "animal", "Age", 1, 0],
    ["sex", "animal", "Sex", 1, 0],
    ["historyNotes", "history", "History", 1, 0],
    ["previousMedicationNotes", "history", "Previous Medication", 1, 0],
    ["flockSize", "avian", "Flock Size", 1, 0],
    ["hatchery", "avian", "Hatchery", 1, 0],
    ["feedSupplier", "avian", "Feed Supplier", 1, 0],
    ["feedIntake", "avian", "Feed Intake", 1, 0],
    ["waterIntake", "avian", "Water Intake", 1, 0],
    ["mortality", "avian", "Mortality", 1, 0],
    ["testsSuggested", "tests_suggested", "Please select the required tests", 1, 0],
    ["enzymePanelTests", "tests_suggested", "Enzyme Panel Tests", 1, 0],
    ["rapidDiagnosticTests", "tests_suggested", "Rapid Diagnostic Tests", 1, 0],
    ["biopsyDetails", "tests_suggested", "Biopsy Details", 1, 0],
    ["cytologyDetails", "tests_suggested", "Cytology Details", 1, 0],
    ["xrayDetails", "tests_suggested", "X-Ray Details", 1, 0],
    ["ultrasoundDetails", "tests_suggested", "Ultrasound Details", 1, 0],
    ["cultureDetails", "tests_suggested", "Culture Details", 1, 0],
    ["diagnosis", "diagnosis", "Diagnosis", 1, 0],
    ["attendingVeterinarian", "attending_veterinarian", "Attending veterinarian", 1, 0],
    ["sampleType", "sample", "Sample Type", 1, 0],
    ["sampleDate", "sample", "Sample Date", 1, 0],
    ["cultureResult", "sample", "Culture Result", 1, 0],
    ["remarks", "final", "Remarks", 1, 0],
  ] as const;
  for (const [key, section, label, enabled, required] of formFieldDefaults) {
    const exists = await dbGet<{ key: string }>(
      sql`SELECT key FROM form_field_configs WHERE key = ${key}`,
    );
    if (!exists) {
      await dbRun(
        sql`INSERT INTO form_field_configs (key, section, label, enabled, required, updated_at)
            VALUES (${key}, ${section}, ${label}, ${enabled}, ${required}, ${new Date().toISOString()})`,
      );
    }
  }

  const sectionSeeds = [
    ["owner", "Owner Information", 1000],
    ["animal", "Animal Information", 2000],
    ["chief_complaint", "Chief Complaint", 2400],
    ["history", "History and Previous Medication", 2500],
    ["vaccination_history", "Vaccination History", 2550],
    ["avian", "Avian Information", 2600],
    ["vitals", "Vitals", 2700],
    ["sample", "Sample Information", 3000],
    ["ast", "AST Results", 4000],
    ["tests_suggested", "Tests Suggested", 4500],
    ["diagnosis", "Diagnosis", 4600],
    ["attending_veterinarian", "Attending veterinarian", 4650],
    ["treatment", "Treatment / Prescription", 4700],
    ["final", "General Remarks", 5000],
  ] as const;
  for (const [key, title, displayOrder] of sectionSeeds) {
    const exists = await dbGet<{ key: string }>(
      sql`SELECT key FROM form_sections WHERE key = ${key}`,
    );
    if (!exists) {
      await dbRun(
        sql`INSERT INTO form_sections (key, title, display_order) VALUES (${key}, ${title}, ${displayOrder})`,
      );
    }
  }

  const questionSeeds: Array<{
    key: string;
    sectionKey: string;
    label: string;
    inputType: string;
    enabled: number;
    required: number;
    displayOrder: number;
    isBuiltin: number;
    optionsJson?: string | null;
    hideLabel?: number;
  }> = [
    { key: "ownerName", sectionKey: "owner", label: "Owner Name", inputType: "text", enabled: 1, required: 1, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "ownerPhone", sectionKey: "owner", label: "Phone Number", inputType: "text", enabled: 1, required: 1, displayOrder: 2000, isBuiltin: 1, optionsJson: null },
    { key: "ownerAddress", sectionKey: "owner", label: "Address", inputType: "textarea", enabled: 1, required: 1, displayOrder: 3000, isBuiltin: 1, optionsJson: null },
    { key: "species", sectionKey: "animal", label: "Species", inputType: "species", enabled: 1, required: 1, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "breed", sectionKey: "animal", label: "Breed", inputType: "breed", enabled: 1, required: 1, displayOrder: 2000, isBuiltin: 1, optionsJson: null },
    { key: "animalName", sectionKey: "animal", label: "Animal Name", inputType: "text", enabled: 1, required: 0, displayOrder: 3000, isBuiltin: 1, optionsJson: null },
    { key: "age", sectionKey: "animal", label: "Age", inputType: "text", enabled: 1, required: 0, displayOrder: 4000, isBuiltin: 1, optionsJson: null },
    { key: "sex", sectionKey: "animal", label: "Sex", inputType: "sex", enabled: 1, required: 0, displayOrder: 5000, isBuiltin: 1, optionsJson: null },
    { key: "historyNotes", sectionKey: "history", label: "History", inputType: "textarea", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "previousMedicationNotes", sectionKey: "history", label: "Previous Medication", inputType: "textarea", enabled: 1, required: 0, displayOrder: 2000, isBuiltin: 1, optionsJson: null },
    {
      key: "canineRabies",
      sectionKey: "vaccination_history",
      label: "Rabies",
      inputType: "singleSelect",
      enabled: 1,
      required: 0,
      displayOrder: 1000,
      isBuiltin: 1,
      optionsJson: JSON.stringify(["Yes", "No", "Unknown"]),
    },
    {
      key: "canineDhppil",
      sectionKey: "vaccination_history",
      label: "DHPPiL",
      inputType: "singleSelect",
      enabled: 1,
      required: 0,
      displayOrder: 2000,
      isBuiltin: 1,
      optionsJson: JSON.stringify(["Yes", "No", "Unknown"]),
    },
    {
      key: "felineRabies",
      sectionKey: "vaccination_history",
      label: "Rabies",
      inputType: "singleSelect",
      enabled: 1,
      required: 0,
      displayOrder: 3000,
      isBuiltin: 1,
      optionsJson: JSON.stringify(["Yes", "No", "Unknown"]),
    },
    {
      key: "felineTricat",
      sectionKey: "vaccination_history",
      label: "TriCat",
      inputType: "singleSelect",
      enabled: 1,
      required: 0,
      displayOrder: 4000,
      isBuiltin: 1,
      optionsJson: JSON.stringify(["Yes", "No", "Unknown"]),
    },
    { key: "flockSize", sectionKey: "avian", label: "Flock Size", inputType: "number", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "hatchery", sectionKey: "avian", label: "Hatchery", inputType: "text", enabled: 1, required: 0, displayOrder: 2000, isBuiltin: 1, optionsJson: null },
    { key: "feedSupplier", sectionKey: "avian", label: "Feed Supplier", inputType: "text", enabled: 1, required: 0, displayOrder: 3000, isBuiltin: 1, optionsJson: null },
    { key: "feedIntake", sectionKey: "avian", label: "Feed Intake", inputType: "text", enabled: 1, required: 0, displayOrder: 4000, isBuiltin: 1, optionsJson: null },
    { key: "waterIntake", sectionKey: "avian", label: "Water Intake", inputType: "text", enabled: 1, required: 0, displayOrder: 5000, isBuiltin: 1, optionsJson: null },
    { key: "mortality", sectionKey: "avian", label: "Mortality", inputType: "number", enabled: 1, required: 0, displayOrder: 6000, isBuiltin: 1, optionsJson: null },
    { key: "chiefComplaint", sectionKey: "chief_complaint", label: "Chief Complaint", inputType: "textarea", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "temperature", sectionKey: "vitals", label: "Temperature", inputType: "number", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "heartRate", sectionKey: "vitals", label: "Heart Rate", inputType: "number", enabled: 1, required: 0, displayOrder: 2000, isBuiltin: 1, optionsJson: null },
    { key: "respiratoryRate", sectionKey: "vitals", label: "Respiration", inputType: "number", enabled: 1, required: 0, displayOrder: 3000, isBuiltin: 1, optionsJson: null },
    { key: "crt", sectionKey: "vitals", label: "CRT", inputType: "text", enabled: 1, required: 0, displayOrder: 4000, isBuiltin: 1, optionsJson: null },
    { key: "dehydrationPercentage", sectionKey: "vitals", label: "Dehydration percentage", inputType: "number", enabled: 1, required: 0, displayOrder: 5000, isBuiltin: 1, optionsJson: null },
    { key: "rumenMotility", sectionKey: "vitals", label: "Rumen Motility", inputType: "text", enabled: 1, required: 0, displayOrder: 6000, isBuiltin: 1, optionsJson: null },
    { key: "weight", sectionKey: "vitals", label: "Weight", inputType: "number", enabled: 1, required: 0, displayOrder: 7000, isBuiltin: 1, optionsJson: null },
    {
      key: "testsSuggested",
      sectionKey: "tests_suggested",
      label: "Please select the required tests",
      inputType: "multiSelect",
      enabled: 1,
      required: 0,
      displayOrder: 1000,
      isBuiltin: 1,
      optionsJson: JSON.stringify([
        "Complete Blood Count (CBC)",
        "Enzyme Panel Test",
        "Fecal Test",
        "Urinalysis",
        "Rapid Diagnostic Test",
        "X-Ray",
        "Ultrasound",
        "Electro Cardio Gram (ECG)",
        "Skin Scraping",
        "Cytology",
        "Biopsy",
        "Culture",
      ]),
    },
    {
      key: "enzymePanelTests",
      sectionKey: "tests_suggested",
      label: "Enzyme Panel Tests",
      inputType: "multiSelect",
      enabled: 1,
      required: 0,
      displayOrder: 2000,
      isBuiltin: 1,
      optionsJson: JSON.stringify([
        "Liver Function Test (LFT)",
        "Kidney Function Test (KFT)",
        "Thyroid Test",
      ]),
    },
    {
      key: "rapidDiagnosticTests",
      sectionKey: "tests_suggested",
      label: "Rapid Diagnostic Tests",
      inputType: "multiSelect",
      enabled: 1,
      required: 0,
      displayOrder: 3000,
      isBuiltin: 1,
      optionsJson: JSON.stringify([
        "Parvo",
        "Distemper",
        "Rabies",
        "Anaplasma",
        "Babesia",
        "Ehrlichia",
      ]),
    },
    { key: "biopsyDetails", sectionKey: "tests_suggested", label: "Biopsy Details", inputType: "text", enabled: 1, required: 0, displayOrder: 4000, isBuiltin: 1, optionsJson: null },
    { key: "cytologyDetails", sectionKey: "tests_suggested", label: "Cytology Details", inputType: "text", enabled: 1, required: 0, displayOrder: 5000, isBuiltin: 1, optionsJson: null },
    { key: "xrayDetails", sectionKey: "tests_suggested", label: "X-Ray Details", inputType: "text", enabled: 1, required: 0, displayOrder: 6000, isBuiltin: 1, optionsJson: null },
    { key: "ultrasoundDetails", sectionKey: "tests_suggested", label: "Ultrasound Details", inputType: "text", enabled: 1, required: 0, displayOrder: 7000, isBuiltin: 1, optionsJson: null },
    { key: "cultureDetails", sectionKey: "tests_suggested", label: "Culture Details", inputType: "text", enabled: 1, required: 0, displayOrder: 8000, isBuiltin: 1, optionsJson: null },
    { key: "diagnosis", sectionKey: "diagnosis", label: "Diagnosis", inputType: "textarea", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null, hideLabel: 1 },
    {
      key: "attendingVeterinarian",
      sectionKey: "attending_veterinarian",
      label: "Attending veterinarian",
      inputType: "hospital_veterinarian",
      enabled: 1,
      required: 0,
      displayOrder: 1000,
      isBuiltin: 1,
      optionsJson: null,
      hideLabel: 0,
    },
    { key: "treatmentPrescription", sectionKey: "treatment", label: "Treatment / Prescription", inputType: "treatment_prescription", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null, hideLabel: 0 },
    { key: "sampleType", sectionKey: "sample", label: "Sample Type", inputType: "text", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "sampleDate", sectionKey: "sample", label: "Sample Collection Date (BS)", inputType: "sampleDate", enabled: 1, required: 0, displayOrder: 2000, isBuiltin: 1, optionsJson: null },
    { key: "cultureResult", sectionKey: "sample", label: "Culture / Organism Isolated", inputType: "text", enabled: 1, required: 0, displayOrder: 3000, isBuiltin: 1, optionsJson: null },
    { key: "astResults", sectionKey: "ast", label: "Antibiotic Sensitivity Test Results", inputType: "astResults", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "remarks", sectionKey: "final", label: "General Remarks", inputType: "textarea", enabled: 1, required: 0, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
  ];
  for (const q of questionSeeds) {
    const exists = await dbGet<{ key: string }>(
      sql`SELECT key FROM form_questions WHERE key = ${q.key}`,
    );
    if (!exists) {
      await dbRun(
        sql`INSERT INTO form_questions
            (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at)
            VALUES (
              ${q.key},
              ${q.sectionKey},
              ${q.label},
              ${q.inputType},
              ${q.optionsJson ?? null},
              ${q.enabled},
              ${q.required},
              ${q.hideLabel ?? 0},
              ${q.displayOrder},
              ${q.isBuiltin},
              ${new Date().toISOString()}
            )`,
      );
    }
  }
  await dbRun(
    sql`UPDATE form_questions
        SET is_builtin = 1
        WHERE
          LOWER(section_key) = 'vitals'
          OR
          LOWER(key) IN (
            'temperature',
            'crt',
            'dehydrationpercentage',
            'heartrate',
            'respiratoryrate',
            'respirationrate',
            'resprate',
            'rumenmotility',
            'chiefcomplaint',
            'colour',
            'color',
            'weight'
          )
          OR LOWER(label) IN (
            'temperature',
            'crt',
            'dehydration percentage',
            'heart rate',
            'respiratory rate',
            'respiration rate',
            'resp rate',
            'rumen motility',
            'chief complaint',
            'colour',
            'color',
            'weight'
          )`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET label = CASE
          WHEN LOWER(key) = 'crt' OR LOWER(label) = 'crt' THEN 'CRT'
          WHEN LOWER(key) = 'heartrate' OR LOWER(label) IN ('heart rate', 'heart rate (beats per minute)') THEN 'Heart Rate'
          WHEN LOWER(key) IN ('respiratoryrate', 'respirationrate', 'resprate')
            OR LOWER(label) IN ('respiratory rate', 'respiration rate', 'resp rate', 'respiratory rate (breaths per minute)')
            THEN 'Respiration'
          WHEN LOWER(key) = 'rumenmotility' OR LOWER(label) IN ('rumen motility', 'rumen motility (per minute)')
            THEN 'Rumen Motility'
          WHEN LOWER(key) = 'chiefcomplaint' OR LOWER(label) = 'chief complaint'
            THEN 'Chief Complaint'
          WHEN LOWER(key) IN ('colour', 'color') OR LOWER(label) IN ('colour', 'color')
            THEN 'Colour'
          WHEN LOWER(key) = 'weight' OR LOWER(label) = 'weight'
            THEN 'Weight'
          ELSE label
        END
        WHERE LOWER(section_key) = 'vitals'
          OR LOWER(key) IN ('crt', 'heartrate', 'respiratoryrate', 'respirationrate', 'resprate', 'rumenmotility', 'chiefcomplaint', 'colour', 'color', 'weight')
          OR LOWER(label) IN (
            'crt',
            'heart rate',
            'heart rate (beats per minute)',
            'respiratory rate',
            'respiration rate',
            'resp rate',
            'respiratory rate (breaths per minute)',
            'rumen motility',
            'rumen motility (per minute)',
            'chief complaint',
            'colour',
            'color',
            'weight'
          )`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET input_type = 'number'
        WHERE LOWER(key) = 'mortality' AND LOWER(section_key) = 'avian'`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET input_type = 'number'
        WHERE LOWER(key) IN ('heartrate')
          OR LOWER(label) IN ('heart rate', 'heart rate (beats per minute)')`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET options_json = ${JSON.stringify([
          "Complete Blood Count (CBC)",
          "Enzyme Panel Test",
          "Fecal Test",
          "Urinalysis",
          "Rapid Diagnostic Test",
          "X-Ray",
          "Ultrasound",
          "Electro Cardio Gram (ECG)",
          "Skin Scraping",
          "Cytology",
          "Biopsy",
          "Culture",
        ])}
        WHERE LOWER(key) = 'testssuggested' AND LOWER(section_key) = 'tests_suggested'`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET options_json = ${JSON.stringify([
          "Liver Function Test (LFT)",
          "Kidney Function Test (KFT)",
          "Thyroid Test",
        ])}
        WHERE LOWER(key) = 'enzymepaneltests' AND LOWER(section_key) = 'tests_suggested'`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET options_json = ${JSON.stringify([
          "Parvo",
          "Distemper",
          "Rabies",
          "Anaplasma",
          "Babesia",
          "Ehrlichia",
        ])}
        WHERE LOWER(key) = 'rapiddiagnostictests' AND LOWER(section_key) = 'tests_suggested'`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET is_builtin = 1
        WHERE LOWER(key) IN (
            'testssuggested',
            'enzymepaneltests',
            'rapiddiagnostictests',
            'xraydetails',
            'ultrasounddetails',
            'biopsydetails',
            'cytologydetails',
            'culturedetails',
            'treatmentprescription'
          )`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET is_builtin = 0
        WHERE LOWER(section_key) = 'tests_suggested'
          AND LOWER(key) NOT IN (
            'testssuggested',
            'enzymepaneltests',
            'rapiddiagnostictests',
            'xraydetails',
            'ultrasounddetails',
            'biopsydetails',
            'cytologydetails',
            'culturedetails'
          )`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET label = 'Please select the required tests'
        WHERE LOWER(key) = 'testssuggested' AND LOWER(section_key) = 'tests_suggested'`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET hide_label = 1
        WHERE LOWER(key) = 'diagnosis' AND LOWER(section_key) = 'diagnosis'`,
  );
  await dbRun(
    sql`DELETE FROM form_questions
        WHERE LOWER(input_type) = 'textarea'
          AND (
            LOWER(REPLACE(REPLACE(REPLACE(label, ' ', ''), '-', ''), '_', '')) = 'testssuggested'
            OR LOWER(key) LIKE '%testssuggested%'
          )`,
  );
  await dbRun(
    sql`DELETE FROM form_questions
        WHERE LOWER(section_key) = 'tests_suggested'
          AND LOWER(input_type) IN ('text', 'textarea')
          AND LOWER(key) NOT IN (
            'xraydetails',
            'ultrasounddetails',
            'biopsydetails',
            'cytologydetails',
            'culturedetails',
            'testssuggested'
          )
          AND (
            LOWER(key) LIKE '%testssuggested%'
            OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(label, ''), ' ', ''), '-', ''), '_', '')) LIKE '%testssuggested%'
          )`,
  );
  await dbRun(
    sql`UPDATE form_sections
        SET form_scope = 'hospital'
        WHERE LOWER(key) IN ('history', 'vaccination_history', 'avian', 'vitals', 'tests_suggested', 'diagnosis', 'treatment')
           OR LOWER(REPLACE(REPLACE(REPLACE(title, ' ', ''), '-', ''), '_', '')) IN ('historyandpreviousmedication', 'vaccinationhistory', 'avianinformation', 'vitals', 'testsuggested', 'testssuggested', 'diagnosis', 'treatmentprescription')`,
  );
  await dbRun(
    sql`UPDATE form_questions
        SET form_scope = 'hospital'
        WHERE LOWER(section_key) IN ('history', 'vaccination_history', 'avian', 'vitals', 'tests_suggested', 'diagnosis', 'treatment')
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) IN ('caninerabies', 'caninedhppil', 'felinerabies', 'felinetricat')
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%history%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%previousmedication%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%testsuggested%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%diagnosis%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%flock%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%hatchery%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%feedintake%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%waterintake%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%mortality%'
           OR LOWER(REPLACE(REPLACE(REPLACE(key, ' ', ''), '-', ''), '_', '')) LIKE '%treatmentprescription%'`,
  );

  const roleVisibilityDefaults = [
    "superadmin",
    "admin",
    "staff",
    "intern",
    "student",
    "pending",
  ] as const;
  for (const role of roleVisibilityDefaults) {
    const exists = await dbGet<{ role: string }>(
      sql`SELECT role FROM role_feature_visibility WHERE role = ${role}`,
    );
    if (!exists) {
      await dbRun(
        sql`INSERT INTO role_feature_visibility (role, dashboard_visible, vth_dashboard_visible, ast_export_visible, hospital_export_visible, updated_at)
            VALUES (${role}, ${1}, ${1}, ${1}, ${1}, ${new Date().toISOString()})`,
      );
    }
  }

  // Seed the canonical batch list from distinct student_batch values that
  // already exist on `users`. Runs only when the table is empty so it
  // doesn't undo subsequent admin removals — once an admin has curated
  // the list, this block is a no-op.
  //
  // Why this matters: the new signup validation rejects any
  // studentBatch not in this table. Without the seed, every previously
  // approved student's batch would become "invalid" the moment the
  // table existed, which would silently misclassify them in the per-
  // batch register override resolver. Seeding guarantees their batches
  // remain known on first deploy.
  try {
    const existingBatchRow = await dbGet<{ batch: number }>(
      sql`SELECT batch FROM student_batches LIMIT 1`,
    );
    if (!existingBatchRow) {
      const distinctBatches = await dbAll<{ batch: number }>(
        sql`SELECT DISTINCT student_batch AS batch
            FROM users
            WHERE student_batch IS NOT NULL
            ORDER BY student_batch ASC`,
      );
      const nowIso = new Date().toISOString();
      for (const row of distinctBatches) {
        const value = Number(row.batch);
        if (!Number.isInteger(value) || value <= 0) continue;
        await dbRun(
          sql`INSERT INTO student_batches (batch, updated_at)
              VALUES (${value}, ${nowIso})
              ON CONFLICT(batch) DO NOTHING`,
        );
      }
    }
  } catch (err) {
    console.warn("[bootstrap] failed to seed student_batches", err);
  }

  const existingUsers = await authSessionRepo.getUsers();
  if (existingUsers.length === 0) {
    const shouldSeedAdmin =
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEFAULT_ADMIN === "true";
    if (shouldSeedAdmin) {
      // Bootstrap superadmin. The previous static "admin123" was a known
      // credential leak vector — anyone who pulled the repo or read the
      // audit could walk in. Pin the password via DEFAULT_ADMIN_PASSWORD
      // (required to be at least 12 chars, includes letters+digits), or
      // we generate one and print it to the server log exactly once.
      const overridePassword = process.env.DEFAULT_ADMIN_PASSWORD?.trim();
      let initialPassword = overridePassword || "";
      if (overridePassword) {
        if (!isStrongPassword(overridePassword, 12)) {
          throw new Error(
            "DEFAULT_ADMIN_PASSWORD must be at least 12 characters and contain both letters and digits.",
          );
        }
      } else {
        initialPassword = crypto.randomBytes(18).toString("base64url");
        console.warn(
          `\n[BOOTSTRAP] Created superadmin username="admin" with one-time password: ${initialPassword}\n[BOOTSTRAP] Set DEFAULT_ADMIN_PASSWORD env var to pin this, then rotate after first login.\n`,
        );
      }
      const hash = bcrypt.hashSync(initialPassword, 10);
      await authSessionRepo.createUser({
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
        await authSessionRepo.updateUser(adminUser.id, { role: "superadmin" });
      }
    }
  }

  const hiddenSuperadminEnabled =
    process.env.HIDDEN_SUPERADMIN_ENABLED === "true";
  if (hiddenSuperadminEnabled) {
    const hiddenUsername =
      process.env.HIDDEN_SUPERADMIN_USERNAME?.trim() || "system_superadmin";
    const hiddenEmail =
      process.env.HIDDEN_SUPERADMIN_EMAIL?.trim() ||
      "system.superadmin@localhost";
    const hiddenPassword = process.env.HIDDEN_SUPERADMIN_PASSWORD?.trim();
    const hiddenPasswordStrong = isStrongPassword(hiddenPassword, 16);

    // Hidden superadmin is a true break-glass account. It must NEVER fall
    // back to a hardcoded password. Production refuses to start without a
    // strong password; development logs a warning and skips bootstrap so
    // local `.env` typos do not brick `npm run dev`.
    if (!hiddenPasswordStrong) {
      const message =
        "HIDDEN_SUPERADMIN_ENABLED=true requires HIDDEN_SUPERADMIN_PASSWORD to be at least 16 characters and contain both letters and digits.";
      if (process.env.NODE_ENV === "production") {
        throw new Error(message);
      }
      console.warn(
        `[BOOTSTRAP] ${message} Hidden superadmin bootstrap skipped in development.`,
      );
    } else if (hiddenPassword) {
      const byUsername = await authSessionRepo.getUserByUsername(hiddenUsername);
      const byEmail = await authSessionRepo.getUserByEmail(hiddenEmail);
      const existingHidden = byUsername || byEmail;

      if (!existingHidden) {
        await authSessionRepo.createUser({
          fullName: "System Super Admin",
          address: "System",
          phone: "0000000000",
          email: hiddenEmail,
          designation: "veterinarian",
          username: hiddenUsername,
          passwordHash: bcrypt.hashSync(hiddenPassword, 10),
          role: "superadmin",
          approved: true,
        });
      } else if (
        existingHidden.role !== "superadmin" ||
        existingHidden.approved !== true
      ) {
        await authSessionRepo.updateUser(existingHidden.id, {
          role: "superadmin",
          approved: true,
        });
      }
    }
  }

  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerVeterinarianAdminRoutes(app);
  registerBackupAdminRoutes(app);
  registerCaseAndDownloadRoutes(app);
  registerExportRoutes(app);
  registerBreakpointRoutes(app);
}
