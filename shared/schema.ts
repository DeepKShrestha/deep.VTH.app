import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---- Users ----
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  designation: text("designation").notNull(), // lab_assistant, veterinarian, student, intern
  studentBatch: integer("student_batch"),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("pending"), // superadmin, admin, staff, student, pending
  approved: integer("approved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  /** Incremented on failed password check; cleared on success. */
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  /** ISO timestamp: account locked until this instant (null = not locked). */
  lockedUntil: text("locked_until"),
  /** Base32 TOTP secret (RFC 6238); never expose to client JSON. */
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  /** When true (admin role only), user cannot disable TOTP; login requires TOTP once enabled. Set by Super Admin. */
  totpEnforced: integer("totp_enforced", { mode: "boolean" }).notNull().default(false),
  /** Stored filename only (e.g. `12.jpg`) under the profile-photos upload directory. */
  profilePhotoPath: text("profile_photo_path"),
});

// ---- Download Requests (for students) ----
export const downloadRequests = sqliteTable("download_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  requestSource: text("request_source").notNull().default("ast_report"), // ast_report, hospital_case
  status: text("status").notNull().default("pending"), // pending, approved, rejected, 
  dateFrom: text("date_from"), // BS date filter
  dateTo: text("date_to"),
  reason: text("reason"),
  adminNote: text("admin_note"),
  resolvedBy: integer("resolved_by"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const passwordResetRequests = sqliteTable("password_reset_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  requestedByRole: text("requested_by_role").notNull(),
  passwordHash: text("password_hash").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  resolvedBy: integer("resolved_by"),
  resolverNote: text("resolver_note"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

const caseChangeLogs = sqliteTable("case_change_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: integer("case_id"),
  caseNumber: text("case_number").notNull(),
  caseScope: text("case_scope").notNull(), // ast, hospital
  action: text("action").notNull(), // created, deleted
  actorUserId: integer("actor_user_id").notNull(),
  actorRole: text("actor_role").notNull(),
  actorName: text("actor_name").notNull(),
  actorUsername: text("actor_username").notNull(),
  createdAt: text("created_at").notNull(),
});

// ---- Cases ----
export const cases = sqliteTable("cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseNumber: text("case_number").notNull(),
  billNumber: text("bill_number"),
  dailyNumber: integer("daily_number"),
  monthlyNumber: integer("monthly_number"),
  yearlyNumber: integer("yearly_number"),
  date: text("date").notNull(), // BS date YYYY-MM-DD
  dateAd: text("date_ad"), // AD date YYYY-MM-DD

  // Owner information
  ownerName: text("owner_name").notNull(),
  ownerAddress: text("owner_address").notNull(),
  ownerPhone: text("owner_phone").notNull(),

  // Animal information
  species: text("species").notNull(),
  breed: text("breed").notNull(),
  animalName: text("animal_name"),
  age: text("age"),
  sex: text("sex"),

  // Sample information
  sampleType: text("sample_type"),
  sampleDate: text("sample_date"), // BS date
  sampleDateAd: text("sample_date_ad"), // AD date
  cultureResult: text("culture_result"),

  // AST Results stored as JSON text
  astResults: text("ast_results"),

  // General remarks
  remarks: text("remarks"),

  // Who registered this case
  registeredBy: integer("registered_by"),

  createdAt: text("created_at").notNull(),

  // Who last updated this case
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedByName: text("last_updated_by_name"),
  updatedAt: text("updated_at"),
  customFields: text("custom_fields"),

  // New: Treatment details (JSON text)
  treatmentDetails: text("treatment_details"),

  // Attending veterinarian (hospital cases; snapshot + optional catalog id)
  veterinarianId: integer("veterinarian_id"),
  veterinarianName: text("veterinarian_name"),
  veterinarianNvc: text("veterinarian_nvc"),
  veterinarianDepartment: text("veterinarian_department"),
});

export const breakpoints = sqliteTable("breakpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  antibiotic: text("antibiotic").notNull(),
  symbol: text("symbol").notNull(),
  content: text("content").notNull(),
  sensitiveMin: integer("sensitive_min").notNull(),
  intermediateLow: integer("intermediate_low"),
  intermediateHigh: integer("intermediate_high"),
  resistantMax: integer("resistant_max").notNull(),
  primaryTargets: text("primary_targets"),
  // NEW: preset flag (boolean)
  isPreset: integer("is_preset", { mode: "boolean" }).notNull().default(false),
});

// ---- New Master Data Tables for Treatments ----
export const medications = sqliteTable("medications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const routesOfAdministration = sqliteTable("routes_of_administration", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  abbreviation: text("abbreviation").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const frequencies = sqliteTable("frequencies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  shortCode: text("short_code"), // e.g., OD, BID
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const doseUnits = sqliteTable("dose_units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const durations = sqliteTable("durations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  value: integer("value"), // e.g., 3 for 3 days
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const caseAttachments = sqliteTable("case_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: integer("case_id"),
  tempToken: text("temp_token"),
  sectionKey: text("section_key").notNull().default("treatment"),
  category: text("category").notNull().default("diagnostic"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storagePath: text("storage_path").notNull(),
  createdBy: integer("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const veterinarians = sqliteTable("veterinarians", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  nvcRegistrationNumber: text("nvc_registration_number").notNull(),
  department: text("department").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});


// ---- Password policy ----
/**
 * Minimum length applied at signup, self-service password change, and password
 * reset flow. Was 6 (NIST 2016 minimum) — raised to 10 because a 10-char
 * baseline materially raises the cost of any credential-stuffing or
 * brute-force attempts. Shared between client and server so messages match.
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Validates that a password meets the project's policy:
 *   - >= PASSWORD_MIN_LENGTH characters
 *   - Contains at least two of: lowercase, uppercase, digit, symbol
 *
 * Returns a human-readable error string when invalid, or `null` when OK.
 */
export function validateStrongPassword(password: string): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  if (classes < 2) {
    return "Password must contain at least two of: lowercase, uppercase, digit, symbol";
  }
  return null;
}

// ---- Insert Schemas ----
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  passwordHash: true,
  role: true,
  approved: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  totpSecret: true,
  totpEnabled: true,
  totpEnforced: true,
  profilePhotoPath: true,
}).extend({
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .refine((p) => validateStrongPassword(p) === null, {
      message:
        "Password must contain at least two of: lowercase, uppercase, digit, symbol",
    }),
  designation: z.enum(["lab_assistant", "veterinarian", "student", "intern"]),
  studentBatch: z.number().int().min(1).max(99).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.designation === "student") {
    if (typeof data.studentBatch !== "number" || !Number.isInteger(data.studentBatch)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["studentBatch"],
        message: "Student batch is required",
      });
    }
    return;
  }
  if (data.studentBatch != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["studentBatch"],
      message: "Student batch is only allowed for student designation",
    });
  }
});

