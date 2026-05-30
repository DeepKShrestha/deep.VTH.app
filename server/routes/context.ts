import type { NextFunction, Request, Response } from "express";
import NepaliDateImport from "nepali-date-converter";
import type { PermissionCapability } from "@shared/capabilities";
import { hasCapability, resolveCapabilitiesForRole } from "@shared/capabilities";
import type { AuthenticatedRequest, CurrentUser } from "./types";
import { MESSAGES } from "./messages";
import { DB_PROVIDER } from "../db";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { authSessionRepo } from "../auth-session-repo";
import {
  getCachedCurrentUser,
  rememberCurrentUser,
} from "../current-user-cache";
import { findApprovedDownloadRequest } from "../download-request-auth";
import { getPgPool } from "../pg-pool";
import { dbAll, dbGet } from "../db-query";

const NepaliDateClass = (NepaliDateImport as any).default || NepaliDateImport;

function getNepaliDateClass() {
  return NepaliDateClass;
}

export function getTodayBs(): string {
  const NepaliDate = getNepaliDateClass();
  const nd = new NepaliDate();
  return nd.format("YYYY-MM-DD");
}

export const sessions = {
  async set(token: string, userId: number) {
    await authSessionRepo.setSession(token, userId);
  },
  async get(token: string) {
    return authSessionRepo.getSessionUserId(token);
  },
  async delete(token: string) {
    await authSessionRepo.deleteSession(token);
  },
  async markAway(token: string) {
    await authSessionRepo.markSessionAway(token);
  },
  async clear() {
    await authSessionRepo.clearSessions();
  },
};

export function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

async function getCurrentUser(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.substring(7);

  // Fast path: cached snapshot avoids re-querying users on every request.
  // We still validate the session in the DB so revocation (logout, ban,
  // password rotation) takes effect within `last_seen_at` throttle.
  const cached = getCachedCurrentUser(token);
  if (cached) {
    const userId = await sessions.get(token);
    if (userId === cached.id) return cached;
    // Session was invalidated or rebound — fall through to slow path.
  }

  const userId = await sessions.get(token);
  if (!userId) return null;
  const user = await authSessionRepo.getUserById(userId);
  if (!user) return null;
  const snapshot: CurrentUser = {
    id: user.id,
    role: user.role,
    approved: user.approved,
    designation: user.designation,
    // Carry studentBatch so per-batch register middleware doesn't have to
    // re-query the users table on every POST /api/cases. Null for non-
    // students; integer (e.g. 76) for students.
    studentBatch: user.studentBatch ?? null,
  };
  rememberCurrentUser(token, snapshot);
  return snapshot;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });
  if (!user.approved)
    return res.status(403).json({ message: MESSAGES.ACCOUNT_NOT_APPROVED });
  (req as AuthenticatedRequest).currentUser = user as CurrentUser;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).currentUser;
    if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });
    if (!roles.includes(user.role))
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    next();
  };
}

export function isAdminRole(role: string): boolean {
  return role === "superadmin" || role === "admin";
}

export type { PermissionCapability };
export { resolveCapabilitiesForRole, hasCapability };

export function requireAnyCapability(...capabilities: PermissionCapability[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).currentUser;
    if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });
    const allowed = capabilities.some((capability) => hasCapability(user.role, capability));
    if (!allowed) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    next();
  };
}

export async function isDashboardVisibleForRole(role: string): Promise<boolean> {
  if (!role) return false;
  if (DB_PROVIDER === "postgres") {
    const result = await getPgPool().query<{ dashboard_visible: boolean | number }>(
      "SELECT dashboard_visible FROM role_feature_visibility WHERE role = $1 LIMIT 1",
      [role],
    );
    const row = result.rows[0];
    if (!row) return true;
    return Boolean(row.dashboard_visible);
  }
  const row = await dbGet<{ dashboard_visible: number }>(
    sql`SELECT dashboard_visible FROM role_feature_visibility WHERE role = ${role} LIMIT 1`,
  );
  if (!row) return true;
  return Boolean(row.dashboard_visible);
}

