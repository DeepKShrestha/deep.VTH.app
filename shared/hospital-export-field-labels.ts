import { ALL_VACCINATION_FIELDS } from "./hospital-vaccination-history";

/** CSV/Excel column titles for known hospital registration JSON keys. */
const BUILTIN_EXPORT_LABELS: Record<string, string> = {
  historyNotes: "History",
  previousMedicationNotes: "Previous Medication",
  chiefComplaint: "Chief Complaint",
  clinicalSignsSymptomsNotes: "Clinical Signs & Symptoms",
  testsSuggested: "Tests Suggested",
  diagnosis: "Diagnosis",
  flockSize: "Flock Size",
  hatchery: "Hatchery",
  feedSupplier: "Feed Supplier",
  feedIntake: "Feed Intake",
  waterIntake: "Water Intake",
  mortality: "Mortality",
  temperature: "Temperature",
  heartRate: "Heart Rate",
  respiratoryRate: "Respiration",
  crt: "CRT",
  crtSeconds: "CRT",
  dehydrationPercentage: "Dehydration %",
  weight: "Weight",
  rumenMotility: "Rumen Motility",
};

function buildVaccinationExportLabels(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of ALL_VACCINATION_FIELDS) {
    map[f.statusKey] = `${f.label} (vaccination status)`;
    map[f.dateBsKey] = `${f.label} (last vaccination date BS)`;
    map[f.dateAdKey] = `${f.label} (last vaccination date AD)`;
  }
  return map;
}

const VACCINATION_EXPORT_LABELS = buildVaccinationExportLabels();

/**
 * Prefer human-readable headers in exports; fall back to the raw form key.
 */
export function resolveHospitalExportFieldLabel(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "Unnamed field";
  if (BUILTIN_EXPORT_LABELS[trimmed]) return BUILTIN_EXPORT_LABELS[trimmed];
  if (VACCINATION_EXPORT_LABELS[trimmed]) return VACCINATION_EXPORT_LABELS[trimmed];
  return trimmed;
}
