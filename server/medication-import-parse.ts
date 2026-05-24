import ExcelJS from "exceljs";

export type ParsedMedicationRow = {
  /** 1-based sheet / file row for user-facing errors */
  rowNumber: number;
  name: string;
  medicationClass: string | null;
};

const NAME_HEADERS = new Set([
  "name",
  "medication",
  "medication_name",
  "drug",
  "drug_name",
  "medicine",
]);

const CLASS_HEADERS = new Set([
  "class",
  "group",
  "category",
  "therapeutic_class",
  "medication_class",
  "type",
]);

const MAX_ROWS = 3000;
const MAX_NAME_LEN = 500;
const MAX_CLASS_LEN = 200;

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeaderCell(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function detectHeaderColumns(parts: string[]): { nameCol: number; classCol: number } | null {
  const norm = parts.map(normalizeHeaderCell);
  let nameCol = -1;
  let classCol = -1;
  for (let i = 0; i < norm.length; i++) {
    if (NAME_HEADERS.has(norm[i])) nameCol = i;
    if (CLASS_HEADERS.has(norm[i])) classCol = i;
  }
  if (nameCol >= 0 && classCol >= 0 && nameCol !== classCol) {
    return { nameCol, classCol };
  }
  return null;
}

function validateNameClass(
  nameRaw: string,
  classRaw: string,
  rowNumber: number,
): { ok: true; name: string; medicationClass: string | null } | { ok: false; message: string } {
  const name = nameRaw.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, message: "Medication name is empty" };
  if (name.length > MAX_NAME_LEN) {
    return { ok: false, message: `Name exceeds ${MAX_NAME_LEN} characters` };
  }
  const cls = classRaw.trim().replace(/\s+/g, " ");
  if (cls.length > MAX_CLASS_LEN) {
    return { ok: false, message: `Class exceeds ${MAX_CLASS_LEN} characters` };
  }
  return { ok: true, name, medicationClass: cls ? cls : null };
}

export function parseMedicationImportCsv(text: string): {
  rows: ParsedMedicationRow[];
  errors: Array<{ row: number; message: string }>;
} {
  const errors: Array<{ row: number; message: string }> = [];
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], errors: [{ row: 0, message: "File is empty" }] };
  }

  const firstParts = parseCsvLine(lines[0]);
  const headerCols = detectHeaderColumns(firstParts);
  let dataStartLine = 0;
  let nameCol = 0;
  let classCol = 1;
  if (headerCols) {
    nameCol = headerCols.nameCol;
    classCol = headerCols.classCol;
    dataStartLine = 1;
  } else if (firstParts.length < 2) {
    return {
      rows: [],
      errors: [{ row: 1, message: "Need at least two columns (name and class), or a header row" }],
    };
  }

  const rows: ParsedMedicationRow[] = [];
  for (let i = dataStartLine; i < lines.length; i++) {
    if (rows.length >= MAX_ROWS) {
      errors.push({ row: i + 1, message: `Stopped after ${MAX_ROWS} rows` });
      break;
    }
    const parts = parseCsvLine(lines[i]);
    const nameRaw = parts[nameCol] ?? "";
    const classRaw = parts[classCol] ?? "";
    const rowNumber = i + 1;
    const v = validateNameClass(nameRaw, classRaw, rowNumber);
    if (!v.ok) {
      errors.push({ row: rowNumber, message: v.message });
      continue;
    }
    rows.push({ rowNumber, name: v.name, medicationClass: v.medicationClass });
  }

  return { rows, errors };
}

export async function parseMedicationImportXlsx(buffer: Buffer): Promise<{
  rows: ParsedMedicationRow[];
  errors: Array<{ row: number; message: string }>;
}> {
  const errors: Array<{ row: number; message: string }> = [];
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { rows: [], errors: [{ row: 0, message: "Invalid Excel file" }] };
  }
  const sheet = wb.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: [{ row: 0, message: "Workbook has no sheets" }] };
  }

  const rowValues = (r: number): string[] => {
    const row = sheet.getRow(r);
    const max = Math.max(row.cellCount, 10);
    const out: string[] = [];
    for (let c = 1; c <= max; c++) {
      const cell = row.getCell(c);
      let v = cell.value;
      if (v && typeof v === "object" && "text" in v && typeof (v as { text?: string }).text === "string") {
        v = (v as { text: string }).text;
      } else if (v && typeof v === "object" && "result" in v) {
        v = (cell as { text?: string }).text ?? String((v as { result?: unknown }).result ?? "");
      }
      out.push(v == null ? "" : String(v));
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out;
  };

  const r1 = rowValues(1);
  if (r1.every((x) => !String(x).trim())) {
    return { rows: [], errors: [{ row: 0, message: "First row is empty" }] };
  }

  const headerCols = detectHeaderColumns(r1);
  let startRow = 1;
  let nameCol = 0;
  let classCol = 1;
  if (headerCols) {
    nameCol = headerCols.nameCol;
    classCol = headerCols.classCol;
    startRow = 2;
  } else if (r1.filter((x) => String(x).trim()).length < 2) {
    return {
      rows: [],
      errors: [{ row: 1, message: "Need at least two columns (name and class), or a header row" }],
    };
  }

  const rows: ParsedMedicationRow[] = [];
  const lastRow = sheet.rowCount || 0;
  for (let r = startRow; r <= lastRow; r++) {
    if (rows.length >= MAX_ROWS) {
      errors.push({ row: r, message: `Stopped after ${MAX_ROWS} rows` });
      break;
    }
    const parts = rowValues(r);
    if (parts.every((p) => !p.trim())) continue;
    const nameRaw = parts[nameCol] ?? "";
    const classRaw = parts[classCol] ?? "";
    const v = validateNameClass(nameRaw, classRaw, r);
    if (!v.ok) {
      errors.push({ row: r, message: v.message });
      continue;
    }
    rows.push({ rowNumber: r, name: v.name, medicationClass: v.medicationClass });
  }

  return { rows, errors };
}

export async function parseMedicationImportFile(
  buffer: Buffer,
  originalName: string,
): Promise<{ rows: ParsedMedicationRow[]; errors: Array<{ row: number; message: string }> }> {
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseMedicationImportCsv(buffer.toString("utf8"));
  }
  if (lower.endsWith(".xlsx")) {
    return parseMedicationImportXlsx(buffer);
  }
  return { rows: [], errors: [{ row: 0, message: "Unsupported file type (use .csv or .xlsx)" }] };
}
