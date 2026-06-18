import { describe, expect, it } from "vitest";
import type { Case } from "./schema";
import {
  formatAttendingVeterinarianExport,
  readHospitalExportCustomField,
  resolveHospitalExportFieldValue,
} from "./hospital-export-values";

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 1,
    caseNumber: "CASE-1",
    billNumber: "B-1",
    dailyNumber: 1,
    monthlyNumber: 1,
    yearlyNumber: 1,
    date: "2083-01-01",
    dateAd: "2026-01-01",
    ownerName: "Owner",
    ownerAddress: "Addr",
    ownerPhone: "9800000000",
    species: "Canine",
    breed: "Local",
    animalName: "Max",
    age: "2y",
    sex: "M",
    sampleType: null,
    sampleDate: null,
    sampleDateAd: null,
    cultureResult: null,
    astResults: null,
    remarks: "Note",
    registeredBy: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUpdatedBy: 1,
    lastUpdatedByName: "Admin",
    updatedAt: "2026-01-01T00:00:00.000Z",
    customFields: null,
    treatmentDetails: null,
    veterinarianId: null,
    veterinarianName: null,
    veterinarianNvc: null,
    veterinarianDepartment: null,
    ...overrides,
  };
}

describe("hospital export field values", () => {
  it("reads history from legacy custom key alias", () => {
    expect(readHospitalExportCustomField("historyNotes", { history: "Fever" })).toBe("Fever");
  });

  it("resolves case table fields before custom JSON", () => {
    const c = makeCase({ ownerName: "From Case" });
    expect(
      resolveHospitalExportFieldValue(c, "ownerName", { ownerName: "From Custom" }, String),
    ).toBe("From Case");
  });

  it("resolves weight from custom fields", () => {
    const c = makeCase();
    expect(
      resolveHospitalExportFieldValue(c, "weight", { weight: "12 kg" }, (v) => String(v ?? "")),
    ).toBe("12 kg");
  });

  it("formats attending veterinarian from case columns", () => {
    const c = makeCase({
      veterinarianName: "Dr. A",
      veterinarianNvc: "123",
      veterinarianDepartment: "Surgery",
    });
    expect(formatAttendingVeterinarianExport(c)).toBe("Dr. A | NVC: 123 | Dept: Surgery");
  });
});
