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
  const userId = await sessions.get(token);
  if (!userId) return null;
  const user = await authSessionRepo.getUserById(userId);
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    approved: user.approved,
    designation: user.designation,
  };
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

export function canRegister(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).currentUser;
  if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });
  if (hasCapability(user.role, "ast.case.create")) {
    return next();
  }
  return res.status(403).json({ message: "Insufficient permissions for AST registration" });
}

export function canRegisterHospital(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).currentUser;
  if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });
  if (hasCapability(user.role, "hospital.case.create")) {
    return next();
  }
  return res.status(403).json({ message: "Insufficient permissions for hospital case registration" });
}

export function canDownload(req: Request, res: Response, next: NextFunction) {
  return canDownloadBySource("ast_report")(req, res, next);
}

function canDownloadBySource(source: "ast_report" | "hospital_case") {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).currentUser;
    if (!user) return res.status(401).json({ message: MESSAGES.NOT_AUTHENTICATED });

    if (user.role !== "student" && !hasCapability(user.role, "ast.download")) {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }

    if (isAdminRole(user.role) || user.role === "staff" || user.role === "intern") {
      return next();
    }

    void (async () => {
      const requests = await dbAll<{ id: number; status: string }>(
        sql`SELECT id, status FROM download_requests
          WHERE user_id = ${user.id}
            AND request_source = ${source}
          ORDER BY created_at DESC`,
      );
      const approved = requests.find((r) => r.status === "approved");
      if (!approved) {
        return res.status(403).json({
          message:
            "Download access not approved or already used. Please submit a new download request.",
        });
      }
      (req as AuthenticatedRequest).approvedDownloadRequest = {
        id: approved.id,
        status: approved.status,
      };
      return next();
    })().catch((error) =>
      res.status(500).json({
        message: "Failed to validate download permissions",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    );
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

