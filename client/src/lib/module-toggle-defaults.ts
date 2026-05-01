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
