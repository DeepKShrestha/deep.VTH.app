import { describe, expect, it } from "vitest";
import { getCaseListDatePresets, formatCaseListDateRangeLabel } from "./case-list-date-presets";
import { getTodayBs } from "./nepali-date";

describe("getCaseListDatePresets", () => {
  it("includes today preset ending on today", () => {
    const today = getTodayBs();
    const preset = getCaseListDatePresets().find((p) => p.id === "today");
    expect(preset).toBeDefined();
    expect(preset!.from).toBe(today);
    expect(preset!.to).toBe(today);
  });

  it("last7 spans seven inclusive days", () => {
    const today = getTodayBs();
    const preset = getCaseListDatePresets().find((p) => p.id === "last7");
    expect(preset).toBeDefined();
    expect(preset!.to).toBe(today);
    expect(preset!.from <= preset!.to).toBe(true);
  });
});

describe("formatCaseListDateRangeLabel", () => {
  it("formats single-day range", () => {
    expect(formatCaseListDateRangeLabel("2082-01-01", "2082-01-01")).toBe("2082-01-01");
  });

  it("formats from-only and to-only", () => {
    expect(formatCaseListDateRangeLabel("2082-01-01", "")).toBe("From 2082-01-01");
    expect(formatCaseListDateRangeLabel("", "2082-01-31")).toBe("Until 2082-01-31");
  });
});
