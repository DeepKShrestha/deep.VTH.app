import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

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

vi.mock("../auth-session-repo", () => ({
  authSessionRepo: {
    getUserById: vi.fn(),
  },
}));

import { caseRepo } from "../case-repo";
import { registerCaseAndDownloadRoutes } from "./cases";

type Handler = (req: Request, res: Response, next?: () => void) => void | Promise<void>;

class MockApp {
  routes: Record<string, Map<string, Handler[]>> = {
    get: new Map(),
    post: new Map(),
    patch: new Map(),
    delete: new Map(),
  };

  /** `registerCaseAndDownloadRoutes` registers static middleware here; these tests only hit JSON routes. */
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
  } as unknown as Response;
  (res.status as any).mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<Request> = {}) {
  return {
    query: {},
    params: { id: "1" },
    body: {},
    currentUser: { id: 1, role: "admin", approved: true, designation: "veterinarian" },
    ...overrides,
  } as unknown as Request;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("module-scope API flow (e2e-style)", () => {
  it("keeps AST and hospital case lists isolated", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const listHandlers = app.routes.get.get("/api/cases")!;
    const listHandler = listHandlers.at(-1)!;
    vi.mocked(caseRepo.getCases).mockImplementation(async (scope?: "ast" | "hospital") => {
      if (scope === "hospital") return [{ id: 2, caseNumber: "CASE-2083-001" }] as any;
      return [{ id: 1, caseNumber: "AST-2083-001" }] as any;
    });

    const astRes = makeRes();
    await listHandler(makeReq({ query: { scope: "ast" } }), astRes);
    expect(astRes.json).toHaveBeenCalledWith([{ id: 1, caseNumber: "AST-2083-001" }]);

    const hospitalRes = makeRes();
    await listHandler(makeReq({ query: { scope: "hospital" } }), hospitalRes);
    expect(hospitalRes.json).toHaveBeenCalledWith([{ id: 2, caseNumber: "CASE-2083-001" }]);
  });

  it("prevents reading a hospital case through AST scope", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const getHandlers = app.routes.get.get("/api/cases/:id")!;
    const getHandler = getHandlers.at(-1)!;
    vi.mocked(caseRepo.getCase).mockResolvedValue(undefined);
    const req = makeReq({ query: { scope: "ast" }, params: { id: "2" } as any });
    const res = makeRes();

    await getHandler(req, res);

    expect(caseRepo.getCase).toHaveBeenCalledWith(2, "ast");
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("prevents deleting across scope mismatch", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const deleteHandlers = app.routes.delete.get("/api/cases/:id")!;
    const deleteHandler = deleteHandlers.at(-1)!;
    vi.mocked(caseRepo.getCase).mockResolvedValue(undefined);
    const req = makeReq({ query: { scope: "ast" }, params: { id: "2" } as any });
    const res = makeRes();

    await deleteHandler(req, res);

    expect(caseRepo.getCase).toHaveBeenCalledWith(2, "ast");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(caseRepo.deleteCase).not.toHaveBeenCalled();
  });
});