export async function isVthDashboardVisibleForRole(role: string): Promise<boolean> {
  if (!role) return false;
  if (DB_PROVIDER === "postgres") {
    const result = await getPgPool().query<{ vth_dashboard_visible: boolean | number }>(
      "SELECT vth_dashboard_visible FROM role_feature_visibility WHERE role = $1 LIMIT 1",
      [role],
    );
    const row = result.rows[0];
    if (!row) return true;
    return Boolean(row.vth_dashboard_visible);
  }
  try {
    const row = await dbGet<{ vth_dashboard_visible: number }>(
      sql`SELECT vth_dashboard_visible FROM role_feature_visibility WHERE role = ${role} LIMIT 1`,
    );
    if (!row) return true;
    return Boolean(row.vth_dashboard_visible);
  } catch {
    // Backward compatibility for databases not yet migrated with vth_dashboard_visible.
    return isDashboardVisibleForRole(role);
  }
}

/**
 * Whether AST module **export / download** is allowed for the given role.
 *
 * This is a per-role admin toggle (in `role_feature_visibility.ast_export_visible`)
 * that acts as an extra gate on top of the existing capability/approval rules
 * (`ast.download` for staff/intern/admin, and the request-approval flow for
 * students). If admin turns this off for a role, the API will deny exports
 * even if the role would otherwise be allowed.
 *
 * Returns `true` for a missing row so existing installations default to the
 * pre-toggle behavior (visible) until an admin explicitly turns it off.
 */
export async function isAstExportVisibleForRole(role: string): Promise<boolean> {
  if (!role) return false;
  if (DB_PROVIDER === "postgres") {
    const result = await getPgPool().query<{ ast_export_visible: boolean | number }>(
      "SELECT ast_export_visible FROM role_feature_visibility WHERE role = $1 LIMIT 1",
      [role],
    );
    const row = result.rows[0];
    if (!row) return true;
    return Boolean(row.ast_export_visible);
  }
  try {
    const row = await dbGet<{ ast_export_visible: number }>(
      sql`SELECT ast_export_visible FROM role_feature_visibility WHERE role = ${role} LIMIT 1`,
    );
    if (!row) return true;
    return Boolean(row.ast_export_visible);
  } catch {
    // Old DBs that haven't migrated yet behave as visible.
    return true;
  }
}

/**
 * Whether Hospital (VTH) module **registration** is allowed for the given
 * role, per the admin toggle. UNLIKE the export toggle, the column is
 * nullable: a missing/NULL value means "inherit the role's intrinsic
 * capability" (`hospital.case.create`). Non-null is an explicit admin
 * override. This is what lets admins grant AST registration to students
 * (who don't have `ast.case.create`) without rewriting the capability
 * matrix, and conversely lock down registration for a role that normally
 * has it. The per-batch refinement is layered on top in
 * `canCreateCaseInScope`.
 */
export async function isHospitalRegisterVisibleForRole(role: string): Promise<boolean> {
  return resolveRegisterColumn(
    role,
    "hospital_register_visible",
    "hospital.case.create",
  );
}

/** AST twin of `isHospitalRegisterVisibleForRole`. */
export async function isAstRegisterVisibleForRole(role: string): Promise<boolean> {
  return resolveRegisterColumn(
    role,
    "ast_register_visible",
    "ast.case.create",
  );
}

async function resolveRegisterColumn(
  role: string,
  column: "ast_register_visible" | "hospital_register_visible",
  fallbackCapability: PermissionCapability,
): Promise<boolean> {
  if (!role) return false;
  if (DB_PROVIDER === "postgres") {
    try {
      const result = await getPgPool().query<{ value: boolean | number | null }>(
        `SELECT ${column} AS value FROM role_feature_visibility WHERE role = $1 LIMIT 1`,
        [role],
      );
      const row = result.rows[0];
      if (!row || row.value == null) return hasCapability(role, fallbackCapability);
      return Boolean(row.value);
    } catch {
      // Pre-migration DB without the column yet — behave as if there were
      // no override row and let the capability matrix decide.
      return hasCapability(role, fallbackCapability);
    }
  }
  try {
    const row = await dbGet<{ value: number | null }>(
      column === "ast_register_visible"
        ? sql`SELECT ast_register_visible AS value FROM role_feature_visibility WHERE role = ${role} LIMIT 1`
        : sql`SELECT hospital_register_visible AS value FROM role_feature_visibility WHERE role = ${role} LIMIT 1`,
    );
    if (!row || row.value == null) return hasCapability(role, fallbackCapability);
    return Boolean(row.value);
  } catch {
    return hasCapability(role, fallbackCapability);
  }
}

