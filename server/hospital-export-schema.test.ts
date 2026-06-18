import { describe, expect, it } from "vitest";
import { appendLegacyExportColumns } from "./hospital-export-schema";

describe("hospital export schema helpers", () => {
  it("appendLegacyExportColumns adds unknown data keys after form columns", () => {
    const result = appendLegacyExportColumns(
      [{ key: "diagnosis", header: "Diagnosis" }],
      ["oldRetiredKey"],
      new Set(["Case Number"]),
    );
    expect(result.map((c) => c.key)).toEqual(["diagnosis", "oldRetiredKey"]);
    expect(result[1].header).toBe("oldRetiredKey");
  });

  it("appendLegacyExportColumns avoids header collisions with reserved names", () => {
    const result = appendLegacyExportColumns(
      [{ key: "diagnosis", header: "Notes" }],
      ["Notes"],
      new Set(["Case Number"]),
    );
    const noteHeaders = result.map((c) => c.header);
    expect(noteHeaders.filter((h) => h === "Notes")).toHaveLength(1);
    expect(noteHeaders).toContain("Notes (2)");
  });
});
