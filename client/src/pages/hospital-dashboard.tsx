import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  Minus,
  BarChart3,
  Stethoscope,
  Pill,
  Bird,
  Activity,
  AlertTriangle,
  Info,
  Sparkles,
  ChevronDown,
  Users,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import { cn } from "@/lib/utils";

// ---- Types (mirror server/hospital-dashboard-analytics.ts payload) ---------

type KV = { name: string; value: number };
type VitalSummary = {
  name: string;
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
};

type HospitalDrilldownRow = {
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

type KpiTile = {
  id: string;
  label: string;
  value: number;
  prior: number;
  deltaPct: number | null;
  deltaAbs: number;
  format: "int" | "float2" | "pct";
  hint?: string;
  sparkline: number[];
  improvement: "up" | "down" | "neutral";
};

type Insight = {
  id: string;
  severity: "info" | "warning" | "alert";
  headline: string;
  supporting?: string;
};

type CaseloadTrendRow = { label: string; current: number; prior: number | null };

type ScorecardRow = {
  name: string;
  caseCount: number;
  caseSharePct: number;
  topDiagnosis: { name: string; count: number } | null;
  medsPerCase: number;
  testsPerCase: number;
  antibioticShare: number;
  diagnosisRecordedPct: number;
};

type Scorecards = {
  hospitalAverage: {
    medsPerCase: number;
    testsPerCase: number;
    antibioticShare: number;
    diagnosisRecordedPct: number;
  };
  vets: ScorecardRow[];
  departments: ScorecardRow[];
};

type MedicationRankingRow = {
  rank: number;
  name: string;
  count: number;
  sharePct: number;
  cumulativeSharePct: number;
  class: string;
  topDiagnosis: { name: string; count: number } | null;
  isAntibiotic: boolean;
};

type HospitalPayload = {
  period: {
    preset: string;
    label: string;
    current: { start: string; end: string; days: number };
    prior: { start: string; end: string; days: number };
  };
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
  narrative: string[];
  scorecards: Scorecards;
  dataQuality: {
    totalCases: number;
    withDiagnosisPct: number;
    withVetAssignedPct: number;
    withChiefComplaintPct: number;
    withVitalsPct: number;
  };
  caseloadTrend: {
    rows: CaseloadTrendRow[];
    currentLabel: string;
    priorLabel: string;
  };
  antibioticTrend: {
    rows: Array<{ label: string; sharePct: number; totalRx: number }>;
    currentAvgSharePct: number;
    priorAvgSharePct: number;
  };
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
    topAntibiotics: KV[];
    medicationClassMix: KV[];
    routesMix: KV[];
    avgMedsPerCase: number;
    casesWithPrescription: number;
    casesWithoutPrescription: number;
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
  drilldownRows: HospitalDrilldownRow[];
};

// Semantic color tokens: one hue = one meaning across the dashboard.
const C = {
  caseVolume: "#0ea5e9", // sky-500
  prescriptions: "#8b5cf6", // violet-500
  tests: "#14b8a6", // teal-500
  alert: "#ef4444", // red-500
  prior: "#94a3b8", // slate-400 (ghost line)
  quality: "#f59e0b", // amber-500
  neutral: "#64748b", // slate-500
};

const PIE_PALETTE = ["#0ea5e9", "#8b5cf6", "#14b8a6", "#f59e0b", "#ef4444", "#ec4899", "#22c55e"];

// ---- Formatters ------------------------------------------------------------

function formatKpiValue(value: number, format: KpiTile["format"]): string {
  if (format === "int") return Math.round(value).toLocaleString();
  if (format === "pct") return `${Math.round(value)}%`;
  return value.toFixed(2);
}

function formatDelta(kpi: KpiTile, comparePrior: boolean): string {
  if (!comparePrior) return "";
  const { deltaPct, deltaAbs, format } = kpi;
  if (deltaPct === null) {
    return deltaAbs === 0 ? "no prior data" : `+${formatKpiValue(deltaAbs, format)} (new)`;
  }
  if (deltaPct === 0 && deltaAbs === 0) return "no change";
  const sign = deltaAbs > 0 ? "+" : "";
  if (format === "pct") {
    return `${sign}${deltaAbs.toFixed(1)} pp`;
  }
  return `${sign}${deltaPct.toFixed(0)}%`;
}

function deltaTone(kpi: KpiTile): "good" | "bad" | "neutral" {
  if (kpi.deltaPct === null || kpi.deltaAbs === 0 || kpi.improvement === "neutral") {
    return "neutral";
  }
  const up = kpi.deltaAbs > 0;
  if (kpi.improvement === "up") return up ? "good" : "bad";
  return up ? "bad" : "good";
}

// ---- Tiny inline sparkline -------------------------------------------------

let sparklineGradientCounter = 0;

function Sparkline({
  values,
  color,
  width = 100,
  height = 32,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  // Unique gradient id per render to avoid SVG defs collisions when many
  // sparkline instances appear on the page at once.
  const gradId = useMemo(
    () => `spark-grad-${++sparklineGradientCounter}`,
    [],
  );
  if (!values.length) {
    return <div style={{ width, height }} className="opacity-30" />;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const coords = values.map((v, i) => {
    const x = stepX * i;
    const y = height - ((v - min) / span) * (height - 6) - 3;
    return { x, y };
  });
  const linePath = coords
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    coords.length > 1
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`
      : "";
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {areaPath ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- CSV helpers -----------------------------------------------------------

/** CSV-safe field: wraps in double quotes, escapes internal quotes, neutralises formulae. */
function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  // Formula-injection guard: prefix with a single tick when the value starts
  // with a character Excel/Sheets/Numbers would treat as a formula.
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const lines = rows.map((r) => r.map(csvCell).join(","));
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- URL state helpers -----------------------------------------------------

type UrlState = {
  preset: string;
  comparePrior: boolean;
  species: string;
  breed: string;
  sex: string;
  department: string;
  vet: string;
  medicationClass: string;
  avianOnly: boolean;
  dateFrom: string;
  dateTo: string;
};

const URL_DEFAULTS: UrlState = {
  preset: "30d",
  comparePrior: true,
  species: "all",
  breed: "all",
  sex: "all",
  department: "all",
  vet: "all",
  medicationClass: "all",
  avianOnly: false,
  dateFrom: "",
  dateTo: "",
};

function readUrlState(path: string): UrlState {
  const qi = path.indexOf("?");
  if (qi < 0) return { ...URL_DEFAULTS };
  const p = new URLSearchParams(path.slice(qi + 1));
  return {
    preset: p.get("preset") || URL_DEFAULTS.preset,
    comparePrior: (p.get("comparePrior") ?? "true") !== "false",
    species: p.get("species") || URL_DEFAULTS.species,
    breed: p.get("breed") || URL_DEFAULTS.breed,
    sex: p.get("sex") || URL_DEFAULTS.sex,
    department: p.get("department") || URL_DEFAULTS.department,
    vet: p.get("vet") || URL_DEFAULTS.vet,
    medicationClass: p.get("medicationClass") || URL_DEFAULTS.medicationClass,
    avianOnly: p.get("avianOnly") === "true",
    dateFrom: p.get("dateFrom") || URL_DEFAULTS.dateFrom,
    dateTo: p.get("dateTo") || URL_DEFAULTS.dateTo,
  };
}

function writeUrlState(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.preset !== URL_DEFAULTS.preset) p.set("preset", s.preset);
  if (s.comparePrior !== URL_DEFAULTS.comparePrior) {
    p.set("comparePrior", s.comparePrior ? "true" : "false");
  }
  if (s.species !== URL_DEFAULTS.species) p.set("species", s.species);
  if (s.breed !== URL_DEFAULTS.breed) p.set("breed", s.breed);
  if (s.sex !== URL_DEFAULTS.sex) p.set("sex", s.sex);
  if (s.department !== URL_DEFAULTS.department) p.set("department", s.department);
  if (s.vet !== URL_DEFAULTS.vet) p.set("vet", s.vet);
  if (s.medicationClass !== URL_DEFAULTS.medicationClass) {
    p.set("medicationClass", s.medicationClass);
  }
  if (s.avianOnly) p.set("avianOnly", "true");
  if (s.dateFrom) p.set("dateFrom", s.dateFrom);
  if (s.dateTo) p.set("dateTo", s.dateTo);
  return p.toString();
}

// ---- KPI tile --------------------------------------------------------------

function KpiCard({
  kpi,
  comparePrior,
  color,
  large,
}: {
  kpi: KpiTile;
  comparePrior: boolean;
  color: string;
  large?: boolean;
}) {
  const tone = deltaTone(kpi);
  const toneClasses =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : tone === "bad"
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
        : "bg-muted text-muted-foreground";
  const ToneIcon =
    tone === "good"
      ? ArrowUpRight
      : tone === "bad"
        ? ArrowDownRight
        : Minus;
  const deltaText = formatDelta(kpi, comparePrior);
  return (
    <Card>
      <CardContent className={cn("flex flex-col gap-2", large ? "p-5" : "p-4")}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {kpi.label}
        </div>
        <div className="flex items-end gap-3">
          <div className={cn("font-semibold leading-none", large ? "text-3xl" : "text-2xl")}>
            {formatKpiValue(kpi.value, kpi.format)}
          </div>
          <div className="ml-auto">
            <Sparkline values={kpi.sparkline} color={color} />
          </div>
        </div>
        {comparePrior && (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                toneClasses,
              )}
            >
              <ToneIcon className="w-3 h-3" />
              {deltaText}
            </span>
            {kpi.hint ? (
              <span className="text-[10px] text-muted-foreground">{kpi.hint}</span>
            ) : null}
          </div>
        )}
        {!comparePrior && kpi.hint ? (
          <div className="text-[10px] text-muted-foreground">{kpi.hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---- Insight card ----------------------------------------------------------

function InsightCard({ insight }: { insight: Insight }) {
  // Severity = warning | info today (no clinical "alert" thresholds applied).
  // The branch for "alert" is kept for forward-compatibility if a future
  // operational signal needs it (e.g. system-level).
  const conf =
    insight.severity === "alert" || insight.severity === "warning"
      ? {
          icon: AlertTriangle,
          border: "border-amber-200 dark:border-amber-900/60",
          bg: "bg-amber-50/60 dark:bg-amber-950/30",
          iconClass: "text-amber-600 dark:text-amber-400",
        }
      : {
          icon: Info,
          border: "border-slate-200 dark:border-slate-800",
          bg: "bg-muted/40",
          iconClass: "text-muted-foreground",
        };
  const Icon = conf.icon;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border p-3 text-xs leading-snug",
        conf.border,
        conf.bg,
      )}
    >
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", conf.iconClass)} />
      <div className="min-w-0">
        <div className="font-medium text-foreground">{insight.headline}</div>
        {insight.supporting ? (
          <div className="mt-0.5 text-muted-foreground">{insight.supporting}</div>
        ) : null}
      </div>
    </div>
  );
}

// ---- Section header --------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <div>
        <h2 className="text-sm font-semibold leading-tight">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  height = 260,
  empty,
  hint,
}: {
  title: string;
  children: React.ReactNode;
  height?: number;
  empty?: boolean;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {hint ? (
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardHeader>
      <CardContent style={{ height }}>
        {empty ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No data for the current filters.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Period selector -------------------------------------------------------

const PERIOD_PRESETS: Array<{ value: string; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "qtd", label: "Quarter to date" },
  { value: "ytd", label: "Year to date" },
  { value: "12m", label: "Last 12 months" },
];

// ---- Page ------------------------------------------------------------------

export default function HospitalDashboardPage() {
  // Initial state is seeded from the URL so bookmarked / shared dashboard
  // views are restored on load.
  const [path, setLocation] = useLocation();
  const initialUrlState = useMemo(() => readUrlState(path), []);
  const [preset, setPreset] = useState(initialUrlState.preset);
  const [comparePrior, setComparePrior] = useState(initialUrlState.comparePrior);
  const [groupBy] = useState("day");
  const [species, setSpecies] = useState(initialUrlState.species);
  const [breed, setBreed] = useState(initialUrlState.breed);
  const [sex, setSex] = useState(initialUrlState.sex);
  const [department, setDepartment] = useState(initialUrlState.department);
  const [vet, setVet] = useState(initialUrlState.vet);
  const [medicationClass, setMedicationClass] = useState(
    initialUrlState.medicationClass,
  );
  const [avianOnly, setAvianOnly] = useState(initialUrlState.avianOnly);
  const [dateFrom, setDateFrom] = useState(initialUrlState.dateFrom);
  const [dateTo, setDateTo] = useState(initialUrlState.dateTo);
  const [showCustomRange, setShowCustomRange] = useState(
    initialUrlState.preset === "custom" ||
      Boolean(initialUrlState.dateFrom || initialUrlState.dateTo),
  );
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<
    "date" | "ownerName" | "species" | "attendingVet" | "department" | "tests" | "meds"
  >("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Sync state back to URL (replace, so back button doesn't get spammed).
  useEffect(() => {
    const basePath = path.split("?")[0];
    const qs = writeUrlState({
      preset,
      comparePrior,
      species,
      breed,
      sex,
      department,
      vet,
      medicationClass,
      avianOnly,
      dateFrom,
      dateTo,
    });
    const next = qs ? `${basePath}?${qs}` : basePath;
    if (typeof window !== "undefined") {
      const current = window.location.hash.replace(/^#/, "");
      if (current === next) return;
    }
    setLocation(next, { replace: true });
  }, [
    preset,
    comparePrior,
    species,
    breed,
    sex,
    department,
    vet,
    medicationClass,
    avianOnly,
    dateFrom,
    dateTo,
    path,
    setLocation,
  ]);

  const { data, isLoading } = useQuery<HospitalPayload>({
    queryKey: [
      "/api/dashboard/hospital-summary",
      preset,
      groupBy,
      species,
      breed,
      sex,
      department,
      vet,
      medicationClass,
      avianOnly,
      dateFrom,
      dateTo,
      comparePrior,
    ],
    queryFn: async () => {
      const q = new URLSearchParams({
        preset,
        groupBy,
        species,
        breed,
        sex,
        department,
        vet,
        medicationClass,
        avianOnly: avianOnly ? "true" : "false",
        comparePrior: comparePrior ? "true" : "false",
      });
      if (dateFrom) q.set("dateFrom", dateFrom);
      if (dateTo) q.set("dateTo", dateTo);
      const res = await apiRequest(
        "GET",
        `/api/dashboard/hospital-summary?${q.toString()}`,
      );
      return res.json();
    },
  });

  const filterChips = useMemo(() => {
    const chips: string[] = [];
    if (species !== "all") chips.push(`Species: ${species}`);
    if (breed !== "all") chips.push(`Breed: ${breed}`);
    if (sex !== "all") chips.push(`Sex: ${sex}`);
    if (department !== "all") chips.push(`Dept: ${department}`);
    if (vet !== "all") chips.push(`Vet: ${vet}`);
    if (medicationClass !== "all") chips.push(`Med class: ${medicationClass}`);
    if (avianOnly) chips.push("Avian only");
    return chips;
  }, [species, breed, sex, department, vet, medicationClass, avianOnly]);

  const tableRows = useMemo(() => {
    const rows = data?.drilldownRows ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          [
            r.caseNumber,
            r.ownerName,
            r.phoneNumber,
            r.address,
            r.animalName,
            r.species,
            r.breed,
            r.age,
            r.sex,
            r.attendingVet,
            r.department,
            r.chiefComplaint,
            r.diagnosis,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : rows.slice();
    // Sort client-side. `date` is the BS date string which sorts well
    // lexicographically because it's zero-padded YYYY-MM-DD.
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = (a.date || "").localeCompare(b.date || "");
          break;
        case "ownerName":
          cmp = (a.ownerName || "").localeCompare(b.ownerName || "");
          break;
        case "species":
          cmp = (a.species || "").localeCompare(b.species || "");
          break;
        case "attendingVet":
          cmp = (a.attendingVet || "").localeCompare(b.attendingVet || "");
          break;
        case "department":
          cmp = (a.department || "").localeCompare(b.department || "");
          break;
        case "tests":
          cmp = a.testsOrderedCount - b.testsOrderedCount;
          break;
        case "meds":
          cmp = a.medicationsCount - b.medicationsCount;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [data, search, sortKey, sortDir]);

  const onSort = (key: typeof sortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "tests" || key === "meds" || key === "date" ? "desc" : "asc");
    }
  };

  const exportCsv = () => {
    const header = [
      "Case number",
      "Date (BS)",
      "Owner",
      "Phone",
      "Animal",
      "Species",
      "Breed",
      "Age",
      "Sex",
      "Attending vet",
      "Department",
      "Chief complaint",
      "Diagnosis",
      "Tests ordered",
      "Medications",
    ];
    const body = tableRows.map((r) => [
      r.caseNumber,
      r.date,
      r.ownerName,
      r.phoneNumber,
      r.animalName,
      r.species,
      r.breed,
      r.age,
      r.sex,
      r.attendingVet,
      r.department,
      r.chiefComplaint,
      r.diagnosis,
      r.testsOrderedCount,
      r.medicationsCount,
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`hospital-dashboard-cases-${stamp}.csv`, [header, ...body]);
  };

  const period = data?.period;
  const periodLabel = period
    ? `${period.current.start} → ${period.current.end} · ${period.current.days} day${period.current.days === 1 ? "" : "s"}`
    : "";

  return (
    <StickyScrollPage
      maxWidthClass="max-w-[1300px]"
      bodyClassName="space-y-5"
      sticky={
        <div className="space-y-3">
          <div className="flex items-start gap-3 mb-3">
            <Link href="/new-case">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Hospital Dashboard
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                {period ? `${period.label} · ${periodLabel}` : "Hospital module · loading…"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border bg-background overflow-hidden">
              {PERIOD_PRESETS.map((p) => (
                <button
                  key={p.value}
                  className={cn(
                    "px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
                    preset === p.value && !showCustomRange
                      ? "bg-foreground text-background"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                  onClick={() => {
                    setPreset(p.value);
                    setShowCustomRange(false);
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                className={cn(
                  "px-2.5 py-1 text-xs whitespace-nowrap transition-colors border-l",
                  showCustomRange
                    ? "bg-foreground text-background"
                    : "hover:bg-muted text-muted-foreground",
                )}
                onClick={() => {
                  setShowCustomRange(true);
                  setPreset("custom");
                }}
              >
                Custom…
              </button>
            </div>
            <div className="flex items-center gap-1.5 pl-2 pr-2 border rounded-md h-7">
              <Switch
                id="compare-prior"
                checked={comparePrior}
                onCheckedChange={setComparePrior}
              />
              <Label htmlFor="compare-prior" className="text-xs cursor-pointer whitespace-nowrap">
                Compare to prior
              </Label>
            </div>
            {showCustomRange ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[140px] h-7 text-xs"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[140px] h-7 text-xs"
                />
              </div>
            ) : null}
          </div>
          <details className="border rounded-md bg-muted/20">
            <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-muted-foreground select-none flex items-center gap-1">
              <ChevronDown className="w-3 h-3" />
              Filters {filterChips.length > 0 ? `(${filterChips.length} active)` : ""}
            </summary>
            <div className="p-3 pt-0">
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={species} onValueChange={setSpecies}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="Species" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All species</SelectItem>
                    {(data?.options.species ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={breed} onValueChange={setBreed}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="Breed" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All breeds</SelectItem>
                    {(data?.options.breeds ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sex} onValueChange={setSex}>
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue placeholder="Sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sex</SelectItem>
                    {(data?.options.sex ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {(data?.options.departments ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={vet} onValueChange={setVet}>
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <SelectValue placeholder="Attending vet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vets</SelectItem>
                    {(data?.options.vets ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={medicationClass} onValueChange={setMedicationClass}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue placeholder="Medication class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All med classes</SelectItem>
                    {(data?.options.medicationClasses ?? []).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 pl-2 pr-2 border rounded-md h-8 bg-background">
                  <Switch
                    id="avian-only"
                    checked={avianOnly}
                    onCheckedChange={setAvianOnly}
                  />
                  <Label htmlFor="avian-only" className="text-xs cursor-pointer">
                    Avian only
                  </Label>
                </div>
              </div>
              {filterChips.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {filterChips.map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                      {c}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        </div>
      }
    >
      {isLoading ? (
        <DashboardSkeleton />
      ) : !data ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Could not load hospital dashboard data.
          </CardContent>
        </Card>
      ) : data.overview.totalCases === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No cases registered in this period. Try widening the date range or clearing
            filters.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* =================================================================
              TIER 0: Auto narrative — the elevator pitch
              ================================================================= */}
          {data.narrative.length > 0 ? (
            <Card className="border-l-4 border-l-sky-500/70">
              <CardContent className="p-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Period summary
                </div>
                <p className="text-[13px] leading-relaxed text-foreground/90">
                  {data.narrative.join(" ")}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* =================================================================
              TIER 1: Headline KPIs
              ================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.kpis.map((k, i) => (
              <KpiCard
                key={k.id}
                kpi={k}
                comparePrior={comparePrior}
                color={[C.caseVolume, C.caseVolume, C.prescriptions, C.quality][i] ?? C.neutral}
                large
              />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.secondaryKpis.map((k, i) => (
              <KpiCard
                key={k.id}
                kpi={k}
                comparePrior={comparePrior}
                color={[C.prescriptions, C.tests][i] ?? C.neutral}
              />
            ))}
          </div>

          {/* =================================================================
              TIER 1.5: Insights / what needs attention
              ================================================================= */}
          {data.insights.length > 0 ? (
            <>
              <SectionHeader
                icon={Sparkles}
                title="What needs attention"
                subtitle="Automatically surfaced from this period's cases."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.insights.map((i) => (
                  <InsightCard key={i.id} insight={i} />
                ))}
              </div>
            </>
          ) : null}

          {/* =================================================================
              TIER 2: Primary analytical answers
              ================================================================= */}

          {/* Caseload trend with prior-period overlay */}
          <SectionHeader
            icon={BarChart3}
            title="Caseload"
            subtitle="Daily case volume — solid is the current period, dashed is the prior period."
          />
          <ChartCard
            title="Cases per day"
            hint={`${data.caseloadTrend.currentLabel}${comparePrior ? `   vs   ${data.caseloadTrend.priorLabel}` : ""}`}
            empty={data.caseloadTrend.rows.every((r) => r.current === 0)}
            height={240}
          >
            <LineChart data={data.caseloadTrend.rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="current"
                name="This period"
                stroke={C.caseVolume}
                strokeWidth={2}
                dot={false}
              />
              {comparePrior ? (
                <Line
                  type="monotone"
                  dataKey="prior"
                  name="Prior period"
                  stroke={C.prior}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                />
              ) : null}
            </LineChart>
          </ChartCard>

          {/* Workload & prescribing scorecards — vet + department breakdown */}
          <SectionHeader
            icon={Users}
            title="Workload & prescribing by clinician"
            subtitle="Top vets and departments — each row compared against the hospital average."
          />
          <div className="grid grid-cols-1 gap-4">
            <ScorecardTable
              title="Top attending vets"
              rows={data.scorecards.vets}
              averages={data.scorecards.hospitalAverage}
              filterValue={vet}
              onFilter={(name) => setVet(name)}
              activeColor={C.caseVolume}
            />
            <ScorecardTable
              title="Top departments"
              rows={data.scorecards.departments}
              averages={data.scorecards.hospitalAverage}
              filterValue={department}
              onFilter={(name) => setDepartment(name)}
              activeColor={C.tests}
            />
          </div>

          {/* Clinical signal — complaints + diagnoses (no clinical thresholds applied) */}
          <SectionHeader
            icon={Stethoscope}
            title="Clinical signal"
            subtitle="What patients are presenting with and what they are being diagnosed with."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Top chief complaints"
              empty={data.clinical.topChiefComplaints.length === 0}
              height={240}
            >
              <BarChart
                data={data.clinical.topChiefComplaints.slice(0, 6)}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill={C.caseVolume} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard
              title="Top diagnoses"
              empty={data.clinical.topDiagnoses.length === 0}
              height={240}
            >
              <BarChart data={data.clinical.topDiagnoses.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill={C.tests} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>
          </div>

          {/* Prescribing patterns — antibiotic stewardship + class mix */}
          <SectionHeader
            icon={Pill}
            title="Prescribing patterns"
            subtitle="Antibiotic stewardship and therapeutic-class mix."
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <ChartCard
                title="Antibiotic share of prescriptions"
                hint={
                  comparePrior
                    ? `Current avg ${data.antibioticTrend.currentAvgSharePct.toFixed(0)}% · Prior avg ${data.antibioticTrend.priorAvgSharePct.toFixed(0)}%`
                    : `Avg ${data.antibioticTrend.currentAvgSharePct.toFixed(0)}%`
                }
                empty={data.antibioticTrend.rows.every((r) => r.totalRx === 0)}
                height={240}
              >
                <LineChart data={data.antibioticTrend.rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    interval="preserveStartEnd"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v: number, key) =>
                      key === "sharePct"
                        ? [`${Number(v).toFixed(1)}%`, "Antibiotic share"]
                        : [v, key]
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="sharePct"
                    stroke={C.alert}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartCard>
            </div>
            <div className="lg:col-span-2">
              <ChartCard
                title="Prescriptions by class"
                empty={data.therapeutics.medicationClassMix.length === 0}
                height={240}
              >
                <PieChart>
                  <Pie
                    data={data.therapeutics.medicationClassMix.slice(0, 6)}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={80}
                    label={(entry) => `${entry.name}`}
                  >
                    {data.therapeutics.medicationClassMix.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ChartCard>
            </div>
          </div>
          <ChartCard
            title="Top antibiotics prescribed"
            hint={
              data.therapeutics.topAntibiotics.length > 0
                ? "Medications whose catalog class is marked as antibiotic / antibacterial."
                : undefined
            }
            empty={data.therapeutics.topAntibiotics.length === 0}
            height={Math.max(220, data.therapeutics.topAntibiotics.length * 28 + 60)}
          >
            <BarChart
              data={data.therapeutics.topAntibiotics.slice(0, 10)}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill={C.alert} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartCard>

          {/* Medication-ranking Pareto: bars = count, line = cumulative %.
              The reference line at 80% answers "how few drugs cover most of
              the prescribing?" — the canonical question for a procurement /
              stewardship audit. */}
          <ParetoMedicationsCard
            rows={data.therapeutics.medicationRanking}
            comparePrior={comparePrior}
          />

          {/* Data quality */}
          <SectionHeader
            icon={Activity}
            title="Data quality"
            subtitle="How completely the hospital form is being filled in."
          />
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <QualityBar
                  label="Diagnosis recorded"
                  pct={data.dataQuality.withDiagnosisPct}
                />
                <QualityBar
                  label="Vet assigned"
                  pct={data.dataQuality.withVetAssignedPct}
                />
                <QualityBar
                  label="Chief complaint"
                  pct={data.dataQuality.withChiefComplaintPct}
                />
                <QualityBar
                  label="Vitals captured"
                  pct={data.dataQuality.withVitalsPct}
                />
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Computed across {data.dataQuality.totalCases.toLocaleString()} cases in
                this period. Encourage attending vets to fill out the fields with the
                lowest completeness.
              </p>
            </CardContent>
          </Card>

          {/* Avian (conditional) */}
          {data.avian.hasAvianData ? (
            <>
              <SectionHeader
                icon={Bird}
                title="Avian / poultry"
                subtitle="Flock burden, mortality, and supplier patterns."
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SimpleStat label="Avian cases" value={data.avian.avianCases} />
                <SimpleStat label="Total flock size" value={data.avian.totalFlock} />
                <SimpleStat label="Total mortality" value={data.avian.totalMortality} />
                <SimpleStat
                  label="Mortality rate"
                  value={`${data.avian.mortalityRatePct.toFixed(2)}%`}
                />
              </div>
              {(data.avian.topHatcheries.length > 0 ||
                data.avian.topFeedSuppliers.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard
                    title="Top hatcheries"
                    empty={data.avian.topHatcheries.length === 0}
                    height={220}
                  >
                    <BarChart
                      data={data.avian.topHatcheries.slice(0, 5)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={130}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.caseVolume} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartCard>
                  <ChartCard
                    title="Top feed suppliers"
                    empty={data.avian.topFeedSuppliers.length === 0}
                    height={220}
                  >
                    <BarChart
                      data={data.avian.topFeedSuppliers.slice(0, 5)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={130}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.quality} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartCard>
                </div>
              )}
            </>
          ) : null}

          {/* =================================================================
              TIER 3: Long-tail details, collapsed
              ================================================================= */}
          <Accordion type="multiple" className="border-t pt-2">
            <AccordionItem value="vitals" className="border-b-0">
              <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
                <span className="flex items-center gap-2">
                  <Stethoscope className="w-3.5 h-3.5 text-muted-foreground" />
                  Vitals distribution
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-3 font-medium">Vital</th>
                        <th className="py-1.5 pr-3 font-medium">Records</th>
                        <th className="py-1.5 pr-3 font-medium">Min</th>
                        <th className="py-1.5 pr-3 font-medium">P25</th>
                        <th className="py-1.5 pr-3 font-medium">Median</th>
                        <th className="py-1.5 pr-3 font-medium">P75</th>
                        <th className="py-1.5 pr-3 font-medium">Max</th>
                        <th className="py-1.5 pr-3 font-medium">Mean</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.clinical.vitals.map((v) => (
                        <tr key={v.name} className="border-t">
                          <td className="py-1.5 pr-3 font-medium">{v.name}</td>
                          <td className="py-1.5 pr-3">{v.count}</td>
                          <td className="py-1.5 pr-3">{v.count ? v.min : "—"}</td>
                          <td className="py-1.5 pr-3">{v.count ? v.p25 : "—"}</td>
                          <td className="py-1.5 pr-3">{v.count ? v.median : "—"}</td>
                          <td className="py-1.5 pr-3">{v.count ? v.p75 : "—"}</td>
                          <td className="py-1.5 pr-3">{v.count ? v.max : "—"}</td>
                          <td className="py-1.5 pr-3">{v.count ? v.mean : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="composition" className="border-b-0">
              <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
                <span className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                  Species, breed, age & weekday breakdowns
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <ChartCard
                    title="Cases by species"
                    empty={data.composition.casesBySpecies.length === 0}
                    height={220}
                  >
                    <BarChart data={data.composition.casesBySpecies.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.caseVolume} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartCard>
                  <ChartCard
                    title="Cases by age group"
                    empty={data.composition.casesByAgeGroup.length === 0}
                    height={220}
                  >
                    <BarChart data={data.composition.casesByAgeGroup}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.tests} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartCard>
                  <ChartCard
                    title="Top breeds"
                    empty={data.composition.casesByBreed.length === 0}
                    height={220}
                  >
                    <BarChart
                      data={data.composition.casesByBreed.slice(0, 8)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={130}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.quality} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartCard>
                  <ChartCard
                    title="Cases by weekday"
                    empty={data.composition.casesByWeekday.every((d) => d.value === 0)}
                    height={220}
                  >
                    <BarChart data={data.composition.casesByWeekday}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.caseVolume} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartCard>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tests" className="border-b-0">
              <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
                <span className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  Tests & diagnostics ordered
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <ChartCard
                    title="Tests suggested"
                    empty={data.clinical.testsSuggested.length === 0}
                    height={220}
                  >
                    <BarChart
                      data={data.clinical.testsSuggested.slice(0, 8)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={150}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.tests} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartCard>
                  <ChartCard
                    title="Rapid diagnostic tests"
                    empty={data.clinical.rapidDiagnosticTests.length === 0}
                    height={220}
                  >
                    <BarChart
                      data={data.clinical.rapidDiagnosticTests.slice(0, 8)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={150}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.prescriptions} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartCard>
                  <ChartCard
                    title="Enzyme panel"
                    empty={data.clinical.enzymePanelTests.length === 0}
                    height={220}
                  >
                    <BarChart
                      data={data.clinical.enzymePanelTests.slice(0, 8)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={150}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.caseVolume} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartCard>
                  <ChartCard
                    title="Imaging & labs"
                    empty={data.clinical.imagingAndLabsCounts.every((b) => b.value === 0)}
                    height={220}
                  >
                    <BarChart data={data.clinical.imagingAndLabsCounts}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill={C.tests} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartCard>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="meds" className="border-b-0">
              <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
                <span className="flex items-center gap-2">
                  <Pill className="w-3.5 h-3.5 text-muted-foreground" />
                  Prescribed medications — full ranking
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-0">
                <MedicationRankingTable
                  rows={data.therapeutics.medicationRanking}
                  medicationClassFilter={medicationClass}
                  onFilterClass={(klass) => setMedicationClass(klass)}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="drilldown" className="border-b-0">
              <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
                <span className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  Case drill-down ({data.overview.totalCases.toLocaleString()} cases)
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-0">
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    placeholder="Search owner, animal, vet, complaint, diagnosis…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={exportCsv}
                    disabled={tableRows.length === 0}
                  >
                    <Download className="w-3 h-3" />
                    Export CSV
                  </Button>
                </div>
                <div className="overflow-x-auto border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/40 text-left">
                      <tr>
                        <th className="py-2 px-2">Case</th>
                        <SortableTh
                          label="Date"
                          active={sortKey === "date"}
                          dir={sortDir}
                          onClick={() => onSort("date")}
                        />
                        <SortableTh
                          label="Owner"
                          active={sortKey === "ownerName"}
                          dir={sortDir}
                          onClick={() => onSort("ownerName")}
                        />
                        <th className="py-2 px-2">Animal</th>
                        <SortableTh
                          label="Species"
                          active={sortKey === "species"}
                          dir={sortDir}
                          onClick={() => onSort("species")}
                        />
                        <SortableTh
                          label="Vet"
                          active={sortKey === "attendingVet"}
                          dir={sortDir}
                          onClick={() => onSort("attendingVet")}
                        />
                        <SortableTh
                          label="Department"
                          active={sortKey === "department"}
                          dir={sortDir}
                          onClick={() => onSort("department")}
                        />
                        <th className="py-2 px-2">Complaint</th>
                        <th className="py-2 px-2">Diagnosis</th>
                        <SortableTh
                          label="Tests"
                          align="right"
                          active={sortKey === "tests"}
                          dir={sortDir}
                          onClick={() => onSort("tests")}
                        />
                        <SortableTh
                          label="Meds"
                          align="right"
                          active={sortKey === "meds"}
                          dir={sortDir}
                          onClick={() => onSort("meds")}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.slice(0, 200).map((r) => (
                        <tr key={r.caseId} className="border-t">
                          <td className="py-1.5 px-2">
                            <Link
                              href={`/new-case/cases/${r.caseId}?scope=hospital`}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {r.caseNumber}
                            </Link>
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">{r.date}</td>
                          <td className="py-1.5 px-2">{r.ownerName}</td>
                          <td className="py-1.5 px-2">{r.animalName || "—"}</td>
                          <td className="py-1.5 px-2">{r.species}</td>
                          <td className="py-1.5 px-2">{r.attendingVet}</td>
                          <td className="py-1.5 px-2">{r.department}</td>
                          <td
                            className="py-1.5 px-2 max-w-[12rem] truncate"
                            title={r.chiefComplaint}
                          >
                            {r.chiefComplaint || "—"}
                          </td>
                          <td
                            className="py-1.5 px-2 max-w-[12rem] truncate"
                            title={r.diagnosis}
                          >
                            {r.diagnosis || "—"}
                          </td>
                          <td className="py-1.5 px-2 text-right">{r.testsOrderedCount}</td>
                          <td className="py-1.5 px-2 text-right">{r.medicationsCount}</td>
                        </tr>
                      ))}
                      {tableRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={11}
                            className="py-6 text-center text-xs text-muted-foreground"
                          >
                            No cases match the current filters.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {tableRows.length > 200 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Showing the first 200 of {tableRows.length.toLocaleString()} matching
                    rows. Use Export CSV for the full set.
                  </p>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </StickyScrollPage>
  );
}

// ---- Small primitives ------------------------------------------------------

function QualityBar({ label, pct }: { label: string; pct: number }) {
  const tone =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", tone)}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

function SimpleStat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
          {label}
        </div>
        <div className="mt-1 text-xl font-semibold leading-none">{value}</div>
      </CardContent>
    </Card>
  );
}

// ---- Scorecard table -------------------------------------------------------

/**
 * Renders a comparison-aware table for vets or departments.
 *
 * Each row shows the bucket's raw numbers plus a small "vs avg" indicator on
 * the metrics where above/below the hospital average is interpretable:
 *  - Antibiotic share: above avg = amber (stewardship concern)
 *  - Diagnosis recorded %: below avg = amber (data-quality gap)
 *  - Meds / case, Tests / case: neutral (no good/bad direction)
 */
function ScorecardTable({
  title,
  rows,
  averages,
  filterValue,
  onFilter,
  activeColor,
}: {
  title: string;
  rows: ScorecardRow[];
  averages: Scorecards["hospitalAverage"];
  filterValue: string;
  onFilter: (name: string) => void;
  activeColor: string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No data for the current filters.</p>
        </CardContent>
      </Card>
    );
  }
  const maxCases = Math.max(...rows.map((r) => r.caseCount), 1);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-baseline justify-between">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <span className="text-[10px] text-muted-foreground">
          Hospital avg · {averages.medsPerCase.toFixed(2)} meds, {averages.testsPerCase.toFixed(2)} tests,
          {" "}{averages.antibioticShare.toFixed(0)}% abx, {averages.diagnosisRecordedPct.toFixed(0)}% dx
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Name</th>
                <th className="py-1.5 pr-2 font-medium">Cases</th>
                <th className="py-1.5 pr-3 font-medium">Top diagnosis</th>
                <th className="py-1.5 pr-2 font-medium text-right">Meds / case</th>
                <th className="py-1.5 pr-2 font-medium text-right">Tests / case</th>
                <th className="py-1.5 pr-2 font-medium text-right">Abx share</th>
                <th className="py-1.5 pr-2 font-medium text-right">Dx recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isActive = filterValue === r.name;
                return (
                  <tr
                    key={r.name}
                    className={cn(
                      "border-t cursor-pointer transition-colors",
                      isActive ? "bg-muted/60" : "hover:bg-muted/30",
                    )}
                    onClick={() => onFilter(isActive ? "all" : r.name)}
                    title={
                      isActive
                        ? "Click to clear this filter"
                        : `Click to filter the dashboard by ${r.name}`
                    }
                  >
                    <td className="py-1.5 pr-2">
                      <div className="flex flex-col">
                        <span className={cn("font-medium", isActive && "text-foreground")}>
                          {r.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {r.caseSharePct.toFixed(0)}% of caseload
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">
                          {r.caseCount}
                        </span>
                        <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${(r.caseCount / maxCases) * 100}%`,
                              backgroundColor: activeColor,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 max-w-[14rem] truncate">
                      {r.topDiagnosis ? (
                        <span>
                          {r.topDiagnosis.name}{" "}
                          <span className="text-muted-foreground">
                            ({r.topDiagnosis.count})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <CompareCell
                      value={r.medsPerCase}
                      average={averages.medsPerCase}
                      direction="neutral"
                      format="float"
                    />
                    <CompareCell
                      value={r.testsPerCase}
                      average={averages.testsPerCase}
                      direction="neutral"
                      format="float"
                    />
                    <CompareCell
                      value={r.antibioticShare}
                      average={averages.antibioticShare}
                      direction="down"
                      format="pct"
                    />
                    <CompareCell
                      value={r.diagnosisRecordedPct}
                      average={averages.diagnosisRecordedPct}
                      direction="up"
                      format="pct"
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Click a row to filter the dashboard by that {title.toLowerCase().includes("vet") ? "vet" : "department"}.
        </p>
      </CardContent>
    </Card>
  );
}

function CompareCell({
  value,
  average,
  direction,
  format,
}: {
  value: number;
  average: number;
  /** Which way "better" lies. up = higher is good, down = lower is good, neutral = no judgement. */
  direction: "up" | "down" | "neutral";
  format: "pct" | "float";
}) {
  const formatted = format === "pct" ? `${value.toFixed(0)}%` : value.toFixed(2);
  // Threshold to avoid flagging tiny noise — only flag when at least 10%
  // (relative) or 5pp (absolute for percentages) above/below the average.
  const rel = average > 0 ? (value - average) / Math.abs(average) : 0;
  const abs = value - average;
  const meaningful = format === "pct" ? Math.abs(abs) >= 5 : Math.abs(rel) >= 0.1;
  let tone: "good" | "warn" | "neutral" = "neutral";
  if (meaningful && direction !== "neutral") {
    if (direction === "up") {
      tone = abs > 0 ? "good" : "warn";
    } else {
      tone = abs < 0 ? "good" : "warn";
    }
  }
  const showArrow = meaningful && direction !== "neutral";
  const ArrowIcon = abs > 0 ? ArrowUp : ArrowDown;
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : "text-foreground";
  return (
    <td className={cn("py-1.5 pr-2 text-right tabular-nums", toneClass)}>
      <span className="inline-flex items-center gap-0.5 justify-end">
        {showArrow ? <ArrowIcon className="w-3 h-3" /> : null}
        {formatted}
      </span>
    </td>
  );
}

// ---- Pareto chart for medication ranking ----------------------------------

/**
 * Pareto chart showing prescription concentration: bars are raw counts
 * (left axis) and the overlay line is the running cumulative share % (right
 * axis). The 80% reference line is the classic readout for "top N drugs
 * cover 80% of prescribing" — useful for procurement & stewardship audits.
 *
 * Capped at the top 15 rows so the chart stays scannable; the ranked table
 * below the chart shows the full set.
 */
function ParetoMedicationsCard({
  rows,
  comparePrior,
}: {
  rows: MedicationRankingRow[];
  comparePrior: boolean;
}) {
  void comparePrior;
  const visible = rows.slice(0, 15);
  if (visible.length === 0) {
    return (
      <ChartCard title="Top medications — Pareto" empty height={260}>
        <div />
      </ChartCard>
    );
  }
  // Find the rank that first crosses the 80% line so we can call it out.
  const cross = visible.findIndex((r) => r.cumulativeSharePct >= 80);
  const crossLabel =
    cross >= 0
      ? `${cross + 1} drug${cross === 0 ? "" : "s"} account${cross === 0 ? "s" : ""} for ~80% of prescriptions`
      : "Prescribing is spread across more than the top 15 medications";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Top medications — Pareto
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Bars = number of prescriptions, line = cumulative % of all
          prescriptions. {crossLabel}.
        </p>
      </CardHeader>
      <CardContent style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visible}
            margin={{ top: 8, right: 16, left: 0, bottom: 64 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={60}
            />
            <YAxis
              yAxisId="count"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              width={36}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11 }}
              width={40}
            />
            <Tooltip
              formatter={(value: number | string, key) => {
                if (key === "count") return [value, "Prescriptions"];
                if (key === "cumulativeSharePct") {
                  return [`${Number(value).toFixed(1)}%`, "Cumulative share"];
                }
                return [value, key];
              }}
            />
            <Legend
              verticalAlign="top"
              height={20}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Bar
              yAxisId="count"
              dataKey="count"
              name="Prescriptions"
              fill={C.prescriptions}
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="cumulativeSharePct"
              name="Cumulative %"
              stroke={C.alert}
              strokeWidth={2}
              dot={{ r: 3, fill: C.alert }}
            />
            <ReferenceLine
              yAxisId="pct"
              y={80}
              stroke={C.neutral}
              strokeDasharray="4 4"
              label={{
                value: "80%",
                position: "right",
                fontSize: 10,
                fill: "currentColor",
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---- Medication ranking table (rank, count, share, class, top dx) ---------

type MedSortKey = "rank" | "name" | "count" | "sharePct" | "class";

function MedicationRankingTable({
  rows,
  medicationClassFilter,
  onFilterClass,
}: {
  rows: MedicationRankingRow[];
  medicationClassFilter: string;
  onFilterClass: (klass: string) => void;
}) {
  const [sortKey, setSortKey] = useState<MedSortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const out = rows.slice();
    out.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "rank":
          cmp = a.rank - b.rank;
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "count":
          cmp = a.count - b.count;
          break;
        case "sharePct":
          cmp = a.sharePct - b.sharePct;
          break;
        case "class":
          cmp = a.class.localeCompare(b.class);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const onSort = (key: MedSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "count" || key === "sharePct" ? "desc" : "asc");
    }
  };

  const exportCsv = () => {
    const header = [
      "Rank",
      "Medicine",
      "Prescriptions",
      "% of all prescriptions",
      "Cumulative %",
      "Class",
      "Top diagnosis",
      "Top diagnosis count",
    ];
    const body = sorted.map((r) => [
      r.rank,
      r.name,
      r.count,
      r.sharePct,
      r.cumulativeSharePct,
      r.class,
      r.topDiagnosis?.name ?? "",
      r.topDiagnosis?.count ?? "",
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`hospital-medications-${stamp}.csv`, [header, ...body]);
  };

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-xs text-muted-foreground">
          No prescriptions recorded for the current filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-semibold">
            Prescribed medications ranking
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Click a class chip to filter the dashboard. Tap a column header
            to sort.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-xs"
          onClick={exportCsv}
          disabled={sorted.length === 0}
        >
          <Download className="w-3 h-3" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <SortableTh
                  label="#"
                  active={sortKey === "rank"}
                  dir={sortDir}
                  onClick={() => onSort("rank")}
                />
                <SortableTh
                  label="Medicine"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => onSort("name")}
                />
                <SortableTh
                  label="Rx"
                  align="right"
                  active={sortKey === "count"}
                  dir={sortDir}
                  onClick={() => onSort("count")}
                />
                <SortableTh
                  label="% share"
                  align="right"
                  active={sortKey === "sharePct"}
                  dir={sortDir}
                  onClick={() => onSort("sharePct")}
                />
                <th className="py-2 px-2 text-right text-muted-foreground">
                  Cum. %
                </th>
                <SortableTh
                  label="Class"
                  active={sortKey === "class"}
                  dir={sortDir}
                  onClick={() => onSort("class")}
                />
                <th className="py-2 px-2 text-muted-foreground">
                  Top diagnosis
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const classIsActive =
                  medicationClassFilter !== "all" &&
                  medicationClassFilter === r.class;
                return (
                  <tr key={r.name} className="border-t">
                    <td className="py-1.5 px-2 tabular-nums text-muted-foreground">
                      {r.rank}
                    </td>
                    <td className="py-1.5 px-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{r.name}</span>
                        {r.isAntibiotic ? (
                          <Badge
                            variant="secondary"
                            className="text-[9px] font-medium px-1 py-0 leading-none h-4"
                          >
                            abx
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                      {r.count}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <div className="w-16 h-1 rounded-full bg-muted overflow-hidden hidden sm:block">
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.max(2, Math.min(100, r.sharePct))}%`,
                              backgroundColor: r.isAntibiotic
                                ? C.alert
                                : C.prescriptions,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                        <span>{r.sharePct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                      {r.cumulativeSharePct.toFixed(0)}%
                    </td>
                    <td className="py-1.5 px-2">
                      {r.class === "Unclassified" ? (
                        <span className="text-muted-foreground italic">
                          Unclassified
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onFilterClass(
                              classIsActive ? "all" : r.class,
                            )
                          }
                          title={
                            classIsActive
                              ? "Click to clear class filter"
                              : `Click to filter the dashboard by ${r.class}`
                          }
                          className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] transition-colors",
                            classIsActive
                              ? "bg-foreground text-background border-foreground"
                              : "hover:bg-muted",
                          )}
                        >
                          {r.class}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 px-2 max-w-[16rem] truncate">
                      {r.topDiagnosis ? (
                        <span>
                          {r.topDiagnosis.name}{" "}
                          <span className="text-muted-foreground">
                            ({r.topDiagnosis.count})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Ranking is capped at the top 25 medications. Cumulative % is
          computed off the full prescription total for the period.
        </p>
      </CardContent>
    </Card>
  );
}

// ---- Sortable column header -----------------------------------------------

function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "py-2 px-2 select-none cursor-pointer hover:text-foreground transition-colors",
        align === "right" && "text-right",
        active ? "text-foreground" : "text-muted-foreground",
      )}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : null}
      </span>
    </th>
  );
}

// ---- Loading skeleton ------------------------------------------------------

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted/60 animate-pulse",
        className,
      )}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <SkeletonBlock className="h-16" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </div>
      <SkeletonBlock className="h-72" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
    </div>
  );
}
