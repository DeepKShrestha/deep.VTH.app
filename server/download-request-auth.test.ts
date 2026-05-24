import { describe, expect, it } from "vitest";
import { exportRangeWithinApproval } from "./download-request-range";

describe("exportRangeWithinApproval", () => {
  it("allows any export range when approval has no bounds", () => {
    expect(
      exportRangeWithinApproval({ dateFrom: null, dateTo: null }, "2082-01-01", "2082-12-31"),
    ).toBe(true);
  });

  it("rejects export range outside approved BS window", () => {
    expect(
      exportRangeWithinApproval(
        { dateFrom: "2082-05-01", dateTo: "2082-05-31" },
        "2082-06-01",
        "2082-06-30",
      ),
    ).toBe(false);
  });

  it("accepts export range inside approved window", () => {
    expect(
      exportRangeWithinApproval(
        { dateFrom: "2082-05-01", dateTo: "2082-05-31" },
        "2082-05-10",
        "2082-05-20",
      ),
    ).toBe(true);
  });

  it("requires explicit export dates when approval is bounded", () => {
    expect(
      exportRangeWithinApproval(
        { dateFrom: "2082-05-01", dateTo: "2082-05-31" },
        null,
        null,
      ),
    ).toBe(false);
  });
});
