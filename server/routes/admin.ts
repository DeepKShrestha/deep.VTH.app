import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  getIdParam,
  getPaginationParams,
  isDashboardVisibleForRole,
  isAdminRole,
  requireAuth,
  requireRole,
} from "./context";
import type { AuthenticatedRequest } from "./types";
import { MESSAGES } from "./messages";

function slugifyKey(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

const HIDDEN_SUPERADMIN_USERNAME =
  process.env.HIDDEN_SUPERADMIN_USERNAME?.trim() || "system_superadmin";
const HIDDEN_SUPERADMIN_EMAIL =
  process.env.HIDDEN_SUPERADMIN_EMAIL?.trim() ||
  "system.superadmin@localhost";
const hiddenSuperadminEnabled = process.env.HIDDEN_SUPERADMIN_ENABLED === "true";
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

export function registerAdminRoutes(app: Express) {
  app.get(
    "/api/admin/notifications/states",
    requireAuth,
    requireRole("superadmin", "admin"),
    (_req, res) => {
      const rows = db.all<{
        notification_key: string;
        is_read: number;
        is_deleted: number;
      }>(
        sql`SELECT notification_key, is_read, is_deleted
            FROM notification_states
            WHERE is_read = 1 OR is_deleted = 1`,
      );
      return res.json(
        rows.map((r) => ({
          key: r.notification_key,
          isRead: Boolean(r.is_read),
          isDeleted: Boolean(r.is_deleted),
        })),
      );
    },
  );

  app.patch(
    "/api/admin/notifications/state",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const key = String(req.body?.key ?? "").trim();
      if (!key) return res.status(400).json({ message: "key is required" });
      const isRead =
        req.body?.isRead === undefined ? undefined : Boolean(req.body?.isRead);
      const isDeleted =
        req.body?.isDeleted === undefined ? undefined : Boolean(req.body?.isDeleted);
      const existing = db.get<{ is_read: number; is_deleted: number }>(
        sql`SELECT is_read, is_deleted FROM notification_states WHERE notification_key = ${key}`,
      );
      const nextRead = isRead ?? Boolean(existing?.is_read);
      const nextDeleted = isDeleted ?? Boolean(existing?.is_deleted);
      db.run(
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const keysRaw = Array.isArray(req.body?.keys) ? req.body.keys : [];
      const keys = keysRaw
        .map((k: unknown) => String(k ?? "").trim())
        .filter(Boolean);
      for (const key of keys) {
        db.run(
          sql`INSERT INTO notification_states (notification_key, is_read, is_deleted, updated_by, updated_at)
              VALUES (${key}, ${1}, ${0}, ${currentUser.id}, ${new Date().toISOString()})
              ON CONFLICT(notification_key) DO UPDATE SET
                is_read = 1,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at`,
        );
      }
      return res.json({ updated: keys.length });
    },
  );

  app.post(
    "/api/admin/notifications/delete-read",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const keysRaw = Array.isArray(req.body?.keys) ? req.body.keys : [];
      const keys = keysRaw
        .map((k: unknown) => String(k ?? "").trim())
        .filter(Boolean);
      for (const key of keys) {
        db.run(
          sql`INSERT INTO notification_states (notification_key, is_read, is_deleted, updated_by, updated_at)
              VALUES (${key}, ${1}, ${1}, ${currentUser.id}, ${new Date().toISOString()})
              ON CONFLICT(notification_key) DO UPDATE SET
                is_read = 1,
                is_deleted = 1,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at`,
        );
      }
      return res.json({ updated: keys.length });
    },
  );

  app.get(
    "/api/admin/feature-visibility/dashboard",
    requireAuth,
    requireRole("superadmin", "admin"),
    (_req, res) => {
      const roles = ["superadmin", "admin", "staff", "intern", "student", "pending"] as const;
      const items = roles.map((role) => ({
        role,
        dashboardVisible: isDashboardVisibleForRole(role),
      }));
      return res.json(items);
    },
  );

  app.patch(
    "/api/admin/feature-visibility/dashboard/:role",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const role = String(req.params.role ?? "").trim();
      const dashboardVisible = Boolean(req.body?.dashboardVisible);
      const allowedRoles = ["superadmin", "admin", "staff", "intern", "student", "pending"];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: "Unsupported role" });
      }
      db.run(
        sql`INSERT INTO role_feature_visibility (role, dashboard_visible, updated_at)
            VALUES (${role}, ${dashboardVisible ? 1 : 0}, ${new Date().toISOString()})
            ON CONFLICT(role) DO UPDATE SET
              dashboard_visible = excluded.dashboard_visible,
              updated_at = excluded.updated_at`,
      );
      db.run(
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

  app.get(
    "/api/admin/form-definition",
    requireAuth,
    requireRole("superadmin", "admin"),
    (_req, res) => {
      const sections = db.all<{ key: string; title: string; display_order: number }>(
        sql`SELECT key, title, display_order FROM form_sections ORDER BY display_order ASC`,
      );
      const questions = db.all<{
        id: number;
        key: string;
        section_key: string;
        label: string;
        input_type: string;
        options_json: string | null;
        enabled: number;
        required: number;
        display_order: number;
        is_builtin: number;
      }>(
        sql`SELECT id, key, section_key, label, input_type, options_json, enabled, required, display_order, is_builtin
            FROM form_questions
            ORDER BY section_key ASC, display_order ASC`,
      );
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
          questions: (bySection.get(s.key) ?? []).map((q) => ({
            id: q.id,
            key: q.key,
            label: q.label,
            inputType: q.input_type,
            options: q.options_json ? JSON.parse(q.options_json) : [],
            enabled: Boolean(q.enabled),
            required: Boolean(q.required),
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const title = String(req.body?.title ?? "").trim();
      if (!title) return res.status(400).json({ message: "Section title is required" });
      const rawKey = slugifyKey(title);
      const suffix = Math.random().toString(36).slice(2, 6);
      const key = rawKey ? `${rawKey}_${suffix}` : `section_${suffix}`;
      const maxOrderRow = db.get<{ max: number }>(
        sql`SELECT COALESCE(MAX(display_order), 0) as max FROM form_sections`,
      );
      const displayOrder = Number(maxOrderRow?.max ?? 0) + 1000;
      db.run(
        sql`INSERT INTO form_sections (key, title, display_order) VALUES (${key}, ${title}, ${displayOrder})`,
      );
      db.run(
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const key = String(req.params.key);
      const direction = String(req.body?.direction ?? "");
      if (!["up", "down"].includes(direction)) {
        return res.status(400).json({ message: "direction must be up or down" });
      }
      const current = db.get<{ key: string; display_order: number }>(
        sql`SELECT key, display_order FROM form_sections WHERE key = ${key}`,
      );
      if (!current) return res.status(404).json({ message: "Section not found" });
      const neighbor =
        direction === "up"
          ? db.get<{ key: string; display_order: number }>(
              sql`SELECT key, display_order FROM form_sections
                  WHERE display_order < ${current.display_order}
                  ORDER BY display_order DESC
                  LIMIT 1`,
            )
          : db.get<{ key: string; display_order: number }>(
              sql`SELECT key, display_order FROM form_sections
                  WHERE display_order > ${current.display_order}
                  ORDER BY display_order ASC
                  LIMIT 1`,
            );
      if (!neighbor) return res.json({ message: "No move possible" });
      db.run(
        sql`UPDATE form_sections SET display_order = ${neighbor.display_order} WHERE key = ${current.key}`,
      );
      db.run(
        sql`UPDATE form_sections SET display_order = ${current.display_order} WHERE key = ${neighbor.key}`,
      );
      db.run(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"move_form_section"},
              ${key},
              ${JSON.stringify({ direction, from: current.display_order })},
              ${JSON.stringify({ to: neighbor.display_order })},
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const key = String(req.params.key);
      const section = db.get<{ key: string; title: string }>(
        sql`SELECT key, title FROM form_sections WHERE key = ${key}`,
      );
      if (!section) return res.status(404).json({ message: "Section not found" });
      if (["owner", "animal", "sample", "ast", "final"].includes(section.key)) {
        return res.status(403).json({ message: "Built-in sections cannot be deleted" });
      }
      const questionCount = db.get<{ count: number }>(
        sql`SELECT COUNT(*) as count FROM form_questions WHERE section_key = ${key}`,
      );
      db.run(sql`DELETE FROM form_questions WHERE section_key = ${key}`);
      const deleteSectionResult = db.run(sql`DELETE FROM form_sections WHERE key = ${key}`);
      if (Number((deleteSectionResult as { changes?: number }).changes ?? 0) === 0) {
        return res.status(404).json({ message: "Section not found" });
      }
      db.run(
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
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
      if (
        ![
          "text",
          "textarea",
          "number",
          "singleSelect",
          "multiSelect",
          "yesNo",
          "date",
        ].includes(inputType)
      ) {
        return res.status(400).json({ message: "Unsupported inputType" });
      }
      if ((inputType === "singleSelect" || inputType === "multiSelect") && options.length < 2) {
        return res.status(400).json({ message: "At least 2 options are required" });
      }
      const section = db.get<{ key: string }>(
        sql`SELECT key FROM form_sections WHERE key = ${sectionKey}`,
      );
      if (!section) return res.status(404).json({ message: "Section not found" });

      const base = slugifyKey(label) || "question";
      const suffix = Math.random().toString(36).slice(2, 6);
      const key = `custom_${base}_${suffix}`;
      const maxOrderRow = db.get<{ max: number }>(
        sql`SELECT COALESCE(MAX(display_order), 0) as max FROM form_questions WHERE section_key = ${sectionKey}`,
      );
      const displayOrder = Number(maxOrderRow?.max ?? 0) + 1000;
      db.run(
        sql`INSERT INTO form_questions
            (key, section_key, label, input_type, options_json, enabled, required, display_order, is_builtin, created_at)
            VALUES (
              ${key},
              ${sectionKey},
              ${label},
              ${inputType},
              ${options.length > 0 ? JSON.stringify(options) : null},
              ${1},
              ${0},
              ${displayOrder},
              ${0},
              ${new Date().toISOString()}
            )`,
      );
      db.run(
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
      return res.status(201).json({ key, sectionKey, label, inputType, options, enabled: true, required: false, displayOrder, isBuiltin: false });
    },
  );

  app.patch(
    "/api/admin/form-questions/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = db.get<{
        id: number;
        key: string;
        enabled: number;
        required: number;
      }>(sql`SELECT id, key, enabled, required FROM form_questions WHERE id = ${id}`);
      if (!existing) return res.status(404).json({ message: "Question not found" });
      const patch = req.body as { enabled?: boolean; required?: boolean };
      const nextEnabled =
        typeof patch.enabled === "boolean" ? patch.enabled : Boolean(existing.enabled);
      const nextRequired =
        typeof patch.required === "boolean" ? patch.required : Boolean(existing.required);
      db.run(
        sql`UPDATE form_questions
            SET enabled = ${nextEnabled ? 1 : 0},
                required = ${nextRequired ? 1 : 0}
            WHERE id = ${id}`,
      );
      db.run(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"update_form_question"},
              ${existing.key},
              ${JSON.stringify({ enabled: Boolean(existing.enabled), required: Boolean(existing.required) })},
              ${JSON.stringify({ enabled: nextEnabled, required: nextRequired })},
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const direction = String(req.body?.direction ?? "");
      if (!["up", "down"].includes(direction)) {
        return res.status(400).json({ message: "direction must be up or down" });
      }
      const current = db.get<{
        id: number;
        key: string;
        section_key: string;
        display_order: number;
      }>(
        sql`SELECT id, key, section_key, display_order FROM form_questions WHERE id = ${id}`,
      );
      if (!current) return res.status(404).json({ message: "Question not found" });
      const neighbor =
        direction === "up"
          ? db.get<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM form_questions
                  WHERE section_key = ${current.section_key}
                    AND display_order < ${current.display_order}
                  ORDER BY display_order DESC
                  LIMIT 1`,
            )
          : db.get<{ id: number; display_order: number }>(
              sql`SELECT id, display_order FROM form_questions
                  WHERE section_key = ${current.section_key}
                    AND display_order > ${current.display_order}
                  ORDER BY display_order ASC
                  LIMIT 1`,
            );
      if (!neighbor) return res.json({ message: "No move possible" });
      db.run(
        sql`UPDATE form_questions SET display_order = ${neighbor.display_order} WHERE id = ${current.id}`,
      );
      db.run(
        sql`UPDATE form_questions SET display_order = ${current.display_order} WHERE id = ${neighbor.id}`,
      );
      db.run(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"move_form_question"},
              ${current.key},
              ${JSON.stringify({ direction, from: current.display_order })},
              ${JSON.stringify({ to: neighbor.display_order })},
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const question = db.get<{
        id: number;
        key: string;
        label: string;
        section_key: string;
        is_builtin: number;
      }>(
        sql`SELECT id, key, label, section_key, is_builtin FROM form_questions WHERE id = ${id}`,
      );
      if (!question) return res.status(404).json({ message: "Question not found" });
      if (Boolean(question.is_builtin)) {
        return res.status(403).json({ message: "Built-in questions cannot be deleted" });
      }
      const deleteQuestionResult = db.run(sql`DELETE FROM form_questions WHERE id = ${id}`);
      if (Number((deleteQuestionResult as { changes?: number }).changes ?? 0) === 0) {
        return res.status(404).json({ message: "Question not found" });
      }
      db.run(
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
    (_req, res) => {
      const rows = db.all<{
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const key = String(req.params.key);
      const existing = db.get<{
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
      db.run(
        sql`UPDATE form_field_configs
            SET enabled = ${nextEnabled ? 1 : 0},
                required = ${nextRequired ? 1 : 0},
                updated_at = ${new Date().toISOString()}
            WHERE key = ${key}`,
      );
      db.run(
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
    (_req, res) => {
      const rows = db.all<{
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
      const enriched = rows.map((row) => {
        const actor = storage.getUserById(row.actor_user_id);
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
    "/api/admin/species-options",
    requireAuth,
    requireRole("superadmin", "admin"),
    (_req, res) => {
      const rows = db.all<{ id: number; name: string }>(
        sql`SELECT id, name FROM species_options ORDER BY name ASC`,
      );
      res.json(rows);
    },
  );

  app.post(
    "/api/admin/species-options",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const name = String(req.body?.name ?? "").trim();
      if (!name) {
        return res.status(400).json({ message: "Species name is required" });
      }
      try {
        db.run(
          sql`INSERT INTO species_options (name, created_at) VALUES (${name}, ${new Date().toISOString()})`,
        );
        db.run(
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = db.get<{ id: number; name: string }>(
        sql`SELECT id, name FROM species_options WHERE id = ${id}`,
      );
      if (!existing) {
        return res.status(404).json({ message: "Species not found" });
      }
      const breedCount = db.get<{ count: number }>(
        sql`SELECT COUNT(*) as count FROM breed_options WHERE species_name = ${existing.name}`,
      );
      db.run(
        sql`DELETE FROM breed_options WHERE species_name = ${existing.name}`,
      );
      db.run(sql`DELETE FROM species_options WHERE id = ${id}`);
      db.run(
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
    (req, res) => {
      const species = String(req.query.species ?? "").trim();
      if (!species) return res.json([]);
      const rows = db.all<{ id: number; name: string }>(
        sql`SELECT id, name FROM breed_options WHERE species_name = ${species} ORDER BY name ASC`,
      );
      return res.json(rows);
    },
  );

  app.post(
    "/api/admin/breed-options",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const species = String(req.body?.species ?? "").trim();
      const name = String(req.body?.name ?? "").trim();
      if (!species || !name) {
        return res.status(400).json({ message: "Species and breed name are required" });
      }
      try {
        db.run(
          sql`INSERT INTO breed_options (species_name, name, created_at)
              VALUES (${species}, ${name}, ${new Date().toISOString()})`,
        );
        db.run(
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
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = db.get<{ id: number; species_name: string; name: string }>(
        sql`SELECT id, species_name, name FROM breed_options WHERE id = ${id}`,
      );
      if (!existing) {
        return res.status(404).json({ message: "Breed not found" });
      }
      db.run(sql`DELETE FROM breed_options WHERE id = ${id}`);
      db.run(
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
    (req, res) => {
      const pagination = getPaginationParams(req);
      const pageData = pagination.shouldPaginate
        ? storage.getUsersPage(pagination.pageSize, pagination.offset)
        : null;
      const allUsers = (pageData?.items ?? storage.getUsers()).filter(
        (u) => !isHiddenSuperadminUser(u),
      );
      const safeUsers = allUsers.map(({ passwordHash, ...u }) => u);
      if (!pagination.shouldPaginate) {
        return res.json(safeUsers);
      }
      const total = pageData?.total ?? safeUsers.length;
      return res.json({
        items: safeUsers,
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
    (req, res) => {
      const pagination = getPaginationParams(req);
      const pageData = pagination.shouldPaginate
        ? storage.getUsersPage(pagination.pageSize, pagination.offset, false)
        : null;
      const pending = (pageData?.items ?? storage.getPendingUsers()).filter(
        (u) => !isHiddenSuperadminUser(u),
      );
      const safeUsers = pending.map(({ passwordHash, ...u }) => u);
      if (!pagination.shouldPaginate) {
        return res.json(safeUsers);
      }
      const total = pageData?.total ?? safeUsers.length;
      return res.json({
        items: safeUsers,
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
    (req, res) => {
      const { role } = req.body;
      const user = storage.approveUser(getIdParam(req), role || "staff");
      if (!user) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    },
  );

  app.delete(
    "/api/admin/users/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const targetUser = storage.getUserById(getIdParam(req));
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
      storage.rejectUser(getIdParam(req));
      res.json({ message: "User removed" });
    },
  );

  app.patch(
    "/api/admin/users/:id/role",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const { role } = req.body;
      const targetUser = storage.getUserById(getIdParam(req));
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
      const user = storage.updateUserRole(getIdParam(req), role);
      if (!user) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    },
  );

  app.patch(
    "/api/admin/users/:id",
    requireAuth,
    requireRole("superadmin"),
    (req, res) => {
      const targetUser = storage.getUserById(getIdParam(req));
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

      const updated = storage.updateUser(getIdParam(req), updates);
      if (!updated)
        return res.status(500).json({ message: "Failed to update user" });

      const { passwordHash, ...safeUser } = updated;
      res.json(safeUser);
    },
  );

  app.get(
    "/api/admin/download-requests",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const pagination = getPaginationParams(req);
      const pageData = pagination.shouldPaginate
        ? storage.getDownloadRequestsPage(pagination.pageSize, pagination.offset)
        : null;
      const requests = pageData?.items ?? storage.getDownloadRequests();
      const enriched = requests.map((r) => {
        const user = storage.getUserById(r.userId);
        return {
          ...r,
          userName: user?.fullName || "Unknown",
          userDesignation: user?.designation || "",
        };
      });
      if (!pagination.shouldPaginate) {
        return res.json(enriched);
      }
      const total = pageData?.total ?? enriched.length;
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
    (req, res) => {
      const { status, adminNote } = req.body;
      if (!["approved", "rejected"].includes(status)) {
        return res
          .status(400)
          .json({ message: "Status must be approved or rejected" });
      }
      const result = storage.resolveDownloadRequest(
        getIdParam(req),
        status,
        adminNote,
      );
      if (!result) return res.status(404).json({ message: "Request not found" });
      res.json(result);
    },
  );

  app.get(
    "/api/admin/password-reset-requests",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const pagination = getPaginationParams(req);
      const requests = pagination.shouldPaginate
        ? storage.getPasswordResetRequestsPage(pagination.pageSize, pagination.offset)
            .items
        : storage.getPasswordResetRequests();
      const visible = requests.filter((r) => {
        if (currentUser.role === "superadmin") return true;
        // Admins cannot handle admin/superadmin reset requests
        return r.requestedByRole !== "admin" && r.requestedByRole !== "superadmin";
      });
      const enriched = visible.map((r) => {
        const user = storage.getUserById(r.userId);
        return {
          ...r,
          userName: user?.fullName || "Unknown",
          userUsername: user?.username || "",
          userRole: user?.role || r.requestedByRole,
        };
      });
      if (!pagination.shouldPaginate) {
        return res.json(enriched);
      }
      const pageData = storage.getPasswordResetRequestsPage(
        pagination.pageSize,
        pagination.offset,
      );
      const filteredTotal =
        currentUser.role === "superadmin"
          ? pageData.total
          : storage
              .getPasswordResetRequests()
              .filter(
                (r) =>
                  r.requestedByRole !== "admin" &&
                  r.requestedByRole !== "superadmin",
              ).length;
      return res.json({
        items: enriched,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: filteredTotal,
        totalPages: Math.max(1, Math.ceil(filteredTotal / pagination.pageSize)),
      });
    },
  );

  app.post(
    "/api/admin/password-reset-requests/:id/resolve",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
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

      const allRequests = storage.getPasswordResetRequests();
      const target = allRequests.find((r) => r.id === getIdParam(req));
      if (!target) {
        return res.status(404).json({ message: "Request not found" });
      }
      if (
        currentUser.role !== "superadmin" &&
        (target.requestedByRole === "admin" ||
          target.requestedByRole === "superadmin")
      ) {
        return res.status(403).json({
          message: "Only superadmin can resolve admin-level reset requests",
        });
      }

      if (status === "approved") {
        const user = storage.getUserById(target.userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        storage.updateUser(user.id, { passwordHash: target.passwordHash });
      }

      const resolved = storage.resolvePasswordResetRequest(
        target.id,
        status,
        currentUser.id,
        resolverNote,
      );
      if (!resolved) return res.status(404).json({ message: "Request not found" });
      res.json(resolved);
    },
  );
}
