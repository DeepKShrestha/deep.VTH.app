/** Built-in vaccination history for hospital cases (Canine / Feline only). */

export const VACCINATION_STATUS_OPTIONS = ["Yes", "No", "Unknown"] as const;
export type VaccinationStatus = (typeof VACCINATION_STATUS_OPTIONS)[number];

export type VaccinationFieldDef = {
  statusKey: string;
  label: string;
  dateBsKey: string;
  dateAdKey: string;
};

export const CANINE_VACCINATION_FIELDS: VaccinationFieldDef[] = [
  {
    statusKey: "canineRabies",
    label: "Rabies",
    dateBsKey: "canineRabiesLastDate",
    dateAdKey: "canineRabiesLastDateAd",
  },
  {
    statusKey: "canineDhppil",
    label: "DHPPiL",
    dateBsKey: "canineDhppilLastDate",
    dateAdKey: "canineDhppilLastDateAd",
  },
];

export const FELINE_VACCINATION_FIELDS: VaccinationFieldDef[] = [
  {
    statusKey: "felineRabies",
    label: "Rabies",
    dateBsKey: "felineRabiesLastDate",
    dateAdKey: "felineRabiesLastDateAd",
  },
  {
    statusKey: "felineTricat",
    label: "TriCat",
    dateBsKey: "felineTricatLastDate",
    dateAdKey: "felineTricatLastDateAd",
  },
];

export const ALL_VACCINATION_FIELDS: VaccinationFieldDef[] = [
  ...CANINE_VACCINATION_FIELDS,
  ...FELINE_VACCINATION_FIELDS,
];

const VACCINATION_STORAGE_KEYS: string[] = ALL_VACCINATION_FIELDS.flatMap((f) => [
  f.statusKey,
  f.dateBsKey,
  f.dateAdKey,
]);
const VACCINATION_STORAGE_KEY_SET = new Set(VACCINATION_STORAGE_KEYS);

export function normalizeSpeciesId(speciesName: string): string {
  return speciesName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isCanineSpeciesName(speciesName: string): boolean {
  return normalizeSpeciesId(speciesName) === "canine";
}

export function isFelineSpeciesName(speciesName: string): boolean {
  return normalizeSpeciesId(speciesName) === "feline";
}

export function isCompanionVaccinationSpecies(speciesName: string): boolean {
  return isCanineSpeciesName(speciesName) || isFelineSpeciesName(speciesName);
}

export function vaccinationFieldsForSpecies(speciesName: string): VaccinationFieldDef[] {
  if (isCanineSpeciesName(speciesName)) return CANINE_VACCINATION_FIELDS;
  if (isFelineSpeciesName(speciesName)) return FELINE_VACCINATION_FIELDS;
  return [];
}

export function isVaccinationStorageKey(key: string): boolean {
  return VACCINATION_STORAGE_KEY_SET.has(key);
}

export function isVaccinationStatusKey(key: string): boolean {
  return ALL_VACCINATION_FIELDS.some((f) => f.statusKey === key);
}

export type VaccinationFormState = Record<string, string>;

export function emptyVaccinationFormState(): VaccinationFormState {
  const state: VaccinationFormState = {};
  for (const f of ALL_VACCINATION_FIELDS) {
    state[f.statusKey] = "";
    state[f.dateBsKey] = "";
    state[f.dateAdKey] = "";
  }
  return state;
}

export function vaccinationFormStateFromCustomFields(
  parsed: Record<string, unknown> | null | undefined,
): VaccinationFormState {
  const state = emptyVaccinationFormState();
  if (!parsed) return state;
  for (const key of VACCINATION_STORAGE_KEYS as string[]) {
    const raw = parsed[key];
    if (raw == null) continue;
    const text = String(raw).trim();
    if (text) state[key] = text;
  }
  return state;
}

export function clearVaccinationFieldsForOtherSpecies(
  state: VaccinationFormState,
  speciesName: string,
): VaccinationFormState {
  const next = { ...state };
  const keepKeys = vaccinationFieldsForSpecies(speciesName).flatMap((f) => [
    f.statusKey,
    f.dateBsKey,
    f.dateAdKey,
  ]);
  for (const f of ALL_VACCINATION_FIELDS) {
    for (const key of [f.statusKey, f.dateBsKey, f.dateAdKey] as const) {
      if (!keepKeys.includes(key)) {
        next[key] = "";
      }
    }
  }
  return next;
}

export function appendVaccinationToCustomFields(
  target: Record<string, string | string[]>,
  speciesName: string,
  state: VaccinationFormState,
  isEnabled: (key: string) => boolean,
): void {
  if (!isCompanionVaccinationSpecies(speciesName)) return;
  for (const field of vaccinationFieldsForSpecies(speciesName)) {
    if (!isEnabled(field.statusKey)) continue;
    const status = (state[field.statusKey] ?? "").trim();
    if (!status) continue;
    target[field.statusKey] = status;
    if (status === "Yes") {
      const bs = (state[field.dateBsKey] ?? "").trim();
      const ad = (state[field.dateAdKey] ?? "").trim();
      if (bs) target[field.dateBsKey] = bs;
      if (ad) target[field.dateAdKey] = ad;
    }
  }
}

export type VaccinationDisplayRow = {
  vaccineLabel: string;
  status: string;
  lastDateDisplay: string | null;
};

export function buildVaccinationDisplayRows(
  parsed: Record<string, unknown> | null | undefined,
  speciesName: string,
  formatBsDate: (bs: string) => string,
  formatAdDate: (ad: string) => string,
): VaccinationDisplayRow[] {
  if (!parsed || !isCompanionVaccinationSpecies(speciesName)) return [];
  const rows: VaccinationDisplayRow[] = [];
  for (const field of vaccinationFieldsForSpecies(speciesName)) {
    const status = String(parsed[field.statusKey] ?? "").trim();
    if (!status) continue;
    let lastDateDisplay: string | null = null;
    if (status === "Yes") {
      const bs = String(parsed[field.dateBsKey] ?? "").trim();
      const ad = String(parsed[field.dateAdKey] ?? "").trim();
      if (bs) {
        lastDateDisplay = formatBsDate(bs);
        if (ad) lastDateDisplay += ` (${formatAdDate(ad)})`;
      }
    }
    rows.push({
      vaccineLabel: field.label,
      status,
      lastDateDisplay,
    });
  }
  return rows;
}

export function filterNonVaccinationCustomEntries<T>(
  entries: Array<[string, T]>,
): Array<[string, T]> {
  return entries.filter(([key]) => !isVaccinationStorageKey(key));
}