/**
 * Per-batch override for student registration. Returns:
 *   - `true`  → explicit admin allow (or default if no row)
 *   - `false` → explicit admin deny for this batch
 *
 * A missing row inherits the role-level decision (returns `true`). The role
 * toggle is the master switch — this only ever narrows further. See
 * migrations/0020_role_register_visibility.sql for the rationale.
 */
export async function isBatchRegisterVisible(
  scope: "ast" | "hospital",
  batch: number,
): Promise<boolean> {
  if (!Number.isFinite(batch) || batch <= 0) return true;
  if (DB_PROVIDER === "postgres") {
    try {
      const result = await getPgPool().query<{ register_visible: boolean | number }>(
        "SELECT register_visible FROM student_batch_feature_visibility WHERE scope = $1 AND batch = $2 LIMIT 1",
        [scope, batch],
      );
      const row = result.rows[0];
      if (!row) return true;
      return Boolean(row.register_visible);
    } catch {
      return true;
    }
  }
  try {
    const row = await dbGet<{ register_visible: number }>(
      sql`SELECT register_visible FROM student_batch_feature_visibility
          WHERE scope = ${scope} AND batch = ${batch} LIMIT 1`,
    );
    if (!row) return true;
    return Boolean(row.register_visible);
  } catch {
    return true;
  }
}

/**
 * Single source of truth for "can this user create a new case in this
 * scope right now". Combines:
 *   1. Per-role admin toggle (with capability fallback when null).
 *   2. Per-batch override (students only; can narrow but not widen).
 *
 * Used by both the server route middlewares (canRegister / canRegisterHospital)
 * AND by the auth payload so the client and server agree on what the
 * "Register New Case" button does.
 */
export async function canCreateCaseInScope(
  user: { role: string; studentBatch?: number | null },
  scope: "ast" | "hospital",
): Promise<boolean> {
  const roleAllows =
    scope === "ast"
      ? await isAstRegisterVisibleForRole(user.role)
      : await isHospitalRegisterVisibleForRole(user.role);
  if (!roleAllows) return false;
  if (user.role === "student" && typeof user.studentBatch === "number") {
    return await isBatchRegisterVisible(scope, user.studentBatch);
  }
  return true;
}

/**
 * Whether Hospital (VTH) module **export / download** is allowed for the
 * given role. See `isAstExportVisibleForRole` for the full rationale — same
 * pattern, different column.
 */
export async function isHospitalExportVisibleForRole(role: string): Promise<boolean> {
  if (!role) return false;
  if (DB_PROVIDER === "postgres") {
    const result = await getPgPool().query<{ hospital_export_visible: boolean | number }>(
      "SELECT hospital_export_visible FROM role_feature_visibility WHERE role = $1 LIMIT 1",
      [role],
    );
    const row = result.rows[0];
    if (!row) return true;
    return Boolean(row.hospital_export_visible);
  }
  try {
    const row = await dbGet<{ hospital_export_visible: number }>(
      sql`SELECT hospital_export_visible FROM role_feature_visibility WHERE role = ${role} LIMIT 1`,
    );
    if (!row) return true;
    return Boolean(row.hospital_export_visible);
  } catch {
    return true;
  }
}

export function getIdParam(req: Request): number {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  return Number.parseInt(id, 10);
}

export function getPaginationParams(
  req: Request,
  defaults: { page: number; pageSize: number; maxPageSize?: number } = {
    page: 1,
    pageSize: 50,
    maxPageSize: 200,
  },
) {
  const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
  const rawPageSize = Array.isArray(req.query.pageSize)
    ? req.query.pageSize[0]
    : req.query.pageSize;
  const page = Math.max(
    1,
    Number.parseInt(String(rawPage ?? defaults.page), 10) || defaults.page,
  );
  const pageSize = Math.min(
    defaults.maxPageSize ?? 200,
    Math.max(
      1,
      Number.parseInt(String(rawPageSize ?? defaults.pageSize), 10) ||
        defaults.pageSize,
    ),
  );
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    shouldPaginate:
      rawPage !== undefined ||
      rawPageSize !== undefined ||
      req.query.paginated === "true",
  };
}

