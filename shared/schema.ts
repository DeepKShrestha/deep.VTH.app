import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("pending"), // superadmin, admin, staff, student, pending
  approved: integer("approved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
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

export const caseChangeLogs = sqliteTable("case_change_logs", {
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

// ---- Insert Schemas ----
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  passwordHash: true,
  role: true,
  approved: true,
}).extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  designation: z.enum(["lab_assistant", "veterinarian", "student", "intern"]),
});

export const insertCaseSchema = createInsertSchema(cases).omit({
  id: true,
  createdAt: true,
  lastUpdatedBy: true,
  lastUpdatedByName: true,
  updatedAt: true,
});

export const insertBreakpointSchema = createInsertSchema(breakpoints).omit({
  id: true,
});

export const insertDownloadRequestSchema = createInsertSchema(downloadRequests).omit({
  id: true,
  createdAt: true,
  status: true,
  adminNote: true,
  resolvedBy: true,
  resolvedAt: true,
});

export const insertPasswordResetRequestSchema = createInsertSchema(
  passwordResetRequests,
).omit({
  id: true,
  status: true,
  resolvedBy: true,
  resolverNote: true,
  createdAt: true,
  resolvedAt: true,
});

// ---- Types ----
export type User = typeof users.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertBreakpoint = z.infer<typeof insertBreakpointSchema>;
export type Breakpoint = typeof breakpoints.$inferSelect;
export type DownloadRequest = typeof downloadRequests.$inferSelect;
export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;

// Safe user type (without password hash) for frontend
export type SafeUser = Omit<User, "passwordHash">;
