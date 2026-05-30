/**
 * Matrix tests for the register-visibility resolver.
 *
 * These cover the *combination* of:
 *   - per-role admin override (NULL → inherit, 0 → deny, 1 → allow)
 *   - per-batch student override (no row → inherit, 0 → deny)
 *
 * The middleware tests in context.test.ts cover the Express plumbing.
 * Here we exercise the pure resolver directly so a future regression in
 * the gating arithmetic is caught with a clearer error message than
 * "the AST POST endpoint returns 403 in a scenario it shouldn't".
 */
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { dbGet } from "../db-query";
import {
  canCreateCaseInScope,
  isAstRegisterVisibleForRole,
  isBatchRegisterVisible,
  isHospitalRegisterVisibleForRole,
} from "./context";

afterEach(() => {
  vi.clearAllMocks();
});

describe("isAstRegisterVisibleForRole — per-role resolver", () => {
  it("returns true for staff when no override row exists (capability fallback)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce(undefined);
    await expect(isAstRegisterVisibleForRole("staff")).resolves.toBe(true);
  });

  it("returns false for student when no override row exists (no capability)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce(undefined);
    await expect(isAstRegisterVisibleForRole("student")).resolves.toBe(false);
  });

  it("returns true for student when admin explicitly sets value=1 (grant)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ value: 1 });
    await expect(isAstRegisterVisibleForRole("student")).resolves.toBe(true);
  });

  it("returns false for staff when admin explicitly sets value=0 (deny)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ value: 0 });
    await expect(isAstRegisterVisibleForRole("staff")).resolves.toBe(false);
  });

  it("treats NULL override as inherit (not as deny)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ value: null });
    await expect(isAstRegisterVisibleForRole("staff")).resolves.toBe(true);
  });

  it("recovers gracefully when the column doesn't exist yet (pre-migration)", async () => {
    vi.mocked(dbGet).mockRejectedValueOnce(new Error("no such column"));
    await expect(isAstRegisterVisibleForRole("staff")).resolves.toBe(true);
  });
});

describe("isHospitalRegisterVisibleForRole — per-role resolver", () => {
  it("returns true for student by default (capability fallback grants hospital)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce(undefined);
    await expect(isHospitalRegisterVisibleForRole("student")).resolves.toBe(true);
  });

  it("returns false for student when admin sets value=0", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ value: 0 });
    await expect(isHospitalRegisterVisibleForRole("student")).resolves.toBe(false);
  });
});

describe("isBatchRegisterVisible — per-batch resolver", () => {
  it("returns true when no row exists (inherit role decision)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce(undefined);
    await expect(isBatchRegisterVisible("ast", 76)).resolves.toBe(true);
  });

  it("returns true when row exists with register_visible=1", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ register_visible: 1 });
    await expect(isBatchRegisterVisible("ast", 76)).resolves.toBe(true);
  });

  it("returns false when row exists with register_visible=0", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ register_visible: 0 });
    await expect(isBatchRegisterVisible("ast", 76)).resolves.toBe(false);
  });

  it("returns true for invalid batch numbers (no-op safeguard)", async () => {
    // Negative / zero / NaN batches should never block — the caller is
    // responsible for supplying a real batch, and "true" matches the
    // inherit-role default.
    await expect(isBatchRegisterVisible("ast", -1)).resolves.toBe(true);
    await expect(isBatchRegisterVisible("ast", 0)).resolves.toBe(true);
    await expect(isBatchRegisterVisible("ast", Number.NaN)).resolves.toBe(true);
  });
});

describe("canCreateCaseInScope — combined resolver matrix", () => {
  it("non-student: role=on → allow (batch never consulted)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ value: 1 });
    await expect(
      canCreateCaseInScope({ role: "staff" }, "ast"),
    ).resolves.toBe(true);
    // Exactly one DB call — confirms we short-circuit the batch lookup.
    expect(dbGet).toHaveBeenCalledTimes(1);
  });

  it("non-student: role=off → deny (batch never consulted)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ value: 0 });
    await expect(
      canCreateCaseInScope({ role: "staff" }, "ast"),
    ).resolves.toBe(false);
    expect(dbGet).toHaveBeenCalledTimes(1);
  });

  it("student with batch: role=off → deny short-circuit (batch never consulted)", async () => {
    vi.mocked(dbGet).mockResolvedValueOnce({ value: 0 });
    await expect(
      canCreateCaseInScope({ role: "student", studentBatch: 76 }, "ast"),
    ).resolves.toBe(false);
    expect(dbGet).toHaveBeenCalledTimes(1);
  });

  it("student with batch: role=on, batch missing → allow (inherit)", async () => {
    vi.mocked(dbGet)
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce(undefined);
    await expect(
      canCreateCaseInScope({ role: "student", studentBatch: 76 }, "ast"),
    ).resolves.toBe(true);
    expect(dbGet).toHaveBeenCalledTimes(2);
  });

  it("student with batch: role=on, batch=0 → deny (per-batch override narrows)", async () => {
    vi.mocked(dbGet)
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ register_visible: 0 });
    await expect(
      canCreateCaseInScope({ role: "student", studentBatch: 76 }, "ast"),
    ).resolves.toBe(false);
  });

  it("student without batch number: role gate applies, batch is skipped", async () => {
    // A student row with null studentBatch (e.g. legacy data before
    // batches were collected) should still go by the role toggle alone.
    vi.mocked(dbGet).mockResolvedValueOnce({ value: 1 });
    await expect(
      canCreateCaseInScope({ role: "student", studentBatch: null }, "ast"),
    ).resolves.toBe(true);
    expect(dbGet).toHaveBeenCalledTimes(1);
  });
});
