import type { Express, RequestHandler } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { sql } from "drizzle-orm";
import { dbAll, dbGet, dbRun } from "../db-query";
import {
  getIdParam,
  getPaginationParams,
  isDashboardVisibleForRole,
  isVthDashboardVisibleForRole,
  isAdminRole,
  requireAuth,
  requireRole,
} from "./context";
import type { AuthenticatedRequest } from "./types";
import { MESSAGES } from "./messages";
import { authSessionRepo } from "../auth-session-repo";
import { toClientSafeUser } from "../user-public";
import {
  doseUnitRepo,
  durationRepo,
  frequencyRepo,
  medicationRepo,
  routeOfAdministrationRepo,
} from "../repos";
import {
  ensureHospitalTreatmentDefinition,
  ensureHospitalVeterinarianDefinition,
  mergeOrphanFormSections,
} from "../hospital-form-definition";
import { parseMedicationImportFile } from "../medication-import-parse";
import type { ParsedMedicationRow } from "../medication-import-parse";
import {
  deletePasswordResetIdCardFile,
  resolvePasswordResetIdCardAbsolutePath,
} from "../services/password-reset-id-card-store";
import {
  isBuiltinTestsSuggestedQuestionKey,
  isTestsSuggestedSectionKey,
  mainKeywordFromLabel,
  panelSubQuestionKeyFromLabel,
  parseTestsSuggestedOptions,
  serializeTestsSuggestedOptions,
  shouldIncludeTestsSuggestedFormQuestion,
} from "@shared/hospital-tests-suggested";

const PROTECTED_PANEL_KEYS = new Set(["enzymePanelTests", "rapidDiagnosticTests"]);

function dedupeMedicationImportRows(rows: ParsedMedicationRow[]): ParsedMedicationRow[] {
  const m = new Map<string, ParsedMedicationRow>();
  for (const r of rows) {
    m.set(r.name.toLowerCase(), r);
  }
  return Array.from(m.values());
}

const medicationImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const n = file.originalname.toLowerCase();
    if (n.endsWith(".csv") || n.endsWith(".xlsx")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only .csv and .xlsx files are allowed"));
  },
});

function slugifyKey(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function resolveFormScope(raw: unknown): "ast" | "hospital" {
  return String(raw ?? "hospital").toLowerCase() === "ast" ? "ast" : "hospital";
}

const HIDDEN_SUPERADMIN_USERNAME =
  process.env.HIDDEN_SUPERADMIN_USERNAME?.trim() || "system_superadmin";
const HIDDEN_SUPERADMIN_EMAIL =
  process.env.HIDDEN_SUPERADMIN_EMAIL?.trim() ||
  "system.superadmin@localhost";
const hiddenSuperadminEnabled = process.env.HIDDEN_SUPERADMIN_ENABLED === "true";
const ALLOWED_USER_ROLES = ["superadmin", "admin", "staff", "intern", "student", "pending"] as const;
type AllowedUserRole = (typeof ALLOWED_USER_ROLES)[number];

function parseAllowedUserRole(raw: unknown): AllowedUserRole | null {
  const role = String(raw ?? "").trim().toLowerCase();
  return (ALLOWED_USER_ROLES as readonly string[]).includes(role) ? (role as AllowedUserRole) : null;
}

function parseStudentBatch(raw: unknown): number | null {
  const value = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isInteger(value) || value < 1 || value > 99) return null;
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return (
    message.includes("unique") ||
    message.includes("duplicate") ||
    message.includes("constraint")
  );
}

function isHiddenSuperadminUser(user: {
  username: string;
  email: string;
}): boolean {
  if (!hiddenSuperadminEnabled) return false;
  return (
    user.username === HIDDEN_SUPERADMIN_USERNAME ||
    user.email === HIDDEN_SUPERADMIN_EMAIL
  );
}

type DownloadRequestRow = {
  id: number;
  user_id: number;
  request_source: string;
  date_from: string | null;
  date_to: string | null;
  reason: string | null;
  status: string;
  admin_note: string | null;
  resolved_by: number | null;
  created_at: string;
  resolved_at: string | null;
};

