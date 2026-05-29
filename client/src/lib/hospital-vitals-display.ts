/** Normalize form/custom field keys and labels for matching (e.g. `respiratoryRate` → `respiratoryrate`). */
export function normalizeClinicalFieldKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Keys that belong in the Physical Exam / Vitals block on case view and print. */
export function isHospitalVitalExamFieldKey(key: string): boolean {
  const n = normalizeClinicalFieldKey(key);
  return (
    n.includes("temperature") ||
    n.includes("heartrate") ||
    isHospitalRespiratoryFieldKey(key) ||
    n.includes("rumenmotility") ||
    n.includes("dehydration") ||
    n.includes("crt") ||
    n.includes("weight")
  );
}

/** Respiratory / breathing rate — `respiratoryRate` must match explicitly (`respiration` alone does not). */
export function isHospitalRespiratoryFieldKey(key: string, label = ""): boolean {
  const source = normalizeClinicalFieldKey(`${label}${key}`);
  return (
    source.includes("respiratoryrate") ||
    source.includes("respirationrate") ||
    source.includes("resprate") ||
    source.includes("breathingrate") ||
    source.includes("breathing") ||
    source.includes("respiration")
  );
}

export function resolveRespiratoryFieldLabel(rawLabel: string): string {
  const trimmed = rawLabel.trim();
  if (/breath|respir/i.test(trimmed)) return trimmed;
  return "Respiration";
}

export function formatRespiratoryVitalValue(label: string, rawValue: string): string {
  const value = String(rawValue || "").trim();
  if (!value) return value;
  const n = normalizeClinicalFieldKey(label);
  if (
    n.includes("respiration") ||
    n.includes("respiratoryrate") ||
    n.includes("breathingrate") ||
    n.includes("breathing")
  ) {
    if (/breath|\/min|per\s*min|bpm/i.test(value)) return value;
    return `${value} breaths/min`;
  }
  return value;
}
