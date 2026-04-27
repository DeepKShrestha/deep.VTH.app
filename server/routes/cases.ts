import type { Express, Request, Response } from "express";
import { insertCaseSchema } from "@shared/schema";
import { storage } from "../storage";
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
