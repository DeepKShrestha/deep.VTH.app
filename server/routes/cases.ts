import type { Express, Request, Response } from "express";
import { insertCaseSchema } from "@shared/schema";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  canDownload,
  canRegister,
  getIdParam,
  getPaginationParams,
  getTodayBs,
  requireAuth,
  requireRole,
} from "./context";
import type { AuthenticatedRequest } from "./types";
import { MESSAGES } from "./messages";
import { rowsToCsv, toExportRows } from "./cases-export";

export function registerCaseAndDownloadRoutes(app: Express) {
  app.get("/api/species-options", requireAuth, canRegister, (_req, res) => {
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM species_options ORDER BY name ASC`,
    );
    res.json(rows.map((r) => r.name));
  });

  app.get("/api/breed-options", requireAuth, canRegister, (req, res) => {
    const species = String(req.query.species ?? "").trim();
    if (!species) return res.json([]);
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM breed_options WHERE species_name = ${species} ORDER BY name ASC`,
    );
    res.json(rows.map((r) => r.name));
  });

  app.get("/api/form-config", requireAuth, canRegister, (_req, res) => {
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
  });

  app.get("/api/form-definition", requireAuth, canRegister, (_req, res) => {
    const sections = db.all<{ key: string; title: string; display_order: number }>(
      sql`SELECT key, title, display_order FROM form_sections ORDER BY display_order ASC`,
    );
    const questions = db.all<{
      id: number;
      key: string;
      section_key: string;
      label: string;
      input_type: string;
      enabled: number;
      required: number;
      display_order: number;
      is_builtin: number;
    }>(
      sql`SELECT id, key, section_key, label, input_type, enabled, required, display_order, is_builtin
          FROM form_questions
          ORDER BY section_key ASC, display_order ASC`,
    );
    const bySection = new Map<string, typeof questions>();
    for (const q of questions) {
      const list = bySection.get(q.section_key) ?? [];
      list.push(q);
      bySection.set(q.section_key, list);
    }
    res.json({
      sections: sections.map((s) => ({
        key: s.key,
        title: s.title,
        displayOrder: s.display_order,
        questions: (bySection.get(s.key) ?? []).map((q) => ({
          id: q.id,
          key: q.key,
          label: q.label,
          inputType: q.input_type,
          enabled: Boolean(q.enabled),
          required: Boolean(q.required),
          displayOrder: q.display_order,
          isBuiltin: Boolean(q.is_builtin),
        })),
      })),
    });
  });

  app.post("/api/download-requests", requireAuth, (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const { dateFrom, dateTo, reason } = req.body;
    const request = storage.createDownloadRequest({
      userId: user.id,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      reason: reason || null,
    });
    res.status(201).json(request);
  });

  app.get(
    "/api/download-requests/mine",
    requireAuth,
    (req: Request, res: Response) => {
      const user = (req as AuthenticatedRequest).currentUser;
      res.json(storage.getDownloadRequestsByUser(user.id));
    },
  );

  app.get("/api/cases", requireAuth, (req, res) => {
    const pagination = getPaginationParams(req);
    if (!pagination.shouldPaginate) {
      return res.json(storage.getCases());
    }
    const pageData = storage.getCasesPage(pagination.pageSize, pagination.offset);
    return res.json({
      items: pageData.items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pageData.total,
      totalPages: Math.max(1, Math.ceil(pageData.total / pagination.pageSize)),
    });
  });

  app.get("/api/cases/:id", requireAuth, (req, res) => {
    const caseData = storage.getCase(getIdParam(req));
    if (!caseData) return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    res.json(caseData);
  });

  app.get("/api/next-case-info", requireAuth, canRegister, (_req, res) => {
    const todayBs = getTodayBs();
    const bsYearMonth = todayBs.substring(0, 7);
    res.json({
      caseNumber: storage.getNextCaseNumber(),
      dailyNumber: storage.getDailyNumber(todayBs),
      monthlyNumber: storage.getMonthlyNumber(bsYearMonth),
      todayBs,
      todayAd: new Date().toISOString().split("T")[0],
    });
  });

  app.post("/api/cases", requireAuth, canRegister, (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const now = new Date().toISOString();
    const fullUser = storage.getUserById(user.id);

    const parsed = insertCaseSchema.safeParse({
      ...req.body,
      registeredBy: user.id,
    });

    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
    }

    const newCase = storage.createCase({
      ...parsed.data,
      lastUpdatedBy: user.id,
      lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
      updatedAt: now,
    });

    res.status(201).json(newCase);
  });

  app.patch("/api/cases/:id", requireAuth, canRegister, (req, res) => {
    const user = (req as AuthenticatedRequest).currentUser;
    const now = new Date().toISOString();
    const fullUser = storage.getUserById(user.id);

    const updated = storage.updateCase(getIdParam(req), {
      ...req.body,
      lastUpdatedBy: user.id,
      lastUpdatedByName: fullUser?.fullName || `User ${user.id}`,
      updatedAt: now,
    });

    if (!updated) {
      return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
    }

    res.json(updated);
  });

  app.delete(
    "/api/cases/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const existing = storage.getCase(getIdParam(req));
      if (!existing) {
        return res.status(404).json({ message: MESSAGES.CASE_NOT_FOUND });
      }
      storage.deleteCase(getIdParam(req));
      res.json({ message: "Case deleted" });
    },
  );
}

export function registerExportRoutes(app: Express) {
  app.get("/api/export/cases", requireAuth, canDownload, (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query as {
      dateFrom?: string;
      dateTo?: string;
    };
    const casesData = storage.getCasesByDateRange(dateFrom, dateTo);
    const rows = toExportRows(casesData);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=ast-cases.csv");

    const csvContent = rowsToCsv(rows);

    const approvedReq = (req as AuthenticatedRequest).approvedDownloadRequest;

    if (approvedReq) {
      storage.resolveDownloadRequest(
        approvedReq.id,
        "downloaded",
        "Download used",
      );
    }

    return res.send(csvContent);
  });
}
