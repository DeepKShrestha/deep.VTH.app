import type { Express } from "express";
import multer from "multer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { DB_PROVIDER } from "../db";
import { dbAll, dbRun } from "../db-query";
import { getSiteBackupDir } from "../services/backup-paths";
import { getBackupSettings, updateBackupSettings } from "../services/backup-settings";
import { isS3Configured } from "../services/backup-remote";
import { listLocalBackupFiles, runSiteBackup } from "../services/backup-service";
import { restoreSiteFromZip } from "../services/restore-service";
import { requireAuth, requireRole } from "./context";
import type { AuthenticatedRequest } from "./types";

const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const base = path.basename(file.originalname || "backup.zip").replace(/[^\w.\-]/g, "_");
      cb(null, `restore-${Date.now()}-${base}`);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 500 },
});

export function registerBackupAdminRoutes(app: Express) {
  app.post(
    "/api/admin/backup/run",
    requireAuth,
    requireRole("superadmin"),
    async (_req, res) => {
      try {
        const result = await runSiteBackup("manual");
        return res.json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ message: msg });
      }
    },
  );

  app.get(
    "/api/admin/backup/local-files",
    requireAuth,
    requireRole("superadmin"),
    (_req, res) => {
      res.json(listLocalBackupFiles());
    },
  );

  app.get(
    "/api/admin/backup/history",
    requireAuth,
    requireRole("superadmin"),
    async (_req, res) => {
      const rows = await dbAll<{
        id: number;
        created_at: string;
        kind: string;
        status: string;
        filename: string;
        size_bytes: number;
        error_message: string | null;
        remote_key: string | null;
        db_provider: string;
      }>(
        sql`SELECT id, created_at, kind, status, filename, size_bytes, error_message, remote_key, db_provider
            FROM backup_history ORDER BY created_at DESC LIMIT 100`,
      );
      res.json(rows);
    },
  );

  app.get(
    "/api/admin/backup/settings",
    requireAuth,
    requireRole("superadmin"),
    async (_req, res) => {
      const settings = await getBackupSettings();
      res.json({
        ...settings,
        dbProvider: DB_PROVIDER,
        s3Configured: isS3Configured(),
      });
    },
  );

  app.put(
    "/api/admin/backup/settings",
    requireAuth,
    requireRole("superadmin"),
    async (req, res) => {
      const body = req.body ?? {};
      await updateBackupSettings({
        autoBackupEnabled:
          typeof body.autoBackupEnabled === "boolean" ? body.autoBackupEnabled : undefined,
        autoIntervalHours:
          typeof body.autoIntervalHours === "number" ? body.autoIntervalHours : undefined,
        retentionCount: typeof body.retentionCount === "number" ? body.retentionCount : undefined,
        remoteUploadEnabled:
          typeof body.remoteUploadEnabled === "boolean" ? body.remoteUploadEnabled : undefined,
      });
      const settings = await getBackupSettings();
      res.json({
        ...settings,
        dbProvider: DB_PROVIDER,
        s3Configured: isS3Configured(),
      });
    },
  );

  app.get(
    "/api/admin/backup/download/:filename",
    requireAuth,
    requireRole("superadmin"),
    (req, res) => {
      const raw = String(req.params.filename ?? "");
      const safe = path.basename(raw);
      if (!/^site-\d{8}-\d{6}\.zip$/i.test(safe)) {
        return res.status(400).json({ message: "Invalid backup filename" });
      }
      const fullPath = path.join(getSiteBackupDir(), safe);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ message: "Backup file not found" });
      }
      return res.download(fullPath, safe);
    },
  );

  app.post(
    "/api/admin/backup/restore",
    requireAuth,
    requireRole("superadmin"),
    restoreUpload.single("archive"),
    async (req, res) => {
      const file = req.file;
      const currentUser = (req as AuthenticatedRequest).currentUser;
      if (!file?.path) {
        return res.status(400).json({ message: "Zip archive is required (field name: archive)" });
      }
      const confirmPhrase = String(req.body?.confirmPhrase ?? "").trim();
      const filename = file.originalname || "backup.zip";
      const sizeBytes = file.size ?? 0;
      try {
        const buf = await fsp.readFile(file.path);
        await fsp.unlink(file.path).catch(() => {});
        const result = await restoreSiteFromZip({ zipBuffer: buf, confirmPhrase });
        // Audit log: site restore is the single most destructive admin op
        // (wipes & replaces every table). Always record who did it, when,
        // and what archive was used — even if the request fails.
        await dbRun(
          sql`INSERT INTO admin_action_logs
              (actor_user_id, actor_role, action_type, target_type, target_id, details_json, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"site_restore"},
                ${"site"},
                ${null},
                ${JSON.stringify({
                  filename,
                  sizeBytes,
                  status: "success",
                  result,
                })},
                ${new Date().toISOString()}
              )`,
        ).catch(() => {
          // Don't fail the response if logging fails — the destructive
          // operation already succeeded.
        });
        return res.json(result);
      } catch (e: unknown) {
        await fsp.unlink(file.path).catch(() => {});
        const msg = e instanceof Error ? e.message : String(e);
        await dbRun(
          sql`INSERT INTO admin_action_logs
              (actor_user_id, actor_role, action_type, target_type, target_id, details_json, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"site_restore"},
                ${"site"},
                ${null},
                ${JSON.stringify({
                  filename,
                  sizeBytes,
                  status: "failure",
                  error: msg,
                })},
                ${new Date().toISOString()}
              )`,
        ).catch(() => {});
        return res.status(400).json({ message: msg });
      }
    },
  );
}
