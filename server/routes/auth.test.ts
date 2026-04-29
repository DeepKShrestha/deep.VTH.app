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

import { authSessionRepo } from "../auth-session-repo";
import { registerAuthRoutes } from "./auth";

type Handler = (req: Request, res: Response, next?: () => void) => void | Promise<void>;

class MockApp {
  routes: Record<string, Map<string, Handler[]>> = {
    post: new Map(),
    get: new Map(),
    patch: new Map(),
  };

  post(path: string, ...handlers: Handler[]) {
    this.routes.post.set(path, handlers);
  }

  get(path: string, ...handlers: Handler[]) {
    this.routes.get.set(path, handlers);
  }

  patch(path: string, ...handlers: Handler[]) {
    this.routes.patch.set(path, handlers);
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
    username: "admin",
    passwordHash: "$2b$10$X7P2.JmqBz1w2xfYfhYQGOk6QNGxB7gJhDUf8T7f1oXdNAB4jif0G", // admin123
    role: "admin",
    approved: true,
    createdAt: "2026-04-27T00:00:00.000Z",
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
        username: "user1",
        password: "secret123",
      },
    } as Request;
    const res = makeRes();

    await app.routes.post.get("/api/auth/signup")?.[0](req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: "Username already taken" });
  });

  it("login sets token and returns safe user", async () => {
    const app = new MockApp();
    registerAuthRoutes(app as unknown as any);
    vi.spyOn(bcrypt, "compareSync").mockReturnValue(true);

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
    expect(typeof payload.token).toBe("string");
  });

  it("login accepts email with extra spaces and different case", async () => {
    const app = new MockApp();
    registerAuthRoutes(app as unknown as any);
    vi.spyOn(bcrypt, "compareSync").mockReturnValue(true);

    const user = makeUser({
      id: 8,
      username: "jane",
      email: "jane@example.com",
      passwordHash: "mocked-hash",
    });
    vi.mocked(authSessionRepo.getUserByUsername).mockResolvedValue(undefined);
    vi.mocked(authSessionRepo.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(authSessionRepo.getUsers).mockResolvedValue([user]);
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
