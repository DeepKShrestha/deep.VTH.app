import { describe, expect, it } from "vitest";
import { parseCsvLine, parseMedicationImportCsv } from "./medication-import-parse";

describe("parseCsvLine", () => {
  it("splits simple commas", () => {
    expect(parseCsvLine("a,b")).toEqual(["a", "b"]);
  });

  it("handles quoted commas", () => {
    expect(parseCsvLine('"Ceftriaxone, USP",Antibiotic')).toEqual(["Ceftriaxone, USP", "Antibiotic"]);
  });
});

describe("parseMedicationImportCsv", () => {
  it("uses first two columns without header", () => {
    const { rows, errors } = parseMedicationImportCsv("Drug A,Class1\nDrug B,Class2\n");
    expect(errors.filter((e) => e.row > 0)).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Drug A", medicationClass: "Class1" });
    expect(rows[1]).toMatchObject({ name: "Drug B", medicationClass: "Class2" });
  });

  it("skips header row when detected", () => {
    const csv = "name,class\nCeftriaxone,Antibiotic\n";
    const { rows, errors } = parseMedicationImportCsv(csv);
    expect(errors.filter((e) => e.row > 0)).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ceftriaxone");
    expect(rows[0].medicationClass).toBe("Antibiotic");
  });
});
