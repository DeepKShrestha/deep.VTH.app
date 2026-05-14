import type { Breakpoint } from "@shared/schema";

/** AST grid row shape used by register-case and CSV import. */
export type AstCsvImportRow = {
  breakpointId: number | null;
  antibiotic: string;
  symbol: string;
  discContent: string;
  zoneSize: string;
  sensitivity: "S" | "I" | "R" | "";
  autoSensitivity: "S" | "I" | "R" | "";
  manualOverride: boolean;
};

export const PENDING_AST_CSV_IMPORT_KEY = "vth:pendingAstCsvImport";

export type PendingAstCsvImportPayload = {
  version: 1;
  mode: "replace" | "append";
  rows: AstCsvImportRow[];
  parsed?: number;
  matched?: number;
  unmatched?: string[];
};

export function interpretZone(zone: number, bp: Breakpoint): "S" | "I" | "R" | "" {
  if (isNaN(zone) || zone <= 0) return "";
  if (zone >= bp.sensitiveMin) return "S";
  if (zone <= bp.resistantMax) return "R";
  if (bp.intermediateLow != null && bp.intermediateHigh != null) {
    if (zone >= bp.intermediateLow && zone <= bp.intermediateHigh) return "I";
  }
  if (zone > bp.resistantMax && zone < bp.sensitiveMin) return "I";
  return "";
}

/**
 * Lab CSV ingest for AST results (v1).
 *
 * Accepts pasted CSV/TSV with a header row. Recognised column aliases:
 *   - antibiotic | drug | name
 *   - symbol | abbreviation | abbr | code
 *   - disc | disc_content | content | strength
 *   - zone | zone_mm | zone_size | inhibition_zone
 */
export function parseAstResultsCsv(
  raw: string,
  breakpoints: Breakpoint[],
): {
  rows: AstCsvImportRow[];
  parsed: number;
  matched: number;
  unmatched: string[];
} {
  const text = raw.trim();
  if (!text) {
    return { rows: [], parsed: 0, matched: 0, unmatched: [] };
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], parsed: 0, matched: 0, unmatched: [] };
  }
  const detectDelim = (line: string): string => {
    if (line.includes("\t")) return "\t";
    if (line.includes(";")) return ";";
    return ",";
  };
  const splitLine = (line: string, delim: string): string[] =>
    line.split(delim).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const delim = detectDelim(lines[0]);
  const header = splitLine(lines[0], delim).map((h) => h.toLowerCase());

  const findCol = (...aliases: string[]) => {
    for (const alias of aliases) {
      const idx = header.findIndex((h) => h === alias);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const antibioticIdx = findCol("antibiotic", "drug", "name", "agent");
  const symbolIdx = findCol("symbol", "abbreviation", "abbr", "code");
  const discIdx = findCol("disc", "disc_content", "content", "strength");
  const zoneIdx = findCol("zone", "zone_mm", "zone_size", "inhibition_zone", "diameter");

  const rows: AstCsvImportRow[] = [];
  let matched = 0;
  const unmatched: string[] = [];

  for (const rawLine of lines.slice(1)) {
    const cells = splitLine(rawLine, delim);
    const antibioticName = antibioticIdx >= 0 ? cells[antibioticIdx] ?? "" : "";
    const symbolName = symbolIdx >= 0 ? cells[symbolIdx] ?? "" : "";
    const discContent = discIdx >= 0 ? cells[discIdx] ?? "" : "";
    const zoneStr = zoneIdx >= 0 ? cells[zoneIdx] ?? "" : "";
    const zoneNum = Number.parseFloat(zoneStr.replace(/[^0-9.]/g, ""));

    if (!antibioticName && !symbolName) continue;

    const bp = breakpoints.find((b) => {
      if (symbolName && b.symbol.toLowerCase() === symbolName.toLowerCase()) {
        if (!discContent) return true;
        return b.content.toLowerCase().includes(discContent.toLowerCase());
      }
      if (antibioticName && b.antibiotic.toLowerCase() === antibioticName.toLowerCase()) {
        if (!discContent) return true;
        return b.content.toLowerCase().includes(discContent.toLowerCase());
      }
      return false;
    });

    if (bp) {
      matched++;
      const auto = Number.isFinite(zoneNum) ? interpretZone(zoneNum, bp) : "";
      rows.push({
        breakpointId: bp.id,
        antibiotic: bp.antibiotic,
        symbol: bp.symbol,
        discContent: bp.content,
        zoneSize: Number.isFinite(zoneNum) ? String(zoneNum) : zoneStr,
        sensitivity: auto || "",
        autoSensitivity: auto || "",
        manualOverride: false,
      });
    } else {
      unmatched.push(antibioticName || symbolName);
      rows.push({
        breakpointId: null,
        antibiotic: antibioticName,
        symbol: symbolName,
        discContent,
        zoneSize: Number.isFinite(zoneNum) ? String(zoneNum) : zoneStr,
        sensitivity: "",
        autoSensitivity: "",
        manualOverride: false,
      });
    }
  }

  return { rows, parsed: lines.length - 1, matched, unmatched };
}

export function emptyAstRow(): AstCsvImportRow {
  return {
    breakpointId: null,
    antibiotic: "",
    symbol: "",
    discContent: "",
    zoneSize: "",
    sensitivity: "",
    autoSensitivity: "",
    manualOverride: false,
  };
}
