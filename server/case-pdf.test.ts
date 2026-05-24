import { describe, expect, it } from "vitest";
import { buildCasePdfBuffer } from "./case-pdf";
import type { Case } from "@shared/schema";

function minimalCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 1,
    caseNumber: "AST-2082-0001",
    date: "2082-01-15",
    dateAd: "2025-04-28",
    billNumber: null,
    ownerName: "Owner Name",
    ownerAddress: "Kathmandu",
    ownerPhone: "9800000000",
    species: "Canine",
    breed: "Mixed",
    animalName: null,
    age: "2y",
    sex: "M",
    sampleType: "Wound swab",
    sampleDate: "2082-01-14",
    cultureResult: "E. coli",
    astResults: JSON.stringify([
      { antibiotic: "Ampicillin", symbol: "AM", zoneSize: "22", sensitivity: "S" },
    ]),
    remarks: "Test remarks",
    treatmentDetails: null,
    customFields: null,
    veterinarianId: null,
    registeredBy: 1,
    lastUpdatedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Case;
}

describe("buildCasePdfBuffer", () => {
  it("returns a valid PDF header and trailer", async () => {
    const buf = await buildCasePdfBuffer(minimalCase());
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(buf.subarray(buf.length - 6).toString("utf8")).toBe("%%EOF\n");
  });

  it("handles unicode owner names without failing", async () => {
    const buf = await buildCasePdfBuffer(
      minimalCase({ ownerName: "राम श्रेष्ठ", ownerAddress: "काठमाडौं" }),
    );
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
