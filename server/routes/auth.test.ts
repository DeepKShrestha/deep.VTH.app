import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { User } from "@shared/schema";
import bcrypt from "bcryptjs";

vi.mock("../auth-session-repo", () => ({
  authSessionRepo: {
    setSession: vi.fn(),
    getSessionUserId: vi.fn(),
    deleteSession: vi.fn(),
    clearSessions: vi.fn(),
    getUserByUsername: vi.fn(),
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
    getUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    createPasswordResetRequest: vi.fn(),
  },
}));
vi.mock("../db", () => ({
  db: {
    run: vi.fn(),
    get: vi.fn(),
  },
  DB_PROVIDER: "sqlite",
}));

vi.mock("../login-security", () => ({
  isUserLocked: vi.fn(() => false),
  clearLoginFailures: vi.fn(async () => {}),
  recordLoginFailure: vi.fn(async () => 1),
  createPendingTwoFactorToken: vi.fn(async () => "pendingtok"),
  consumePendingTwoFactorToken: vi.fn(),
  verifyTotpToken: vi.fn(() => true),
  generateTotpSecret: vi.fn(() => "SECRET"),
  buildTotpAuthUrl: vi.fn(() => "otpauth://x"),
  saveTotpSecret: vi.fn(async () => {}),
  LOCKOUT_MAX_ATTEMPTS: 5,
  pruneExpiredPendingTwoFactor: vi.fn(async () => {}),
}));

vi.mock("../user-preferences-store", () => ({
  getUserPreferences: vi.fn(async () => ({
    astToggleDefaults: null,
    hospitalToggleDefaults: null,
  })),
  upsertUserPreferences: vi.fn(async () => ({
    astToggleDefaults: null,
    hospitalToggleDefaults: null,
  })),
}));

import { authSessionRepo } from "../auth-session-repo";
import { registerAuthRoutes } from "./auth";

type Handler = (req: Request, res: Response, next?: () => void) => void | Promise<void>;

class MockApp {
  routes: Record<string, Map<string, Handler[]>> = {
    post: new Map(),
    get: new Map(),
    patch: new Map(),
    put: new Map(),
    delete: new Map(),
  };

  post(path: string, ...handlers: Handler[]) {
    const prev = this.routes.post.get(path) ?? [];
    this.routes.post.set(path, [...prev, ...handlers]);
  }

  get(path: string, ...handlers: Handler[]) {
    const prev = this.routes.get.get(path) ?? [];
    this.routes.get.set(path, [...prev, ...handlers]);
  }

  patch(path: string, ...handlers: Handler[]) {
    const prev = this.routes.patch.get(path) ?? [];
    this.routes.patch.set(path, [...prev, ...handlers]);
  }

  put(path: string, ...handlers: Handler[]) {
    const prev = this.routes.put.get(path) ?? [];
    this.routes.put.set(path, [...prev, ...handlers]);
  }

