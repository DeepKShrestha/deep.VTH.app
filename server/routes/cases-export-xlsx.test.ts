import { describe, expect, it } from "vitest";
import type { Case } from "@shared/schema";
import { astWideExportColumnOrder, toAstWideExportRows } from "./cases-export";
import { rowsToXlsxBuffer } from "./cases-export-xlsx";

function minimalCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 9,
    caseNumber: "AST-TEST-001",
    billNumber: null,
    dailyNumber: 1,
    monthlyNumber: 1,
    yearlyNumber: 1,
    date: "2083-02-01",
    dateAd: "2026-05-01",
    ownerName: "O",
    ownerAddress: "A",
    ownerPhone: "1",
    species: "Canine",
    breed: "Mix",
    animalName: "Dog",
    age: "1y",
    sex: "F",
    sampleType: "Blood",
    sampleDate: "2083-02-01",
    sampleDateAd: "2026-05-01",
    cultureResult: "E. coli",
    astResults: "[]",
    remarks: "",
    registeredBy: 1,
    createdAt: "2026-05-01T00:00:00.000Z",
    lastUpdatedBy: 1,
    lastUpdatedByName: "Admin",
    updatedAt: "2026-05-01T00:00:00.000Z",
    customFields: null,
    treatmentDetails: null,
    veterinarianId: null,
    veterinarianName: null,
    veterinarianNvc: null,
    veterinarianDepartment: null,
    ...overrides,
  };
}

describe("cases-export-xlsx", () => {
  it("writes an xlsx ZIP (PK header)", async () => {
    const buf = await rowsToXlsxBuffer([], astWideExportColumnOrder("statistical"), "Empty");
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("writes a workbook with a data row", async () => {
    const rows = toAstWideExportRows([minimalCase()], "statistical");
    const order = astWideExportColumnOrder("statistical");
    const buf = await rowsToXlsxBuffer(rows, order, "AST");
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
