type ModuleScope = "ast" | "hospital";

export type AstToggleDefaults = {
  quickRegisterMode: boolean;
  hideOptionalFields: boolean;
  usePresetAntibiotics: boolean;
  autoMode: boolean;
  compactPrintMode: boolean;
};

export type HospitalToggleDefaults = {
  quickRegisterMode: boolean;
  hideOptionalFields: boolean;
  historyNotesBulletPoints: boolean;
  previousMedicationNotesBulletPoints: boolean;
  clinicalSignsSymptomsNotesBulletPoints: boolean;
  chiefComplaintBulletPoints: boolean;
  compactPrintMode: boolean;
};

const AST_DEFAULTS: AstToggleDefaults = {
  quickRegisterMode: false,
  hideOptionalFields: false,
  usePresetAntibiotics: false,
  autoMode: true,
  compactPrintMode: false,
};

const HOSPITAL_DEFAULTS: HospitalToggleDefaults = {
  quickRegisterMode: false,
  hideOptionalFields: false,
  historyNotesBulletPoints: true,
  previousMedicationNotesBulletPoints: true,
  clinicalSignsSymptomsNotesBulletPoints: true,
  chiefComplaintBulletPoints: true,
  compactPrintMode: false,
};

export const TOGGLE_DEFAULTS_HYDRATED_EVENT = "vth:toggle-defaults-hydrated";

function storageKey(scope: ModuleScope): string {
  return `vth:toggle-defaults:${scope}`;
}

function safeParse<T>(raw: string | null): Partial<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Partial<T>) : null;
  } catch {
    return null;
  }
}

function pickAstFromRecord(raw: Record<string, unknown>): Partial<AstToggleDefaults> {
  const out: Partial<AstToggleDefaults> = {};
  (Object.keys(AST_DEFAULTS) as (keyof AstToggleDefaults)[]).forEach((k) => {
    const v = raw[k];
    if (typeof v === "boolean") out[k] = v;
  });
  return out;
}

function pickHospitalFromRecord(raw: Record<string, unknown>): Partial<HospitalToggleDefaults> {
  const out: Partial<HospitalToggleDefaults> = {};
  (Object.keys(HOSPITAL_DEFAULTS) as (keyof HospitalToggleDefaults)[]).forEach((k) => {
    const v = raw[k];
    if (typeof v === "boolean") out[k] = v;
  });
  return out;
}

/**
 * Merge server-stored defaults into localStorage so backups/restores and
 * multi-device use stay consistent. Dispatches `TOGGLE_DEFAULTS_HYDRATED_EVENT`.
 */
export function hydrateToggleDefaultsFromServer(prefs: {
  astToggleDefaults: Record<string, unknown> | null;
  hospitalToggleDefaults: Record<string, unknown> | null;
}) {
  if (typeof window === "undefined") return;
  if (prefs.astToggleDefaults) {
    const merged = { ...AST_DEFAULTS, ...pickAstFromRecord(prefs.astToggleDefaults) };
    window.localStorage.setItem(storageKey("ast"), JSON.stringify(merged));
  }
  if (prefs.hospitalToggleDefaults) {
    const merged = {
      ...HOSPITAL_DEFAULTS,
      ...pickHospitalFromRecord(prefs.hospitalToggleDefaults),
    };
    window.localStorage.setItem(storageKey("hospital"), JSON.stringify(merged));
  }
  window.dispatchEvent(new Event(TOGGLE_DEFAULTS_HYDRATED_EVENT));
}

export function getAstToggleDefaults(): AstToggleDefaults {
  if (typeof window === "undefined") return AST_DEFAULTS;
  const parsed = safeParse<AstToggleDefaults>(window.localStorage.getItem(storageKey("ast")));
  return {
    ...AST_DEFAULTS,
    ...(parsed ?? {}),
  };
}

export function setAstToggleDefaults(next: Partial<AstToggleDefaults>) {
  if (typeof window === "undefined") return;
  const merged = { ...getAstToggleDefaults(), ...next };
  window.localStorage.setItem(storageKey("ast"), JSON.stringify(merged));
}

export function getHospitalToggleDefaults(): HospitalToggleDefaults {
  if (typeof window === "undefined") return HOSPITAL_DEFAULTS;
  const parsed = safeParse<HospitalToggleDefaults>(window.localStorage.getItem(storageKey("hospital")));
  return {
    ...HOSPITAL_DEFAULTS,
    ...(parsed ?? {}),
  };
}

export function setHospitalToggleDefaults(next: Partial<HospitalToggleDefaults>) {
  if (typeof window === "undefined") return;
  const merged = { ...getHospitalToggleDefaults(), ...next };
  window.localStorage.setItem(storageKey("hospital"), JSON.stringify(merged));
}
