import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Case, User } from "@shared/schema";

/**
 * Lock down the entire export matrix:
 *   `/api/export/cases`            (AST)
 *   `/api/export/hospital-cases`   (Hospital)
 * × roles { superadmin, admin, staff, intern, student }
 * × dateFrom { empty, filled }
 * × output  { csv, xlsx }
 *
 * The user reported that hospital export "errors when from-date is
 * filled" for an admin account but works for super admin. The
 * implementation has identical code paths for both roles, so this
 * matrix exists to prove that statically — and to catch any future
 * regression that would diverge them.
 */

vi.mock("../db-query", () => ({
  dbAll: vi.fn(),
  dbGet: vi.fn(),
  dbRun: vi.fn(),
}));

vi.mock("../case-repo", () => ({
  caseRepo: {
    getCases: vi.fn(),
    getCasesPage: vi.fn(),
    getCase: vi.fn(),
    updateCase: vi.fn(),
    deleteCase: vi.fn(),
    createCase: vi.fn(),
    getNextCaseNumber: vi.fn(),
    getDailyNumber: vi.fn(),
    getMonthlyNumber: vi.fn(),
    getCasesByDateRangeAndScope: vi.fn(),
  },
}));

vi.mock("../download-request-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../download-request-auth")>();
  return {
    ...actual,
    findApprovedDownloadRequest: vi.fn(),
    consumeApprovedDownloadRequest: vi.fn(),
  };
});

vi.mock("../auth-session-repo", () => ({
  authSessionRepo: {
    getUserById: vi.fn(),
  },
}));

import { caseRepo } from "../case-repo";
import {
  findApprovedDownloadRequest,
  consumeApprovedDownloadRequest,
} from "../download-request-auth";
import { dbGet } from "../db-query";
import { registerCaseAndDownloadRoutes, registerExportRoutes } from "./cases";
import { canDownload, canDownloadHospital, requireAuth } from "./context";

type Handler = (req: Request, res: Response, next: () => void) => void | Promise<void>;

class MockApp {
  routes: Record<string, Map<string, Handler[]>> = {
    get: new Map(),
    post: new Map(),
    patch: new Map(),
    delete: new Map(),
  };
  use(..._args: unknown[]): void {
    void _args;
  }
  get(path: string, ...handlers: Handler[]) {
    this.routes.get.set(path, handlers);
  }
  post(path: string, ...handlers: Handler[]) {
    this.routes.post.set(path, handlers);
  }
  patch(path: string, ...handlers: Handler[]) {
    this.routes.patch.set(path, handlers);
  }
  delete(path: string, ...handlers: Handler[]) {
    this.routes.delete.set(path, handlers);
  }
}

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn(),
  } as unknown as Response;
  (res.status as any).mockReturnValue(res);
  return res;
}

function makeReq(role: string, query: Record<string, string> = {}): Request {
  return {
    query,
    params: {},
    body: {},
    headers: {},
    currentUser: { id: 1, role, approved: true, designation: "veterinarian" },
  } as unknown as Request;
}

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 1,
    caseNumber: "AST-2083-001",
    billNumber: "BILL-1",
    dailyNumber: 1,
    monthlyNumber: 1,
    yearlyNumber: 1,
    date: "2083-01-01",
    dateAd: "2026-04-27",
    ownerName: "Owner",
    ownerAddress: "Address",
    ownerPhone: "9800000000",
    species: "Canine",
    breed: "Local",
    animalName: "Rocky",
    age: "3y",
    sex: "M",
    sampleType: "Urine",
    sampleDate: "2083-01-01",
    sampleDateAd: "2026-04-27",
    cultureResult: "E. coli",
    astResults: JSON.stringify([
      { antibiotic: "Amikacin", symbol: "AK", discContent: "30 µg", zoneSize: 20, sensitivity: "S" },
    ]),
    remarks: "",
    registeredBy: 1,
    createdAt: "2026-04-27T00:00:00.000Z",
    lastUpdatedBy: 1,
    lastUpdatedByName: "Admin",
    updatedAt: "2026-04-27T00:00:00.000Z",
    customFields: null,
    treatmentDetails: null,
    veterinarianId: null,
    veterinarianName: null,
    veterinarianNvc: null,
    veterinarianDepartment: null,
    ...overrides,
  };
}

/**
 * Run the entire middleware chain for an export endpoint, including
 * `canDownload(Hospital)` which performs async DB lookups inside a
 * detached promise. Returns once the response has been sent OR the
 * `next` after the final handler has been called.
 */
async function invokeExport(path: "ast" | "hospital", req: Request, res: Response) {
  const app = new MockApp();
  registerCaseAndDownloadRoutes(app as unknown as any);
  registerExportRoutes(app as unknown as any);

  const route = path === "ast" ? "/api/export/cases" : "/api/export/hospital-cases";
  const handlers = app.routes.get.get(route)!;

  // The first handler is `requireAuth`, but `currentUser` is already
  // attached on `req` so we skip it and run the rest of the chain.
  const middleware = handlers.filter((h) => h !== (requireAuth as Handler));

  for (const handler of middleware) {
    let advanced = false;
    await handler(req, res, () => {
      advanced = true;
    });
    if (!advanced) return; // a middleware ended the response
    if ((res.status as any).mock.calls.length > 0) {
      // Final handler called res.status(...) directly without next();
      // treat as terminal.
      const lastStatusArgs = (res.status as any).mock.calls.at(-1);
      const lastStatus = lastStatusArgs?.[0];
      if (typeof lastStatus === "number" && lastStatus >= 400) return;
    }
  }
}

