import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { DownloadRequest, User } from "@shared/schema";
vi.mock("../db", () => ({
  DB_PROVIDER: "sqlite",
  db: {
    run: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock("../db-query", () => ({
  dbAll: vi.fn(),
  dbGet: vi.fn(),
}));
vi.mock("../download-request-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../download-request-auth")>();
  return {
    ...actual,
    findApprovedDownloadRequest: vi.fn(),
  };
});
vi.mock("../auth-session-repo", () => ({
  authSessionRepo: {
    setSession: vi.fn(),
    getSessionUserId: vi.fn(),
    deleteSession: vi.fn(),
    clearSessions: vi.fn(),
    getUserById: vi.fn(),
  },
}));
import { authSessionRepo } from "../auth-session-repo";
import { invalidateAll as invalidateCurrentUserCache } from "../current-user-cache";
import { findApprovedDownloadRequest } from "../download-request-auth";
import {
  canDownload,
  canRegister,
  getIdParam,
  requireAuth,
  requireRole,
  sessions,
} from "./context";
import { MESSAGES } from "./messages";
import type { AuthenticatedRequest } from "./types";

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as any).mockReturnValue(res);
  return res;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    fullName: "Admin",
    address: "VTH",
    phone: "9800000000",
    email: "admin@example.com",
    designation: "veterinarian",
    studentBatch: null,
    username: "admin",
    passwordHash: "hash",
    role: "admin",
    approved: true,
    createdAt: "2026-04-27T00:00:00.000Z",
    failedLoginAttempts: 0,
    lockedUntil: null,
    totpSecret: null,
    totpEnabled: false,
    totpEnforced: false,
    profilePhotoPath: null,
    ...overrides,
  };
}

function makeDownloadRequest(
  overrides: Partial<DownloadRequest> = {},
): DownloadRequest {
  return {
    id: 1,
    userId: 9,
    status: "pending",
    dateFrom: null,
    dateTo: null,
    reason: null,
    adminNote: null,
    createdAt: "2026-04-27T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

afterEach(async () => {
  invalidateCurrentUserCache();
  await sessions.clear();
  vi.clearAllMocks();
});

describe("route context middleware", () => {
  it("parses numeric id param", () => {
    const req = { params: { id: "42" } } as unknown as Request;
    expect(getIdParam(req)).toBe(42);
  });

  it("requireRole blocks missing user", () => {
    const req = {} as Request;
    const res = makeRes();
    const next = vi.fn();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: MESSAGES.NOT_AUTHENTICATED });
    expect(next).not.toHaveBeenCalled();
  });

  it("requireRole allows matching role", () => {
    const req = {
      currentUser: { id: 1, role: "admin", approved: true, designation: "veterinarian" },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    requireRole("admin")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("canRegister rejects student role", () => {
    const req = {
      currentUser: { id: 2, role: "student", approved: true, designation: "student" },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    canRegister(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("canDownload approves staff directly", () => {
    const req = {
      currentUser: { id: 3, role: "staff", approved: true, designation: "lab_assistant" },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    canDownload(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("canDownload denies student without approved request", async () => {
    vi.mocked(findApprovedDownloadRequest).mockResolvedValue(undefined);

    const req = {
      currentUser: { id: 9, role: "student", approved: true, designation: "student" },
      query: {},
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    canDownload(req, res, next);
    await Promise.resolve();
    await Promise.resolve();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("canDownload attaches approved request for student", async () => {
    vi.mocked(findApprovedDownloadRequest).mockResolvedValue({ id: 11, status: "approved" });

    const req = {
      currentUser: { id: 9, role: "student", approved: true, designation: "student" },
      query: { dateFrom: "2082-05-01", dateTo: "2082-05-31" },
    } as unknown as AuthenticatedRequest;
    const res = makeRes();
    const next = vi.fn();

    canDownload(req, res, next);
    await Promise.resolve();
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
    expect(req.approvedDownloadRequest?.id).toBe(11);
  });

  it("requireAuth caches the user snapshot across repeated requests", async () => {
    const token = "cache-test-token";
    const user = makeUser({ id: 42, role: "staff" });
    vi.mocked(authSessionRepo.getSessionUserId).mockResolvedValue(user.id);
    vi.mocked(authSessionRepo.getUserById).mockResolvedValue(user);

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(authSessionRepo.getUserById).toHaveBeenCalledTimes(1);

    const req2 = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request;
    const res2 = makeRes();
    const next2 = vi.fn();

    await requireAuth(req2, res2, next2);
    expect(next2).toHaveBeenCalledTimes(1);
    expect(authSessionRepo.getUserById).toHaveBeenCalledTimes(1);
    expect(authSessionRepo.getSessionUserId).toHaveBeenCalledTimes(2);
  });

  it("requireAuth bypasses cache when session user id no longer matches", async () => {
    const token = "cache-mismatch-token";
    const user = makeUser({ id: 7, role: "admin" });
    vi.mocked(authSessionRepo.getSessionUserId)
      .mockResolvedValueOnce(user.id)
      .mockResolvedValueOnce(99)
      .mockResolvedValueOnce(99);
    vi.mocked(authSessionRepo.getUserById)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(makeUser({ id: 99, role: "student" }));

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request;
    await requireAuth(req, makeRes(), vi.fn());

    const req2 = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as Request;
    await requireAuth(req2, makeRes(), vi.fn());

    expect(authSessionRepo.getUserById).toHaveBeenCalledTimes(2);
  });

  it("canDownload denies student when export dates are missing for a bounded approval", async () => {
    vi.mocked(findApprovedDownloadRequest).mockResolvedValue(undefined);

    const req = {
      currentUser: { id: 9, role: "student", approved: true, designation: "student" },
      query: {},
    } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();

    canDownload(req, res, next);
    await Promise.resolve();
    await Promise.resolve();

    expect(findApprovedDownloadRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        source: "ast_report",
        exportDateFrom: null,
        exportDateTo: null,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

});
