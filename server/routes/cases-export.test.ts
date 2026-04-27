import { describe, expect, it } from "vitest";
import type { Case } from "@shared/schema";
import { parseAstResults, rowsToCsv, toExportRows } from "./cases-export";

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 1,
    caseNumber: "AST-2083-001",
    billNumber: "BILL-1",
    dailyNumber: 1,
    monthlyNumber: 1,
    date: "2083-01-01",
    dateAd: "2026-04-27",
    ownerName: "Owner",
    ownerAddress: "Address",
    ownerPhone: "9800000000",
    species: "Canine",
    breed: "Local",
    animalName: "Rocky",
    age: "3y",
    sex: "M",
    sampleType: "Urine",
    sampleDate: "2083-01-01",
    sampleDateAd: "2026-04-27",
    cultureResult: "E. coli",
    astResults: JSON.stringify([
      { antibiotic: "Amikacin", symbol: "AK", zoneSize: 20, sensitivity: "S" },
    ]),
    remarks: 'note with "quote"',
    registeredBy: 1,
    createdAt: "2026-04-27T00:00:00.000Z",
    lastUpdatedBy: 1,
    lastUpdatedByName: "Admin",
    updatedAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("cases export helpers", () => {
  it("safely parses invalid AST json", () => {
    expect(parseAstResults("bad-json")).toEqual([]);
  });

  it("builds export rows with AST summary fields", () => {
    const rows = toExportRows([makeCase()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Antibiotics Tested"]).toBe("Amikacin (AK)");
    expect(rows[0]["Zone Sizes (mm)"]).toBe("20");
    expect(rows[0]["Sensitivity Results"]).toBe("S");
  });

  it("escapes double quotes in CSV output", () => {
    const csv = rowsToCsv(toExportRows([makeCase()]));
    expect(csv).toContain('"note with ""quote"""');
  });

  it("returns fallback text for empty rows", () => {
    expect(rowsToCsv([])).toBe("No data");
  });
});
