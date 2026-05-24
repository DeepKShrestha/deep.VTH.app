import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db-query", () => ({
  dbGet: vi.fn(),
}));

import { dbGet } from "./db-query";
import { allocateCaseIdentifiers, peekCaseIdentifiers } from "./case-counters";

describe("case-counters", () => {
  beforeEach(() => {
    vi.mocked(dbGet).mockReset();
  });

  it("allocateCaseIdentifiers returns formatted case number and sequence fields", async () => {
    let n = 0;
    vi.mocked(dbGet).mockImplementation(async () => {
      n += 1;
      return { last_value: n };
    });

    const ids = await allocateCaseIdentifiers("ast", "2082-05-24");
    expect(ids.caseNumber).toMatch(/^AST-\d{6}-\d{3}$/);
    expect(ids.dailyNumber).toBeGreaterThan(0);
    expect(ids.monthlyNumber).toBeGreaterThan(0);
    expect(ids.yearlyNumber).toBeGreaterThan(0);
    expect(vi.mocked(dbGet)).toHaveBeenCalledTimes(4);
  });

  it("peekCaseIdentifiers uses counter row when present", async () => {
    vi.mocked(dbGet).mockImplementation(async (query) => {
      const raw = JSON.stringify(query);
      if (raw.includes("case_counters")) return { last_value: 41 };
      return { count: 0 };
    });
    const ids = await peekCaseIdentifiers("hospital", "2082-05-24");
    expect(ids.dailyNumber).toBe(42);
    expect(ids.caseNumber).toMatch(/^CASE-\d{6}-\d{3}$/);
  });
});
