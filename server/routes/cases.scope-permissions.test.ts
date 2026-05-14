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
import { authSessionRepo } from "../auth-session-repo";
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

describe("cases route scope + permission hardening", () => {
  it("denies GET /api/cases for pending role", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const handlers = app.routes.get.get("/api/cases")!;
    const handler = handlers.at(-1)!;
    const req = makeReq({
      query: { scope: "hospital" },
      currentUser: { id: 8, role: "pending", approved: true, designation: "student" } as any,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(caseRepo.getCases).not.toHaveBeenCalled();
  });

  it("allows scoped GET /api/cases and forwards exact scope", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const handlers = app.routes.get.get("/api/cases")!;
    const handler = handlers.at(-1)!;
    vi.mocked(caseRepo.getCases).mockResolvedValue([]);
    const req = makeReq({ query: { scope: "hospital" } });
    const res = makeRes();

    await handler(req, res);

    expect(caseRepo.getCases).toHaveBeenCalledWith("hospital", undefined);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("defaults GET /api/cases/:id to AST scope when query scope missing", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const handlers = app.routes.get.get("/api/cases/:id")!;
    const handler = handlers.at(-1)!;
    vi.mocked(caseRepo.getCase).mockResolvedValue({ id: 1, caseNumber: "AST-2083-001" } as any);
    const req = makeReq({ query: {}, params: { id: "1" } as any });
    const res = makeRes();

    await handler(req, res);

    expect(caseRepo.getCase).toHaveBeenCalledWith(1, "ast", undefined);
  });

  it("denies PATCH /api/cases/:id when role lacks edit capability for requested scope", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const handlers = app.routes.patch.get("/api/cases/:id")!;
    const handler = handlers.at(-1)!;
    const req = makeReq({
      query: { scope: "hospital" },
      currentUser: { id: 9, role: "pending", approved: true, designation: "student" } as any,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(caseRepo.updateCase).not.toHaveBeenCalled();
  });

  it("blocks PATCH that attempts to move case across module scopes", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const handlers = app.routes.patch.get("/api/cases/:id")!;
    const handler = handlers.at(-1)!;
    vi.mocked(authSessionRepo.getUserById).mockResolvedValue({ id: 1, fullName: "Admin" } as any);
    vi.mocked(caseRepo.getCase).mockResolvedValue({ id: 1, caseNumber: "AST-2083-001" } as any);
    const req = makeReq({
      query: { scope: "ast" },
      body: { caseNumber: "CASE-2083-001" },
      params: { id: "1" } as any,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(caseRepo.updateCase).not.toHaveBeenCalled();
  });

  it("allows PATCH within same scope and sends scope to repository", async () => {
    const app = new MockApp();
    registerCaseAndDownloadRoutes(app as unknown as any);
    const handlers = app.routes.patch.get("/api/cases/:id")!;
    const handler = handlers.at(-1)!;
    vi.mocked(authSessionRepo.getUserById).mockResolvedValue({ id: 1, fullName: "Admin" } as any);
    vi.mocked(caseRepo.getCase).mockResolvedValue({ id: 1, caseNumber: "CASE-2083-001" } as any);
    vi.mocked(caseRepo.updateCase).mockResolvedValue({
      id: 1,
      caseNumber: "CASE-2083-001",
      ownerName: "Updated Owner",
    } as any);
    const req = makeReq({
      query: { scope: "hospital" },
      body: { ownerName: "Updated Owner", caseNumber: "CASE-2083-001" },
      params: { id: "1" } as any,
    });
    const res = makeRes();

    await handler(req, res);

    expect(caseRepo.updateCase).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ ownerName: "Updated Owner" }),
      "hospital",
      undefined,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, caseNumber: "CASE-2083-001" }),
    );
  });
});

