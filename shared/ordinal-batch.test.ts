import { describe, expect, it } from "vitest";
import { formatOrdinalBatch } from "./ordinal-batch";

describe("formatOrdinalBatch", () => {
  it("uses st/nd/rd/th correctly for 1–23", () => {
    expect(formatOrdinalBatch(1)).toBe("1st batch");
    expect(formatOrdinalBatch(2)).toBe("2nd batch");
    expect(formatOrdinalBatch(3)).toBe("3rd batch");
    expect(formatOrdinalBatch(4)).toBe("4th batch");
    expect(formatOrdinalBatch(11)).toBe("11th batch");
    expect(formatOrdinalBatch(12)).toBe("12th batch");
    expect(formatOrdinalBatch(13)).toBe("13th batch");
    expect(formatOrdinalBatch(21)).toBe("21st batch");
    expect(formatOrdinalBatch(22)).toBe("22nd batch");
    expect(formatOrdinalBatch(23)).toBe("23rd batch");
  });

  it("coerces numeric strings from JSON/SQL", () => {
    expect(formatOrdinalBatch("1")).toBe("1st batch");
    expect(formatOrdinalBatch("21")).toBe("21st batch");
  });
});
