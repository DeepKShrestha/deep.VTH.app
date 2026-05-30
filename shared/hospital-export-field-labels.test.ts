import { describe, expect, it } from "vitest";
import { resolveHospitalExportFieldLabel } from "./hospital-export-field-labels";

describe("resolveHospitalExportFieldLabel", () => {
  it("labels vaccination keys readably", () => {
    expect(resolveHospitalExportFieldLabel("felineTricat")).toBe(
      "TriCat (vaccination status)",
    );
    expect(resolveHospitalExportFieldLabel("canineDhppil")).toBe(
      "DHPPiL (vaccination status)",
    );
  });
});
