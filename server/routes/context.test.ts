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
vi.mock("../auth-session-repo", () => ({
  authSessionRepo: {
    setSession: vi.fn(),
    getSessionUserId: vi.fn(),
    deleteSession: vi.fn(),
    clearSessions: vi.fn(),
    getUserById: vi.fn(),
  },
}));
import { dbAll } from "../db-query";
import {
  canDownload,
  canRegister,
  getIdParam,
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
    username: "admin",
    passwordHash: "hash",
    role: "admin",
    approved: true,
    createdAt: "2026-04-27T00:00:00.000Z",
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
  await sessions.clear();
  vi.restoreAllMocks();
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
    vi.mocked(dbAll).mockResolvedValue([{ id: 1, status: "pending" }]);

    const req = {
      currentUser: { id: 9, role: "student", approved: true, designation: "student" },
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
    const approved = makeDownloadRequest({ id: 11, status: "approved" });
    vi.mocked(dbAll).mockResolvedValue([{ id: approved.id, status: approved.status }]);

    const req = {
      currentUser: { id: 9, role: "student", approved: true, designation: "student" },
    } as unknown as AuthenticatedRequest;
    const res = makeRes();
    const next = vi.fn();

    canDownload(req, res, next);
    await Promise.resolve();
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
    expect(req.approvedDownloadRequest?.id).toBe(11);
  });

});
