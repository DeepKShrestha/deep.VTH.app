import { describe, expect, it } from "vitest";
import { BS_YEAR_MAX, BS_YEAR_MIN, isValidBsDate } from "./nepali-date";

describe("isValidBsDate year bounds", () => {
  it("accepts any year in the supported BS range", () => {
    expect(BS_YEAR_MAX).toBe(2090);
    expect(isValidBsDate("2085-05-15")).toBe(true);
  });

  it("rejects years above BS_YEAR_MAX", () => {
    expect(isValidBsDate(`${BS_YEAR_MAX + 1}-01-01`)).toBe(false);
  });

  it("rejects years below BS_YEAR_MIN", () => {
    expect(isValidBsDate(`${BS_YEAR_MIN - 1}-12-30`)).toBe(false);
  });
});
