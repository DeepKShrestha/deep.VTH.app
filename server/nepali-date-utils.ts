import NepaliDateImport from "nepali-date-converter";
import { isBsYearInSupportedRange } from "@shared/nepali-date-bounds";

const NepaliDateClass = (NepaliDateImport as any).default || NepaliDateImport;

/** Convert AD YYYY-MM-DD to BS YYYY-MM-DD for dashboard SQL filters. */
export function adYmdToBsYmd(adYmd: string): string | undefined {
  const t = adYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  try {
    const [y, m, d] = t.split("-").map((v) => Number.parseInt(v, 10));
    const nd = new NepaliDateClass(new Date(y, m - 1, d));
    return nd.format("YYYY-MM-DD");
  } catch {
    return undefined;
  }
}

/** True when string looks like a BS calendar date (Veterinary app uses 2070+). */
export function isLikelyBsYmd(value: string): boolean {
  const t = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const year = Number.parseInt(t.slice(0, 4), 10);
  return isBsYearInSupportedRange(year);
}