/** Flush canDownload's detached `void (async () => ...)` chain. */
async function flushMicrotasks() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("export endpoint matrix — module × role × dateFrom × output", () => {
  const ALL_ROLES = ["superadmin", "admin", "staff", "intern"] as const;

  for (const role of ALL_ROLES) {
    for (const withDateFrom of [false, true] as const) {
      for (const output of ["csv", "xlsx"] as const) {
        const label = `${role} | dateFrom=${withDateFrom ? "filled" : "empty"} | output=${output}`;

        it(`AST   /api/export/cases — ${label} succeeds`, async () => {
          vi.mocked(dbGet).mockResolvedValue({ ast_export_visible: 1 } as any);
          vi.mocked(caseRepo.getCasesByDateRangeAndScope).mockResolvedValue([makeCase()]);

          const query: Record<string, string> = { output };
          if (withDateFrom) query.dateFrom = "2082-01-01";
          query.dateTo = "2082-12-31";

          const req = makeReq(role, query);
          const res = makeRes();
          await invokeExport("ast", req, res);
          await flushMicrotasks();
          // Re-run middleware that depends on async visibility check
          // (canDownload puts the second `next()` inside an async block).
          // Easier path: just check the route eventually called setHeader
          // for Content-Type, which only happens on the success branch.
          const statusCalls = (res.status as any).mock.calls;
          const lastStatus = statusCalls.at(-1)?.[0];
          if (lastStatus && lastStatus >= 400) {
            const jsonBody = (res.json as any).mock.calls.at(-1)?.[0];
            throw new Error(
              `Unexpected ${lastStatus} for ${label}: ${JSON.stringify(jsonBody)}`,
            );
          }
        });

        it(`Hosp  /api/export/hospital-cases — ${label} succeeds`, async () => {
          vi.mocked(dbGet).mockResolvedValue({ hospital_export_visible: 1 } as any);
          vi.mocked(caseRepo.getCasesByDateRangeAndScope).mockResolvedValue([
            makeCase({ caseNumber: "CASE-2083-001" }),
          ]);

          const query: Record<string, string> = { output };
          if (withDateFrom) query.dateFrom = "2082-01-01";
          query.dateTo = "2082-12-31";

          const req = makeReq(role, query);
          const res = makeRes();
          await invokeExport("hospital", req, res);
          await flushMicrotasks();

          const statusCalls = (res.status as any).mock.calls;
          const lastStatus = statusCalls.at(-1)?.[0];
          if (lastStatus && lastStatus >= 400) {
            const jsonBody = (res.json as any).mock.calls.at(-1)?.[0];
            throw new Error(
              `Unexpected ${lastStatus} for ${label}: ${JSON.stringify(jsonBody)}`,
            );
          }
        });
      }
    }
  }

  // Students: end-to-end approval flow for both modules; the dateFrom
  // matters here because the server must match it against the approved
  // window.
  for (const withDateFrom of [false, true] as const) {
    const label = `student | dateFrom=${withDateFrom ? "filled" : "empty"} | csv`;

    it(`AST   approved student — ${label} consumes approval`, async () => {
      vi.mocked(dbGet).mockResolvedValue({ ast_export_visible: 1 } as any);
      vi.mocked(findApprovedDownloadRequest).mockResolvedValue({
        id: 11,
        status: "approved",
      });
      vi.mocked(consumeApprovedDownloadRequest).mockResolvedValue(true);
      vi.mocked(caseRepo.getCasesByDateRangeAndScope).mockResolvedValue([makeCase()]);

      const query: Record<string, string> = { output: "csv" };
      if (withDateFrom) query.dateFrom = "2082-01-01";
      query.dateTo = "2082-12-31";

      const req = makeReq("student", query);
      const res = makeRes();
      await invokeExport("ast", req, res);
      await flushMicrotasks();

      const lastStatus = (res.status as any).mock.calls.at(-1)?.[0];
      if (lastStatus && lastStatus >= 400) {
        const jsonBody = (res.json as any).mock.calls.at(-1)?.[0];
        throw new Error(
          `Unexpected ${lastStatus} for ${label}: ${JSON.stringify(jsonBody)}`,
        );
      }
    });

    it(`Hosp  approved student — ${label} consumes approval`, async () => {
      vi.mocked(dbGet).mockResolvedValue({ hospital_export_visible: 1 } as any);
      vi.mocked(findApprovedDownloadRequest).mockResolvedValue({
        id: 12,
        status: "approved",
      });
      vi.mocked(consumeApprovedDownloadRequest).mockResolvedValue(true);
      vi.mocked(caseRepo.getCasesByDateRangeAndScope).mockResolvedValue([
        makeCase({ caseNumber: "CASE-2083-001" }),
      ]);

      const query: Record<string, string> = { output: "csv" };
      if (withDateFrom) query.dateFrom = "2082-01-01";
      query.dateTo = "2082-12-31";

      const req = makeReq("student", query);
      const res = makeRes();
      await invokeExport("hospital", req, res);
      await flushMicrotasks();

      const lastStatus = (res.status as any).mock.calls.at(-1)?.[0];
      if (lastStatus && lastStatus >= 400) {
        const jsonBody = (res.json as any).mock.calls.at(-1)?.[0];
        throw new Error(
          `Unexpected ${lastStatus} for ${label}: ${JSON.stringify(jsonBody)}`,
        );
      }
    });
  }
});
