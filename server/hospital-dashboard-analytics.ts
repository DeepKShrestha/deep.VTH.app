/**
 * Hospital dashboard analytics.
 *
 * Pure aggregation helpers that consume a list of cases (already filtered by
 * date / species / breed / sex at the SQL layer) plus a set of in-memory
 * secondary filters (department, vet, medication class, avian-only) and a
 * period window (current + prior, for analyst-style period-over-period
 * comparisons).
 *
 * The page is built around the "inverted pyramid" pattern: a small number of
 * headline KPIs with deltas + sparklines, then 3-6 actionable insight
 * callouts, then a handful of focused analytical answers, then long-tail
 * detail below the fold. The shapes here are designed for that — the page
 * does not have to do any rolling/comparison math, the server does it.
 *
 * Kept separate from server/routes/cases.ts so it can be unit-tested without
 * spinning up the Express app or the database.
 */

import type { Case } from "@shared/schema";

// ---- Time helpers -----------------------------------------------------------

export type GroupBy = "day" | "week" | "month" | "year";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function timeKeyForGroup(ymd: string, groupBy: GroupBy): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const [, y, mo, dRaw] = m;
  const d = Number.parseInt(dRaw, 10);
  if (groupBy === "day") return `${y}-${mo}-${String(d).padStart(2, "0")}`;
  if (groupBy === "week") return `${y}-${mo}-W${Math.max(1, Math.ceil(d / 7))}`;
  if (groupBy === "month") return `${y}-${mo}`;
  return y;
}

function parseAdDate(adYmd: string | null | undefined): Date | null {
  const s = String(adYmd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseAdDateTime(value: string | null | undefined): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function bsYearMonth(bsDate: string | null | undefined): { year: string; month: string } | null {
  const m = String(bsDate ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: m[1], month: `${m[1]}-${m[2]}` };
}

function parseAgeYears(ageRaw: string | null | undefined): number | null {
  const s = String(ageRaw ?? "").trim();
  if (!s) return null;
  const num = Number.parseFloat(s.replace(",", "."));
  if (!Number.isFinite(num)) return null;
  if (s.toLowerCase().includes("month")) return num / 12;
  return num;
}

function ageBand(ageRaw: string | null | undefined): string {
  const years = parseAgeYears(ageRaw);
  if (years == null) return "Unknown";
  if (years < 1) return "<1 year";
  if (years <= 3) return "1-3 years";
  if (years <= 7) return "4-7 years";
  return ">7 years";
}

// ---- Parsing case JSON ------------------------------------------------------

export type TreatmentMedicationEntry = {
  medication?: string;
  dose?: string;
  doseUnit?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  note?: string;
};

export type TreatmentFieldValue = {
  medications?: TreatmentMedicationEntry[];
  generalInstructions?: string;
};

export function parseCustomFields(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function parseTreatmentDetails(
  raw: string | null | undefined,
): Record<string, TreatmentFieldValue> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, TreatmentFieldValue>)
      : {};
  } catch {
    return {};
  }
}