function toDownloadRequest(row: DownloadRequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
    requestSource: row.request_source,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    reason: row.reason,
    status: row.status,
    adminNote: row.admin_note,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

type PasswordResetRequestRow = {
  id: number;
  user_id: number;
  requested_by_role: string;
  password_hash: string;
  reason: string | null;
  status: string;
  resolved_by: number | null;
  resolver_note: string | null;
  id_card_filename: string | null;
  created_at: string;
  resolved_at: string | null;
};

function canResolvePasswordResetRequest(
  currentUser: { role: string },
  requestedByRole: string,
): boolean {
  if (currentUser.role === "superadmin") return true;
  return requestedByRole !== "admin" && requestedByRole !== "superadmin";
}

async function logAdminAction(args: {
  actorUserId: number;
  actorRole: string;
  actionType: string;
  targetType: string;
  targetId?: string | number | null;
  details?: Record<string, unknown>;
}) {
  await dbRun(
    sql`INSERT INTO admin_action_logs
        (actor_user_id, actor_role, action_type, target_type, target_id, details_json, created_at)
        VALUES (
          ${args.actorUserId},
          ${args.actorRole},
          ${args.actionType},
          ${args.targetType},
          ${args.targetId == null ? null : String(args.targetId)},
          ${args.details ? JSON.stringify(args.details) : null},
          ${new Date().toISOString()}
        )`,
  );
}


function toPasswordResetRequest(row: PasswordResetRequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
    requestedByRole: row.requested_by_role,
    reason: row.reason,
    status: row.status,
    resolvedBy: row.resolved_by,
    resolverNote: row.resolver_note,
    hasIdCard: Boolean(row.id_card_filename),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export function registerAdminRoutes(app: Express) {
  const buildAdminNotifications = async (
    currentUserId: number,
  ): Promise<
    Array<{
      key: string;
      type: "pending-approval" | "download-request" | "password-reset";
      title: string;
      message: string;
      href: string;
      createdAt: string;
      isRead: boolean;
      isDeleted: boolean;
    }>
  > => {
    const pendingUsers = (await authSessionRepo.getUsers())
      .filter((u) => !u.approved && !isHiddenSuperadminUser(u))
      .map((u) => ({
        baseKey: `pending-approval:${u.id}`,
        type: "pending-approval" as const,
        title: "New account approval request",
        message: `${u.fullName} (@${u.username}) is waiting for approval.`,
        href: `/admin?tab=pending&focus=user-${u.id}`,
        createdAt: u.createdAt,
      }));

    const pendingDownloadRows = await dbAll<DownloadRequestRow>(
      sql`SELECT id, user_id, request_source, date_from, date_to, reason, status, admin_note, resolved_by, created_at, resolved_at
          FROM download_requests
          WHERE status = ${"pending"}
          ORDER BY created_at DESC`,
    );
    const pendingResetRows = await dbAll<PasswordResetRequestRow>(
      sql`SELECT id, user_id, requested_by_role, password_hash, reason, status, resolved_by, resolver_note, id_card_filename, created_at, resolved_at
          FROM password_reset_requests
          WHERE status = ${"pending"}
          ORDER BY created_at DESC`,
    );
    const notifyUserIds = [
      ...pendingDownloadRows.map((r) => r.user_id),
      ...pendingResetRows.map((r) => r.user_id),
    ];
    const userDisplayMap = await authSessionRepo.getUserDisplayByIds(notifyUserIds);

    const pendingDownloads = pendingDownloadRows.map((row) => {
      const requester = userDisplayMap.get(row.user_id);
      return {
        baseKey: `download-request:${row.id}`,
        type: "download-request" as const,
        title: "Pending download request",
        message: `${requester?.fullName || "Unknown user"} requested ${
          row.request_source === "hospital_case" ? "hospital" : "AST"
        } data download.`,
        href: `/admin?tab=downloads&focus=download-${row.id}`,
        createdAt: row.created_at,
      };
    });

    const pendingResets = pendingResetRows.map((row) => {
      const requester = userDisplayMap.get(row.user_id);
      return {
        baseKey: `password-reset:${row.id}`,
        type: "password-reset" as const,
        title: "Pending password reset request",
        message: `${requester?.fullName || "Unknown user"} requested password reset.`,
        href: `/admin?tab=password-resets&focus=reset-${row.id}`,
        createdAt: row.created_at,
      };
    });

    const baseItems = [...pendingUsers, ...pendingDownloads, ...pendingResets].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    if (baseItems.length === 0) return [];

    const stateRows = await dbAll<{
      notification_key: string;
      is_read: number;
      is_deleted: number;
    }>(
      sql`SELECT notification_key, is_read, is_deleted
          FROM notification_states
          WHERE notification_key LIKE ${`${currentUserId}:%`}`,
    );
    const stateMap = new Map(
      stateRows.map((r) => [
        r.notification_key,
        { isRead: Boolean(r.is_read), isDeleted: Boolean(r.is_deleted) },
      ]),
    );

    return baseItems.map((item) => {
      const scopedKey = `${currentUserId}:${item.baseKey}`;
      const state = stateMap.get(scopedKey);
      return {
        key: item.baseKey,
        type: item.type,
        title: item.title,
        message: item.message,
        href: item.href,
        createdAt: item.createdAt,
        isRead: state?.isRead ?? false,
        isDeleted: state?.isDeleted ?? false,
      };
    });
  };

  app.get(
    "/api/admin/notifications",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const allItems = await buildAdminNotifications(currentUser.id);
      const visibleItems = allItems.filter((item) => !item.isDeleted);
      return res.json({
        items: visibleItems,
        unreadCount: visibleItems.filter((item) => !item.isRead).length,
      });
    },
  );

  app.patch(
    "/api/admin/notifications/state",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const baseKey = String(req.body?.key ?? "").trim();
      if (!baseKey) return res.status(400).json({ message: "key is required" });
      const key = `${currentUser.id}:${baseKey}`;
      const isRead =
        req.body?.isRead === undefined ? undefined : Boolean(req.body?.isRead);
      const isDeleted =
        req.body?.isDeleted === undefined ? undefined : Boolean(req.body?.isDeleted);
      const existing = await dbGet<{ is_read: number; is_deleted: number }>(
        sql`SELECT is_read, is_deleted FROM notification_states WHERE notification_key = ${key}`,
      );
      const nextRead = isRead ?? Boolean(existing?.is_read);
      const nextDeleted = isDeleted ?? Boolean(existing?.is_deleted);
      await dbRun(
        sql`INSERT INTO notification_states (notification_key, is_read, is_deleted, updated_by, updated_at)
            VALUES (${key}, ${nextRead ? 1 : 0}, ${nextDeleted ? 1 : 0}, ${currentUser.id}, ${new Date().toISOString()})
            ON CONFLICT(notification_key) DO UPDATE SET
              is_read = excluded.is_read,
              is_deleted = excluded.is_deleted,
              updated_by = excluded.updated_by,
              updated_at = excluded.updated_at`,
      );
      return res.json({ key, isRead: nextRead, isDeleted: nextDeleted });
    },
  );

  app.post(
    "/api/admin/notifications/mark-read-all",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const allItems = await buildAdminNotifications(currentUser.id);
      const unreadItems = allItems.filter((item) => !item.isDeleted && !item.isRead);
      for (const item of unreadItems) {
        const scopedKey = `${currentUser.id}:${item.key}`;
        await dbRun(
          sql`INSERT INTO notification_states (notification_key, is_read, is_deleted, updated_by, updated_at)
              VALUES (${scopedKey}, ${1}, ${0}, ${currentUser.id}, ${new Date().toISOString()})
              ON CONFLICT(notification_key) DO UPDATE SET
                is_read = 1,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at`,
        );
      }
      return res.json({ updated: unreadItems.length });
    },
  );

  app.post(
    "/api/admin/notifications/delete-read",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const allItems = await buildAdminNotifications(currentUser.id);
      const readVisibleItems = allItems.filter((item) => !item.isDeleted && item.isRead);
      for (const item of readVisibleItems) {
        const scopedKey = `${currentUser.id}:${item.key}`;
        await dbRun(
          sql`INSERT INTO notification_states (notification_key, is_read, is_deleted, updated_by, updated_at)
              VALUES (${scopedKey}, ${1}, ${1}, ${currentUser.id}, ${new Date().toISOString()})
              ON CONFLICT(notification_key) DO UPDATE SET
                is_read = 1,
                is_deleted = 1,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at`,
        );
      }
      return res.json({ updated: readVisibleItems.length });
    },
  );

  app.get(
    "/api/admin/feature-visibility/dashboard",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const roles = ["superadmin", "admin", "staff", "intern", "student", "pending"] as const;
      const visibility = await Promise.all(
        roles.map(async (role) => ({
          role,
          dashboardVisible: await isDashboardVisibleForRole(role),
        })),
      );
      const items = visibility;
      return res.json(items);
    },
  );

  app.get(
    "/api/admin/feature-visibility/vth-dashboard",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const roles = ["superadmin", "admin", "staff", "intern", "student", "pending"] as const;
      const visibility = await Promise.all(
        roles.map(async (role) => ({
          role,
          dashboardVisible: await isVthDashboardVisibleForRole(role),
        })),
      );
      return res.json(visibility);
    },
  );

  app.patch(
    "/api/admin/feature-visibility/dashboard/:role",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const role = String(req.params.role ?? "").trim();
      const dashboardVisible = Boolean(req.body?.dashboardVisible);
      const allowedRoles = ["superadmin", "admin", "staff", "intern", "student", "pending"];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: "Unsupported role" });
      }
      // Only a Super Admin can change Super Admin visibility. Otherwise a
      // regular admin could hide the Super Admin dashboard and lock the
      // owner out (the audit flagged this as H-11).
      if (role === "superadmin" && currentUser.role !== "superadmin") {
        return res
          .status(403)
          .json({ message: "Only Super Admin can change Super Admin dashboard visibility" });
      }
      await dbRun(
        sql`INSERT INTO role_feature_visibility (role, dashboard_visible, updated_at)
            VALUES (${role}, ${dashboardVisible ? 1 : 0}, ${new Date().toISOString()})
            ON CONFLICT(role) DO UPDATE SET
              dashboard_visible = excluded.dashboard_visible,
              updated_at = excluded.updated_at`,
      );
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"set_dashboard_visibility_by_role"},
              ${role},
              ${null},
              ${JSON.stringify({ dashboardVisible })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ role, dashboardVisible });
    },
  );

  app.patch(
    "/api/admin/feature-visibility/vth-dashboard/:role",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const role = String(req.params.role ?? "").trim();
      const dashboardVisible = Boolean(req.body?.dashboardVisible);
      const allowedRoles = ["superadmin", "admin", "staff", "intern", "student", "pending"];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: "Unsupported role" });
      }
      if (role === "superadmin" && currentUser.role !== "superadmin") {
        return res
          .status(403)
          .json({ message: "Only Super Admin can change Super Admin dashboard visibility" });
      }
      try {
        await dbGet(sql`SELECT vth_dashboard_visible FROM role_feature_visibility LIMIT 1`);
      } catch {
        await dbRun(
          sql`ALTER TABLE role_feature_visibility ADD COLUMN vth_dashboard_visible INTEGER NOT NULL DEFAULT 1`,
        );
      }
      await dbRun(
        sql`INSERT INTO role_feature_visibility (role, vth_dashboard_visible, updated_at)
            VALUES (${role}, ${dashboardVisible ? 1 : 0}, ${new Date().toISOString()})
            ON CONFLICT(role) DO UPDATE SET
              vth_dashboard_visible = excluded.vth_dashboard_visible,
              updated_at = excluded.updated_at`,
      );
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"set_vth_dashboard_visibility_by_role"},
              ${role},
              ${null},
              ${JSON.stringify({ dashboardVisible })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ role, dashboardVisible });
    },
  );

  app.get(
    "/api/admin/form-definition",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const scope = resolveFormScope(req.query.scope);
      if (scope === "hospital") {
        await ensureHospitalTreatmentDefinition();
        await ensureHospitalVeterinarianDefinition();
      }
      let sections = await dbAll<{ key: string; title: string; display_order: number }>(
        sql`SELECT key, title, display_order FROM form_sections
            WHERE form_scope = 'shared' OR form_scope = ${scope}
            ORDER BY display_order ASC`,
      );
      const questions = await dbAll<{
        id: number;
        key: string;
        section_key: string;
        label: string;
        input_type: string;
        options_json: string | null;
        enabled: number;
        required: number;
        hide_label: number;
        display_order: number;
        is_builtin: number;
      }>(
        sql`SELECT id, key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin
            FROM form_questions
            WHERE form_scope = 'shared' OR form_scope = ${scope}
            ORDER BY section_key ASC, display_order ASC`,
      );
      sections = mergeOrphanFormSections(sections, questions);
      const bySection = new Map<string, typeof questions>();
      for (const q of questions) {
        const list = bySection.get(q.section_key) ?? [];
        list.push(q);
        bySection.set(q.section_key, list);
      }
      return res.json({
        sections: sections.map((s) => ({
          key: s.key,
          title: s.title,
          displayOrder: s.display_order,
          questions: (bySection.get(s.key) ?? [])
            .filter((q) => {
              if (!isTestsSuggestedSectionKey(s.key, s.title)) return true;
              return shouldIncludeTestsSuggestedFormQuestion({
                key: q.key,
                label: q.label,
                inputType: q.input_type,
              });
            })
            .map((q) => ({
              id: q.id,
              key: q.key,
              label: q.label,
              inputType: q.input_type,
              options: q.options_json ? JSON.parse(q.options_json) : [],
              enabled: Boolean(q.enabled),
              required: Boolean(q.required),
              hideLabel: Boolean(q.hide_label),
              displayOrder: q.display_order,
              isBuiltin: Boolean(q.is_builtin),
            })),
        })),
      });
    },
  );

  app.post(
    "/api/admin/form-sections",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.body?.scope);
      const title = String(req.body?.title ?? "").trim();
      if (!title) return res.status(400).json({ message: "Section title is required" });
      const rawKey = slugifyKey(title);
      const suffix = Math.random().toString(36).slice(2, 6);
      const key = rawKey ? `${rawKey}_${suffix}` : `section_${suffix}`;
      const maxOrderRow = await dbGet<{ max: number }>(
        sql`SELECT COALESCE(MAX(display_order), 0) as max FROM form_sections`,
      );
      const displayOrder = Number(maxOrderRow?.max ?? 0) + 1000;
      await dbRun(
        sql`INSERT INTO form_sections (key, title, display_order, form_scope) VALUES (${key}, ${title}, ${displayOrder}, ${scope})`,
      );
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"add_form_section"},
              ${key},
              ${null},
              ${JSON.stringify({ title, displayOrder })},
              ${new Date().toISOString()}
            )`,
      );
      return res.status(201).json({ key, title, displayOrder });
    },
  );

  app.patch(
    "/api/admin/form-sections/:key/move",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.body?.scope);
      const key = String(req.params.key);
      const direction = String(req.body?.direction ?? "");
      if (!["up", "down"].includes(direction)) {
        return res.status(400).json({ message: "direction must be up or down" });
      }
      const rows = await dbAll<{ key: string; display_order: number }>(
        sql`SELECT key, display_order FROM form_sections
            WHERE form_scope = 'shared' OR form_scope = ${scope}
            ORDER BY display_order ASC, key ASC`,
      );
      const idx = rows.findIndex((r) => r.key === key);
      if (idx === -1) return res.status(404).json({ message: "Section not found" });
      const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= rows.length) {
        return res.json({ message: "No move possible" });
      }
      const keyA = rows[idx].key;
      const keyB = rows[neighborIdx].key;
      const fromOrder = rows[idx].display_order;
      const neighborKey = keyB;
      const toOrder = rows[neighborIdx].display_order;
      if (fromOrder !== toOrder) {
        await dbRun(sql`UPDATE form_sections SET display_order = ${toOrder} WHERE key = ${keyA}`);
        await dbRun(sql`UPDATE form_sections SET display_order = ${fromOrder} WHERE key = ${keyB}`);
      } else {
        const reordered = [...rows];
        [reordered[idx], reordered[neighborIdx]] = [reordered[neighborIdx], reordered[idx]];
        for (let i = 0; i < reordered.length; i++) {
          const nextOrder = (i + 1) * 1000;
          await dbRun(
            sql`UPDATE form_sections SET display_order = ${nextOrder} WHERE key = ${reordered[i].key}`,
          );
        }
      }
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"move_form_section"},
              ${key},
              ${JSON.stringify({ direction, fromOrder, swappedWith: neighborKey, toOrder })},
              ${JSON.stringify(
                fromOrder !== toOrder
                  ? { swappedOrders: true }
                  : { renumbered: true, reason: "tied_display_order" },
              )},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Section moved" });
    },
  );

  app.delete(
    "/api/admin/form-sections/:key",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.query.scope);
      const key = String(req.params.key);
      const section = await dbGet<{ key: string; title: string }>(
        sql`SELECT key, title FROM form_sections WHERE key = ${key} AND form_scope = ${scope}`,
      );
      if (!section) return res.status(404).json({ message: "Section not found" });
      if (
        [
          "owner",
          "animal",
          "history",
          "avian",
          "vitals",
          "sample",
          "ast",
          "tests_suggested",
          "diagnosis",
          "treatment",
          "attending_veterinarian",
          "final",
        ].includes(section.key)
      ) {
        return res.status(403).json({ message: "Built-in sections cannot be deleted" });
      }
      const normalizedTitle = section.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (
        normalizedTitle.includes("testsuggested") ||
        normalizedTitle.includes("testssuggested") ||
        normalizedTitle === "diagnosis" ||
        normalizedTitle.includes("treatmentprescription") ||
        normalizedTitle.includes("attendingveterinarian")
      ) {
        return res.status(403).json({ message: "Built-in sections cannot be deleted" });
      }
      const questionCount = await dbGet<{ count: number }>(
        sql`SELECT COUNT(*) as count FROM form_questions WHERE section_key = ${key} AND form_scope = ${scope}`,
      );
      await dbRun(sql`DELETE FROM form_questions WHERE section_key = ${key} AND form_scope = ${scope}`);
      const deleteSectionResult = await dbRun(sql`DELETE FROM form_sections WHERE key = ${key} AND form_scope = ${scope}`);
      if (Number(deleteSectionResult.changes ?? 0) === 0) {
        return res.status(404).json({ message: "Section not found" });
      }
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_form_section"},
              ${key},
              ${JSON.stringify({ title: section.title, questionCount: Number(questionCount?.count ?? 0) })},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Section deleted", deletedKey: key });
    },
  );

  app.post(
    "/api/admin/form-questions",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.body?.scope);
      const sectionKey = String(req.body?.sectionKey ?? "").trim();
      const label = String(req.body?.label ?? "").trim();
      const inputType = String(req.body?.inputType ?? "text").trim();
      const optionsRaw = Array.isArray(req.body?.options) ? req.body.options : [];
      const options = optionsRaw
        .map((v: unknown) => String(v ?? "").trim())
        .filter(Boolean);
      if (!sectionKey || !label) {
        return res.status(400).json({ message: "sectionKey and label are required" });
      }
      const standardInputTypes = [
        "text",
        "textarea",
        "number",
        "singleSelect",
        "multiSelect",
        "yesNo",
        "date",
      ];
      if (!standardInputTypes.includes(inputType)) {
        return res.status(400).json({
          message:
            inputType === "treatment_prescription" || inputType === "hospital_veterinarian"
              ? "Treatment/Prescription and Attending veterinarian are built-in section widgets, not addable question types."
              : "Unsupported inputType",
        });
      }
      if ((inputType === "singleSelect" || inputType === "multiSelect") && options.length < 2) {
        return res.status(400).json({ message: "At least 2 options are required" });
      }
      const section = await dbGet<{ key: string }>(
        sql`SELECT key FROM form_sections WHERE key = ${sectionKey} AND (form_scope = 'shared' OR form_scope = ${scope})`,
      );
      if (!section) return res.status(404).json({ message: "Section not found" });

      const base = slugifyKey(label) || "question";
      const suffix = Math.random().toString(36).slice(2, 6);
      const key = `custom_${base}_${suffix}`;
      const maxOrderRow = await dbGet<{ max: number }>(
        sql`SELECT COALESCE(MAX(display_order), 0) as max FROM form_questions WHERE section_key = ${sectionKey} AND (form_scope = 'shared' OR form_scope = ${scope})`,
      );
      const displayOrder = Number(maxOrderRow?.max ?? 0) + 1000;
      await dbRun(
        sql`INSERT INTO form_questions
            (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at, form_scope)
            VALUES (
              ${key},
              ${sectionKey},
              ${label},
              ${inputType},
              ${options.length > 0 ? JSON.stringify(options) : null},
              ${1},
              ${0},
              ${0},
              ${displayOrder},
              ${0},
              ${new Date().toISOString()},
              ${scope}
            )`,
      );
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"add_form_question"},
              ${key},
              ${null},
              ${JSON.stringify({ sectionKey, label, inputType, options, displayOrder })},
              ${new Date().toISOString()}
            )`,
      );
      return res.status(201).json({ key, sectionKey, label, inputType, options, enabled: true, required: false, hideLabel: false, displayOrder, isBuiltin: false });
    },
  );

  app.patch(
    "/api/admin/form-questions/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.body?.scope);
      const id = getIdParam(req);
      const existing = await dbGet<{
        id: number;
        key: string;
        input_type: string;
        options_json: string | null;
        enabled: number;
        required: number;
        hide_label: number;
      }>(sql`SELECT id, key, input_type, options_json, enabled, required, hide_label FROM form_questions WHERE id = ${id} AND (form_scope = 'shared' OR form_scope = ${scope})`);
      if (!existing) return res.status(404).json({ message: "Question not found" });
      const patch = req.body as { enabled?: boolean; required?: boolean; hideLabel?: boolean; options?: string[] };
      const nextEnabled =
        typeof patch.enabled === "boolean" ? patch.enabled : Boolean(existing.enabled);
      const nextRequired =
        typeof patch.required === "boolean" ? patch.required : Boolean(existing.required);
      const nextHideLabel =
        typeof patch.hideLabel === "boolean" ? patch.hideLabel : Boolean(existing.hide_label);
      const nextOptions =
        Array.isArray(patch.options)
          ? patch.options.map((v) => String(v ?? "").trim()).filter(Boolean)
          : existing.options_json
            ? (JSON.parse(existing.options_json) as string[])
            : [];
      if (
        Array.isArray(patch.options) &&
        (existing.input_type === "singleSelect" || existing.input_type === "multiSelect") &&
        nextOptions.length < 2
      ) {
        return res.status(400).json({ message: "At least 2 options are required" });
      }
      await dbRun(
        sql`UPDATE form_questions
            SET enabled = ${nextEnabled ? 1 : 0},
                required = ${nextRequired ? 1 : 0},
                hide_label = ${nextHideLabel ? 1 : 0},
                options_json = ${
                  existing.input_type === "singleSelect" || existing.input_type === "multiSelect"
                    ? JSON.stringify(nextOptions)
                    : existing.options_json
                }
            WHERE id = ${id}`,
      );
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"update_form_question"},
              ${existing.key},
              ${JSON.stringify({
                enabled: Boolean(existing.enabled),
                required: Boolean(existing.required),
                hideLabel: Boolean(existing.hide_label),
                options: existing.options_json ? JSON.parse(existing.options_json) : [],
              })},
              ${JSON.stringify({ enabled: nextEnabled, required: nextRequired, hideLabel: nextHideLabel, options: nextOptions })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Question updated" });
    },
  );

  app.patch(
    "/api/admin/form-questions/:id/move",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.body?.scope);
      const id = getIdParam(req);
      const direction = String(req.body?.direction ?? "");
      if (!["up", "down"].includes(direction)) {
        return res.status(400).json({ message: "direction must be up or down" });
      }
      const current = await dbGet<{
        id: number;
        key: string;
        section_key: string;
        display_order: number;
      }>(
        sql`SELECT id, key, section_key, display_order FROM form_questions WHERE id = ${id} AND (form_scope = 'shared' OR form_scope = ${scope})`,
      );
      if (!current) return res.status(404).json({ message: "Question not found" });
      const rows = await dbAll<{ id: number; key: string; display_order: number }>(
        sql`SELECT id, key, display_order FROM form_questions
            WHERE section_key = ${current.section_key}
              AND (form_scope = 'shared' OR form_scope = ${scope})
            ORDER BY display_order ASC, id ASC`,
      );
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return res.status(404).json({ message: "Question not found" });
      const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= rows.length) {
        return res.json({ message: "No move possible" });
      }
      const idA = rows[idx].id;
      const idB = rows[neighborIdx].id;
      const fromOrder = rows[idx].display_order;
      const toOrder = rows[neighborIdx].display_order;
      if (fromOrder !== toOrder) {
        await dbRun(sql`UPDATE form_questions SET display_order = ${toOrder} WHERE id = ${idA}`);
        await dbRun(sql`UPDATE form_questions SET display_order = ${fromOrder} WHERE id = ${idB}`);
      } else {
        const reordered = [...rows];
        [reordered[idx], reordered[neighborIdx]] = [reordered[neighborIdx], reordered[idx]];
        for (let i = 0; i < reordered.length; i++) {
          const nextOrder = (i + 1) * 1000;
          await dbRun(
            sql`UPDATE form_questions SET display_order = ${nextOrder} WHERE id = ${reordered[i].id}`,
          );
        }
      }
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"move_form_question"},
              ${current.key},
              ${JSON.stringify({ direction, fromOrder, swappedWithId: rows[neighborIdx].id, toOrder })},
              ${JSON.stringify(
                fromOrder !== toOrder
                  ? { swappedOrders: true }
                  : { renumbered: true, reason: "tied_display_order" },
              )},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Question moved" });
    },
  );

  app.delete(
    "/api/admin/form-questions/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.query.scope);
      const id = getIdParam(req);
      const question = await dbGet<{
        id: number;
        key: string;
        label: string;
        section_key: string;
        is_builtin: number;
      }>(
        sql`SELECT id, key, label, section_key, is_builtin FROM form_questions WHERE id = ${id} AND (form_scope = 'shared' OR form_scope = ${scope})`,
      );
      if (!question) return res.status(404).json({ message: "Question not found" });
      if (isBuiltinTestsSuggestedQuestionKey(question.key) || question.is_builtin === 1) {
        return res.status(403).json({ message: "Built-in questions cannot be deleted" });
      }
      const deleteQuestionResult = await dbRun(
        sql`DELETE FROM form_questions
            WHERE id = ${id}
              AND (form_scope = 'shared' OR form_scope = ${scope})`,
      );
      if (Number(deleteQuestionResult.changes ?? 0) === 0) {
        return res.status(404).json({ message: "Question not found" });
      }
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_form_question"},
              ${question.key},
              ${JSON.stringify({ label: question.label, sectionKey: question.section_key })},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Question deleted", deletedId: id, deletedKey: question.key });
    },
  );

  app.get(
    "/api/admin/form-config",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const rows = await dbAll<{
        key: string;
        section: string;
        label: string;
        enabled: number;
        required: number;
      }>(
        sql`SELECT key, section, label, enabled, required
            FROM form_field_configs
            ORDER BY section ASC, label ASC`,
      );
      res.json(
        rows.map((r) => ({
          ...r,
          enabled: Boolean(r.enabled),
          required: Boolean(r.required),
        })),
      );
    },
  );

  app.patch(
    "/api/admin/form-config/:key",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const key = String(req.params.key);
      const existing = await dbGet<{
        key: string;
        enabled: number;
        required: number;
      }>(sql`SELECT key, enabled, required FROM form_field_configs WHERE key = ${key}`);
      if (!existing) {
        return res.status(404).json({ message: "Form field config not found" });
      }
      const patch = req.body as { enabled?: boolean; required?: boolean };
      const nextEnabled =
        typeof patch.enabled === "boolean" ? patch.enabled : Boolean(existing.enabled);
      const nextRequired =
        typeof patch.required === "boolean"
          ? patch.required
          : Boolean(existing.required);
      await dbRun(
        sql`UPDATE form_field_configs
            SET enabled = ${nextEnabled ? 1 : 0},
                required = ${nextRequired ? 1 : 0},
                updated_at = ${new Date().toISOString()}
            WHERE key = ${key}`,
      );
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"update_field_config"},
              ${key},
              ${JSON.stringify({
                enabled: Boolean(existing.enabled),
                required: Boolean(existing.required),
              })},
              ${JSON.stringify({ enabled: nextEnabled, required: nextRequired })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Form field config updated" });
    },
  );

  app.get(
    "/api/admin/form-edit-logs",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const scope = String(req.query.scope ?? "").trim();
      const treatmentMasterOnly = scope === "treatment_master";
      const rows = treatmentMasterOnly
        ? await dbAll<{
            id: number;
            actor_user_id: number;
            actor_role: string;
            action: string;
            target_key: string | null;
            old_value: string | null;
            new_value: string | null;
            created_at: string;
          }>(
            sql`SELECT id, actor_user_id, actor_role, action, target_key, old_value, new_value, created_at
            FROM form_edit_audit_logs
            WHERE action LIKE 'add\\_treatment\\_%' ESCAPE '\\'
               OR action LIKE 'update\\_treatment\\_%' ESCAPE '\\'
               OR action LIKE 'delete\\_treatment\\_%' ESCAPE '\\'
               OR action LIKE 'move\\_treatment\\_%' ESCAPE '\\'
            ORDER BY created_at DESC
            LIMIT 200`,
          )
        : await dbAll<{
            id: number;
            actor_user_id: number;
            actor_role: string;
            action: string;
            target_key: string | null;
            old_value: string | null;
            new_value: string | null;
            created_at: string;
          }>(
            sql`SELECT id, actor_user_id, actor_role, action, target_key, old_value, new_value, created_at
            FROM form_edit_audit_logs
            ORDER BY created_at DESC
            LIMIT 100`,
          );
      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_user_id).filter((id) => Number.isInteger(id) && id > 0)),
      );
      const actorDisplay = await authSessionRepo.getUserDisplayByIds(actorIds);
      const enriched = rows.map((row) => {
        const actor = actorDisplay.get(row.actor_user_id);
        return {
          id: row.id,
          actorUserId: row.actor_user_id,
          actorRole: row.actor_role,
          actorName: actor?.fullName || `User ${row.actor_user_id}`,
          action: row.action,
          targetKey: row.target_key,
          oldValue: row.old_value,
          newValue: row.new_value,
          createdAt: row.created_at,
        };
      });
      res.json(enriched);
    },
  );

  app.get(
    "/api/admin/medications",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const rows = await medicationRepo.getMedications();
      return res.json(rows);
    },
  );

  const medicationImportMulter: RequestHandler = (req, res, next) => {
    medicationImportUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Invalid upload";
        return res.status(400).json({ message: msg });
      }
      next();
    });
  };

  const medicationImportHandler: RequestHandler = async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const file = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
    if (!file?.buffer) {
      return res.status(400).json({ message: 'Missing file (multipart field "file")' });
    }
    const dryRun =
      String((req.body as Record<string, unknown>)?.dryRun ?? "").toLowerCase() === "true" ||
      (req.body as Record<string, unknown>)?.dryRun === true;
    const onDuplicate =
      String((req.body as Record<string, unknown>)?.onDuplicate ?? "skip") === "update"
        ? "update"
        : "skip";

    const parsed = await parseMedicationImportFile(file.buffer, file.originalname);
    const parseErrors = parsed.errors.filter((e) => e.row > 0);
    const fileErrors = parsed.errors.filter((e) => e.row === 0);
    const deduped = dedupeMedicationImportRows(parsed.rows);
    const consolidated = parsed.rows.length - deduped.length;

    const existing = await medicationRepo.getMedications();
    const byLower = new Map(existing.map((e) => [e.name.toLowerCase(), e] as const));

    let wouldCreate = 0;
    let wouldUpdate = 0;
    let wouldSkip = 0;
    for (const r of deduped) {
      const ex = byLower.get(r.name.toLowerCase());
      if (!ex) wouldCreate++;
      else if (onDuplicate === "update") wouldUpdate++;
      else wouldSkip++;
    }

    if (dryRun) {
      return res.json({
        dryRun: true,
        fileErrors,
        parseErrors,
        consolidatedDuplicateRows: consolidated,
        rowCount: deduped.length,
        wouldCreate,
        wouldUpdate,
        wouldSkip,
        sample: deduped.slice(0, 25),
      });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const applyErrors: Array<{ row: number; message: string }> = [];

    for (const r of deduped) {
      const ex = byLower.get(r.name.toLowerCase());
      try {
        if (!ex) {
          const row = await medicationRepo.createMedication({
            name: r.name,
            description: null,
            medicationClass: r.medicationClass,
          });
          byLower.set(r.name.toLowerCase(), row);
          created++;
        } else if (onDuplicate === "update") {
          const sameClass = (ex.medicationClass ?? null) === (r.medicationClass ?? null);
          if (sameClass) {
            skipped++;
            continue;
          }
          await medicationRepo.updateMedication(ex.id, {
            name: ex.name,
            description: ex.description ?? null,
            medicationClass: r.medicationClass,
          });
          const next = await medicationRepo.getMedication(ex.id);
          if (next) byLower.set(r.name.toLowerCase(), next);
          updated++;
        } else {
          skipped++;
        }
      } catch (e) {
        applyErrors.push({
          row: r.rowNumber,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await dbRun(
      sql`INSERT INTO form_edit_audit_logs
          (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
          VALUES (
            ${currentUser.id},
            ${currentUser.role},
            ${"import_treatment_medications"},
            ${"bulk"},
            ${null},
            ${JSON.stringify({ created, updated, skipped, applyErrors: applyErrors.slice(0, 50) })},
            ${new Date().toISOString()}
          )`,
    );

    return res.json({
      dryRun: false,
      created,
      updated,
      skipped,
      fileErrors,
      parseErrors,
      consolidatedDuplicateRows: consolidated,
      applyErrors,
    });
  };

  app.post(
    ["/api/admin/medications/import", "/api/admin/medications/bulk-import"],
    requireAuth,
    requireRole("superadmin", "admin"),
    medicationImportMulter,
    medicationImportHandler,
  );

  app.post(
    "/api/admin/medications",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const name = String(req.body?.name ?? "").trim();
      const description = String(req.body?.description ?? "").trim();
      const medicationClass = String(req.body?.medicationClass ?? "").trim();
      if (!name) return res.status(400).json({ message: "Medication name is required" });
      try {
        const created = await medicationRepo.createMedication({
          name,
          description: description || null,
          medicationClass: medicationClass || null,
        });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"add_treatment_medication"},
                ${String(created.id)},
                ${null},
                ${JSON.stringify(created)},
                ${new Date().toISOString()}
              )`,
        );
        return res.status(201).json(created);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to save medication" });
        }
        return res.status(409).json({ message: "Medication already exists" });
      }
    },
  );

  app.patch(
    "/api/admin/medications/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const body = req.body as Record<string, unknown>;
      const name = String(body?.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "Medication name is required" });
      try {
        const before = await medicationRepo.getMedication(id);
        if (!before) return res.status(404).json({ message: "Medication not found" });

        const description = Object.hasOwn(body, "description")
          ? String(body.description ?? "").trim() || null
          : (before.description ?? null);
        const medicationClass = Object.hasOwn(body, "medicationClass")
          ? String(body.medicationClass ?? "").trim() || null
          : (before.medicationClass ?? null);

        const updated = await medicationRepo.updateMedication(id, {
          name,
          description,
          medicationClass,
        });
        if (!updated) return res.status(404).json({ message: "Medication not found" });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"update_treatment_medication"},
                ${String(id)},
                ${JSON.stringify(before)},
                ${JSON.stringify(updated)},
                ${new Date().toISOString()}
              )`,
        );
        return res.json(updated);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to update medication" });
        }
        return res.status(409).json({ message: "Medication already exists" });
      }
    },
  );

  app.delete(
    "/api/admin/medications/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = await medicationRepo.getMedication(id);
      if (!existing) return res.status(404).json({ message: "Medication not found" });
      await medicationRepo.deleteMedication(id);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_treatment_medication"},
              ${String(id)},
              ${JSON.stringify(existing)},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Medication removed" });
    },
  );

  app.patch(
    "/api/admin/medications/:id/move",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const direction = String(req.body?.direction ?? "");
      if (!["up", "down"].includes(direction)) {
        return res.status(400).json({ message: "direction must be up or down" });
      }
      const current = await dbGet<{ id: number; display_order: number }>(
        sql`SELECT id, display_order FROM medications WHERE id = ${id}`,
      );
      if (!current) return res.status(404).json({ message: "Medication not found" });
      const neighbor =
        direction === "up"
          ? await dbGet<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM medications
                  WHERE display_order < ${current.display_order}
                  ORDER BY display_order DESC, id DESC
                  LIMIT 1`,
            )
          : await dbGet<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM medications
                  WHERE display_order > ${current.display_order}
                  ORDER BY display_order ASC, id ASC
                  LIMIT 1`,
            );
      if (!neighbor) return res.json({ message: "No move possible" });
      await dbRun(sql`UPDATE medications SET display_order = ${neighbor.display_order} WHERE id = ${current.id}`);
      await dbRun(sql`UPDATE medications SET display_order = ${current.display_order} WHERE id = ${neighbor.id}`);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"move_treatment_medication"},
              ${String(id)},
              ${JSON.stringify({ direction, from: current.display_order })},
              ${JSON.stringify({ to: neighbor.display_order })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Medication reordered" });
    },
  );

  app.get(
    "/api/admin/routes-of-administration",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const rows = await routeOfAdministrationRepo.getRoutesOfAdministration();
      return res.json(rows);
    },
  );

  app.post(
    "/api/admin/routes-of-administration",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const name = String(req.body?.name ?? "").trim();
      const abbreviation = String(req.body?.abbreviation ?? "").trim();
      if (!abbreviation) return res.status(400).json({ message: "Route abbreviation is required" });
      try {
        const created = await routeOfAdministrationRepo.createRouteOfAdministration({
          name: name || abbreviation,
          abbreviation,
        });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"add_treatment_route"},
                ${String(created.id)},
                ${null},
                ${JSON.stringify(created)},
                ${new Date().toISOString()}
              )`,
        );
        return res.status(201).json(created);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to save route" });
        }
        return res.status(409).json({ message: "Route already exists" });
      }
    },
  );

  app.patch(
    "/api/admin/routes-of-administration/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const name = String(req.body?.name ?? "").trim();
      const abbreviation = String(req.body?.abbreviation ?? "").trim();
      if (!abbreviation) return res.status(400).json({ message: "Route abbreviation is required" });
      try {
        const before = await routeOfAdministrationRepo.getRouteOfAdministration(id);
        const updated = await routeOfAdministrationRepo.updateRouteOfAdministration(id, {
          name: name || abbreviation,
          abbreviation,
        });
        if (!updated) return res.status(404).json({ message: "Route not found" });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"update_treatment_route"},
                ${String(id)},
                ${JSON.stringify(before)},
                ${JSON.stringify(updated)},
                ${new Date().toISOString()}
              )`,
        );
        return res.json(updated);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to update route" });
        }
        return res.status(409).json({ message: "Route already exists" });
      }
    },
  );

  app.delete(
    "/api/admin/routes-of-administration/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = await routeOfAdministrationRepo.getRouteOfAdministration(id);
      if (!existing) return res.status(404).json({ message: "Route not found" });
      await routeOfAdministrationRepo.deleteRouteOfAdministration(id);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_treatment_route"},
              ${String(id)},
              ${JSON.stringify(existing)},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Route removed" });
    },
  );

  app.patch(
    "/api/admin/routes-of-administration/:id/move",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const direction = String(req.body?.direction ?? "");
      if (!["up", "down"].includes(direction)) {
        return res.status(400).json({ message: "direction must be up or down" });
      }
      const current = await dbGet<{ id: number; display_order: number }>(
        sql`SELECT id, display_order FROM routes_of_administration WHERE id = ${id}`,
      );
      if (!current) return res.status(404).json({ message: "Route not found" });
      const neighbor =
        direction === "up"
          ? await dbGet<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM routes_of_administration
                  WHERE display_order < ${current.display_order}
                  ORDER BY display_order DESC, id DESC
                  LIMIT 1`,
            )
          : await dbGet<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM routes_of_administration
                  WHERE display_order > ${current.display_order}
                  ORDER BY display_order ASC, id ASC
                  LIMIT 1`,
            );
      if (!neighbor) return res.json({ message: "No move possible" });
      await dbRun(sql`UPDATE routes_of_administration SET display_order = ${neighbor.display_order} WHERE id = ${current.id}`);
      await dbRun(sql`UPDATE routes_of_administration SET display_order = ${current.display_order} WHERE id = ${neighbor.id}`);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"move_treatment_route"},
              ${String(id)},
              ${JSON.stringify({ direction, from: current.display_order })},
              ${JSON.stringify({ to: neighbor.display_order })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Route reordered" });
    },
  );

  app.get(
    "/api/admin/frequencies",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const rows = await frequencyRepo.getFrequencies();
      return res.json(rows);
    },
  );

  app.post(
    "/api/admin/frequencies",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const name = String(req.body?.name ?? "").trim();
      const shortCode = String(req.body?.shortCode ?? "").trim();
      if (!shortCode) return res.status(400).json({ message: "Frequency abbreviation is required" });
      try {
        const created = await frequencyRepo.createFrequency({
          name: name || shortCode,
          shortCode,
        });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"add_treatment_frequency"},
                ${String(created.id)},
                ${null},
                ${JSON.stringify(created)},
                ${new Date().toISOString()}
              )`,
        );
        return res.status(201).json(created);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to save frequency" });
        }
        return res.status(409).json({ message: "Frequency already exists" });
      }
    },
  );

  app.patch(
    "/api/admin/frequencies/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const name = String(req.body?.name ?? "").trim();
      const shortCode = String(req.body?.shortCode ?? "").trim();
      if (!shortCode) return res.status(400).json({ message: "Frequency abbreviation is required" });
      try {
        const before = await frequencyRepo.getFrequency(id);
        const updated = await frequencyRepo.updateFrequency(id, {
          name: name || shortCode,
          shortCode,
        });
        if (!updated) return res.status(404).json({ message: "Frequency not found" });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"update_treatment_frequency"},
                ${String(id)},
                ${JSON.stringify(before)},
                ${JSON.stringify(updated)},
                ${new Date().toISOString()}
              )`,
        );
        return res.json(updated);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to update frequency" });
        }
        return res.status(409).json({ message: "Frequency already exists" });
      }
    },
  );

  app.delete(
    "/api/admin/frequencies/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = await frequencyRepo.getFrequency(id);
      if (!existing) return res.status(404).json({ message: "Frequency not found" });
      await frequencyRepo.deleteFrequency(id);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_treatment_frequency"},
              ${String(id)},
              ${JSON.stringify(existing)},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Frequency removed" });
    },
  );

  app.patch(
    "/api/admin/frequencies/:id/move",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const direction = String(req.body?.direction ?? "");
      if (!["up", "down"].includes(direction)) {
        return res.status(400).json({ message: "direction must be up or down" });
      }
      const current = await dbGet<{ id: number; display_order: number }>(
        sql`SELECT id, display_order FROM frequencies WHERE id = ${id}`,
      );
      if (!current) return res.status(404).json({ message: "Frequency not found" });
      const neighbor =
        direction === "up"
          ? await dbGet<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM frequencies
                  WHERE display_order < ${current.display_order}
                  ORDER BY display_order DESC, id DESC
                  LIMIT 1`,
            )
          : await dbGet<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM frequencies
                  WHERE display_order > ${current.display_order}
                  ORDER BY display_order ASC, id ASC
                  LIMIT 1`,
            );
      if (!neighbor) return res.json({ message: "No move possible" });
      await dbRun(sql`UPDATE frequencies SET display_order = ${neighbor.display_order} WHERE id = ${current.id}`);
      await dbRun(sql`UPDATE frequencies SET display_order = ${current.display_order} WHERE id = ${neighbor.id}`);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"move_treatment_frequency"},
              ${String(id)},
              ${JSON.stringify({ direction, from: current.display_order })},
              ${JSON.stringify({ to: neighbor.display_order })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Frequency reordered" });
    },
  );

  app.get(
    "/api/admin/dose-units",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const rows = await doseUnitRepo.getDoseUnits();
      return res.json(rows);
    },
  );

  app.post(
    "/api/admin/dose-units",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "Dose unit name is required" });
      try {
        const created = await doseUnitRepo.createDoseUnit({ name });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"add_treatment_dose_unit"},
                ${String(created.id)},
                ${null},
                ${JSON.stringify(created)},
                ${new Date().toISOString()}
              )`,
        );
        return res.status(201).json(created);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to save dose unit" });
        }
        return res.status(409).json({ message: "Dose unit already exists" });
      }
    },
  );

  app.patch(
    "/api/admin/dose-units/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "Dose unit name is required" });
      try {
        const before = await doseUnitRepo.getDoseUnit(id);
        const updated = await doseUnitRepo.updateDoseUnit(id, { name });
        if (!updated) return res.status(404).json({ message: "Dose unit not found" });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"update_treatment_dose_unit"},
                ${String(id)},
                ${JSON.stringify(before)},
                ${JSON.stringify(updated)},
                ${new Date().toISOString()}
              )`,
        );
        return res.json(updated);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to update dose unit" });
        }
        return res.status(409).json({ message: "Dose unit already exists" });
      }
    },
  );

  app.delete(
    "/api/admin/dose-units/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = await doseUnitRepo.getDoseUnit(id);
      if (!existing) return res.status(404).json({ message: "Dose unit not found" });
      await doseUnitRepo.deleteDoseUnit(id);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_treatment_dose_unit"},
              ${String(id)},
              ${JSON.stringify(existing)},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Dose unit removed" });
    },
  );

  app.patch(
    "/api/admin/dose-units/:id/move",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const direction = String(req.body?.direction ?? "");
      if (!["up", "down"].includes(direction)) {
        return res.status(400).json({ message: "direction must be up or down" });
      }
      const current = await dbGet<{ id: number; display_order: number }>(
        sql`SELECT id, display_order FROM dose_units WHERE id = ${id}`,
      );
      if (!current) return res.status(404).json({ message: "Dose unit not found" });
      const neighbor =
        direction === "up"
          ? await dbGet<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM dose_units
                  WHERE display_order < ${current.display_order}
                  ORDER BY display_order DESC, id DESC
                  LIMIT 1`,
            )
          : await dbGet<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM dose_units
                  WHERE display_order > ${current.display_order}
                  ORDER BY display_order ASC, id ASC
                  LIMIT 1`,
            );
      if (!neighbor) return res.json({ message: "No move possible" });
      await dbRun(sql`UPDATE dose_units SET display_order = ${neighbor.display_order} WHERE id = ${current.id}`);
      await dbRun(sql`UPDATE dose_units SET display_order = ${current.display_order} WHERE id = ${neighbor.id}`);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"move_treatment_dose_unit"},
              ${String(id)},
              ${JSON.stringify({ direction, from: current.display_order })},
              ${JSON.stringify({ to: neighbor.display_order })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Dose unit reordered" });
    },
  );

  app.get(
    "/api/admin/durations",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const rows = await durationRepo.getDurations();
      return res.json(rows);
    },
  );

  app.post(
    "/api/admin/durations",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const name = String(req.body?.name ?? "").trim();
      const rawValue = req.body?.value;
      const value =
        rawValue === null || rawValue === undefined || String(rawValue).trim() === ""
          ? null
          : Number.parseInt(String(rawValue), 10);
      if (!name) return res.status(400).json({ message: "Duration name is required" });
      if (value !== null && !Number.isInteger(value)) {
        return res.status(400).json({ message: "Duration value must be an integer" });
      }
      try {
        const created = await durationRepo.createDuration({ name, value });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"add_treatment_duration"},
                ${String(created.id)},
                ${null},
                ${JSON.stringify(created)},
                ${new Date().toISOString()}
              )`,
        );
        return res.status(201).json(created);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to save duration" });
        }
        return res.status(409).json({ message: "Duration already exists" });
      }
    },
  );

  app.patch(
    "/api/admin/durations/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const name = String(req.body?.name ?? "").trim();
      const rawValue = req.body?.value;
      const value =
        rawValue === null || rawValue === undefined || String(rawValue).trim() === ""
          ? null
          : Number.parseInt(String(rawValue), 10);
      if (!name) return res.status(400).json({ message: "Duration name is required" });
      if (value !== null && !Number.isInteger(value)) {
        return res.status(400).json({ message: "Duration value must be an integer" });
      }
      try {
        const before = await durationRepo.getDuration(id);
        const updated = await durationRepo.updateDuration(id, { name, value });
        if (!updated) return res.status(404).json({ message: "Duration not found" });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"update_treatment_duration"},
                ${String(id)},
                ${JSON.stringify(before)},
                ${JSON.stringify(updated)},
                ${new Date().toISOString()}
              )`,
        );
        return res.json(updated);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          return res.status(500).json({ message: "Failed to update duration" });
        }
        return res.status(409).json({ message: "Duration already exists" });
      }
    },
  );

  app.delete(
    "/api/admin/durations/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = await durationRepo.getDuration(id);
      if (!existing) return res.status(404).json({ message: "Duration not found" });
      await durationRepo.deleteDuration(id);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_treatment_duration"},
              ${String(id)},
              ${JSON.stringify(existing)},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Duration removed" });
    },
  );

  app.get(
    "/api/admin/species-options",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const rows = await dbAll<{ id: number; name: string }>(
        sql`SELECT id, name FROM species_options ORDER BY name ASC`,
      );
      res.json(rows);
    },
  );

  app.post(
    "/api/admin/species-options",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const name = String(req.body?.name ?? "").trim();
      if (!name) {
        return res.status(400).json({ message: "Species name is required" });
      }
      try {
        await dbRun(
          sql`INSERT INTO species_options (name, created_at) VALUES (${name}, ${new Date().toISOString()})`,
        );
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"add_species_option"},
                ${"species"},
                ${null},
                ${JSON.stringify({ name })},
                ${new Date().toISOString()}
              )`,
        );
      } catch {
        return res.status(409).json({ message: "Species already exists" });
      }
      return res.status(201).json({ message: "Species added" });
    },
  );

  app.delete(
    "/api/admin/species-options/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = await dbGet<{ id: number; name: string }>(
        sql`SELECT id, name FROM species_options WHERE id = ${id}`,
      );
      if (!existing) {
        return res.status(404).json({ message: "Species not found" });
      }
      const breedCount = await dbGet<{ count: number }>(
        sql`SELECT COUNT(*) as count FROM breed_options WHERE species_name = ${existing.name}`,
      );
      await dbRun(
        sql`DELETE FROM breed_options WHERE species_name = ${existing.name}`,
      );
      await dbRun(sql`DELETE FROM species_options WHERE id = ${id}`);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_species_option"},
              ${"species"},
              ${JSON.stringify({ id, name: existing.name })},
              ${JSON.stringify({ deletedBreedOptions: breedCount?.count ?? 0 })},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Species removed" });
    },
  );

  app.get(
    "/api/admin/breed-options",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const species = String(req.query.species ?? "").trim();
      if (!species) return res.json([]);
      const rows = await dbAll<{ id: number; name: string }>(
        sql`SELECT id, name FROM breed_options WHERE species_name = ${species} ORDER BY name ASC`,
      );
      return res.json(rows);
    },
  );

  app.post(
    "/api/admin/breed-options",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const species = String(req.body?.species ?? "").trim();
      const name = String(req.body?.name ?? "").trim();
      if (!species || !name) {
        return res.status(400).json({ message: "Species and breed name are required" });
      }
      try {
        await dbRun(
          sql`INSERT INTO breed_options (species_name, name, created_at)
              VALUES (${species}, ${name}, ${new Date().toISOString()})`,
        );
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"add_breed_option"},
                ${species},
                ${null},
                ${JSON.stringify({ species, name })},
                ${new Date().toISOString()}
              )`,
        );
      } catch {
        return res.status(409).json({ message: "Breed already exists for this species" });
      }
      return res.status(201).json({ message: "Breed added" });
    },
  );

  app.delete(
    "/api/admin/breed-options/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = await dbGet<{ id: number; species_name: string; name: string }>(
        sql`SELECT id, species_name, name FROM breed_options WHERE id = ${id}`,
      );
      if (!existing) {
        return res.status(404).json({ message: "Breed not found" });
      }
      await dbRun(sql`DELETE FROM breed_options WHERE id = ${id}`);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_breed_option"},
              ${existing.species_name},
              ${JSON.stringify({ id: existing.id, name: existing.name })},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Breed removed" });
    },
  );

  app.get(
    "/api/admin/users",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const pagination = getPaginationParams(req);
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const users = await authSessionRepo.getUsers();
      const activeSessionUserIds = new Set(await authSessionRepo.getActiveSessionUserIds());
      // The caller is, by definition, active right now (this very request).
      // Guarantees the admin viewing the list sees themselves as Active even
      // if their `last_seen_at` write was throttled.
      if (currentUser?.id) activeSessionUserIds.add(currentUser.id);
      const visibleUsers = users.filter(
        (u) => !isHiddenSuperadminUser(u),
      );
      const safeUsers = visibleUsers.map((u) => ({
        ...toClientSafeUser(u),
        activeNow: activeSessionUserIds.has(u.id),
      }));
      if (!pagination.shouldPaginate) {
        return res.json(safeUsers);
      }
      const items = safeUsers.slice(
        pagination.offset,
        pagination.offset + pagination.pageSize,
      );
      const total = safeUsers.length;
      return res.json({
        items,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      });
    },
  );

  app.get(
    "/api/admin/users/pending",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const pagination = getPaginationParams(req);
      const pending = (await authSessionRepo.getUsers()).filter(
        (u) => !u.approved && !isHiddenSuperadminUser(u),
      );
      const safeUsers = pending.map((u) => toClientSafeUser(u));
      if (!pagination.shouldPaginate) {
        return res.json(safeUsers);
      }
      const items = safeUsers.slice(
        pagination.offset,
        pagination.offset + pagination.pageSize,
      );
      const total = safeUsers.length;
      return res.json({
        items,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      });
    },
  );

  app.post(
    "/api/admin/users/:id/approve",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const parsedRole = parseAllowedUserRole(req.body?.role ?? "staff");
      if (!parsedRole) {
        return res.status(400).json({ message: "Unsupported role" });
      }
      if (currentUser.role !== "superadmin" && isAdminRole(parsedRole)) {
        return res.status(403).json({
          message: "Only Super Admin can assign admin roles during approval",
        });
      }
      const id = getIdParam(req);
      const user = await authSessionRepo.updateUser(id, {
        role: parsedRole,
        approved: true,
      });
      if (!user) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      await logAdminAction({
        actorUserId: currentUser.id,
        actorRole: currentUser.role,
        actionType: "user.approve",
        targetType: "user",
        targetId: user.id,
        details: { assignedRole: parsedRole },
      });
      res.json(toClientSafeUser(user));
    },
  );

  app.delete(
    "/api/admin/users/batch/:batch",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const batch = parseStudentBatch(req.params.batch);
      if (!batch) {
        return res.status(400).json({ message: "Invalid batch. Expected 1-99." });
      }
      const usersInBatch = (await authSessionRepo.getUsers()).filter(
        (user) =>
          user.studentBatch === batch &&
          user.designation === "student" &&
          user.id !== currentUser.id &&
          !isAdminRole(user.role) &&
          !isHiddenSuperadminUser(user),
      );
      if (usersInBatch.length === 0) {
        return res.json({ message: "No deletable students found in this batch", deletedCount: 0 });
      }

      const ids = usersInBatch.map((user) => user.id);
      await dbRun(sql`DELETE FROM users WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
      // Revoke any active sessions held by the deleted users; without
      // this they could keep using the app until their token expires.
      for (const id of ids) {
        await authSessionRepo.deleteSessionsByUserId(id).catch(() => {});
      }

      await logAdminAction({
        actorUserId: currentUser.id,
        actorRole: currentUser.role,
        actionType: "user.batch.delete",
        targetType: "student_batch",
        targetId: batch,
        details: { batch, deletedCount: ids.length, deletedUserIds: ids },
      });
      return res.json({
        message: `Deleted ${ids.length} student account${ids.length > 1 ? "s" : ""} from batch ${batch}`,
        deletedCount: ids.length,
      });
    },
  );

  app.post(
    "/api/admin/users/bulk-delete",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const raw = (req.body as { ids?: unknown })?.ids;
      if (!Array.isArray(raw) || raw.length === 0) {
        return res.status(400).json({ message: "Provide a non-empty ids array" });
      }
      const idSet = new Set<number>();
      for (const v of raw) {
        const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
        if (Number.isInteger(n) && n > 0) idSet.add(n);
      }
      const uniqueIds = Array.from(idSet).slice(0, 200);
      const skipped: { id: number; reason: string }[] = [];
      const toDelete: number[] = [];

      for (const id of uniqueIds) {
        const targetUser = await authSessionRepo.getUserById(id);
        if (!targetUser) {
          skipped.push({ id, reason: "not_found" });
          continue;
        }
        if (isHiddenSuperadminUser(targetUser)) {
          skipped.push({ id, reason: "protected" });
          continue;
        }
        if (targetUser.id === currentUser.id) {
          skipped.push({ id, reason: "self" });
          continue;
        }
        if (isAdminRole(targetUser.role) && currentUser.role !== "superadmin") {
          skipped.push({ id, reason: "admin_protected" });
          continue;
        }
        toDelete.push(id);
      }

      if (toDelete.length === 0) {
        return res.json({
          message: "No matching accounts could be deleted.",
          deletedCount: 0,
          deletedUserIds: [] as number[],
          skipped,
        });
      }

      await dbRun(
        sql`DELETE FROM users WHERE id IN (${sql.join(
          toDelete.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      for (const id of toDelete) {
        await authSessionRepo.deleteSessionsByUserId(id).catch(() => {});
      }

      await logAdminAction({
        actorUserId: currentUser.id,
        actorRole: currentUser.role,
        actionType: "user.bulk.delete",
        targetType: "user",
        targetId: null,
        details: { deletedCount: toDelete.length, deletedUserIds: toDelete, skipped },
      });

      return res.json({
        message: `Removed ${toDelete.length} account${toDelete.length > 1 ? "s" : ""}.`,
        deletedCount: toDelete.length,
        deletedUserIds: toDelete,
        skipped,
      });
    },
  );

  app.delete(
    "/api/admin/users/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const targetUser = await authSessionRepo.getUserById(id);
      if (!targetUser) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      if (isHiddenSuperadminUser(targetUser)) {
        return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      }
      if (targetUser.id === currentUser.id) {
        return res.status(403).json({ message: "Cannot delete your own account" });
      }
      if (isAdminRole(targetUser.role) && currentUser.role !== "superadmin") {
        return res
          .status(403)
          .json({ message: "Only Super Admin can remove admins" });
      }
      await dbRun(sql`DELETE FROM users WHERE id = ${id}`);
      await authSessionRepo.deleteSessionsByUserId(id).catch(() => {});
      res.json({ message: "User removed" });
    },
  );

  app.patch(
    "/api/admin/users/:id/role",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const role = parseAllowedUserRole(req.body?.role);
      if (!role) {
        return res.status(400).json({ message: "Unsupported role" });
      }
      const id = getIdParam(req);
      const targetUser = await authSessionRepo.getUserById(id);
      if (!targetUser) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      if (isHiddenSuperadminUser(targetUser)) {
        return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      }
      if (targetUser.id === currentUser.id) {
        return res.status(403).json({ message: "Cannot change your own role" });
      }
      if (
        (isAdminRole(role) || isAdminRole(targetUser.role)) &&
        currentUser.role !== "superadmin"
      ) {
        return res.status(403).json({
          message: "Only Super Admin can assign or modify admin roles",
        });
      }
      const updatePayload =
        role === "admin" ? { role } : { role, totpEnforced: false };
      const user = await authSessionRepo.updateUser(id, updatePayload);
      if (!user) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      await logAdminAction({
        actorUserId: currentUser.id,
        actorRole: currentUser.role,
        actionType: "user.role.change",
        targetType: "user",
        targetId: user.id,
        details: { fromRole: targetUser.role, toRole: role },
      });
      res.json(toClientSafeUser(user));
    },
  );

  app.patch(
    "/api/admin/users/:id/totp-enforcement",
    requireAuth,
    requireRole("superadmin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const targetUser = await authSessionRepo.getUserById(id);
      if (!targetUser) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      if (isHiddenSuperadminUser(targetUser)) {
        return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      }
      if (targetUser.role !== "admin") {
        return res.status(400).json({
          message: "Mandatory two-factor can only be applied to Administrator accounts.",
        });
      }
      const enforced = (req.body as { enforced?: unknown }).enforced;
      if (typeof enforced !== "boolean") {
        return res.status(400).json({ message: "Body must include enforced: boolean" });
      }
      if (enforced && !targetUser.totpEnabled) {
        return res.status(400).json({
          message:
            "This administrator must enable two-factor authentication in their Profile before it can be required.",
        });
      }
      const updated = await authSessionRepo.updateUser(id, { totpEnforced: enforced });
      if (!updated) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      await logAdminAction({
        actorUserId: currentUser.id,
        actorRole: currentUser.role,
        actionType: "user.totp_enforcement",
        targetType: "user",
        targetId: updated.id,
        details: { enforced },
      });
      res.json(toClientSafeUser(updated));
    },
  );

  app.patch(
    "/api/admin/users/:id",
    requireAuth,
    requireRole("superadmin"),
    async (req, res) => {
      const id = getIdParam(req);
      const targetUser = await authSessionRepo.getUserById(id);
      if (!targetUser) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      if (isHiddenSuperadminUser(targetUser)) {
        return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      }

      const { fullName, address, phone, email, username, designation } =
        req.body as {
          fullName?: string;
          address?: string;
          phone?: string;
          email?: string;
          username?: string;
          designation?: string;
        };

      const updates: Record<string, string> = {};
      if (typeof fullName === "string" && fullName.trim()) {
        updates.fullName = fullName.trim();
      }
      if (typeof address === "string" && address.trim()) {
        updates.address = address.trim();
      }
      if (typeof phone === "string" && phone.trim()) {
        updates.phone = phone.trim();
      }
      if (typeof email === "string" && email.trim()) {
        updates.email = email.trim();
      }
      if (typeof username === "string" && username.trim()) {
        updates.username = username.trim();
      }
      if (typeof designation === "string" && designation.trim()) {
        updates.designation = designation.trim();
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: MESSAGES.NO_CHANGES_PROVIDED });
      }

      const updated = await authSessionRepo.updateUser(id, updates);
      if (!updated)
        return res.status(500).json({ message: "Failed to update user" });

      res.json(toClientSafeUser(updated));
    },
  );

  app.get(
    "/api/admin/download-requests",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const pagination = getPaginationParams(req);
      const rows = await dbAll<DownloadRequestRow>(
        sql`SELECT id, user_id, request_source, date_from, date_to, reason, status, admin_note, resolved_by, created_at, resolved_at
            FROM download_requests
            ORDER BY created_at DESC`,
      );
      const requests = rows.map(toDownloadRequest);
      const paged = pagination.shouldPaginate
        ? requests.slice(pagination.offset, pagination.offset + pagination.pageSize)
        : requests;
      const userIds = paged.flatMap((r) =>
        [r.userId, r.resolvedBy].filter((id): id is number => id != null),
      );
      const userDisplayMap = await authSessionRepo.getUserDisplayByIds(userIds);
      const enriched = paged.map((r) => {
        const user = userDisplayMap.get(r.userId);
        const resolver = r.resolvedBy ? userDisplayMap.get(r.resolvedBy) : undefined;
        return {
          ...r,
          userName: user?.fullName || "Unknown",
          userUsername: user?.username || "",
          userDesignation: user?.designation || "",
          resolverName: resolver?.fullName || "",
        };
      });
      if (!pagination.shouldPaginate) {
        return res.json(enriched);
      }
      const total = requests.length;
      return res.json({
        items: enriched,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      });
    },
  );

  app.post(
    "/api/admin/download-requests/:id/resolve",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const { status, adminNote } = req.body;
      if (!["approved", "rejected"].includes(status)) {
        return res
          .status(400)
          .json({ message: "Status must be approved or rejected" });
      }
      const id = getIdParam(req);
      const existing = await dbGet<DownloadRequestRow>(
        sql`SELECT id, user_id, request_source, date_from, date_to, reason, status, admin_note, resolved_by, created_at, resolved_at
            FROM download_requests
            WHERE id = ${id}`,
      );
      if (!existing) return res.status(404).json({ message: "Request not found" });
      await dbRun(
        sql`UPDATE download_requests
            SET status = ${status},
                admin_note = ${adminNote || null},
                resolved_by = ${currentUser.id},
                resolved_at = ${new Date().toISOString()}
            WHERE id = ${id}`,
      );
      const updated = await dbGet<DownloadRequestRow>(
        sql`SELECT id, user_id, request_source, date_from, date_to, reason, status, admin_note, resolved_by, created_at, resolved_at
            FROM download_requests
            WHERE id = ${id}`,
      );
      if (!updated) return res.status(404).json({ message: "Request not found" });
      await logAdminAction({
        actorUserId: currentUser.id,
        actorRole: currentUser.role,
        actionType: "download.request.resolve",
        targetType: "download_request",
        targetId: updated.id,
        details: {
          status,
          requestSource: updated.request_source,
          userId: updated.user_id,
        },
      });
      res.json(toDownloadRequest(updated));
    },
  );

  app.get(
    "/api/admin/password-reset-requests",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const pagination = getPaginationParams(req);
      const rows = await dbAll<PasswordResetRequestRow>(
        sql`SELECT id, user_id, requested_by_role, password_hash, reason, status, resolved_by, resolver_note, id_card_filename, created_at, resolved_at
            FROM password_reset_requests
            ORDER BY created_at DESC`,
      );
      const requests = rows.map(toPasswordResetRequest);
      const visible = requests.filter((r) => {
        if (currentUser.role === "superadmin") return true;
        return r.requestedByRole !== "admin" && r.requestedByRole !== "superadmin";
      });
      const paged = pagination.shouldPaginate
        ? visible.slice(pagination.offset, pagination.offset + pagination.pageSize)
        : visible;
      const lookupIds = new Set<number>();
      for (const r of paged) {
        lookupIds.add(r.userId);
        if (r.resolvedBy) lookupIds.add(r.resolvedBy);
      }
      const userDisplay = await authSessionRepo.getUserDisplayByIds(
        Array.from(lookupIds),
      );
      const enriched = paged.map((r) => {
        const user = userDisplay.get(r.userId);
        const resolver = r.resolvedBy ? userDisplay.get(r.resolvedBy) : undefined;
        return {
          ...r,
          userName: user?.fullName || "Unknown",
          userUsername: user?.username || "",
          userRole: user?.role || r.requestedByRole,
          resolverName: resolver?.fullName || "",
        };
      });
      if (!pagination.shouldPaginate) {
        return res.json(enriched);
      }
      const filteredTotal = visible.length;
      return res.json({
        items: enriched,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: filteredTotal,
        totalPages: Math.max(1, Math.ceil(filteredTotal / pagination.pageSize)),
      });
    },
  );

  app.get(
    "/api/admin/password-reset-requests/:id/id-card",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const target = await dbGet<PasswordResetRequestRow>(
        sql`SELECT id, user_id, requested_by_role, password_hash, reason, status, resolved_by, resolver_note, id_card_filename, created_at, resolved_at
            FROM password_reset_requests
            WHERE id = ${getIdParam(req)}`,
      );
      if (!target) {
        return res.status(404).json({ message: "Request not found" });
      }
      const mapped = toPasswordResetRequest(target);
      if (!canResolvePasswordResetRequest(currentUser, mapped.requestedByRole)) {
        return res.status(403).json({
          message: "Only superadmin can view admin-level reset ID cards",
        });
      }
      if (mapped.status !== "pending" || !target.id_card_filename) {
        return res.status(404).json({ message: "ID card image not available" });
      }

      const abs = resolvePasswordResetIdCardAbsolutePath(target.id_card_filename);
      if (!abs || !fs.existsSync(abs)) {
        return res.status(404).json({ message: "ID card image not found" });
      }

      const ext = path.extname(abs).toLowerCase();
      const contentType = ext === ".png" ? "image/png" : "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", "inline");
      return res.sendFile(abs);
    },
  );

  app.post(
    "/api/admin/password-reset-requests/:id/resolve",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const { status, resolverNote } = req.body as {
        status?: string;
        resolverNote?: string;
      };
      if (!status || !["approved", "rejected"].includes(status)) {
        return res
          .status(400)
          .json({ message: "Status must be approved or rejected" });
      }

      const target = await dbGet<PasswordResetRequestRow>(
        sql`SELECT id, user_id, requested_by_role, password_hash, reason, status, resolved_by, resolver_note, id_card_filename, created_at, resolved_at
            FROM password_reset_requests
            WHERE id = ${getIdParam(req)}`,
      );
      if (!target) {
        return res.status(404).json({ message: "Request not found" });
      }
      const targetMapped = toPasswordResetRequest(target);
      if (!canResolvePasswordResetRequest(currentUser, targetMapped.requestedByRole)) {
        return res.status(403).json({
          message: "Only superadmin can resolve admin-level reset requests",
        });
      }

      await deletePasswordResetIdCardFile(target.id_card_filename);

      if (status === "approved") {
        const user = await authSessionRepo.getUserById(targetMapped.userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        await authSessionRepo.updateUser(user.id, {
          passwordHash: target.password_hash,
        });
      }

      await dbRun(
        sql`UPDATE password_reset_requests
            SET status = ${status},
                resolved_by = ${currentUser.id},
                resolver_note = ${resolverNote || null},
                id_card_filename = NULL,
                resolved_at = ${new Date().toISOString()}
            WHERE id = ${targetMapped.id}`,
      );
      const resolved = await dbGet<PasswordResetRequestRow>(
        sql`SELECT id, user_id, requested_by_role, password_hash, reason, status, resolved_by, resolver_note, id_card_filename, created_at, resolved_at
            FROM password_reset_requests
            WHERE id = ${targetMapped.id}`,
      );
      if (!resolved) return res.status(404).json({ message: "Request not found" });
      await logAdminAction({
        actorUserId: currentUser.id,
        actorRole: currentUser.role,
        actionType: "password.reset.request.resolve",
        targetType: "password_reset_request",
        targetId: resolved.id,
        details: {
          status,
          requestedByRole: resolved.requested_by_role,
          userId: resolved.user_id,
          hadIdCard: Boolean(target.id_card_filename),
        },
      });
      res.json(toPasswordResetRequest(resolved));
    },
  );

  /**
   * Admin action log viewer endpoint.
   *
   * Surfaces the existing `admin_action_logs` table — which we already write
   * to for approve/reject/role-change/password-reset/site-restore actions —
   * so superadmins can audit *who did what when* through the UI instead of
   * via raw SQL.
   *
   * Pagination is a simple `limit + before` cursor (newest-first):
   *   GET /api/admin/action-logs?limit=50           -> newest 50
   *   GET /api/admin/action-logs?limit=50&before=N  -> next 50 older than id N
   *
   * Filters: ?actor=<userId>, ?actionType=<exact match>, ?targetType=<...>.
   */
  app.get(
    "/api/admin/action-logs/action-types",
    requireAuth,
    requireRole("superadmin"),
    async (_req, res) => {
      const rows = await dbAll<{ action_type: string }>(
        sql`SELECT DISTINCT action_type FROM admin_action_logs ORDER BY action_type ASC`,
      );
      res.json(rows.map((r) => r.action_type));
    },
  );

  app.get(
    "/api/admin/action-logs",
    requireAuth,
    requireRole("superadmin"),
    async (req, res) => {
      const rawLimit = Number.parseInt(String(req.query.limit ?? "100"), 10);
      const limit = Math.min(500, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 100));
      const beforeRaw = Number.parseInt(String(req.query.before ?? ""), 10);
      const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : null;
      const actorRaw = Number.parseInt(String(req.query.actor ?? ""), 10);
      const actor = Number.isFinite(actorRaw) && actorRaw > 0 ? actorRaw : null;
      const actionType = String(req.query.actionType ?? "").trim();
      const targetType = String(req.query.targetType ?? "").trim();

      type LogRow = {
        id: number;
        actor_user_id: number;
        actor_role: string;
        action_type: string;
        target_type: string;
        target_id: string | null;
        details_json: string | null;
        created_at: string;
      };

      const rows = await dbAll<LogRow>(
        sql`SELECT id, actor_user_id, actor_role, action_type, target_type, target_id, details_json, created_at
            FROM admin_action_logs
            WHERE 1=1
              AND (${before} IS NULL OR id < ${before})
              AND (${actor} IS NULL OR actor_user_id = ${actor})
              AND (${actionType} = '' OR action_type = ${actionType})
              AND (${targetType} = '' OR target_type = ${targetType})
            ORDER BY id DESC
            LIMIT ${limit}`,
      );

      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_user_id).filter((v): v is number => Number.isFinite(v))),
      );
      const actorDisplay = await authSessionRepo.getUserDisplayByIds(actorIds);

      res.json(
        rows.map((row) => ({
          id: row.id,
          actorUserId: row.actor_user_id,
          actorRole: row.actor_role,
          actorName: actorDisplay.get(row.actor_user_id)?.fullName ?? null,
          actorUsername: actorDisplay.get(row.actor_user_id)?.username ?? null,
          actionType: row.action_type,
          targetType: row.target_type,
          targetId: row.target_id,
          details: row.details_json ? safeParseJson(row.details_json) : null,
          createdAt: row.created_at,
        })),
      );
    },
  );

  app.post(
    "/api/admin/tests-suggested-panels",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.body?.scope);
      const sectionKey = String(req.body?.sectionKey ?? "tests_suggested").trim();
      const mainLabel = String(req.body?.mainLabel ?? "").trim();
      const subOptionsRaw = Array.isArray(req.body?.subOptions) ? req.body.subOptions : [];
      const subOptions = subOptionsRaw
        .map((v: unknown) => String(v ?? "").trim())
        .filter(Boolean);
      if (!mainLabel) {
        return res.status(400).json({ message: "Main test name is required" });
      }
      if (subOptions.length < 1) {
        return res.status(400).json({ message: "At least one sub-option is required" });
      }

      const mainQuestion = await dbGet<{
        id: number;
        key: string;
        options_json: string | null;
      }>(
        sql`SELECT id, key, options_json FROM form_questions
            WHERE section_key = ${sectionKey}
              AND LOWER(key) IN ('testssuggested', 'testsuggested')
              AND (form_scope = 'shared' OR form_scope = ${scope})
            LIMIT 1`,
      );
      if (!mainQuestion) {
        return res.status(404).json({ message: "Tests Suggested main question not found" });
      }

      let panelKey = String(req.body?.panelKey ?? "").trim() || panelSubQuestionKeyFromLabel(mainLabel);
      const existingKeys = await dbAll<{ key: string }>(
        sql`SELECT key FROM form_questions WHERE section_key = ${sectionKey} AND (form_scope = 'shared' OR form_scope = ${scope})`,
      );
      const keySet = new Set(existingKeys.map((r) => r.key));
      if (keySet.has(panelKey)) {
        panelKey = `${panelKey}_${Math.random().toString(36).slice(2, 6)}`;
      }

      const parsedOptions = parseTestsSuggestedOptions(
        mainQuestion.options_json ? JSON.parse(mainQuestion.options_json) : [],
      );
      const mainNorm = mainKeywordFromLabel(mainLabel);
      const alreadyListed = parsedOptions.some(
        (opt) => mainKeywordFromLabel(typeof opt === "string" ? opt : opt.label) === mainNorm,
      );
      const nextOptions = alreadyListed
        ? parsedOptions
        : [
            ...parsedOptions,
            { type: "panel" as const, label: mainLabel, panelKey },
          ];

      await dbRun(
        sql`UPDATE form_questions
            SET options_json = ${JSON.stringify(serializeTestsSuggestedOptions(nextOptions))}
            WHERE id = ${mainQuestion.id}`,
      );

      const existingSub = await dbGet<{ id: number }>(
        sql`SELECT id FROM form_questions WHERE key = ${panelKey} AND (form_scope = 'shared' OR form_scope = ${scope})`,
      );
      if (!existingSub) {
        const maxOrderRow = await dbGet<{ max: number }>(
          sql`SELECT COALESCE(MAX(display_order), 0) as max FROM form_questions
              WHERE section_key = ${sectionKey} AND (form_scope = 'shared' OR form_scope = ${scope})`,
        );
        const displayOrder = Number(maxOrderRow?.max ?? 0) + 1000;
        await dbRun(
          sql`INSERT INTO form_questions
              (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at, form_scope)
              VALUES (
                ${panelKey},
                ${sectionKey},
                ${mainLabel},
                ${"multiSelect"},
                ${JSON.stringify(subOptions)},
                ${1},
                ${0},
                ${0},
                ${displayOrder},
                ${0},
                ${new Date().toISOString()},
                ${scope}
              )`,
        );
      } else {
        await dbRun(
          sql`UPDATE form_questions
              SET options_json = ${JSON.stringify(subOptions)},
                  label = ${mainLabel},
                  hide_label = ${0},
                  input_type = ${"multiSelect"}
              WHERE key = ${panelKey} AND (form_scope = 'shared' OR form_scope = ${scope})`,
        );
      }

      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"add_tests_suggested_panel"},
              ${panelKey},
              ${null},
              ${JSON.stringify({ mainLabel, subOptions, sectionKey })},
              ${new Date().toISOString()}
            )`,
      );

      return res.status(201).json({
        mainLabel,
        panelKey,
        subOptions,
      });
    },
  );

  app.delete(
    "/api/admin/tests-suggested-panels/:panelKey",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const scope = resolveFormScope(req.query.scope);
      const sectionKey = String(req.query.sectionKey ?? "tests_suggested").trim();
      const panelKey = String(req.params.panelKey ?? "").trim();
      if (!panelKey) {
        return res.status(400).json({ message: "panelKey is required" });
      }
      if (PROTECTED_PANEL_KEYS.has(panelKey)) {
        return res.status(403).json({ message: "Built-in panels cannot be removed from here" });
      }

      const mainQuestion = await dbGet<{ id: number; options_json: string | null }>(
        sql`SELECT id, options_json FROM form_questions
            WHERE section_key = ${sectionKey}
              AND LOWER(key) IN ('testssuggested', 'testsuggested')
              AND (form_scope = 'shared' OR form_scope = ${scope})
            LIMIT 1`,
      );
      if (!mainQuestion) {
        return res.status(404).json({ message: "Tests Suggested main question not found" });
      }

      const parsed = parseTestsSuggestedOptions(
        mainQuestion.options_json ? JSON.parse(mainQuestion.options_json) : [],
      );
      const panelEntry = parsed.find(
        (opt) => typeof opt !== "string" && opt.type === "panel" && opt.panelKey === panelKey,
      );
      const removedMainLabel =
        panelEntry && typeof panelEntry !== "string" ? panelEntry.label : null;
      const removedMainKeyword = removedMainLabel
        ? mainKeywordFromLabel(removedMainLabel)
        : null;
      const nextOptions = parsed.filter((opt) => {
        if (typeof opt === "string") {
          if (removedMainKeyword && mainKeywordFromLabel(opt) === removedMainKeyword) {
            return false;
          }
          return true;
        }
        return opt.type !== "panel" || opt.panelKey !== panelKey;
      });

      await dbRun(
        sql`UPDATE form_questions
            SET options_json = ${JSON.stringify(serializeTestsSuggestedOptions(nextOptions))}
            WHERE id = ${mainQuestion.id}`,
      );
      await dbRun(
        sql`DELETE FROM form_questions
            WHERE key = ${panelKey}
              AND section_key = ${sectionKey}
              AND (form_scope = 'shared' OR form_scope = ${scope})`,
      );

      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_tests_suggested_panel"},
              ${panelKey},
              ${null},
              ${JSON.stringify({ sectionKey })},
              ${new Date().toISOString()}
            )`,
      );

      return res.json({ message: "Panel removed", panelKey });
    },
  );
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
