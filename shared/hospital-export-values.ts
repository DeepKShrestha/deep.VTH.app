import type { Case } from "./schema";

/** Storage keys that may hold data for a built-in form question key. */
const CUSTOM_FIELD_ALIASES: Record<string, readonly string[]> = {
  historyNotes: ["history"],
  previousMedicationNotes: ["previousMedication"],
  clinicalSignsSymptomsNotes: ["clinicalSignsAndSymptoms"],
  crt: ["crtSeconds"],
};

const CASE_TABLE_FIELD_GETTERS: Record<string, (c: Case) => string> = {
  ownerName: (c) => c.ownerName,
  ownerPhone: (c) => c.ownerPhone,
  ownerAddress: (c) => c.ownerAddress,
  species: (c) => c.species,
  breed: (c) => c.breed,
  animalName: (c) => c.animalName ?? "",
  age: (c) => c.age ?? "",
  sex: (c) => c.sex ?? "",
  remarks: (c) => c.remarks ?? "",
};

export function formatTreatmentDetailsExport(raw: string | null): string {
  if (!raw?.trim()) return "";
  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      { medications?: Array<Record<string, string>>; generalInstructions?: string }
    >;
    const chunks: string[] = [];
    for (const block of Object.values(parsed)) {
      if (!block || typeof block !== "object") continue;
      if (Array.isArray(block.medications)) {
        for (const med of block.medications) {
          if (!med || typeof med !== "object") continue;
          const line = [
            med.medication,
            med.dose,
            med.doseUnit,
            med.route,
            med.frequency,
            med.duration,
            med.note,
          ]
            .map((x) => String(x ?? "").trim())
            .filter(Boolean)
            .join(" ");
          if (line) chunks.push(line);
        }
      }
      const gi = String(block.generalInstructions ?? "").trim();
      if (gi) chunks.push(gi);
    }
    return chunks.join(" | ");
  } catch {
    return raw.trim();
  }
}

export function formatAttendingVeterinarianExport(c: Case): string {
  const parts = [
    c.veterinarianName?.trim() ?? "",
    c.veterinarianNvc?.trim() ? `NVC: ${c.veterinarianNvc.trim()}` : "",
    c.veterinarianDepartment?.trim() ? `Dept: ${c.veterinarianDepartment.trim()}` : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

export function readHospitalExportCustomField(
  questionKey: string,
  customFields: Record<string, unknown>,
): unknown {
  if (Object.prototype.hasOwnProperty.call(customFields, questionKey)) {
    return customFields[questionKey];
  }
  for (const alias of CUSTOM_FIELD_ALIASES[questionKey] ?? []) {
    if (Object.prototype.hasOwnProperty.call(customFields, alias)) {
      return customFields[alias];
    }
  }
  return undefined;
}

export function resolveHospitalExportFieldValue(
  c: Case,
  questionKey: string,
  customFields: Record<string, unknown>,
  formatValue: (value: unknown) => string,
): string {
  const caseGetter = CASE_TABLE_FIELD_GETTERS[questionKey];
  if (caseGetter) return caseGetter(c);
  if (questionKey === "attendingVeterinarian") return formatAttendingVeterinarianExport(c);
  if (questionKey === "treatmentPrescription") {
    return formatTreatmentDetailsExport(c.treatmentDetails);
  }
  return formatValue(readHospitalExportCustomField(questionKey, customFields));
}

export function hospitalExportLeadingClinicalRow(c: Case): Record<string, string> {
  return {
    "Case Number": c.caseNumber,
    "Bill Number": c.billNumber || "",
    "Case Date (BS)": c.date,
    "Case Date (AD)": c.dateAd || "",
  };
}

export function hospitalExportLeadingStatisticalRow(c: Case): Record<string, string> {
  return {
    case_number: c.caseNumber,
    bill_number: c.billNumber || "",
    date_bs: c.date,
    date_ad: c.dateAd || "",
  };
}
