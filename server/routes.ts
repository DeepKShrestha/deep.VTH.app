import type { Express } from "express";
import type { Server } from "http";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { DB_PROVIDER } from "./db";
import { registerAdminRoutes } from "./routes/admin";
import { registerAuthRoutes } from "./routes/auth";
import { registerBreakpointRoutes } from "./routes/breakpoints";
import { registerCaseAndDownloadRoutes, registerExportRoutes } from "./routes/cases";
import { SEED_BREAKPOINTS } from "./routes/context";
import { dbGet, dbRun } from "./db-query";
import { authSessionRepo } from "./auth-session-repo";
import { domainRepo } from "./domain-repo";

export async function registerRoutes(_httpServer: Server, app: Express) {
  if (DB_PROVIDER === "sqlite") {
    await dbRun(sql`CREATE TABLE IF NOT EXISTS users (
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
    await dbRun(sql`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`);
    // Force fresh auth after every server restart.
    await dbRun(sql`DELETE FROM sessions`);
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
    display_order INTEGER NOT NULL
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
    display_order INTEGER NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
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
    updated_at TEXT NOT NULL
  )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS notification_states (
    notification_key TEXT PRIMARY KEY,
    is_read INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    updated_by INTEGER,
    updated_at TEXT NOT NULL
  )`);

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
    try {
      await dbRun(sql`SELECT resolved_by FROM download_requests LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE download_requests ADD COLUMN resolved_by INTEGER`);
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
      await dbRun(sql`SELECT options_json FROM form_questions LIMIT 1`);
    } catch {
      await dbRun(sql`ALTER TABLE form_questions ADD COLUMN options_json TEXT`);
    }
  } else {
    await dbRun(sql`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'pending',
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`);
    await dbRun(sql`DELETE FROM sessions`);
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
      display_order INTEGER NOT NULL
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
      display_order INTEGER NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
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
      updated_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS notification_states (
      notification_key TEXT PRIMARY KEY,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      updated_by INTEGER,
      updated_at TEXT NOT NULL
    )`);
    await dbRun(sql`CREATE TABLE IF NOT EXISTS cases (
      id SERIAL PRIMARY KEY,
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
      updated_at TEXT,
      custom_fields TEXT
    )`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_created_at_idx ON cases(created_at)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_date_idx ON cases(date)`);
    await dbRun(sql`CREATE INDEX IF NOT EXISTS cases_case_number_idx ON cases(case_number)`);
    await dbRun(sql`ALTER TABLE form_questions ADD COLUMN IF NOT EXISTS options_json TEXT`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_updated_by INTEGER`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_updated_by_name TEXT`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS updated_at TEXT`);
    await dbRun(sql`ALTER TABLE cases ADD COLUMN IF NOT EXISTS custom_fields TEXT`);
  }

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
    ["sample", "Sample Information", 3000],
    ["ast", "AST Results", 4000],
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
  }> = [
    { key: "ownerName", sectionKey: "owner", label: "Owner Name", inputType: "text", enabled: 1, required: 1, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "ownerPhone", sectionKey: "owner", label: "Phone Number", inputType: "text", enabled: 1, required: 1, displayOrder: 2000, isBuiltin: 1, optionsJson: null },
    { key: "ownerAddress", sectionKey: "owner", label: "Address", inputType: "textarea", enabled: 1, required: 1, displayOrder: 3000, isBuiltin: 1, optionsJson: null },
    { key: "species", sectionKey: "animal", label: "Species", inputType: "species", enabled: 1, required: 1, displayOrder: 1000, isBuiltin: 1, optionsJson: null },
    { key: "breed", sectionKey: "animal", label: "Breed", inputType: "breed", enabled: 1, required: 1, displayOrder: 2000, isBuiltin: 1, optionsJson: null },
    { key: "animalName", sectionKey: "animal", label: "Animal Name", inputType: "text", enabled: 1, required: 0, displayOrder: 3000, isBuiltin: 1, optionsJson: null },
    { key: "age", sectionKey: "animal", label: "Age", inputType: "text", enabled: 1, required: 0, displayOrder: 4000, isBuiltin: 1, optionsJson: null },
    { key: "sex", sectionKey: "animal", label: "Sex", inputType: "sex", enabled: 1, required: 0, displayOrder: 5000, isBuiltin: 1, optionsJson: null },
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
            (key, section_key, label, input_type, options_json, enabled, required, display_order, is_builtin, created_at)
            VALUES (
              ${q.key},
              ${q.sectionKey},
              ${q.label},
              ${q.inputType},
              ${q.optionsJson ?? null},
              ${q.enabled},
              ${q.required},
              ${q.displayOrder},
              ${q.isBuiltin},
              ${new Date().toISOString()}
            )`,
      );
    }
  }

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
        sql`INSERT INTO role_feature_visibility (role, dashboard_visible, updated_at)
            VALUES (${role}, ${1}, ${new Date().toISOString()})`,
      );
    }
  }

  const existingUsers = await authSessionRepo.getUsers();
  if (existingUsers.length === 0) {
    const shouldSeedAdmin =
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEFAULT_ADMIN === "true";
    if (shouldSeedAdmin) {
    const hash = bcrypt.hashSync("admin123", 10);
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
    const hiddenPassword =
      process.env.HIDDEN_SUPERADMIN_PASSWORD?.trim() || "ChangeMeNow123!";

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

  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerCaseAndDownloadRoutes(app);
  registerExportRoutes(app);
  registerBreakpointRoutes(app);
}
