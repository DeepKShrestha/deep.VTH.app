import { describe, expect, it } from "vitest";
import { toStatisticalColumnName, uniqueStatisticalColumnName } from "./hospital-export-statistical";

describe("hospital export statistical headers", () => {
  it("converts camelCase keys to snake_case", () => {
    expect(toStatisticalColumnName("chiefComplaint")).toBe("chief_complaint");
    expect(toStatisticalColumnName("canineRabiesLastDate")).toBe("canine_rabies_last_date");
  });

  it("converts spaced labels to snake_case", () => {
    expect(toStatisticalColumnName("Village Name")).toBe("village_name");
  });

  it("deduplicates statistical headers", () => {
    const used = new Set<string>(["species"]);
    expect(uniqueStatisticalColumnName("species", used)).toBe("species_2");
    expect(used.has("species_2")).toBe(true);
  });
});
