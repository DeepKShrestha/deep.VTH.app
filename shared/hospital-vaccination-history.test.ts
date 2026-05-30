import { describe, expect, it } from "vitest";
import {
  appendVaccinationToCustomFields,
  buildVaccinationDisplayRows,
  clearVaccinationFieldsForOtherSpecies,
  isCompanionVaccinationSpecies,
  vaccinationFieldsForSpecies,
  vaccinationFormStateFromCustomFields,
} from "./hospital-vaccination-history";

describe("hospital-vaccination-history", () => {
  it("detects companion species", () => {
    expect(isCompanionVaccinationSpecies("Canine")).toBe(true);
    expect(isCompanionVaccinationSpecies("Feline")).toBe(true);
    expect(isCompanionVaccinationSpecies("Bovine")).toBe(false);
  });

  it("returns species-specific fields", () => {
    expect(vaccinationFieldsForSpecies("Canine").map((f) => f.label)).toEqual([
      "Rabies",
      "DHPPiL",
    ]);
    expect(vaccinationFieldsForSpecies("Feline").map((f) => f.label)).toEqual([
      "Rabies",
      "TriCat",
    ]);
  });

  it("clears other species when switching", () => {
    const state = vaccinationFormStateFromCustomFields({
      canineRabies: "Yes",
      canineRabiesLastDate: "2081-01-01",
      felineTricat: "No",
    });
    const cleared = clearVaccinationFieldsForOtherSpecies(state, "Canine");
    expect(cleared.canineRabies).toBe("Yes");
    expect(cleared.felineTricat).toBe("");
  });

  it("writes status and optional dates to custom fields", () => {
    const target: Record<string, string | string[]> = {};
    appendVaccinationToCustomFields(
      target,
      "Canine",
      {
        ...vaccinationFormStateFromCustomFields(null),
        canineRabies: "Yes",
        canineRabiesLastDate: "2081-05-01",
        canineRabiesLastDateAd: "2024-08-17",
        canineDhppil: "Unknown",
      },
      () => true,
    );
    expect(target.canineRabies).toBe("Yes");
    expect(target.canineRabiesLastDate).toBe("2081-05-01");
    expect(target.canineDhppil).toBe("Unknown");
    expect(target.canineDhppilLastDate).toBeUndefined();
  });

  it("builds compact display rows", () => {
    const rows = buildVaccinationDisplayRows(
      {
        canineRabies: "Yes",
        canineRabiesLastDate: "2081-05-01",
        canineDhppil: "No",
      },
      "Canine",
      (bs) => `BS:${bs}`,
      (ad) => `AD:${ad}`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.lastDateDisplay).toContain("BS:2081-05-01");
    expect(rows[1]?.status).toBe("No");
  });
});