/**
 * AST case-registration gate. Combines the per-role admin toggle (with
 * capability fallback) AND the per-batch student override. This replaced
 * the old "just check `hasCapability`" check so admins can grant or revoke
 * AST registration without code changes — see
 * `canCreateCaseInScope` and migrations/0020_role_register_visibility.sql.
 */
export function canRegister(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).currentUser;
  if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });
  void (async () => {
    try {
      const allowed = await canCreateCaseInScope(user, "ast");
      if (!allowed) {
        return res
          .status(403)
          .json({ message: "AST registration is disabled for your role or batch." });
      }
      next();
    } catch (error) {
      return res.status(500).json({
        message: "Failed to validate registration permissions",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })().catch(() => {});
}

/** Hospital twin of `canRegister`. */
export function canRegisterHospital(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).currentUser;
  if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });
  void (async () => {
    try {
      const allowed = await canCreateCaseInScope(user, "hospital");
      if (!allowed) {
        return res
          .status(403)
          .json({ message: "Hospital registration is disabled for your role or batch." });
      }
      next();
    } catch (error) {
      return res.status(500).json({
        message: "Failed to validate registration permissions",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })().catch(() => {});
}

export function canDownload(req: Request, res: Response, next: NextFunction) {
  return canDownloadBySource("ast_report")(req, res, next);
}

function canDownloadBySource(source: "ast_report" | "hospital_case") {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).currentUser;
    if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });

    // Hard capability/role gate first (matches pre-toggle behaviour).
    if (user.role !== "student" && !hasCapability(user.role, "ast.download")) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }

    // Admin-configurable per-role visibility toggle. Acts as an EXTRA gate on
    // top of the capability/approval rules: even a staff member with
    // `ast.download` is blocked if admin turned the toggle off for their role.
    // Reads happen in an async chain because we may also need to check the
    // download-request approval below.
    void (async () => {
      try {
        const visible =
          source === "hospital_case"
            ? await isHospitalExportVisibleForRole(user.role)
            : await isAstExportVisibleForRole(user.role);
        if (!visible) {
          return res.status(403).json({
            message:
              "Export is disabled for your role. Contact an administrator if you need access.",
          });
        }

        if (isAdminRole(user.role) || user.role === "staff" || user.role === "intern") {
          return next();
        }

        // Students: still require an approved download request that covers
        // the requested date range — the toggle only ADDS a gate, it does
        // not remove the approval flow.
        const exportFrom =
          typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : undefined;
        const exportTo =
          typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : undefined;
        const approved = await findApprovedDownloadRequest({
          userId: user.id,
          source,
          exportDateFrom: exportFrom || null,
          exportDateTo: exportTo || null,
        });
        if (!approved) {
          return res.status(403).json({
            message:
              "Download access not approved for this date range, or approval was already used. Submit a new download request.",
          });
        }
        (req as AuthenticatedRequest).approvedDownloadRequest = {
          id: approved.id,
          status: approved.status,
        };
        return next();
      } catch (error) {
        return res.status(500).json({
          message: "Failed to validate download permissions",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })().catch(() => {
      // Last-resort guard; outer try/catch already responds.
    });
  };
}

export function canDownloadHospital(req: Request, res: Response, next: NextFunction) {
  return canDownloadBySource("hospital_case")(req, res, next);
}

export const SEED_BREAKPOINTS = [
  {
    antibiotic: "Amikacin",
    symbol: "AK",
    content: "30 µg",
    sensitiveMin: 17,
    intermediateLow: 15,
    intermediateHigh: 16,
    resistantMax: 14,
    primaryTargets: "Gram-negative bacilli (e.g., Pseudomonas spp.)",
  },
  {
    antibiotic: "Amoxicillin",
    symbol: "AML",
    content: "25 µg",
    sensitiveMin: 19,
    intermediateLow: 16,
    intermediateHigh: 18,
    resistantMax: 15,
    primaryTargets: "Enterobacteriaceae, Streptococci",
  },
  {
    antibiotic: "Amoxicillin",
    symbol: "AML",
    content: "10 µg",
    sensitiveMin: 17,
    intermediateLow: 14,
    intermediateHigh: 16,
    resistantMax: 13,
    primaryTargets: "Enterobacteriaceae, Streptococci",
  },
  {
    antibiotic: "Azithromycin",
    symbol: "AZM",
    content: "15 µg",
    sensitiveMin: 18,
    intermediateLow: 14,
    intermediateHigh: 17,
    resistantMax: 13,
    primaryTargets: "Respiratory pathogens",
  },
  {
    antibiotic: "Azithromycin (S. typhi)",
    symbol: "AZM",
    content: "15 µg",
    sensitiveMin: 13,
    intermediateLow: null,
    intermediateHigh: null,
    resistantMax: 12,
    primaryTargets: "Salmonella typhi",
  },
  {
    antibiotic: "Cefalexin",
    symbol: "LEX",
    content: "30 µg",
    sensitiveMin: 18,
    intermediateLow: 15,
    intermediateHigh: 17,
    resistantMax: 14,
    primaryTargets: "Staphylococci",
  },
  {
    antibiotic: "Chloramphenicol",
    symbol: "C",
    content: "30 µg",
    sensitiveMin: 18,
    intermediateLow: 13,
    intermediateHigh: 17,
    resistantMax: 12,
    primaryTargets: "Anaerobes, Actinobacillus spp.",
  },
  {
    antibiotic: "Ciprofloxacin",
    symbol: "CIP",
    content: "5 µg",
    sensitiveMin: 25,
    intermediateLow: 22,
    intermediateHigh: 24,
    resistantMax: 21,
    primaryTargets: "Enterobacteriaceae",
  },
  {
    antibiotic: "Doxycycline",
    symbol: "DO",
    content: "30 µg",
    sensitiveMin: 16,
    intermediateLow: 13,
    intermediateHigh: 15,
    resistantMax: 12,
    primaryTargets: "Pasteurella spp., E. coli",
  },
  {
    antibiotic: "Enrofloxacin",
    symbol: "ENR",
    content: "5 µg",
    sensitiveMin: 22,
    intermediateLow: 18,
    intermediateHigh: 21,
    resistantMax: 17,
    primaryTargets: "Enterobacteriaceae",
  },
  {
    antibiotic: "Enrofloxacin",
    symbol: "ENR",
    content: "10 µg",
    sensitiveMin: 25,
    intermediateLow: 21,
    intermediateHigh: 24,
    resistantMax: 20,
    primaryTargets: "Pseudomonas spp.",
  },
  {
    antibiotic: "Florfenicol",
    symbol: "FFC",
    content: "30 µg",
    sensitiveMin: 19,
    intermediateLow: 16,
    intermediateHigh: 18,
    resistantMax: 15,
    primaryTargets: "BRD pathogens (e.g. Mannheimia haemolytica)",
  },
  {
    antibiotic: "Gentamicin",
    symbol: "GEN",
    content: "10 µg",
    sensitiveMin: 15,
    intermediateLow: 13,
    intermediateHigh: 14,
    resistantMax: 12,
    primaryTargets: "Gram-negative bacilli",
  },
  {
    antibiotic: "Levofloxacin",
    symbol: "LEV",
    content: "5 µg",
    sensitiveMin: 20,
    intermediateLow: 17,
    intermediateHigh: 19,
    resistantMax: 16,
    primaryTargets: "Respiratory & UTI pathogens",
  },
  {
    antibiotic: "Neomycin",
    symbol: "N",
    content: "30 µg",
    sensitiveMin: 17,
    intermediateLow: 14,
    intermediateHigh: 16,
    resistantMax: 13,
    primaryTargets: "Enterobacteriaceae",
  },
  {
    antibiotic: "Tetracycline",
    symbol: "TE",
    content: "30 µg",
    sensitiveMin: 15,
    intermediateLow: 12,
    intermediateHigh: 14,
    resistantMax: 11,
    primaryTargets: "Broad-spectrum",
  },
  {
    antibiotic: "Trimethoprim",
    symbol: "TR",
    content: "5 µg",
    sensitiveMin: 16,
    intermediateLow: 11,
    intermediateHigh: 15,
    resistantMax: 10,
    primaryTargets: "Urinary pathogens",
  },
] as const;

