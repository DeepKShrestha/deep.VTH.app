import { describe, expect, it } from "vitest";
import type { Case } from "@shared/schema";
import {
  astWideExportColumnOrder,
  buildExportCsvFilename,
  hospitalExportColumnOrder,
  rowsToCsv,
  toAstLongExportRows,
  toAstWideExportRows,
  toHospitalExportRows,
} from "./cases-export";

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 1,
    caseNumber: "AST-2083-001",
    billNumber: "BILL-1",
    dailyNumber: 1,
    monthlyNumber: 1,
    yearlyNumber: 1,
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
      { antibiotic: "Amikacin", symbol: "AK", discContent: "30 µg", zoneSize: 20, sensitivity: "S" },
    ]),
    remarks: 'note with "quote"',
    registeredBy: 1,
    createdAt: "2026-04-27T00:00:00.000Z",
    lastUpdatedBy: 1,
    lastUpdatedByName: "Admin",
    updatedAt: "2026-04-27T00:00:00.000Z",
    customFields: null,
    treatmentDetails: null,
    veterinarianId: null,
    veterinarianName: null,
    veterinarianNvc: null,
    veterinarianDepartment: null,
    ...overrides,
  };
}

describe("cases export helpers", () => {
  it("wide export handles invalid AST json safely", () => {
    const rows = toAstWideExportRows([makeCase({ astResults: "bad-json" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ast_result_count).toBe("0");
    expect(rows[0].ast_result_slot_01).toBe("");
    expect(rows[0].case_number).toBe("AST-2083-001");
  });

  it("wide export puts first antibiotic in slot 01", () => {
    const rows = toAstWideExportRows([makeCase()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ast_result_count).toBe("1");
    expect(String(rows[0].ast_result_slot_01)).toContain("Amikacin");
    expect(String(rows[0].ast_result_slot_01)).toContain("AK");
    expect(String(rows[0].ast_result_slot_01)).toContain("20");
    expect(String(rows[0].ast_result_slot_01)).toContain("S");
    expect(rows[0].ast_result_slot_02).toBe("");
  });

  it("long export produces one row per antibiotic", () => {
    const rows = toAstLongExportRows([makeCase()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ast_antibiotic).toBe("Amikacin");
    expect(rows[0].ast_zone_mm).toBe("20");
    expect(rows[0].ast_sensitivity).toBe("S");
  });

  it("CSV header follows wide column order", () => {
    const csv = rowsToCsv(toAstWideExportRows([makeCase()]), astWideExportColumnOrder());
    const firstLine = csv.split(/\r?\n/)[0].replace(/^\uFEFF/, "");
    expect(firstLine.startsWith('"case_number"')).toBe(true);
    expect(firstLine).toContain('"ast_result_count"');
    expect(firstLine).toContain('"ast_result_slot_01"');
  });

  it("escapes double quotes in CSV output", () => {
    const csv = rowsToCsv(toAstWideExportRows([makeCase()]), astWideExportColumnOrder());
    expect(csv).toContain('"note with ""quote"""');
  });

  it("buildExportCsvFilename includes scope, optional dates, and AST layout", () => {
    expect(
      buildExportCsvFilename({
        scope: "ast",
        dateFrom: "2083-01-01",
        dateTo: "2083-01-31",
        astLayout: "wide",
      }),
    ).toBe("ast-export-wide_2083-01-01_to_2083-01-31.csv");
    expect(
      buildExportCsvFilename({
        scope: "ast",
        dateFrom: "2083-01-01",
        dateTo: "2083-01-31",
        astLayout: "long",
      }),
    ).toBe("ast-export-long_2083-01-01_to_2083-01-31.csv");
    expect(buildExportCsvFilename({ scope: "hospital" })).toBe("hospital-export_any_to_any.csv");
  });

  it("returns fallback text for empty rows", () => {
    expect(rowsToCsv([])).toBe("No data");
  });

  it("hospital export uses form labels as headers (no custom_ prefix)", () => {
    const rows = toHospitalExportRows([
      makeCase({
        caseNumber: "H-1",
        customFields: JSON.stringify({ "Village Name": "Ktm", Notes: "a" }),
      }),
    ]);
    const order = hospitalExportColumnOrder(rows);
    expect(order[0]).toBe("case_number");
    expect(order[1]).toBe("case_id");
    expect(order).toContain("Village Name");
    expect(order).toContain("Notes");
    expect(order.some((k) => k.startsWith("custom_"))).toBe(false);
    const csv = rowsToCsv(rows, order);
    expect(csv).toContain('"H-1"');
    expect(csv).toContain('"Village Name"');
  });

  it("hospital custom header avoids collision with core column names", () => {
    const rows = toHospitalExportRows([
      makeCase({
        customFields: JSON.stringify({ species: "from form", "Village Name": "x" }),
      }),
    ]);
    const order = hospitalExportColumnOrder(rows);
    expect(order).toContain("species");
    expect(order).toContain("species (2)");
    expect(rows[0]["species (2)"]).toBe("from form");
  });
});
