import { describe, expect, it } from "vitest";
import { filenameFromContentDisposition } from "./content-disposition-filename";

describe("filenameFromContentDisposition", () => {
  it("parses quoted filename", () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="ast-export-wide_2083-01-01_to_any.csv"',
        "fallback.csv",
      ),
    ).toBe("ast-export-wide_2083-01-01_to_any.csv");
  });

  it("parses filename*=UTF-8", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''my%20file.csv",
        "fallback.csv",
      ),
    ).toBe("my file.csv");
  });

  it("returns fallback when header missing", () => {
    expect(filenameFromContentDisposition(null, "x.csv")).toBe("x.csv");
  });
});
