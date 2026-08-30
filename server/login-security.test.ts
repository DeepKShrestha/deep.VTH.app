import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  DB_PROVIDER: "sqlite",
}));
vi.mock("./db-query", () => ({
  dbGet: vi.fn(),
  dbRun: vi.fn(),
}));
vi.mock("./pg-pool", () => ({
  getPgPool: vi.fn(),
}));

import { dbGet, dbRun } from "./db-query";
import {
  LOCKOUT_MAX_ATTEMPTS,
  accountLockMessage,
  isUserLocked,
  resetLoginFailureWindowIfUnlocked,
  recordLoginFailure,
} from "./login-security";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("login-security", () => {
  beforeEach(() => {
    vi.mocked(dbRun).mockClear();
    vi.mocked(dbRun).mockResolvedValue(undefined);
    vi.mocked(dbGet).mockReset();
  });
  it("isUserLocked is false when locked_until is in the past", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isUserLocked(past)).toBe(false);
    expect(isUserLocked(null)).toBe(false);
  });

  it("isUserLocked is true when locked_until is in the future", () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    expect(isUserLocked(future)).toBe(true);
  });

  it("accountLockMessage includes remaining minutes", () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(accountLockMessage(future)).toMatch(/Try again in about \d+ minute/);
  });

  it("resetLoginFailureWindowIfUnlocked clears expired lock state", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    vi.mocked(dbRun).mockResolvedValue(undefined);

    await resetLoginFailureWindowIfUnlocked(7, past, LOCKOUT_MAX_ATTEMPTS);

    expect(dbRun).toHaveBeenCalled();
  });

  it("resetLoginFailureWindowIfUnlocked does nothing while actively locked", async () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    vi.mocked(dbRun).mockResolvedValue(undefined);

    await resetLoginFailureWindowIfUnlocked(7, future, LOCKOUT_MAX_ATTEMPTS);

    expect(dbRun).not.toHaveBeenCalled();
  });

  it("recordLoginFailure resets stale window before counting a new failure", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    vi.mocked(dbGet)
      .mockResolvedValueOnce({ locked_until: past, failed_login_attempts: 5 })
      .mockResolvedValueOnce({ c: 1 });
    vi.mocked(dbRun).mockResolvedValue(undefined);

    const count = await recordLoginFailure(3);

    expect(count).toBe(1);
    expect(dbRun).toHaveBeenCalled();
  });
});
