import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db-query", () => ({
  dbGet: vi.fn(),
  dbRun: vi.fn(),
}));

import { dbGet, dbRun } from "./db-query";
import { ensureHospitalVitalsDefinition } from "./hospital-form-definition";

const mockedGet = vi.mocked(dbGet);
const mockedRun = vi.mocked(dbRun);

const EXPECTED_VITAL_KEYS = [
  "chiefComplaint",
  "temperature",
  "heartRate",
  "respiratoryRate",
  "crt",
  "dehydrationPercentage",
  "rumenMotility",
  "weight",
  "colour",
] as const;

describe("ensureHospitalVitalsDefinition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRun.mockResolvedValue(undefined as never);
  });

  it("inserts the Vitals section and all 9 vital questions on a fresh DB", async () => {
    // Nothing exists: section lookup + every question lookup returns undefined.
    mockedGet.mockResolvedValue(undefined as never);

    await ensureHospitalVitalsDefinition();

    // 1 section insert + 9 question inserts.
    expect(mockedRun).toHaveBeenCalledTimes(1 + EXPECTED_VITAL_KEYS.length);

    // Inspect the SQL fragments to confirm what was inserted. Using
    // `queryChunks` mirrors how drizzle's `sql` template stores literals.
    const inserts = mockedRun.mock.calls.map((args) => {
      const stmt = args[0] as unknown as { queryChunks?: unknown[] };
      const chunks = Array.isArray(stmt.queryChunks)
        ? stmt.queryChunks.map((c) => (typeof c === "object" && c && "value" in c ? (c as { value: unknown }).value : c))
        : [];
      return JSON.stringify(chunks);
    });

    expect(inserts.some((s) => s.includes('"vitals"') && s.includes('"Vitals"'))).toBe(true);
    for (const key of EXPECTED_VITAL_KEYS) {
      expect(inserts.some((s) => s.includes(`"${key}"`))).toBe(true);
    }
  });

  it("updates existing rows without re-inserting when section + questions already exist", async () => {
    // Section exists and every question exists.
    mockedGet.mockImplementation(async () => ({ id: 1 } as never));

    await ensureHospitalVitalsDefinition();

    // 1 section UPDATE + 9 question UPDATEs.
    expect(mockedRun).toHaveBeenCalledTimes(1 + EXPECTED_VITAL_KEYS.length);
  });

  it("scopes every operation to 'hospital'", async () => {
    mockedGet.mockResolvedValue(undefined as never);

    await ensureHospitalVitalsDefinition();

    const everyStmt = mockedRun.mock.calls.map((args) => {
      const stmt = args[0] as unknown as { queryChunks?: unknown[] };
      const chunks = Array.isArray(stmt.queryChunks)
        ? stmt.queryChunks.map((c) => (typeof c === "object" && c && "value" in c ? (c as { value: unknown }).value : c))
        : [];
      return JSON.stringify(chunks);
    });

    for (const s of everyStmt) {
      expect(s).toContain('"hospital"');
    }
  });
});
