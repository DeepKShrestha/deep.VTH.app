import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureMedicationsFromTreatmentDetails } from "./ensure-treatment-catalog-medications";

vi.mock("./repos", () => ({
  medicationRepo: {
    findMedicationByNormalizedName: vi.fn(),
    createMedication: vi.fn(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("ensureMedicationsFromTreatmentDetails", () => {
  it("creates medications not already in the catalog", async () => {
    const { medicationRepo } = await import("./repos");
    vi.mocked(medicationRepo.findMedicationByNormalizedName).mockResolvedValue(undefined);
    vi.mocked(medicationRepo.createMedication).mockResolvedValue({
      id: 1,
      name: "New Drug",
      description: null,
      medicationClass: null,
      createdAt: "",
    });

    const payload = JSON.stringify({
      treatmentPrescription: {
        medications: [{ medication: "New Drug" }, { medication: "  Amox  " }],
      },
    });

    const created = await ensureMedicationsFromTreatmentDetails(payload);
    expect(created).toBe(2);
    expect(medicationRepo.createMedication).toHaveBeenCalledTimes(2);
    expect(medicationRepo.createMedication).toHaveBeenCalledWith({
      name: "New Drug",
      description: null,
      medicationClass: null,
    });
  });

  it("skips names that already exist (case-insensitive)", async () => {
    const { medicationRepo } = await import("./repos");
    vi.mocked(medicationRepo.findMedicationByNormalizedName).mockResolvedValue({
      id: 9,
      name: "Amoxicillin",
      description: null,
      medicationClass: null,
      createdAt: "",
    });

    const payload = JSON.stringify({
      treatmentPrescription: {
        medications: [{ medication: "amoxicillin" }],
      },
    });

    const created = await ensureMedicationsFromTreatmentDetails(payload);
    expect(created).toBe(0);
    expect(medicationRepo.createMedication).not.toHaveBeenCalled();
  });

  it("returns 0 for invalid or empty JSON", async () => {
    expect(await ensureMedicationsFromTreatmentDetails(null)).toBe(0);
    expect(await ensureMedicationsFromTreatmentDetails("not-json")).toBe(0);
  });
});
