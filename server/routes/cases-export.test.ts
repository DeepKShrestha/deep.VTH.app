import { describe, expect, it } from "vitest";
import type { Case } from "@shared/schema";
import {
  astLongExportColumnOrder,
  astWideExportColumnOrder,
  buildExportCsvFilename,
  buildHospitalExportSchema,
  EXPORT_STATISTICAL_AUDIT_ORDER,
  HOSPITAL_CLINICAL_CORE_HEADERS,
  hospitalExportColumnOrder,
  isStatisticalExportAllowed,
  parseExportLayout,
  parseExportQueryFilters,
  parseOptionalExportQueryString,
  pruneEmptyDynamicExportColumns,
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
  it("wide statistical export handles invalid AST json safely", () => {
    const rows = toAstWideExportRows([makeCase({ astResults: "bad-json" })], "statistical");
    expect(rows).toHaveLength(1);
    expect(rows[0].ast_result_count).toBe("0");
    expect(rows[0].ast_result_slot_01).toBe("");
    expect(rows[0].case_number).toBe("AST-2083-001");
  });

  it("wide clinical export uses readable headers", () => {
    const rows = toAstWideExportRows([makeCase()], "clinical");
    expect(rows).toHaveLength(1);
    expect(rows[0]["Case Number"]).toBe("AST-2083-001");
    expect(rows[0]["AST Result Count"]).toBe("1");
    expect(String(rows[0]["AST Result 01"])).toContain("Amikacin");
    expect(rows[0].case_number).toBeUndefined();
  });

  it("wide statistical export puts first antibiotic in slot 01", () => {
    const rows = toAstWideExportRows([makeCase()], "statistical");
    expect(rows).toHaveLength(1);
    expect(rows[0].ast_result_count).toBe("1");
    expect(String(rows[0].ast_result_slot_01)).toContain("Amikacin");
    expect(String(rows[0].ast_result_slot_01)).toContain("AK");
    expect(rows[0].ast_result_slot_02).toBe("");
    expect(rows[0].case_id).toBe("1");
  });

  it("long clinical export uses readable antibiotic columns", () => {
    const rows = toAstLongExportRows([makeCase()], "clinical");
    expect(rows).toHaveLength(1);
    expect(rows[0].Antibiotic).toBe("Amikacin");
    expect(rows[0]["Zone (mm)"]).toBe("20");
    expect(rows[0].ast_antibiotic).toBeUndefined();
  });

  it("long statistical export produces one row per antibiotic", () => {
    const rows = toAstLongExportRows([makeCase()], "statistical");
    expect(rows).toHaveLength(1);
    expect(rows[0].ast_antibiotic).toBe("Amikacin");
    expect(rows[0].ast_zone_mm).toBe("20");
    expect(rows[0].ast_sensitivity).toBe("S");
    expect(rows[0].case_id).toBe("1");
  });

  it("CSV header follows wide statistical column order", () => {
    const csv = rowsToCsv(
      toAstWideExportRows([makeCase()], "statistical"),
      astWideExportColumnOrder("statistical"),
    );
    const firstLine = csv.split(/\r?\n/)[0].replace(/^\uFEFF/, "");
    expect(firstLine.startsWith('"case_number"')).toBe(true);
    expect(firstLine).toContain('"ast_result_count"');
    expect(firstLine).toContain('"record_created_at"');
  });

  it("CSV header follows wide clinical column order", () => {
    const csv = rowsToCsv(
      toAstWideExportRows([makeCase()], "clinical"),
      astWideExportColumnOrder("clinical"),
    );
    const firstLine = csv.split(/\r?\n/)[0].replace(/^\uFEFF/, "");
    expect(firstLine.startsWith('"Case Number"')).toBe(true);
    expect(firstLine).toContain('"AST Result Count"');
  });

  it("escapes double quotes in CSV output", () => {
    const csv = rowsToCsv(
      toAstWideExportRows([makeCase()], "clinical"),
      astWideExportColumnOrder("clinical"),
    );
    expect(csv).toContain('"note with ""quote"""');
  });

  it("buildExportCsvFilename includes scope, optional dates, and AST layout", () => {
    expect(
      buildExportCsvFilename({
        scope: "ast",
        dateFrom: "2083-01-01",
        dateTo: "2083-01-31",
        exportLayout: "clinical",
        astLayout: "wide",
      }),
    ).toBe("ast-export-clinical-wide_2083-01-01_to_2083-01-31.csv");
    expect(
      buildExportCsvFilename({
        scope: "ast",
        dateFrom: "2083-01-01",
        dateTo: "2083-01-31",
        exportLayout: "statistical",
        astLayout: "long",
      }),
    ).toBe("ast-export-statistical-long_2083-01-01_to_2083-01-31.csv");
    expect(buildExportCsvFilename({ scope: "hospital" })).toBe(
      "hospital-export-clinical_any_to_any.csv",
    );
    expect(buildExportCsvFilename({ scope: "hospital", hospitalLayout: "statistical" })).toBe(
      "hospital-export-statistical_any_to_any.csv",
    );
  });

  it("returns fallback text for empty rows when no column order is supplied", () => {
    expect(rowsToCsv([])).toBe("No data");
  });

  it("emits a header-only CSV when rows are empty but a column order is given", () => {
    const csv = rowsToCsv([], ["case_number", "owner_name"]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"case_number","owner_name"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("clinical hospital export uses readable headers and omits AST sample columns", () => {
    const schema = buildHospitalExportSchema(
      "clinical",
      [{ key: "Village Name", header: "Village Name" }],
      ["Village Name", "Notes"],
    );
    const rows = toHospitalExportRows(
      [
        makeCase({
          caseNumber: "H-1",
          customFields: JSON.stringify({ "Village Name": "Ktm", Notes: "a" }),
        }),
      ],
      schema,
    );
    const order = hospitalExportColumnOrder(rows, schema);
    expect(order[0]).toBe("Case Number");
    expect(order).toContain("Village Name");
    expect(order).toContain("Notes");
    expect(order).not.toContain("sample_type");
    expect(order).not.toContain("Sample Type");
    expect(order).not.toContain("culture_organism");
    expect(order).not.toContain("Case ID");
    const csv = rowsToCsv(rows, order);
    expect(csv).toContain('"H-1"');
    expect(csv).toContain('"Village Name"');
  });

  it("statistical hospital export uses snake_case headers and audit columns", () => {
    const schema = buildHospitalExportSchema("statistical", [], []);
    const rows = toHospitalExportRows([makeCase({ caseNumber: "CASE-1" })], schema);
    const order = hospitalExportColumnOrder(rows, schema);
    expect(order[0]).toBe("case_number");
    expect(order).toContain("treatment_prescription");
    for (const header of EXPORT_STATISTICAL_AUDIT_ORDER) {
      expect(order).toContain(header);
    }
    expect(order).not.toContain("sample_type");
    expect(order).not.toContain("Case Number");
    expect(rows[0].case_id).toBe("1");
    expect(rows[0].case_number).toBe("CASE-1");
  });

  it("hospital export respects form column order before legacy keys", () => {
    const schema = buildHospitalExportSchema(
      "clinical",
      [
        { key: "diagnosis", header: "Diagnosis" },
        { key: "chiefComplaint", header: "Chief Complaint" },
      ],
      ["legacyField"],
    );
    const order = schema.columns;
    const diagnosisIdx = order.indexOf("Diagnosis");
    const complaintIdx = order.indexOf("Chief Complaint");
    const legacyIdx = order.indexOf("legacyField");
    expect(diagnosisIdx).toBeGreaterThan(-1);
    expect(complaintIdx).toBeGreaterThan(diagnosisIdx);
    expect(legacyIdx).toBeGreaterThan(complaintIdx);
  });

  it("hospital export includes vet, treatment, and vaccination columns", () => {
    const schema = buildHospitalExportSchema(
      "clinical",
      [],
      ["canineRabies", "canineRabiesLastDate", "canineDhppil"],
    );
    const rows = toHospitalExportRows(
      [
        makeCase({
          veterinarianName: "Dr. A",
          veterinarianNvc: "123",
          veterinarianDepartment: "Surgery",
          treatmentDetails: JSON.stringify({
            treatmentPrescription: {
              medications: [
                {
                  medication: "Amox",
                  dose: "10",
                  doseUnit: "mg",
                  route: "PO",
                  frequency: "BID",
                  duration: "5d",
                  note: "",
                },
              ],
              generalInstructions: "Rest",
            },
          }),
          customFields: JSON.stringify({
            canineRabies: "Yes",
            canineRabiesLastDate: "2082-01-15",
            canineDhppil: "Unknown",
          }),
        }),
      ],
      schema,
    );
    const order = hospitalExportColumnOrder(rows, schema);
    expect(order).toContain("Attending Veterinarian");
    expect(order).toContain("Treatment / Prescription");
    expect(order).toContain("Rabies (vaccination status)");
    expect(rows[0]["Attending Veterinarian"]).toBe("Dr. A");
    expect(rows[0]["Rabies (vaccination status)"]).toBe("Yes");
    expect(rows[0]["Rabies (last vaccination date BS)"]).toBe("2082-01-15");
  });

  it("prunes dynamic columns that are empty for every row", () => {
    const schema = buildHospitalExportSchema(
      "clinical",
      [
        { key: "diagnosis", header: "Diagnosis" },
        { key: "emptyField", header: "Empty Field" },
      ],
      [],
    );
    const rows = toHospitalExportRows(
      [makeCase({ customFields: JSON.stringify({ diagnosis: "OK" }) })],
      schema,
    );
    const order = pruneEmptyDynamicExportColumns(rows, schema);
    expect(order).toContain("Diagnosis");
    expect(order).not.toContain("Empty Field");
    for (const header of HOSPITAL_CLINICAL_CORE_HEADERS) {
      expect(order).toContain(header);
    }
  });

  it("buildExportCsvFilename includes species slug when set", () => {
    expect(
      buildExportCsvFilename({
        scope: "hospital",
        dateFrom: "2082-01-01",
        dateTo: "2082-01-31",
        species: "Canine",
      }),
    ).toBe("hospital-export-clinical_2082-01-01_to_2082-01-31_species-canine.csv");
  });

  it("parseOptionalExportQueryString trims and ignores empty values", () => {
    expect(parseOptionalExportQueryString("  Canine  ")).toBe("Canine");
    expect(parseOptionalExportQueryString("")).toBeUndefined();
    expect(parseOptionalExportQueryString(["", "Feline"])).toBe("Feline");
    expect(parseOptionalExportQueryString(undefined)).toBeUndefined();
  });

  it("parseExportQueryFilters normalizes date and species query params", () => {
    expect(
      parseExportQueryFilters({
        dateFrom: " 2082-01-01 ",
        dateTo: "2082-12-31",
        species: "Canine",
      }),
    ).toEqual({
      dateFrom: "2082-01-01",
      dateTo: "2082-12-31",
      species: "Canine",
    });
  });

  it("statistical export maps custom fields to snake_case headers", () => {
    const schema = buildHospitalExportSchema(
      "statistical",
      [{ key: "chiefComplaint", header: "ignored" }],
      [],
    );
    const rows = toHospitalExportRows(
      [makeCase({ customFields: JSON.stringify({ chiefComplaint: "Limping" }) })],
      schema,
    );
    expect(rows[0].chief_complaint).toBe("Limping");
  });

  it("parseExportLayout accepts statistical and legacy full alias", () => {
    expect(parseExportLayout(undefined)).toBe("clinical");
    expect(parseExportLayout("statistical")).toBe("statistical");
    expect(parseExportLayout("full")).toBe("statistical");
    expect(parseExportLayout("clinical")).toBe("clinical");
  });

  it("isStatisticalExportAllowed blocks students only", () => {
    expect(isStatisticalExportAllowed("student")).toBe(false);
    expect(isStatisticalExportAllowed("staff")).toBe(true);
    expect(isStatisticalExportAllowed("admin")).toBe(true);
    expect(isStatisticalExportAllowed("intern")).toBe(true);
  });
});
