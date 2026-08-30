import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db-query", () => ({
  dbRun: vi.fn(),
}));

vi.mock("../pg-pool", () => ({
  getPgPool: vi.fn(),
}));

vi.mock("../auth-session-repo", () => ({
  authSessionRepo: {
    deleteSessionsByUserId: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../db", () => ({
  DB_PROVIDER: "sqlite",
}));

import { dbRun } from "../db-query";
import { detachUserCaseChangeLogs, deleteUsersByIds } from "./user-deletion";
import { authSessionRepo } from "../auth-session-repo";

describe("user-deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detaches case change logs before deleting users", async () => {
    await deleteUsersByIds([3, 7]);

    expect(vi.mocked(dbRun).mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(authSessionRepo.deleteSessionsByUserId).toHaveBeenCalledWith(3);
    expect(authSessionRepo.deleteSessionsByUserId).toHaveBeenCalledWith(7);
  });

  it("detachUserCaseChangeLogs no-ops on empty input", async () => {
    await detachUserCaseChangeLogs([]);
    expect(dbRun).not.toHaveBeenCalled();
  });
});
