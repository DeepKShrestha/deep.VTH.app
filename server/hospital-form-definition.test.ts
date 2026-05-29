import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db-query", () => ({
  dbGet: vi.fn(),
  dbRun: vi.fn(),
}));

import { dbGet, dbRun } from "./db-query";
import {
  ensureHospitalChiefComplaintDefinition,
  ensureHospitalVitalsDefinition,
} from "./hospital-form-definition";

const mockedGet = vi.mocked(dbGet);
const mockedRun = vi.mocked(dbRun);

const EXPECTED_VITAL_KEYS = [
  "temperature",
  "heartRate",
  "respiratoryRate",
  "crt",
  "dehydrationPercentage",
  "rumenMotility",
  "weight",
] as const;

const RETIRED_VITAL_KEYS = ["colour"] as const;

function describeSqlChunks(args: unknown[]): string {
  const stmt = args[0] as { queryChunks?: unknown[] };
  const chunks = Array.isArray(stmt.queryChunks)
    ? stmt.queryChunks.map((c) =>
        typeof c === "object" && c !== null && "value" in c
          ? (c as { value: unknown }).value
          : c,
      )
    : [];
  return JSON.stringify(chunks);
}

describe("ensureHospitalVitalsDefinition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRun.mockResolvedValue(undefined as never);
  });

  it("inserts the Vitals section and all current vital questions on a fresh DB", async () => {
    // Nothing exists: section lookup + every question lookup returns undefined.
    mockedGet.mockResolvedValue(undefined as never);

    await ensureHospitalVitalsDefinition();

    // 1 section insert + N question inserts + cleanup DELETE for each retired key.
    expect(mockedRun).toHaveBeenCalledTimes(
      1 + EXPECTED_VITAL_KEYS.length + RETIRED_VITAL_KEYS.length,
    );

    const stmts = mockedRun.mock.calls.map((args) => describeSqlChunks(args));

    expect(stmts.some((s) => s.includes('"vitals"') && s.includes('"Vitals"'))).toBe(true);
    for (const key of EXPECTED_VITAL_KEYS) {
      expect(stmts.some((s) => s.includes(`"${key}"`))).toBe(true);
    }
    // chiefComplaint must NOT be touched by the vitals ensurer — it now
    // lives in its own dedicated section managed by
    // ensureHospitalChiefComplaintDefinition.
    expect(stmts.some((s) => s.includes('"chiefComplaint"'))).toBe(false);
  });

  it("updates existing rows without re-inserting when section + questions already exist", async () => {
    // Section exists and every question exists.
    mockedGet.mockImplementation(async () => ({ id: 1 } as never));

    await ensureHospitalVitalsDefinition();

    // 1 section UPDATE + N question UPDATEs + cleanup DELETE for each retired key.
    expect(mockedRun).toHaveBeenCalledTimes(
      1 + EXPECTED_VITAL_KEYS.length + RETIRED_VITAL_KEYS.length,
    );
  });

  it("scopes every vitals operation to 'hospital'", async () => {
    mockedGet.mockResolvedValue(undefined as never);

    await ensureHospitalVitalsDefinition();

    // Section + question INSERT/UPDATE statements all carry "hospital" scope.
    // The retired-cleanup DELETE doesn't carry a scope literal (it's an
    // unconditional delete of our own built-in row), so check separately.
    const stmts = mockedRun.mock.calls.map((args) => describeSqlChunks(args));
    let scopedCount = 0;
    for (const s of stmts) {
      if (s.includes('"hospital"')) scopedCount += 1;
    }
    expect(scopedCount).toBe(1 + EXPECTED_VITAL_KEYS.length);
  });

  it("deletes retired built-in vitals (e.g. colour) so existing DBs self-heal", async () => {
    mockedGet.mockResolvedValue(undefined as never);

    await ensureHospitalVitalsDefinition();

    const stmts = mockedRun.mock.calls.map((args) => describeSqlChunks(args));
    for (const retired of RETIRED_VITAL_KEYS) {
      const deleteStmt = stmts.find(
        (s) => s.includes("DELETE FROM form_questions") && s.includes(`"${retired}"`),
      );
      expect(deleteStmt).toBeDefined();
    }
  });
});

describe("ensureHospitalChiefComplaintDefinition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRun.mockResolvedValue(undefined as never);
  });

  it("inserts the section and the chiefComplaint question on a fresh DB", async () => {
    mockedGet.mockResolvedValue(undefined as never);

    await ensureHospitalChiefComplaintDefinition();

    // 1 section INSERT + 1 question INSERT.
    expect(mockedRun).toHaveBeenCalledTimes(2);
    const stmts = mockedRun.mock.calls.map((args) => describeSqlChunks(args));
    expect(stmts.some((s) => s.includes('"chief_complaint"') && s.includes('"Chief Complaint"'))).toBe(true);
    expect(stmts.some((s) => s.includes('"chiefComplaint"') && s.includes('"textarea"'))).toBe(true);
  });

  it("moves an existing chiefComplaint row into chief_complaint section", async () => {
    // Section already exists AND the question already exists (e.g. previously
    // seeded into the vitals section by an older build).
    mockedGet.mockImplementation(async () => ({ id: 42 } as never));

    await ensureHospitalChiefComplaintDefinition();

    // 1 section UPDATE + 1 question UPDATE.
    expect(mockedRun).toHaveBeenCalledTimes(2);
    const stmts = mockedRun.mock.calls.map((args) => describeSqlChunks(args));
    // The question UPDATE must set section_key to chief_complaint.
    const questionUpdate = stmts.find(
      (s) => s.includes('"chiefComplaint"') && s.includes('"chief_complaint"'),
    );
    expect(questionUpdate).toBeDefined();
  });

  it("scopes every chief-complaint operation to 'hospital'", async () => {
    mockedGet.mockResolvedValue(undefined as never);

    await ensureHospitalChiefComplaintDefinition();

    for (const args of mockedRun.mock.calls) {
      expect(describeSqlChunks(args)).toContain('"hospital"');
    }
  });
});