export const insertCaseSchema = createInsertSchema(cases).omit({
  id: true,
  createdAt: true,
  lastUpdatedBy: true,
  lastUpdatedByName: true,
  updatedAt: true,
});

/**
 * Explicit allowlist of fields a client may patch via PATCH /api/cases/:id.
 *
 * `id`, `createdAt`, `registeredBy`, `caseNumber`, `dailyNumber`,
 * `monthlyNumber`, `yearlyNumber`, and the `lastUpdated*` / `updatedAt`
 * audit fields are deliberately NOT in this list — they are either
 * server-controlled or set at registration time and should never be
 * mutated by a PATCH body. The route handler sets `lastUpdated*` /
 * `updatedAt` itself.
 */
export const patchCaseSchema = insertCaseSchema
  .pick({
    billNumber: true,
    date: true,
    dateAd: true,
    ownerName: true,
    ownerAddress: true,
    ownerPhone: true,
    species: true,
    breed: true,
    animalName: true,
    age: true,
    sex: true,
    sampleType: true,
    sampleDate: true,
    sampleDateAd: true,
    cultureResult: true,
    astResults: true,
    remarks: true,
    customFields: true,
    treatmentDetails: true,
    veterinarianId: true,
    veterinarianName: true,
    veterinarianNvc: true,
    veterinarianDepartment: true,
  })
  .partial();

export const insertBreakpointSchema = createInsertSchema(breakpoints).omit({
  id: true,
});

// ---- Insert Schemas for new master data ----
export const insertMedicationSchema = createInsertSchema(medications).omit({
  id: true,
  createdAt: true,
});

export const insertRouteOfAdministrationSchema = createInsertSchema(routesOfAdministration).omit({
  id: true,
  createdAt: true,
});

export const insertFrequencySchema = createInsertSchema(frequencies).omit({
  id: true,
  createdAt: true,
});

export const insertDoseUnitSchema = createInsertSchema(doseUnits).omit({
  id: true,
  createdAt: true,
});

export const insertDurationSchema = createInsertSchema(durations).omit({
  id: true,
  createdAt: true,
});

export const insertVeterinarianSchema = createInsertSchema(veterinarians).omit({
  id: true,
  createdAt: true,
  displayOrder: true,
});


// ---- Types ----
export type User = typeof users.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertBreakpoint = z.infer<typeof insertBreakpointSchema>;
export type Breakpoint = typeof breakpoints.$inferSelect;
export type DownloadRequest = typeof downloadRequests.$inferSelect;
export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;

// New master data types
export type Medication = typeof medications.$inferSelect;
export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type RouteOfAdministration = typeof routesOfAdministration.$inferSelect;
export type InsertRouteOfAdministration = z.infer<typeof insertRouteOfAdministrationSchema>;
export type Frequency = typeof frequencies.$inferSelect;
export type InsertFrequency = z.infer<typeof insertFrequencySchema>;
export type DoseUnit = typeof doseUnits.$inferSelect;
export type InsertDoseUnit = z.infer<typeof insertDoseUnitSchema>;
export type Duration = typeof durations.$inferSelect;
export type InsertDuration = z.infer<typeof insertDurationSchema>;
export type CaseAttachment = typeof caseAttachments.$inferSelect;
export type Veterinarian = typeof veterinarians.$inferSelect;
export type InsertVeterinarian = z.infer<typeof insertVeterinarianSchema>;


// Safe user type (without password hash) for frontend
export type SafeUser = Omit<User, "passwordHash" | "totpSecret" | "profilePhotoPath"> & {
  profilePhotoUrl?: string | null;
};
