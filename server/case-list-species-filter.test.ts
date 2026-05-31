import { afterEach, describe, expect, it, vi } from "vitest";
import { caseRepo } from "./case-repo";

vi.mock("./db-query", () => ({
  dbAll: vi.fn(async () => []),
  dbGet: vi.fn(async () => ({ count: 0 })),
  dbRun: vi.fn(async () => ({ changes: 0 })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function sqlText(query: unknown): string {
  return (query as { toQuery: (cfg: object) => { sql: string } }).toQuery({
    escapeName: (name: string) => name,
    escapeParam: () => "?",
    escapeString: (value: string) => `'${value.replace(/'/g, "''")}'`,
  } as object).sql;
}

describe("case list species filter", () => {
  it("uses case-insensitive trimmed species match in filtered page queries", async () => {
    await caseRepo.getCasesFilteredPage(20, 0, "hospital", { species: "canine" });

    const { dbAll } = await import("./db-query");
    const listCall = vi.mocked(dbAll).mock.calls.find((call) => {
      const text = sqlText(call[0]).toLowerCase();
      return text.includes("from cases") && text.includes("limit");
    });
    expect(listCall).toBeDefined();
    const built = sqlText(listCall![0]).toLowerCase();
    expect(built).toContain("lower(trim(species)) = lower(?)");
    expect(built).toContain("case_number like");
  });

  it("uses case-insensitive trimmed species match in export date-range queries", async () => {
    await caseRepo.getCasesByDateRangeAndScope(
      "hospital",
      "2082-01-01",
      "2082-12-31",
      undefined,
      "Canine",
    );

    const { dbAll } = await import("./db-query");
    expect(vi.mocked(dbAll).mock.calls.length).toBeGreaterThan(0);
    const built = sqlText(vi.mocked(dbAll).mock.calls[0]![0]).toLowerCase();
    expect(built).toContain("lower(trim(species)) = lower(?)");
    expect(built).toContain("date >=");
    expect(built).toContain("date <=");
    expect(built).toContain("case_number like");
  });
});

describe("dashboard SQL filters (getCasesForDashboard)", () => {
  it("uses case-insensitive match for breed, sex, sample type, and organism", async () => {
    await caseRepo.getCasesForDashboard("hospital", {
      species: "Canine",
      breed: "labrador",
      sex: "male",
      sampleType: "blood",
      organism: "ecoli",
    });

    const { dbAll } = await import("./db-query");
    expect(vi.mocked(dbAll).mock.calls.length).toBeGreaterThan(0);
    const call = vi.mocked(dbAll).mock.calls[0]!;
    const built = sqlText(call[0]).toLowerCase();
    expect(built).toContain("lower(trim(species)) = lower(?)");
    expect(built).toContain("lower(trim(breed)) = lower(?)");
    expect(built).toContain("lower(trim(coalesce(sex, 'unknown'))) = lower(?)");
    expect(built).toContain("lower(trim(coalesce(sample_type, 'unknown'))) = lower(?)");
    expect(built).toContain("lower(trim(coalesce(culture_result, ''))) = lower(?)");
  });
});
