import { describe, expect, it } from "vitest";
import {
  isHospitalRespiratoryFieldKey,
  isHospitalVitalExamFieldKey,
} from "./hospital-vitals-display";

describe("hospital vitals display classification", () => {
  it("treats respiratoryRate as a vital exam field", () => {
    expect(isHospitalVitalExamFieldKey("respiratoryRate")).toBe(true);
    expect(isHospitalRespiratoryFieldKey("respiratoryRate")).toBe(true);
  });

  it("treats breathing-rate style keys as respiratory vitals", () => {
    expect(isHospitalVitalExamFieldKey("breathingRate")).toBe(true);
    expect(isHospitalRespiratoryFieldKey("breathingRate", "Breathing Rate")).toBe(true);
  });

  it("keeps rumen motility in vitals exam", () => {
    expect(isHospitalVitalExamFieldKey("rumenMotility")).toBe(true);
    expect(isHospitalRespiratoryFieldKey("rumenMotility")).toBe(false);
  });
});
