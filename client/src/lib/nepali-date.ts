import NepaliDate from "nepali-date-converter";

// Nepali month names
export const BS_MONTHS = [
  "Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Aswin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
] as const;

import { BS_YEAR_MAX, BS_YEAR_MIN } from "@shared/nepali-date-bounds";

export { BS_YEAR_MIN, BS_YEAR_MAX };

/**
 * Get today's date in both BS and AD
 */
export function getTodayBsAd(): { bs: string; ad: string; bsYear: number; bsMonth: number; bsDay: number } {
  const nd = new NepaliDate();
  return {
    bs: nd.format("YYYY-MM-DD"),
    ad: nd.toJsDate().toISOString().split("T")[0],
    bsYear: nd.getYear(),
    bsMonth: nd.getMonth() + 1, // 1-indexed
    bsDay: nd.getDate(),
  };
}

/** Today's case date in BS (YYYY-MM-DD). */
export function getTodayBs(): string {
  return getTodayBsAd().bs;
}

/** Add or subtract calendar days from a BS date string. */
export function addBsDays(bsDate: string, days: number): string {
  const ad = bsToAd(bsDate);
  if (!ad) return "";
  const [y, m, d] = ad.split("-").map(Number);
  const js = new Date(y, m - 1, d);
  js.setDate(js.getDate() + days);
  const year = js.getFullYear();
  const month = String(js.getMonth() + 1).padStart(2, "0");
  const day = String(js.getDate()).padStart(2, "0");
  return adToBs(`${year}-${month}-${day}`);
}

/** First and last valid day of a BS month (month is 1–12). */
export function getBsMonthRange(
  year: number,
  month: number,
): { from: string; to: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = getDaysInBsMonth(year, month);
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Convert AD date string (YYYY-MM-DD) to BS date string (YYYY-MM-DD)
 */
export function adToBs(adDate: string): string {
  try {
    const [y, m, d] = adDate.split("-").map(Number);
    const nd = NepaliDate.fromAD(new Date(y, m - 1, d));
    return nd.format("YYYY-MM-DD");
  } catch {
    return "";
  }
}

/**
 * Convert BS date string (YYYY-MM-DD) to AD date string (YYYY-MM-DD)
 */
export function bsToAd(bsDate: string): string {
  try {
    const [y, m, d] = bsDate.split("-").map(Number);
    const nd = new NepaliDate(y, m - 1, d); // 0-indexed month
    const js = nd.toJsDate();
    const year = js.getFullYear();
    const month = String(js.getMonth() + 1).padStart(2, "0");
    const day = String(js.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

/**
 * Format a BS date string to a display format
 * Input: "2082-12-06" → "06 Chaitra 2082" or "2082/12/06"
 */
export function formatBsDate(bsDate: string, format: "long" | "short" = "short"): string {
  try {
    const [y, m, d] = bsDate.split("-").map(Number);
    const nd = new NepaliDate(y, m - 1, d);
    if (format === "long") {
      return nd.format("DD MMMM YYYY");
    }
    return nd.format("YYYY/MM/DD");
  } catch {
    return bsDate;
  }
}

/**
 * Format an AD date string to display
 */
export function formatAdDate(adDate: string): string {
  try {
    const [y, m, d] = adDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return adDate;
  }
}

/**
 * Validate a BS date string (YYYY-MM-DD)
 * Returns true if valid BS date
 */
export function isValidBsDate(bsDate: string): boolean {
  try {
    const parts = bsDate.split("-");
    if (parts.length !== 3) return false;
    const [y, m, d] = parts.map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 32) return false;
    if (y < BS_YEAR_MIN || y > BS_YEAR_MAX) return false;
    // Try constructing — will throw if invalid
    const nd = new NepaliDate(y, m - 1, d);
    return nd.getYear() === y && nd.getMonth() === m - 1 && nd.getDate() === d;
  } catch {
    return false;
  }
}

/**
 * Get the number of days in a BS month
 */
export function getDaysInBsMonth(year: number, month: number): number {
  try {
    // month is 1-indexed here
    // Try day 32 to find the max
    for (let d = 32; d >= 28; d--) {
      try {
        const nd = new NepaliDate(year, month - 1, d);
        if (nd.getYear() === year && nd.getMonth() === month - 1 && nd.getDate() === d) {
          return d;
        }
      } catch {
        continue;
      }
    }
    return 30; // fallback
  } catch {
    return 30;
  }
}
