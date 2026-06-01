import { medicationRepo } from "./repos";

type TreatmentMedicationRow = {
  medication?: string;
};

type TreatmentPrescriptionBlock = {
  medications?: TreatmentMedicationRow[];
};

/**
 * When a hospital case is saved, add any prescription medication names that are
 * not already in the master catalog (case-insensitive match). Typos create
 * separate rows; admins can merge/edit in Treatment Master Data.
 */
export async function ensureMedicationsFromTreatmentDetails(
  treatmentDetailsJson: string | null | undefined,
): Promise<number> {
  if (!treatmentDetailsJson?.trim()) return 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(treatmentDetailsJson);
  } catch {
    return 0;
  }
  if (!parsed || typeof parsed !== "object") return 0;

  const names = new Set<string>();
  for (const block of Object.values(parsed as Record<string, TreatmentPrescriptionBlock>)) {
    if (!block || typeof block !== "object" || !Array.isArray(block.medications)) continue;
    for (const row of block.medications) {
      const name = String(row?.medication ?? "").trim();
      if (name) names.add(name);
    }
  }

  let created = 0;
  for (const name of Array.from(names)) {
    const existing = await medicationRepo.findMedicationByNormalizedName(name);
    if (existing) continue;
    try {
      await medicationRepo.createMedication({ name, description: null, medicationClass: null });
      created += 1;
    } catch {
      // Concurrent insert or unique constraint — treat as already present.
    }
  }
  return created;
}