export function flattenMedications(
  details: Record<string, TreatmentFieldValue>,
): TreatmentMedicationEntry[] {
  const out: TreatmentMedicationEntry[] = [];
  for (const entry of Object.values(details)) {
    const meds = entry?.medications;
    if (Array.isArray(meds)) {
      for (const m of meds) {
        if (m && typeof m === "object" && String(m.medication ?? "").trim()) out.push(m);
      }
    }
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function asText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return "";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const num = Number.parseFloat(v.replace(",", "."));
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

// ---- Payload shape ----------------------------------------------------------

export type KV = { name: string; value: number };
export type VitalSummary = {
  name: string;
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
};

export type HospitalDrilldownRow = {
  caseId: number;
  caseNumber: string;
  date: string;
  ownerName: string;
  phoneNumber: string;
  address: string;
  animalName: string;
  species: string;
  breed: string;
  age: string;
  sex: string;
  attendingVet: string;
  department: string;
  chiefComplaint: string;
  diagnosis: string;
  testsOrderedCount: number;
  medicationsCount: number;
};

export type KpiFormat = "int" | "float2" | "pct";

export type KpiTile = {
  id: string;
  label: string;
  value: number;
  prior: number;
  /** Percent change vs prior (null when prior is 0 and value is also 0, or any other "cannot compute"). */
  deltaPct: number | null;
  /** Absolute difference (value - prior). */
  deltaAbs: number;
  /**
   * How the client should render this. For percentages and floats the value
   * is already in its display unit (e.g. 62.5 for "62.5%", 2.43 for "2.43").
   */
  format: KpiFormat;
  hint?: string;
  /** Daily series across the *current* period (length = days in current window). */
  sparkline: number[];
  /**
   * Improvement direction: "up" means a higher value is better (green), "down"
   * means lower is better, "neutral" means deltas should be shown without
   * good/bad coloring. The client uses this to color the delta badge.
   */
  improvement: "up" | "down" | "neutral";
};

export type InsightSeverity = "info" | "warning" | "alert";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  headline: string;
  supporting?: string;
};

export type DataQuality = {
  totalCases: number;
  withDiagnosisPct: number;
  withVetAssignedPct: number;
  withChiefComplaintPct: number;
  withVitalsPct: number;
};

export type ScorecardRow = {
  /** Vet or department name. */
  name: string;
  caseCount: number;
  /** Percent of all hospital cases this period that came through this name. */
  caseSharePct: number;
  /** Most common diagnosis for this bucket, or null when none recorded. */
  topDiagnosis: { name: string; count: number } | null;
  medsPerCase: number;
  testsPerCase: number;
  /**
   * Share of this bucket's prescriptions that fall in an antibiotic class.
   * 0 when the bucket has no prescriptions.
   */
  antibioticShare: number;
  diagnosisRecordedPct: number;
};

export type Scorecards = {
  hospitalAverage: {
    medsPerCase: number;
    testsPerCase: number;
    antibioticShare: number;
    diagnosisRecordedPct: number;
  };
  /** Top vets by case count this period (capped). */
  vets: ScorecardRow[];
  /** Top departments by case count this period (capped). */
  departments: ScorecardRow[];
};

/**
 * One row in the ranked medication table — designed to drive both the
 * Pareto chart (count + cumulativeSharePct) and the detailed drill-down
 * table (class + topDiagnosis context).
 */
export type MedicationRankingRow = {
  rank: number;
  name: string;
  /** Absolute prescription count in the current period. */
  count: number;
  /** Share of all current-period prescriptions (0-100). */
  sharePct: number;
  /**
   * Cumulative share of prescriptions through this row when the list is
   * sorted descending by count. Drives the Pareto cumulative-% line and
   * answers "how many drugs cover N% of prescribing".
   */
  cumulativeSharePct: number;
  /** Therapeutic class from the medication catalog, or "Unclassified". */
  class: string;
  /**
   * Most common recorded diagnosis on cases where this medication appears.
   * Null when none of those cases recorded a diagnosis.
   */
  topDiagnosis: { name: string; count: number } | null;
  /** Convenience flag — true when `class` matches the antibiotic regex. */
  isAntibiotic: boolean;
};

export type CaseloadTrendRow = {
  label: string;
  current: number;
  prior: number | null;
};

export type CaseloadTrend = {
  rows: CaseloadTrendRow[];
  currentLabel: string;
  priorLabel: string;
};

export type AntibioticTrend = {
  rows: Array<{ label: string; sharePct: number; totalRx: number }>;
  currentAvgSharePct: number;
  priorAvgSharePct: number;
};

export type PeriodWindow = {
  preset: string;
  label: string;
  current: { start: string; end: string; days: number };
  prior: { start: string; end: string; days: number };
};

export type HospitalDashboardPayload = {
  period: PeriodWindow;
  filters: {
    preset: string;
    groupBy: string;
    species: string;
    breed: string;
    sex: string;
    department: string;
    vet: string;
    medicationClass: string;
    avianOnly: boolean;
    dateFrom?: string;
    dateTo?: string;
    comparePrior: boolean;
  };
  options: {
    species: string[];
    breeds: string[];
    sex: string[];
    departments: string[];
    vets: string[];
    medicationClasses: string[];
  };
  kpis: KpiTile[];
  secondaryKpis: KpiTile[];
  insights: Insight[];
  /** Short auto-generated sentences describing what changed this period. */
  narrative: string[];
  scorecards: Scorecards;
  dataQuality: DataQuality;
  caseloadTrend: CaseloadTrend;
  antibioticTrend: AntibioticTrend;
  overview: {
    totalCases: number;
    casesToday: number;
    casesThisMonth: number;
    casesThisYear: number;
    distinctOwners: number;
    repeatVisitRatePct: number;
    activeVets: number;
    activeDepartments: number;
    totalPrescriptions: number;
    totalTestsOrdered: number;
    avgPrescriptionsPerCase: number;
    avgTestsPerCase: number;
    mostCommonSpecies: string;
    mostCommonDepartment: string;
    mostPrescribedMedication: string;
    mostCommonChiefComplaint: string;
  };
  composition: {
    casesBySpecies: KV[];
    casesByBreed: KV[];
    casesBySex: KV[];
    casesByAgeGroup: KV[];
    casesByDepartment: KV[];
    casesByVet: KV[];
    casesByWeekday: KV[];
    casesByHour: KV[];
  };
  clinical: {
    topChiefComplaints: KV[];
    topDiagnoses: KV[];
    vitals: VitalSummary[];
    dehydrationBuckets: KV[];
    testsSuggested: KV[];
    enzymePanelTests: KV[];
    rapidDiagnosticTests: KV[];
    imagingAndLabsCounts: KV[];
  };
  therapeutics: {
    topMedications: KV[];
    /**
     * Top antibiotics specifically — restricted to medications whose
     * catalog class matches the antibiotic-class regex. Useful for
     * answering "which antibiotics are we using the most?" without the
     * noise of non-antibiotic top sellers.
     */
    topAntibiotics: KV[];
    medicationClassMix: KV[];
    routesMix: KV[];
    avgMedsPerCase: number;
    casesWithPrescription: number;
    casesWithoutPrescription: number;
    /**
     * Ranked drill-down for the prescribing page: every medication (up to
     * the cap) with its raw count, share %, running cumulative %, class,
     * and most-common paired diagnosis. Drives the Pareto chart and the
     * detailed prescribed-medications table.
     */
    medicationRanking: MedicationRankingRow[];
  };
  avian: {
    hasAvianData: boolean;
    avianCases: number;
    totalFlock: number;
    totalMortality: number;
    mortalityRatePct: number;
    topHatcheries: KV[];
    topFeedSuppliers: KV[];
  };
  trends: {
    casesOverTime: Array<{ period: string; value: number }>;
    prescriptionsOverTime: Array<{ period: string; value: number }>;
    testsOrderedOverTime: Array<{ period: string; value: number }>;
    departmentWorkloadTrend: Array<Record<string, string | number>>;
    departmentKeys: string[];
  };
  drilldownRows: HospitalDrilldownRow[];
};

// ---- Filters ----------------------------------------------------------------

export type HospitalAnalyticsInput = {
  cases: Case[];
  groupBy: GroupBy;
  /** Map of medication name → therapeutic class (from medications catalog). */
  medicationClassByName: Map<string, string>;
  /** Secondary in-memory filters. */
  filters: {
    department: string; // "all" or value
    vet: string;
    medicationClass: string;
    avianOnly: boolean;
  };
  /** Reference "now" — overridable for tests. */
  now?: Date;
  /**
   * Period window for KPI comparison + caseload trend. When omitted, defaults
   * to "last 30 days vs prior 30 days" computed from `now`. The endpoint will
   * normally compute this itself based on the preset / custom range so it
   * stays consistent with the SQL filter that selected the cases.
   */
  period?: PeriodWindow;
  /**
   * When `cases` already includes cases from BOTH the current and prior
   * windows (so deltas can be computed), set this to true. The aggregator
   * will then split internally and only run the heavy aggregations on the
   * current-window subset. When false (or omitted), the full case list is
   * treated as the current period and prior-period numbers are zero.
   */
  casesIncludePrior?: boolean;
  /**
   * Whether the client wants prior-period comparison displayed. The server
   * still computes the deltas so the page can toggle without a refetch, but
   * this is echoed back in `filters.comparePrior` so the page can default the
   * toggle to whatever the user last picked.
   */
  comparePrior?: boolean;
};

// ---- Utility map helpers ---------------------------------------------------

function topKV(map: Map<string, number>, limit: number): KV[] {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function bumpMap<K>(map: Map<K, number>, key: K, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function topName(map: Map<string, number>): string {
  let best: { name: string; value: number } | null = null;
  for (const [name, value] of Array.from(map.entries())) {
    if (!best || value > best.value) best = { name, value };
  }
  return best?.name ?? "N/A";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function vitalSummary(name: string, values: number[]): VitalSummary {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { name, count: 0, min: 0, p25: 0, median: 0, p75: 0, max: 0, mean: 0 };
  }
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    name,
    count: sorted.length,
    min: Number(sorted[0].toFixed(2)),
    p25: Number(percentile(sorted, 0.25).toFixed(2)),
    median: Number(percentile(sorted, 0.5).toFixed(2)),
    p75: Number(percentile(sorted, 0.75).toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    mean: Number((sum / sorted.length).toFixed(2)),
  };
}

const AVIAN_PATTERN = /(chicken|fowl|hen|poultry|broiler|layer|duck|turkey|quail|pigeon|bird|goose|avian)/i;
function isAvianSpecies(species: string): boolean {
  return AVIAN_PATTERN.test(species);
}

const IMAGING_KEYS: Array<{ key: string; label: string }> = [
  { key: "xrayDetails", label: "X-Ray" },
  { key: "ultrasoundDetails", label: "Ultrasound" },
  { key: "biopsyDetails", label: "Biopsy" },
  { key: "cytologyDetails", label: "Cytology" },
  { key: "cultureDetails", label: "Culture" },
];

const VITALS: Array<{ key: string; label: string }> = [
  { key: "temperature", label: "Temperature" },
  { key: "heartRate", label: "Heart rate" },
  { key: "respiratoryRate", label: "Respiratory rate" },
  { key: "weight", label: "Weight" },
  { key: "dehydrationPercentage", label: "Dehydration %" },
];

const FREE_TEXT_TRIM = 140;

function trimText(s: string, max = FREE_TEXT_TRIM): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function bucketizeDehydration(values: number[]): KV[] {
  const buckets = new Map<string, number>([
    ["0-5%", 0],
    ["5-10%", 0],
    [">10%", 0],
  ]);
  for (const v of values) {
    if (v < 5) bumpMap(buckets, "0-5%");
    else if (v <= 10) bumpMap(buckets, "5-10%");
    else bumpMap(buckets, ">10%");
  }
  return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
}

// ---- Period helpers --------------------------------------------------------

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function diffDaysInclusive(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00Z`).getTime();
  const b = new Date(`${endIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

const PRESET_LABEL_MAP: Record<string, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  qtd: "Quarter to date",
  ytd: "Year to date",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
  all: "All time",
  custom: "Custom range",
};

/**
 * Resolve a preset (and optional custom range) to a current+prior window.
 *
 * Both windows are inclusive at both ends and aligned to days (UTC midnight).
 * The prior window is always the same length as the current window, ending
 * the day before the current window starts.
 *
 * "all" returns a current window of the last 365 days vs the 365 days before
 * that, so the headline KPIs still mean something even when the user clears
 * the date filter.
 */
export function resolvePeriodWindow(args: {
  preset: string;
  now: Date;
  dateFromAd?: string;
  dateToAd?: string;
}): PeriodWindow {
  const preset = args.preset || "30d";
  const nowIso = isoDay(args.now);
  const todayUtc = new Date(`${nowIso}T00:00:00Z`);
  const dayBeforeIso = (iso: string) =>
    isoDay(addDays(new Date(`${iso}T00:00:00Z`), -1));

  if (preset === "custom" || args.dateFromAd || args.dateToAd) {
    const endIso = (args.dateToAd && /^\d{4}-\d{2}-\d{2}$/.test(args.dateToAd))
      ? args.dateToAd
      : nowIso;
    const startIso = (args.dateFromAd && /^\d{4}-\d{2}-\d{2}$/.test(args.dateFromAd))
      ? args.dateFromAd
      : isoDay(addDays(new Date(`${endIso}T00:00:00Z`), -29));
    const days = diffDaysInclusive(startIso, endIso);
    const priorEnd = dayBeforeIso(startIso);
    const priorStart = isoDay(addDays(new Date(`${priorEnd}T00:00:00Z`), -(days - 1)));
    return {
      preset: "custom",
      label: `${startIso} → ${endIso}`,
      current: { start: startIso, end: endIso, days },
      prior: { start: priorStart, end: priorEnd, days },
    };
  }

  let startIso = nowIso;
  let endIso = nowIso;

  switch (preset) {
    case "today":
      startIso = nowIso;
      endIso = nowIso;
      break;
    case "7d":
      startIso = isoDay(addDays(todayUtc, -6));
      endIso = nowIso;
      break;
    case "30d":
      startIso = isoDay(addDays(todayUtc, -29));
      endIso = nowIso;
      break;
    case "90d":
      startIso = isoDay(addDays(todayUtc, -89));
      endIso = nowIso;
      break;
    case "qtd": {
      const m = todayUtc.getUTCMonth();
      const qStart = new Date(Date.UTC(todayUtc.getUTCFullYear(), m - (m % 3), 1));
      startIso = isoDay(qStart);
      endIso = nowIso;
      break;
    }
    case "ytd": {
      const yStart = new Date(Date.UTC(todayUtc.getUTCFullYear(), 0, 1));
      startIso = isoDay(yStart);
      endIso = nowIso;
      break;
    }
    case "3m": {
      const d = new Date(todayUtc);
      d.setUTCMonth(d.getUTCMonth() - 3);
      d.setUTCDate(d.getUTCDate() + 1);
      startIso = isoDay(d);
      endIso = nowIso;
      break;
    }
    case "6m": {
      const d = new Date(todayUtc);
      d.setUTCMonth(d.getUTCMonth() - 6);
      d.setUTCDate(d.getUTCDate() + 1);
      startIso = isoDay(d);
      endIso = nowIso;
      break;
    }
    case "12m":
    case "all": {
      const d = new Date(todayUtc);
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      d.setUTCDate(d.getUTCDate() + 1);
      startIso = isoDay(d);
      endIso = nowIso;
      break;
    }
    default:
      startIso = isoDay(addDays(todayUtc, -29));
      endIso = nowIso;
  }

  const days = diffDaysInclusive(startIso, endIso);
  const priorEnd = dayBeforeIso(startIso);
  const priorStart = isoDay(addDays(new Date(`${priorEnd}T00:00:00Z`), -(days - 1)));
  return {
    preset,
    label: PRESET_LABEL_MAP[preset] ?? "Custom range",
    current: { start: startIso, end: endIso, days },
    prior: { start: priorStart, end: priorEnd, days },
  };
}

// ---- Snapshot (for KPI deltas) ---------------------------------------------

type HeadlineSnapshot = {
  totalCases: number;
  distinctOwners: number;
  totalMeds: number;
  totalTests: number;
  avgMedsPerCase: number;
  avgTestsPerCase: number;
  diagnosisRecordedPct: number;
  antibioticShare: number;
};

// Class names that come back from the medications catalog and that we want to
// count as antibiotics for stewardship. The page does NOT hardcode any clinical
// thresholds (e.g. dosing, MIC, temperature ranges) — this regex is only used
// to recognise whichever therapeutic-class labels the user has applied to the
// medications they manage (Antibiotic, Antibacterial, Cephalosporin, etc.).
const ANTIBIOTIC_CLASS_RE =
  /antibiotic|antibacterial|antimicrobial|cephalosporin|penicillin|fluoroquinolone|sulfonamide|tetracycline|macrolide|aminoglycoside/i;

function isAntibioticClass(cls: string | undefined): boolean {
  if (!cls) return false;
  return ANTIBIOTIC_CLASS_RE.test(cls);
}

function countTestsOrdered(custom: Record<string, unknown>): number {
  return (
    asStringArray(custom.testsSuggested).length +
    asStringArray(custom.enzymePanelTests).length +
    asStringArray(custom.rapidDiagnosticTests).length +
    IMAGING_KEYS.reduce(
      (acc, k) => acc + (asText(custom[k.key]).trim() ? 1 : 0),
      0,
    )
  );
}

function snapshotOf(
  cases: Case[],
  medClassByName: Map<string, string>,
): HeadlineSnapshot {
  let totalMeds = 0;
  let totalTests = 0;
  let abxCount = 0;
  let casesWithDiagnosis = 0;
  const phones = new Set<string>();
  for (const c of cases) {
    const custom = parseCustomFields(c.customFields);
    const meds = flattenMedications(parseTreatmentDetails(c.treatmentDetails));
    totalMeds += meds.length;
    totalTests += countTestsOrdered(custom);
    if (asText(custom.diagnosis).trim()) casesWithDiagnosis += 1;
    const phone = String(c.ownerPhone ?? "").trim();
    if (phone) phones.add(phone);
    for (const m of meds) {
      const name = String(m.medication ?? "").trim().toLowerCase();
      if (!name) continue;
      const klass = medClassByName.get(name);
      if (isAntibioticClass(klass)) abxCount += 1;
    }
  }
  return {
    totalCases: cases.length,
    distinctOwners: phones.size,
    totalMeds,
    totalTests,
    avgMedsPerCase: cases.length > 0 ? totalMeds / cases.length : 0,
    avgTestsPerCase: cases.length > 0 ? totalTests / cases.length : 0,
    diagnosisRecordedPct:
      cases.length > 0 ? (casesWithDiagnosis / cases.length) * 100 : 0,
    antibioticShare: totalMeds > 0 ? (abxCount / totalMeds) * 100 : 0,
  };
}

function deltaPct(value: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior === 0) {
    if (value === 0) return 0;
    return null;
  }
  return ((value - prior) / Math.abs(prior)) * 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeKpi(
  args: {
    id: string;
    label: string;
    value: number;
    prior: number;
    format: KpiFormat;
    hint?: string;
    sparkline: number[];
    improvement: "up" | "down" | "neutral";
  },
): KpiTile {
  const value = args.format === "int" ? Math.round(args.value) : round2(args.value);
  const prior = args.format === "int" ? Math.round(args.prior) : round2(args.prior);
  const dPct = deltaPct(value, prior);
  return {
    id: args.id,
    label: args.label,
    value,
    prior,
    deltaPct: dPct == null ? null : round1(dPct),
    deltaAbs: round2(value - prior),
    format: args.format,
    hint: args.hint,
    sparkline: args.sparkline.map((n) => Math.round(n * 100) / 100),
    improvement: args.improvement,
  };
}

function dailyBuckets(
  cases: Case[],
  startIso: string,
  endIso: string,
  value: (d: Case) => number,
): number[] {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const days = Math.round((end - start) / 86_400_000) + 1;
  const out = new Array<number>(days).fill(0);
  for (const c of cases) {
    const ad = c.dateAd ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ad)) continue;
    const ts = new Date(`${ad}T00:00:00Z`).getTime();
    if (!Number.isFinite(ts) || ts < start || ts > end) continue;
    const idx = Math.round((ts - start) / 86_400_000);
    if (idx >= 0 && idx < days) out[idx] += value(c);
  }
  return out;
}

function formatDayLabel(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, , mo, d] = m;
  const monthNames = [
    "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  return `${monthNames[Number.parseInt(mo, 10) - 1]} ${Number.parseInt(d, 10)}`;
}

// ---- Main aggregator --------------------------------------------------------

export function computeHospitalDashboard(
  input: HospitalAnalyticsInput,
): Omit<HospitalDashboardPayload, "filters" | "options"> {
  const { cases, groupBy, medicationClassByName, filters, now = new Date() } = input;

  // Resolve the period window. The page uses this both to render its compact
  // "Last 30 days vs prior 30 days" label and to align the caseload trend rows.
  // When the caller didn't pass a window, default to "last 30 days" anchored
  // at `now`. Cases are only split into current/prior buckets when the caller
  // explicitly asks for it (see `casesIncludePrior` below).
  const period = input.period ?? resolvePeriodWindow({ preset: "30d", now });

  // Apply secondary in-memory filters.
  const departmentFilter = filters.department.trim();
  const vetFilter = filters.vet.trim();
  const medClassFilter = filters.medicationClass.trim();
  const avianOnly = !!filters.avianOnly;

  const passesInMemoryFilters = (c: Case): boolean => {
    const dept = String(c.veterinarianDepartment ?? "").trim();
    const vet = String(c.veterinarianName ?? "").trim();
    const species = String(c.species ?? "").trim();
    if (departmentFilter && departmentFilter !== "all" && dept !== departmentFilter) return false;
    if (vetFilter && vetFilter !== "all" && vet !== vetFilter) return false;
    if (avianOnly && !isAvianSpecies(species)) return false;
    if (medClassFilter && medClassFilter !== "all") {
      const meds = flattenMedications(parseTreatmentDetails(c.treatmentDetails));
      const hasClass = meds.some((m) => {
        const klass = medicationClassByName.get(String(m.medication ?? "").trim().toLowerCase());
        return klass === medClassFilter;
      });
      if (!hasClass) return false;
    }
    return true;
  };

  const allFiltered = cases.filter(passesInMemoryFilters);

  // Split into current vs prior windows. When the caller has only supplied
  // current-period cases, `prior` will be empty and deltas will be 0.
  const inWindow = (c: Case, start: string, end: string): boolean => {
    const ad = c.dateAd ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ad)) return false;
    return ad >= start && ad <= end;
  };
  // Only split when the caller explicitly opted in. This keeps older callers
  // (and the existing unit tests) working without surprise filtering — when
  // they pass a flat list of cases without `casesIncludePrior: true`, every
  // case is treated as part of the current period and prior numbers are 0.
  const splitByPeriod = input.casesIncludePrior === true;
  const filtered = splitByPeriod
    ? allFiltered.filter((c) => inWindow(c, period.current.start, period.current.end))
    : allFiltered;
  const priorCases = splitByPeriod
    ? allFiltered.filter((c) => inWindow(c, period.prior.start, period.prior.end))
    : [];

  // Pre-compute per-case derived fields used in multiple aggregations.
  type Derived = {
    case: Case;
    species: string;
    breed: string;
    sex: string;
    department: string;
    vet: string;
    ad: Date | null;
    bsDate: string;
    custom: Record<string, unknown>;
    treatments: Record<string, TreatmentFieldValue>;
    medications: TreatmentMedicationEntry[];
    testsOrderedCount: number;
    chiefComplaint: string;
    diagnosis: string;
  };

  const derived: Derived[] = filtered.map((c) => {
    const custom = parseCustomFields(c.customFields);
    const treatments = parseTreatmentDetails(c.treatmentDetails);
    const medications = flattenMedications(treatments);
    const testsOrderedCount =
      asStringArray(custom.testsSuggested).length +
      asStringArray(custom.enzymePanelTests).length +
      asStringArray(custom.rapidDiagnosticTests).length +
      IMAGING_KEYS.reduce(
        (acc, k) => acc + (asText(custom[k.key]).trim() ? 1 : 0),
        0,
      );
    return {
      case: c,
      species: String(c.species ?? "Unknown").trim() || "Unknown",
      breed: String(c.breed ?? "Unknown").trim() || "Unknown",
      sex: String(c.sex ?? "Unknown").trim() || "Unknown",
      department: String(c.veterinarianDepartment ?? "").trim() || "Unassigned",
      vet: String(c.veterinarianName ?? "").trim() || "Unassigned",
      ad: parseAdDate(c.dateAd ?? c.date),
      bsDate: String(c.date ?? "").trim(),
      custom,
      treatments,
      medications,
      testsOrderedCount,
      chiefComplaint: trimText(asText(custom.chiefComplaint)),
      diagnosis: trimText(asText(custom.diagnosis)),
    };
  });

  // -- Overview KPIs ----------------------------------------------------------
  const todayBs = bsYearMonth(filtered[0]?.date ?? null); // not actually used; we use AD comparisons
  const nowYmd = now.toISOString().slice(0, 10);
  const nowMonth = nowYmd.slice(0, 7);
  const nowYear = nowYmd.slice(0, 4);

  let casesToday = 0;
  let casesThisMonth = 0;
  let casesThisYear = 0;
  for (const d of derived) {
    const adYmd = d.case.dateAd ?? "";
    if (adYmd === nowYmd) casesToday += 1;
    if (adYmd.startsWith(nowMonth)) casesThisMonth += 1;
    if (adYmd.startsWith(nowYear)) casesThisYear += 1;
  }
  void todayBs;

  const phoneCounts = new Map<string, number>();
  for (const d of derived) {
    const phone = String(d.case.ownerPhone ?? "").trim();
    if (phone) bumpMap(phoneCounts, phone);
  }
  const distinctOwners = phoneCounts.size;
  const repeatOwnerCases = Array.from(phoneCounts.values()).reduce(
    (acc, count) => acc + (count > 1 ? count : 0),
    0,
  );
  const repeatVisitRatePct =
    derived.length > 0 ? Number(((repeatOwnerCases / derived.length) * 100).toFixed(1)) : 0;

  const activeVets = new Set(
    derived.map((d) => d.vet).filter((v) => v && v !== "Unassigned"),
  ).size;
  const activeDepartments = new Set(
    derived.map((d) => d.department).filter((v) => v && v !== "Unassigned"),
  ).size;

  let totalPrescriptions = 0;
  let totalTestsOrdered = 0;
  let casesWithPrescription = 0;
  for (const d of derived) {
    totalPrescriptions += d.medications.length;
    totalTestsOrdered += d.testsOrderedCount;
    if (d.medications.length > 0) casesWithPrescription += 1;
  }

  const avg = (sum: number, n: number) => (n > 0 ? Number((sum / n).toFixed(2)) : 0);

  // -- Composition ------------------------------------------------------------
  const speciesCounts = new Map<string, number>();
  const breedCounts = new Map<string, number>();
  const sexCounts = new Map<string, number>();
  const ageBandCounts = new Map<string, number>();
  const deptCounts = new Map<string, number>();
  const vetCounts = new Map<string, number>();
  const weekdayCounts = new Map<string, number>(WEEKDAYS.map((d) => [d, 0]));
  const hourCounts = new Map<string, number>(
    Array.from({ length: 24 }, (_, i) => [String(i).padStart(2, "0"), 0]),
  );

  // -- Clinical ---------------------------------------------------------------
  const complaintCounts = new Map<string, number>();
  const diagnosisCounts = new Map<string, number>();
  const vitalValues = new Map<string, number[]>(VITALS.map((v) => [v.key, []]));
  const dehydrationValues: number[] = [];
  const testsSuggestedCounts = new Map<string, number>();
  const enzymePanelCounts = new Map<string, number>();
  const rapidDiagnosticCounts = new Map<string, number>();
  const imagingCounts = new Map<string, number>(IMAGING_KEYS.map((k) => [k.label, 0]));

  // -- Therapeutics -----------------------------------------------------------
  const medCounts = new Map<string, number>();
  const abxNameCounts = new Map<string, number>();
  const medClassCounts = new Map<string, number>();
  const routeCounts = new Map<string, number>();
  // For the ranked-table drill-down: track which diagnoses appear on cases
  // that received each medication. Key is the canonical medication name
  // (the display-cased version used in `medCounts`), value is a tally of
  // diagnoses (already lowercased + trimmed; title-cased on output).
  const medDiagnosisCounts = new Map<string, Map<string, number>>();

  // -- Avian ------------------------------------------------------------------
  let avianCases = 0;
  let totalFlock = 0;
  let totalMortality = 0;
  const hatcheryCounts = new Map<string, number>();
  const feedSupplierCounts = new Map<string, number>();

  // -- Trends -----------------------------------------------------------------
  const casesTrend = new Map<string, number>();
  const prescriptionsTrend = new Map<string, number>();
  const testsTrend = new Map<string, number>();
  const deptTrend = new Map<string, Map<string, number>>();

  for (const d of derived) {
    bumpMap(speciesCounts, d.species);
    bumpMap(breedCounts, d.breed);
    bumpMap(sexCounts, d.sex);
    bumpMap(ageBandCounts, ageBand(d.case.age));
    bumpMap(deptCounts, d.department);
    bumpMap(vetCounts, d.vet);

    if (d.ad) {
      bumpMap(weekdayCounts, WEEKDAYS[d.ad.getUTCDay()]);
    }
    const created = parseAdDateTime(d.case.createdAt);
    if (created) {
      bumpMap(hourCounts, String(created.getUTCHours()).padStart(2, "0"));
    }

    if (d.chiefComplaint) bumpMap(complaintCounts, d.chiefComplaint.toLowerCase());
    if (d.diagnosis) bumpMap(diagnosisCounts, d.diagnosis.toLowerCase());

    for (const v of VITALS) {
      const num = asNumber(d.custom[v.key]);
      if (num != null) vitalValues.get(v.key)!.push(num);
    }
    const deh = asNumber(d.custom.dehydrationPercentage);
    if (deh != null) dehydrationValues.push(deh);

    for (const t of asStringArray(d.custom.testsSuggested)) bumpMap(testsSuggestedCounts, t);
    for (const t of asStringArray(d.custom.enzymePanelTests)) bumpMap(enzymePanelCounts, t);
    for (const t of asStringArray(d.custom.rapidDiagnosticTests))
      bumpMap(rapidDiagnosticCounts, t);
    for (const k of IMAGING_KEYS) {
      if (asText(d.custom[k.key]).trim()) bumpMap(imagingCounts, k.label);
    }

    for (const m of d.medications) {
      const name = String(m.medication ?? "").trim();
      if (name) bumpMap(medCounts, name);
      const klass = medicationClassByName.get(name.toLowerCase());
      if (name && isAntibioticClass(klass)) bumpMap(abxNameCounts, name);
      bumpMap(medClassCounts, klass || "Unclassified");
      const route = String(m.route ?? "").trim();
      if (route) bumpMap(routeCounts, route);
      if (name && d.diagnosis.trim()) {
        const diagKey = d.diagnosis.trim().toLowerCase();
        let inner = medDiagnosisCounts.get(name);
        if (!inner) {
          inner = new Map<string, number>();
          medDiagnosisCounts.set(name, inner);
        }
        bumpMap(inner, diagKey);
      }
    }

    if (isAvianSpecies(d.species)) {
      avianCases += 1;
      const flock = asNumber(d.custom.flockSize);
      const mortality = asNumber(d.custom.mortality);
      if (flock != null) totalFlock += flock;
      if (mortality != null) totalMortality += mortality;
      const hatchery = asText(d.custom.hatchery);
      if (hatchery) bumpMap(hatcheryCounts, hatchery);
      const feed = asText(d.custom.feedSupplier);
      if (feed) bumpMap(feedSupplierCounts, feed);
    }

    const tkSource = d.case.dateAd ?? d.case.date ?? "";
    const tk = timeKeyForGroup(tkSource, groupBy);
    if (tk) {
      bumpMap(casesTrend, tk);
      if (d.medications.length > 0) bumpMap(prescriptionsTrend, tk, d.medications.length);
      if (d.testsOrderedCount > 0) bumpMap(testsTrend, tk, d.testsOrderedCount);
      const inner = deptTrend.get(tk) ?? new Map<string, number>();
      bumpMap(inner, d.department);
      deptTrend.set(tk, inner);
    }
  }

  // Title-case the top complaints/diagnoses for display.
  const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const topComplaints = topKV(complaintCounts, 10).map((kv) => ({
    name: titleCase(kv.name),
    value: kv.value,
  }));
  const topDiagnoses = topKV(diagnosisCounts, 10).map((kv) => ({
    name: titleCase(kv.name),
    value: kv.value,
  }));

  // Departments to surface in the trend stack (top 5).
  const topDepartmentNames = topKV(deptCounts, 5).map((kv) => kv.name);
  const departmentWorkloadTrend = Array.from(deptTrend.entries())
    .map(([period, inner]) => {
      const row: Record<string, string | number> = { period };
      for (const dept of topDepartmentNames) row[dept] = inner.get(dept) ?? 0;
      return row;
    })
    .sort((a, b) =>
      String(a.period).localeCompare(String(b.period), undefined, { numeric: true }),
    );

  // -- Drill-down rows --------------------------------------------------------
  const drilldownRows: HospitalDrilldownRow[] = derived
    .slice(0, 500)
    .map((d) => ({
      caseId: d.case.id,
      caseNumber: d.case.caseNumber,
      date: d.case.date,
      ownerName: d.case.ownerName,
      phoneNumber: d.case.ownerPhone ?? "",
      address: d.case.ownerAddress ?? "",
      animalName: d.case.animalName ?? "",
      species: d.species,
      breed: d.breed,
      age: d.case.age ?? "",
      sex: d.sex,
      attendingVet: d.vet,
      department: d.department,
      chiefComplaint: d.chiefComplaint,
      diagnosis: d.diagnosis,
      testsOrderedCount: d.testsOrderedCount,
      medicationsCount: d.medications.length,
    }));

  const sortPeriod = (rows: Array<{ period: string; value: number }>) =>
    rows.sort((a, b) => a.period.localeCompare(b.period, undefined, { numeric: true }));

  // -- Medication ranking (Pareto + drill-down table) ------------------------
  // Capped at 25 rows so the page stays scannable; the user can use the
  // medication-class filter to narrow further. Cumulative share is computed
  // off the *full* prescription total (not just the top-25 total) so that
  // "top 5 drugs cover 80%" remains a true statement about the whole period.
  const totalRxForRanking = Array.from(medCounts.values()).reduce(
    (acc, v) => acc + v,
    0,
  );
  const sortedMedEntries = Array.from(medCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 25);
  const medicationRanking: MedicationRankingRow[] = [];
  let runningTotal = 0;
  for (let i = 0; i < sortedMedEntries.length; i++) {
    const { name, count } = sortedMedEntries[i];
    runningTotal += count;
    const klass = medicationClassByName.get(name.toLowerCase()) ?? "Unclassified";
    const dxMap = medDiagnosisCounts.get(name);
    let topDx: { name: string; count: number } | null = null;
    if (dxMap) {
      for (const [n, c] of Array.from(dxMap.entries())) {
        if (!topDx || c > topDx.count) topDx = { name: n, count: c };
      }
    }
    medicationRanking.push({
      rank: i + 1,
      name,
      count,
      sharePct:
        totalRxForRanking > 0
          ? round1((count / totalRxForRanking) * 100)
          : 0,
      cumulativeSharePct:
        totalRxForRanking > 0
          ? round1((runningTotal / totalRxForRanking) * 100)
          : 0,
      class: klass,
      topDiagnosis: topDx
        ? { name: titleCase(topDx.name), count: topDx.count }
        : null,
      isAntibiotic: isAntibioticClass(klass),
    });
  }

  // -- Headline KPIs + per-day series ----------------------------------------
  // Walk derived once and build daily series + counters used by KPIs,
  // sparklines, clinical alerts, data quality and the antibiotic-share trend.
  const trendDays = period.current.days;
  const startCurrentDate = new Date(`${period.current.start}T00:00:00Z`);
  const dayIdx = (ad: string | null | undefined): number => {
    if (!ad || !/^\d{4}-\d{2}-\d{2}$/.test(ad)) return -1;
    const ts = new Date(`${ad}T00:00:00Z`).getTime();
    const idx = Math.round((ts - startCurrentDate.getTime()) / 86_400_000);
    return idx >= 0 && idx < trendDays ? idx : -1;
  };

  const dailyCases = new Array<number>(trendDays).fill(0);
  const dailyMeds = new Array<number>(trendDays).fill(0);
  const dailyTests = new Array<number>(trendDays).fill(0);
  const dailyAbx = new Array<number>(trendDays).fill(0);
  const dailyWithDx = new Array<number>(trendDays).fill(0);

  let casesWithDiagnosisCurrent = 0;
  let casesWithVetCurrent = 0;
  let casesWithComplaintCurrent = 0;
  let casesWithVitalsCurrent = 0;
  let abxCountCurrent = 0;

  // Per-bucket stats for the vet + department scorecards. Each key is a
  // vet name or department name; values accumulate during the same single
  // pass so we don't traverse `derived` a second time.
  type BucketStats = {
    cases: number;
    meds: number;
    abx: number;
    tests: number;
    withDx: number;
    diagnoses: Map<string, number>;
  };
  const emptyBucket = (): BucketStats => ({
    cases: 0,
    meds: 0,
    abx: 0,
    tests: 0,
    withDx: 0,
    diagnoses: new Map(),
  });
  const vetBuckets = new Map<string, BucketStats>();
  const deptBuckets = new Map<string, BucketStats>();
  const bucketFor = (map: Map<string, BucketStats>, key: string): BucketStats => {
    let b = map.get(key);
    if (!b) {
      b = emptyBucket();
      map.set(key, b);
    }
    return b;
  };

  for (const d of derived) {
    const i = dayIdx(d.case.dateAd);
    if (i >= 0) dailyCases[i] += 1;

    const vetBucket = bucketFor(vetBuckets, d.vet);
    const deptBucket = bucketFor(deptBuckets, d.department);
    vetBucket.cases += 1;
    deptBucket.cases += 1;

    // "Vitals captured" only checks whether *any* vital was recorded — it does
    // NOT compare values against any clinical thresholds, since the form does
    // not enforce species-specific normal ranges and we deliberately don't
    // assert ad-hoc thresholds.
    const t = asNumber(d.custom.temperature);
    const hr = asNumber(d.custom.heartRate);
    const rr = asNumber(d.custom.respiratoryRate);
    const w = asNumber(d.custom.weight);
    const deh = asNumber(d.custom.dehydrationPercentage);
    const hasVitals = t != null || hr != null || rr != null || w != null || deh != null;
    if (hasVitals) casesWithVitalsCurrent += 1;
    if (d.diagnosis.trim()) {
      casesWithDiagnosisCurrent += 1;
      if (i >= 0) dailyWithDx[i] += 1;
      vetBucket.withDx += 1;
      deptBucket.withDx += 1;
      const diagKey = d.diagnosis.trim().toLowerCase();
      vetBucket.diagnoses.set(diagKey, (vetBucket.diagnoses.get(diagKey) ?? 0) + 1);
      deptBucket.diagnoses.set(diagKey, (deptBucket.diagnoses.get(diagKey) ?? 0) + 1);
    }
    if (d.chiefComplaint.trim()) casesWithComplaintCurrent += 1;
    if (d.vet && d.vet !== "Unassigned") casesWithVetCurrent += 1;

    if (i >= 0) dailyTests[i] += d.testsOrderedCount;
    vetBucket.tests += d.testsOrderedCount;
    deptBucket.tests += d.testsOrderedCount;

    for (const m of d.medications) {
      if (i >= 0) dailyMeds[i] += 1;
      vetBucket.meds += 1;
      deptBucket.meds += 1;
      const klass = medicationClassByName.get(String(m.medication ?? "").trim().toLowerCase());
      if (isAntibioticClass(klass)) {
        abxCountCurrent += 1;
        if (i >= 0) dailyAbx[i] += 1;
        vetBucket.abx += 1;
        deptBucket.abx += 1;
      }
    }
  }

  const dailyMedsPerCase = dailyCases.map((c, i) => (c > 0 ? dailyMeds[i] / c : 0));
  const dailyTestsPerCase = dailyCases.map((c, i) => (c > 0 ? dailyTests[i] / c : 0));
  const dailyDxPct = dailyCases.map((c, i) => (c > 0 ? (dailyWithDx[i] / c) * 100 : 0));
  const dailyAbxSharePct = dailyMeds.map((m, i) => (m > 0 ? (dailyAbx[i] / m) * 100 : 0));

  // Prior-period daily case counts (only used for the trend overlay).
  const priorDailyCases = dailyBuckets(
    priorCases,
    period.prior.start,
    period.prior.end,
    () => 1,
  );

  // Prior snapshot for KPI deltas.
  const priorSnap = snapshotOf(priorCases, medicationClassByName);

  const currentSnap: HeadlineSnapshot = {
    totalCases: derived.length,
    distinctOwners,
    totalMeds: totalPrescriptions,
    totalTests: totalTestsOrdered,
    avgMedsPerCase: derived.length > 0 ? totalPrescriptions / derived.length : 0,
    avgTestsPerCase: derived.length > 0 ? totalTestsOrdered / derived.length : 0,
    diagnosisRecordedPct:
      derived.length > 0 ? (casesWithDiagnosisCurrent / derived.length) * 100 : 0,
    antibioticShare:
      totalPrescriptions > 0 ? (abxCountCurrent / totalPrescriptions) * 100 : 0,
  };

  const priorRangeHint = `vs ${period.prior.start} → ${period.prior.end}`;
  const kpis: KpiTile[] = [
    makeKpi({
      id: "cases",
      label: "Cases registered",
      value: currentSnap.totalCases,
      prior: priorSnap.totalCases,
      format: "int",
      hint: priorRangeHint,
      sparkline: dailyCases,
      improvement: "up",
    }),
    makeKpi({
      id: "owners",
      label: "Owners served",
      value: currentSnap.distinctOwners,
      prior: priorSnap.distinctOwners,
      format: "int",
      hint: "Distinct phone numbers in this period",
      sparkline: dailyCases,
      improvement: "up",
    }),
    makeKpi({
      id: "meds_per_case",
      label: "Meds / case",
      value: currentSnap.avgMedsPerCase,
      prior: priorSnap.avgMedsPerCase,
      format: "float2",
      hint: "Avg prescriptions per case",
      sparkline: dailyMedsPerCase,
      improvement: "neutral",
    }),
    makeKpi({
      id: "diagnosis_pct",
      label: "Diagnosis recorded",
      value: currentSnap.diagnosisRecordedPct,
      prior: priorSnap.diagnosisRecordedPct,
      format: "pct",
      hint: "Cases with a working diagnosis on file",
      sparkline: dailyDxPct,
      improvement: "up",
    }),
  ];

  const secondaryKpis: KpiTile[] = [
    makeKpi({
      id: "abx_share",
      label: "Antibiotic share",
      value: currentSnap.antibioticShare,
      prior: priorSnap.antibioticShare,
      format: "pct",
      hint: "Share of prescriptions in antibiotic classes (stewardship)",
      sparkline: dailyAbxSharePct,
      improvement: "down",
    }),
    makeKpi({
      id: "tests_per_case",
      label: "Tests / case",
      value: currentSnap.avgTestsPerCase,
      prior: priorSnap.avgTestsPerCase,
      format: "float2",
      hint: "Avg diagnostic tests / imaging items ordered per case",
      sparkline: dailyTestsPerCase,
      improvement: "neutral",
    }),
  ];

  // -- Insights ---------------------------------------------------------------
  // Insights are derived from data the user owns: medication classes they
  // maintain in the catalog, diagnoses they record on cases, and simple
  // period-over-period deltas. The dashboard intentionally does NOT raise
  // alerts from vital-sign thresholds (temperature, heart rate, dehydration)
  // because the form does not enforce species-specific normal ranges and no
  // such ranges are defined elsewhere in the codebase.
  const insights: Insight[] = [];
  const abxDelta = currentSnap.antibioticShare - priorSnap.antibioticShare;
  if (
    currentSnap.totalMeds >= 10 &&
    priorSnap.totalMeds >= 10 &&
    abxDelta >= 5
  ) {
    insights.push({
      id: "abx-up",
      severity: "warning",
      headline: `Antibiotic share is ${currentSnap.antibioticShare.toFixed(0)}% (up ${abxDelta.toFixed(0)} pp vs prior)`,
      supporting: "Stewardship: review prescribing patterns.",
    });
  }
  if (
    derived.length >= 10 &&
    currentSnap.diagnosisRecordedPct < 70
  ) {
    insights.push({
      id: "diagnosis-gap",
      severity: "warning",
      headline: `Diagnosis missing on ${(100 - currentSnap.diagnosisRecordedPct).toFixed(0)}% of cases`,
      supporting: "Ask attending vets to record a working diagnosis on every case.",
    });
  }
  const casesDelta = currentSnap.totalCases - priorSnap.totalCases;
  if (
    priorSnap.totalCases >= 5 &&
    Math.abs(casesDelta) >= Math.max(3, priorSnap.totalCases * 0.25)
  ) {
    const arrow = casesDelta > 0 ? "up" : "down";
    insights.push({
      id: "caseload-shift",
      severity: "info",
      headline: `Caseload is ${arrow} ${Math.abs(casesDelta)} cases vs prior period`,
      supporting: `${currentSnap.totalCases} this period vs ${priorSnap.totalCases} previously.`,
    });
  }
  if (topComplaints[0]) {
    insights.push({
      id: "top-complaint",
      severity: "info",
      headline: `Most common complaint: ${topComplaints[0].name} (${topComplaints[0].value} case${topComplaints[0].value === 1 ? "" : "s"})`,
    });
  }
  if (topDiagnoses[0]) {
    insights.push({
      id: "top-diagnosis",
      severity: "info",
      headline: `Most common diagnosis: ${topDiagnoses[0].name} (${topDiagnoses[0].value} case${topDiagnoses[0].value === 1 ? "" : "s"})`,
    });
  }
  const busiestWeekday = WEEKDAYS.reduce(
    (best, d) => ((weekdayCounts.get(d) ?? 0) > (weekdayCounts.get(best) ?? 0) ? d : best),
    WEEKDAYS[0],
  );
  const busiestCount = weekdayCounts.get(busiestWeekday) ?? 0;
  if (busiestCount > 0 && derived.length >= 7) {
    insights.push({
      id: "busiest-day",
      severity: "info",
      headline: `Busiest weekday: ${busiestWeekday} (${busiestCount} cases)`,
    });
  }
  const SEV_ORDER: Record<InsightSeverity, number> = { alert: 0, warning: 1, info: 2 };
  insights.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const cappedInsights = insights.slice(0, 6);

  // -- Caseload trend (daily, current vs prior overlay) ----------------------
  const caseloadRows: CaseloadTrendRow[] = [];
  for (let i = 0; i < trendDays; i++) {
    const dateIso = isoDay(addDays(startCurrentDate, i));
    caseloadRows.push({
      label: formatDayLabel(dateIso),
      current: dailyCases[i] ?? 0,
      prior: i < priorDailyCases.length ? (priorDailyCases[i] ?? 0) : null,
    });
  }
  const caseloadTrend: CaseloadTrend = {
    rows: caseloadRows,
    currentLabel: `${period.current.start} → ${period.current.end}`,
    priorLabel: `${period.prior.start} → ${period.prior.end}`,
  };

  // -- Antibiotic stewardship trend ------------------------------------------
  const antibioticRows = dailyMeds.map((tot, i) => ({
    label: formatDayLabel(isoDay(addDays(startCurrentDate, i))),
    sharePct: tot > 0 ? Number(((dailyAbx[i] / tot) * 100).toFixed(1)) : 0,
    totalRx: tot,
  }));
  const antibioticTrend: AntibioticTrend = {
    rows: antibioticRows,
    currentAvgSharePct: round1(currentSnap.antibioticShare),
    priorAvgSharePct: round1(priorSnap.antibioticShare),
  };

  // -- Data quality ----------------------------------------------------------
  const dataQuality: DataQuality = {
    totalCases: derived.length,
    withDiagnosisPct:
      derived.length > 0 ? round1((casesWithDiagnosisCurrent / derived.length) * 100) : 0,
    withVetAssignedPct:
      derived.length > 0 ? round1((casesWithVetCurrent / derived.length) * 100) : 0,
    withChiefComplaintPct:
      derived.length > 0 ? round1((casesWithComplaintCurrent / derived.length) * 100) : 0,
    withVitalsPct:
      derived.length > 0 ? round1((casesWithVitalsCurrent / derived.length) * 100) : 0,
  };

  // -- Scorecards (per vet + per department) ---------------------------------
  // Capped to the top 5 by case count so the table stays scannable. Each row
  // exposes the same set of comparison metrics, and the page can color them
  // against `hospitalAverage` to show who's above / below the house norm.
  const totalCases = derived.length;
  const SCORECARD_LIMIT = 5;

  const toScorecardRow = (
    name: string,
    b: { cases: number; meds: number; abx: number; tests: number; withDx: number; diagnoses: Map<string, number> },
  ): ScorecardRow => {
    let topDx: { name: string; count: number } | null = null;
    for (const [n, c] of Array.from(b.diagnoses.entries())) {
      if (!topDx || c > topDx.count) topDx = { name: n, count: c };
    }
    return {
      name,
      caseCount: b.cases,
      caseSharePct:
        totalCases > 0 ? round1((b.cases / totalCases) * 100) : 0,
      topDiagnosis: topDx
        ? { name: topDx.name.replace(/\b\w/g, (c) => c.toUpperCase()), count: topDx.count }
        : null,
      medsPerCase: b.cases > 0 ? round2(b.meds / b.cases) : 0,
      testsPerCase: b.cases > 0 ? round2(b.tests / b.cases) : 0,
      antibioticShare: b.meds > 0 ? round1((b.abx / b.meds) * 100) : 0,
      diagnosisRecordedPct:
        b.cases > 0 ? round1((b.withDx / b.cases) * 100) : 0,
    };
  };

  const scorecards: Scorecards = {
    hospitalAverage: {
      medsPerCase: round2(currentSnap.avgMedsPerCase),
      testsPerCase: round2(currentSnap.avgTestsPerCase),
      antibioticShare: round1(currentSnap.antibioticShare),
      diagnosisRecordedPct: round1(currentSnap.diagnosisRecordedPct),
    },
    vets: Array.from(vetBuckets.entries())
      .filter(([name]) => name && name !== "Unassigned")
      .map(([name, b]) => toScorecardRow(name, b))
      .sort((a, b) => b.caseCount - a.caseCount || a.name.localeCompare(b.name))
      .slice(0, SCORECARD_LIMIT),
    departments: Array.from(deptBuckets.entries())
      .filter(([name]) => name && name !== "Unassigned")
      .map(([name, b]) => toScorecardRow(name, b))
      .sort((a, b) => b.caseCount - a.caseCount || a.name.localeCompare(b.name))
      .slice(0, SCORECARD_LIMIT),
  };

  // -- Auto narrative --------------------------------------------------------
  // 2-4 plain sentences summarising the period. Each line is independently
  // gated so the narrative shrinks gracefully on low-data periods.
  const narrative: string[] = [];
  if (currentSnap.totalCases > 0) {
    const lead = priorSnap.totalCases > 0 && casesDelta !== 0
      ? `${currentSnap.totalCases} case${currentSnap.totalCases === 1 ? "" : "s"} this ${period.label.toLowerCase()} — ${casesDelta > 0 ? "up" : "down"} ${Math.abs(casesDelta)} vs the prior ${period.prior.days} day${period.prior.days === 1 ? "" : "s"} (${priorSnap.totalCases}).`
      : `${currentSnap.totalCases} case${currentSnap.totalCases === 1 ? "" : "s"} registered this ${period.label.toLowerCase()} from ${currentSnap.distinctOwners} owner${currentSnap.distinctOwners === 1 ? "" : "s"}.`;
    narrative.push(lead);
  }
  const topDept = scorecards.departments[0];
  if (topDept) {
    const sharePart =
      topDept.caseSharePct >= 5
        ? ` (${topDept.caseSharePct.toFixed(0)}% of caseload)`
        : "";
    narrative.push(
      `${topDept.name} handled the most cases${sharePart}` +
        (topDept.topDiagnosis
          ? `, most often for ${topDept.topDiagnosis.name}.`
          : "."),
    );
  }
  if (currentSnap.totalMeds > 0) {
    const abxPart =
      priorSnap.totalMeds >= 5 && Math.abs(abxDelta) >= 3
        ? ` (${abxDelta > 0 ? "up" : "down"} ${Math.abs(abxDelta).toFixed(0)} pp)`
        : "";
    narrative.push(
      `${currentSnap.totalMeds} prescription${currentSnap.totalMeds === 1 ? "" : "s"} written; antibiotics made up ${currentSnap.antibioticShare.toFixed(0)}%${abxPart}.`,
    );
  }
  if (currentSnap.totalCases >= 5) {
    narrative.push(
      `Diagnosis recorded on ${currentSnap.diagnosisRecordedPct.toFixed(0)}% of cases; vitals captured on ${dataQuality.withVitalsPct.toFixed(0)}%.`,
    );
  }

  return {
    period,
    kpis,
    secondaryKpis,
    insights: cappedInsights,
    narrative,
    scorecards,
    dataQuality,
    caseloadTrend,
    antibioticTrend,
    overview: {
      totalCases: derived.length,
      casesToday,
      casesThisMonth,
      casesThisYear,
      distinctOwners,
      repeatVisitRatePct,
      activeVets,
      activeDepartments,
      totalPrescriptions,
      totalTestsOrdered,
      avgPrescriptionsPerCase: avg(totalPrescriptions, derived.length),
      avgTestsPerCase: avg(totalTestsOrdered, derived.length),
      mostCommonSpecies: topName(speciesCounts),
      mostCommonDepartment: topName(deptCounts),
      mostPrescribedMedication: topName(medCounts),
      mostCommonChiefComplaint: topComplaints[0]?.name ?? "N/A",
    },
    composition: {
      casesBySpecies: topKV(speciesCounts, 12),
      casesByBreed: topKV(breedCounts, 15),
      casesBySex: topKV(sexCounts, 10),
      casesByAgeGroup: topKV(ageBandCounts, 10),
      casesByDepartment: topKV(deptCounts, 10),
      casesByVet: topKV(vetCounts, 10),
      casesByWeekday: WEEKDAYS.map((name) => ({
        name,
        value: weekdayCounts.get(name) ?? 0,
      })),
      casesByHour: Array.from(hourCounts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => ({ name, value })),
    },
    clinical: {
      topChiefComplaints: topComplaints,
      topDiagnoses: topDiagnoses,
      vitals: VITALS.map((v) => vitalSummary(v.label, vitalValues.get(v.key) ?? [])),
      dehydrationBuckets: bucketizeDehydration(dehydrationValues),
      testsSuggested: topKV(testsSuggestedCounts, 10),
      enzymePanelTests: topKV(enzymePanelCounts, 10),
      rapidDiagnosticTests: topKV(rapidDiagnosticCounts, 10),
      imagingAndLabsCounts: Array.from(imagingCounts.entries()).map(([name, value]) => ({
        name,
        value,
      })),
    },
    therapeutics: {
      topMedications: topKV(medCounts, 15),
      topAntibiotics: topKV(abxNameCounts, 10),
      medicationClassMix: topKV(medClassCounts, 10),
      routesMix: topKV(routeCounts, 10),
      avgMedsPerCase: avg(totalPrescriptions, derived.length),
      casesWithPrescription,
      casesWithoutPrescription: Math.max(0, derived.length - casesWithPrescription),
      medicationRanking,
    },
    avian: {
      hasAvianData: avianCases > 0,
      avianCases,
      totalFlock,
      totalMortality,
      mortalityRatePct:
        totalFlock > 0 ? Number(((totalMortality / totalFlock) * 100).toFixed(2)) : 0,
      topHatcheries: topKV(hatcheryCounts, 10),
      topFeedSuppliers: topKV(feedSupplierCounts, 10),
    },
    trends: {
      casesOverTime: sortPeriod(
        Array.from(casesTrend.entries()).map(([period, value]) => ({ period, value })),
      ),
      prescriptionsOverTime: sortPeriod(
        Array.from(prescriptionsTrend.entries()).map(([period, value]) => ({ period, value })),
      ),
      testsOrderedOverTime: sortPeriod(
        Array.from(testsTrend.entries()).map(([period, value]) => ({ period, value })),
      ),
      departmentWorkloadTrend,
      departmentKeys: topDepartmentNames,
    },
    drilldownRows,
  };
}