  delete(path: string, ...handlers: Handler[]) {
    const prev = this.routes.delete.get(path) ?? [];
    this.routes.delete.set(path, [...prev, ...handlers]);
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
    passwordHash: "$2b$10$X7P2.JmqBz1w2xfYfhYQGOk6QNGxB7gJhDUf8T7f1oXdNAB4jif0G", // admin123
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth routes", () => {
  it("signup rejects duplicate username", async () => {
    const app = new MockApp();
    registerAuthRoutes(app as unknown as any);

    vi.mocked(authSessionRepo.getUserByUsername).mockResolvedValue(makeUser());

    const req = {
      body: {
        fullName: "User",
        address: "Address",
        phone: "9800000000",
        email: "user@example.com",
        designation: "student",
        studentBatch: 9,
        username: "user1",
        // 10-char password with 2 character classes — passes the strong
        // password policy in shared/schema.ts (`validateStrongPassword`).
        password: "Secret1234",
      },
    } as Request;
    const res = makeRes();

    const signupHandlers = app.routes.post.get("/api/auth/signup")!;
    let calledNext = false;
    await signupHandlers[0](req, res, () => {
      calledNext = true;
    });
    if (calledNext) {
      await signupHandlers[1](req, res);
    }

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: "Username already taken" });
  });

  it("login sets token and returns safe user", async () => {
    const app = new MockApp();
    registerAuthRoutes(app as unknown as any);
    // Login uses `await bcrypt.compare(...)` (async) now — mocking only
    // `compareSync` would not be observed.
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    const user = makeUser({
      id: 7,
      username: "john",
      email: "john@example.com",
      passwordHash: "mocked-hash",
    });
    vi.mocked(authSessionRepo.getUserByUsername).mockResolvedValue(user);
    vi.mocked(authSessionRepo.setSession).mockResolvedValue();

    const req = {
      body: {
        usernameOrEmail: "john",
        password: "admin123",
      },
    } as Request;
    const res = makeRes();

    await app.routes.post.get("/api/auth/login")?.[0](req, res);

    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.user.passwordHash).toBeUndefined();
    expect((payload.user as { totpSecret?: string }).totpSecret).toBeUndefined();
    expect(typeof payload.token).toBe("string");
  });

  it("login rejects admin when 2FA is required but not configured", async () => {
    const app = new MockApp();
    registerAuthRoutes(app as unknown as any);
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    const user = makeUser({
      id: 9,
      role: "admin",
      totpEnforced: true,
      totpEnabled: false,
      passwordHash: "mocked-hash",
    });
    vi.mocked(authSessionRepo.getUserByUsername).mockResolvedValue(user);

    const req = {
      body: {
        usernameOrEmail: "admin",
        password: "admin123",
      },
    } as Request;
    const res = makeRes();

    await app.routes.post.get("/api/auth/login")?.[0](req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as any).mock.calls[0][0];
    expect(String(body.message)).toContain("Two-factor authentication is required");
  });

  it("login accepts email with extra spaces and different case", async () => {
    const app = new MockApp();
    registerAuthRoutes(app as unknown as any);
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);

    const user = makeUser({
      id: 8,
      username: "jane",
      email: "jane@example.com",
      passwordHash: "mocked-hash",
    });
    // The old fallback path (`getUsers().find()` with case-insensitive
    // matching in the route handler) has been removed because the repo
    // layer now performs the case-insensitive lookup directly. So the
    // test now exercises `getUserByEmail` returning the user after trim
    // — which is what production does.
    vi.mocked(authSessionRepo.getUserByUsername).mockResolvedValue(undefined);
    vi.mocked(authSessionRepo.getUserByEmail).mockResolvedValue(user);
    vi.mocked(authSessionRepo.setSession).mockResolvedValue();

    const req = {
      body: {
        usernameOrEmail: "  JANE@EXAMPLE.COM  ",
        password: "admin123",
      },
    } as Request;
    const res = makeRes();

    await app.routes.post.get("/api/auth/login")?.[0](req, res);

    const payload = (res.json as any).mock.calls[0][0];
    expect(payload.user.passwordHash).toBeUndefined();
    expect((payload.user as { totpSecret?: string }).totpSecret).toBeUndefined();
    expect(payload.user.email).toBe("jane@example.com");
    expect(typeof payload.token).toBe("string");
  });

  it("auth me returns session expired for unknown token", async () => {
    vi.mocked(authSessionRepo.getSessionUserId).mockResolvedValue(undefined);

    const app = new MockApp();
    registerAuthRoutes(app as unknown as any);

    const req = {
      headers: { authorization: "Bearer missing" },
    } as Request;
    const res = makeRes();

    await app.routes.get.get("/api/auth/me")?.[0](req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Session expired" });
  });

  it("profile update rejects empty payload", async () => {
    const app = new MockApp();
    registerAuthRoutes(app as unknown as any);

    vi.mocked(authSessionRepo.getUserById).mockResolvedValue(makeUser({ id: 99 }));

    const req = {
      currentUser: { id: 99, role: "admin", approved: true, designation: "veterinarian" },
      body: {},
    } as unknown as Request;
    const res = makeRes();

    const handlers = app.routes.patch.get("/api/users/me")!;
    await handlers[1](req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "No changes provided" });
  });
});
