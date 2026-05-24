import { useMemo, useState } from "react";
import { Link } from "wouter";
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
  AreaChart,
  Area,
} from "recharts";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StickyScrollPage } from "@/components/sticky-scroll-page";

type KV = { name: string; value: number };
type DashboardPayload = {
  options: {
    species: string[];
    breeds: string[];
    sex: string[];
    sampleTypes: string[];
    organisms: string[];
    antibiotics: string[];
  };
  overview: {
    totalRegisteredCases: number;
    totalSamples: number;
    totalCasesWithOrganismEntered: number;
    totalAntibioticTestRecords: number;
    totalDistinctOrganisms: number;
    totalDistinctAntibiotics: number;
    overallSusceptiblePct: number;
    overallIntermediatePct: number;
    overallResistantPct: number;
    mostCommonSpecies: string;
    mostCommonSampleType: string;
    mostCommonOrganism: string;
    mostFrequentlyUsedAntibiotic: string;
  };
  animalProfile: {
    casesBySpecies: KV[];
    casesByBreed: KV[];
    casesBySex: KV[];
    casesByAgeGroup: KV[];
  };
  sampleProfile: {
    samplesBySampleType: KV[];
    samplesOverTime: Array<{ period: string; value: number }>;
    sampleTypeTrend: Array<Record<string, string | number>>;
  };
  organismProfile: {
    casesWithOrganism: number;
    casesWithoutOrganism: number;
    topOrganismsIsolated: KV[];
    organismsOverTime: Array<Record<string, string | number>>;
  };
  antibioticProfile: {
    overallSirDistribution: KV[];
    sirByAntibiotic: Array<{ name: string; susceptible: number; intermediate: number; resistant: number }>;
  };
  antibiogram: {
    antibiotics: string[];
    matrix: Array<{ organism: string; cells: Array<{ antibiotic: string; tested: number; susceptiblePct: number; resistantPct: number; lowData: boolean }> }>;
  };
  trends: {
    totalCasesOverTime: Array<{ period: string; value: number }>;
    sirTrend: Array<{ period: string; susceptible: number; intermediate: number; resistant: number }>;
  };
  drilldownRows: Array<{
    caseId: number;
    caseNumber: string;
    ownerName: string;
    phoneNumber: string;
    address: string;
    animalName: string;
    species: string;
    breed: string;
    age: string;
    sex: string;
    sampleType: string;
    sampleCollectionDate: string;
    organismIsolated: string;
    antibiotic: string;
    resultCategory: "S" | "I" | "R";
  }>;
};

const COLORS = ["#16a34a", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#14b8a6"];
type DashboardScope = "ast" | "hospital";

const PRESET_LABELS: Record<string, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
  all: "All time",
};

const GROUP_LABELS: Record<string, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-bold">{value}</CardContent>
    </Card>
  );
}

export default function DashboardPage({
  scope = "ast",
  title = "AMR Statistical Dashboard",
  subtitle = "Veterinary AST surveillance dashboard",
  backHref = "/",
}: {
  scope?: DashboardScope;
  title?: string;
  subtitle?: string;
  backHref?: string;
}) {
  const scopeLabel = scope === "hospital" ? "Hospital-only data" : "AST-only data";
  const [preset, setPreset] = useState("all");
  const [groupBy, setGroupBy] = useState("month");
  const [species, setSpecies] = useState("all");
  const [breed, setBreed] = useState("all");
  const [sex, setSex] = useState("all");
  const [sampleType, setSampleType] = useState("all");
  const [organism, setOrganism] = useState("all");
  const [antibiotic, setAntibiotic] = useState("all");
  const [result, setResult] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minTested, setMinTested] = useState("5");
  const [search, setSearch] = useState("");
  const [matrixMode, setMatrixMode] = useState<"susceptiblePct" | "resistantPct" | "tested">("resistantPct");

  const { data, isLoading } = useQuery<DashboardPayload>({
    queryKey: ["/api/dashboard/summary", scope, preset, groupBy, species, breed, sex, sampleType, organism, antibiotic, result, dateFrom, dateTo, minTested],
    queryFn: async () => {
      const q = new URLSearchParams({ scope, preset, groupBy, species, breed, sex, sampleType, organism, antibiotic, result, minTested });
      if (dateFrom) q.set("dateFrom", dateFrom);
      if (dateTo) q.set("dateTo", dateTo);
      const res = await apiRequest("GET", `/api/dashboard/summary?${q.toString()}`);
      return res.json();
    },
  });

  const sampleTypeKeys = useMemo(() => (data?.sampleProfile.samplesBySampleType ?? []).map((r) => r.name).slice(0, 6), [data]);
  const tableRows = useMemo(() => {
    const rows = data?.drilldownRows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.caseNumber, r.ownerName, r.phoneNumber, r.address, r.animalName, r.species, r.breed, r.sex, r.sampleType, r.organismIsolated, r.antibiotic, r.resultCategory].join(" ").toLowerCase().includes(q));
  }, [data, search]);

  const dashboardActiveFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (preset !== "all") chips.push(`Time: ${PRESET_LABELS[preset] ?? preset}`);
    if (groupBy !== "month") chips.push(`Group: ${GROUP_LABELS[groupBy] ?? groupBy}`);
    if (species !== "all") chips.push(`Species: ${species}`);
    if (breed !== "all") chips.push(`Breed: ${breed}`);
    if (sex !== "all") chips.push(`Sex: ${sex}`);
    if (sampleType !== "all") chips.push(`Sample: ${sampleType}`);
    if (organism !== "all") chips.push(`Organism: ${organism}`);
    if (antibiotic !== "all") chips.push(`Antibiotic: ${antibiotic}`);
    if (result !== "all") {
      const r =
        result === "S" ? "Susceptible" : result === "I" ? "Intermediate" : result === "R" ? "Resistant" : result;
      chips.push(`Result: ${r}`);
    }
    if (dateFrom) chips.push(`From: ${dateFrom}`);
    if (dateTo) chips.push(`To: ${dateTo}`);
    if (minTested !== "5") chips.push(`Min tested: ${minTested}`);
    if (matrixMode !== "resistantPct") {
      chips.push(
        matrixMode === "susceptiblePct" ? "Matrix: % susceptible" : "Matrix: number tested",
      );
    }
    return chips;
  }, [
    preset,
    groupBy,
    species,
    breed,
    sex,
    sampleType,
    organism,
    antibiotic,
    result,
    dateFrom,
    dateTo,
    minTested,
    matrixMode,
  ]);

  return (
    <StickyScrollPage
      maxWidthClass="max-w-[1300px]"
      bodyClassName="space-y-6"
      sticky={
        <div className="space-y-3">
        <div className="flex items-start sm:items-center gap-3 mb-3">
          <Link href={backHref}><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" /> {title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Scope: {scopeLabel}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-2 min-w-max pr-1">
            <Select value={preset} onValueChange={setPreset}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Preset" /></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem><SelectItem value="3m">Last 3 months</SelectItem><SelectItem value="6m">Last 6 months</SelectItem><SelectItem value="12m">Last 12 months</SelectItem><SelectItem value="all">All time</SelectItem></SelectContent></Select>
            <Select value={groupBy} onValueChange={setGroupBy}><SelectTrigger className="w-[120px]"><SelectValue placeholder="Group by" /></SelectTrigger><SelectContent><SelectItem value="day">Day</SelectItem><SelectItem value="week">Week</SelectItem><SelectItem value="month">Month</SelectItem><SelectItem value="year">Year</SelectItem></SelectContent></Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
            <Select value={species} onValueChange={setSpecies}><SelectTrigger className="w-[140px]"><SelectValue placeholder="Species" /></SelectTrigger><SelectContent><SelectItem value="all">All species</SelectItem>{(data?.options.species ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={breed} onValueChange={setBreed}><SelectTrigger className="w-[140px]"><SelectValue placeholder="Breed" /></SelectTrigger><SelectContent><SelectItem value="all">All breeds</SelectItem>{(data?.options.breeds ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={sex} onValueChange={setSex}><SelectTrigger className="w-[120px]"><SelectValue placeholder="Sex" /></SelectTrigger><SelectContent><SelectItem value="all">All sex</SelectItem>{(data?.options.sex ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={sampleType} onValueChange={setSampleType}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Sample type" /></SelectTrigger><SelectContent><SelectItem value="all">All sample types</SelectItem>{(data?.options.sampleTypes ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={organism} onValueChange={setOrganism}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Organism" /></SelectTrigger><SelectContent><SelectItem value="all">All organisms</SelectItem>{(data?.options.organisms ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={antibiotic} onValueChange={setAntibiotic}><SelectTrigger className="w-[160px]"><SelectValue placeholder="Antibiotic" /></SelectTrigger><SelectContent><SelectItem value="all">All antibiotics</SelectItem>{(data?.options.antibiotics ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
            <Select value={result} onValueChange={setResult}><SelectTrigger className="w-[130px]"><SelectValue placeholder="Result" /></SelectTrigger><SelectContent><SelectItem value="all">All result</SelectItem><SelectItem value="S">Susceptible</SelectItem><SelectItem value="I">Intermediate</SelectItem><SelectItem value="R">Resistant</SelectItem></SelectContent></Select>
            <Select value={minTested} onValueChange={setMinTested}><SelectTrigger className="w-[140px]"><SelectValue placeholder="Min tested" /></SelectTrigger><SelectContent><SelectItem value="1">Min tested 1</SelectItem><SelectItem value="5">Min tested 5</SelectItem><SelectItem value="10">Min tested 10</SelectItem><SelectItem value="30">Min tested 30</SelectItem></SelectContent></Select>
            <Select value={matrixMode} onValueChange={(v) => setMatrixMode(v as "susceptiblePct" | "resistantPct" | "tested")}><SelectTrigger className="w-[170px]"><SelectValue placeholder="Antibiogram mode" /></SelectTrigger><SelectContent><SelectItem value="susceptiblePct">% susceptible</SelectItem><SelectItem value="resistantPct">% resistant</SelectItem><SelectItem value="tested">Number tested</SelectItem></SelectContent></Select>
          </div>
        </div>
        {dashboardActiveFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
              Filters applied
            </span>
            {dashboardActiveFilterChips.map((label, i) => (
              <Badge key={`${i}-${label}`} variant="secondary" className="text-[10px] font-normal max-w-[14rem] truncate">
                {label}
              </Badge>
            ))}
          </div>
        )}
        </div>
      }
    >

      {isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading dashboard...</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Metric label="Total registered cases" value={data?.overview.totalRegisteredCases ?? 0} />
            <Metric label="Total samples" value={data?.overview.totalSamples ?? 0} />
            <Metric label="Cases with organism" value={data?.overview.totalCasesWithOrganismEntered ?? 0} />
            <Metric label="Antibiotic records" value={data?.overview.totalAntibioticTestRecords ?? 0} />
            <Metric label="Distinct organisms" value={data?.overview.totalDistinctOrganisms ?? 0} />
            <Metric label="Distinct antibiotics" value={data?.overview.totalDistinctAntibiotics ?? 0} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Metric label="Overall S%" value={`${data?.overview.overallSusceptiblePct ?? 0}%`} />
            <Metric label="Overall I%" value={`${data?.overview.overallIntermediatePct ?? 0}%`} />
            <Metric label="Overall R%" value={`${data?.overview.overallResistantPct ?? 0}%`} />
            <Metric label="Most common species" value={data?.overview.mostCommonSpecies ?? "N/A"} />
            <Metric label="Most common sample" value={data?.overview.mostCommonSampleType ?? "N/A"} />
            <Metric label="Most used antibiotic" value={data?.overview.mostFrequentlyUsedAntibiotic ?? "N/A"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-base">Cases by species</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.animalProfile.casesBySpecies ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#0ea5e9" /></BarChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Cases by breed</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.animalProfile.casesByBreed ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#8b5cf6" /></BarChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Cases by sex</CardTitle></CardHeader><CardContent className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data?.animalProfile.casesBySex ?? []} dataKey="value" nameKey="name" outerRadius={80} label>{(data?.animalProfile.casesBySex ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Cases by age group</CardTitle></CardHeader><CardContent className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.animalProfile.casesByAgeGroup ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#14b8a6" /></BarChart></ResponsiveContainer></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-base">Samples by sample type</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.sampleProfile.samplesBySampleType ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#0ea5e9" /></BarChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Samples over time</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={data?.sampleProfile.samplesOverTime ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" stroke="#0ea5e9" dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle className="text-base">Sample type trend over time</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.sampleProfile.sampleTypeTrend ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip />{sampleTypeKeys.map((k, i) => <Area key={k} dataKey={k} stackId="1" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} />)}</AreaChart></ResponsiveContainer></CardContent></Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-base">Cases with / without organism</CardTitle></CardHeader><CardContent className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: "With organism", value: data?.organismProfile.casesWithOrganism ?? 0 }, { name: "Without organism", value: data?.organismProfile.casesWithoutOrganism ?? 0 }]} dataKey="value" nameKey="name" outerRadius={80} label><Cell fill="#16a34a" /><Cell fill="#64748b" /></Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Top organisms isolated</CardTitle></CardHeader><CardContent className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.organismProfile.topOrganismsIsolated ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#f59e0b" /></BarChart></ResponsiveContainer></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-base">Overall S / I / R distribution</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data?.antibioticProfile.overallSirDistribution ?? []} dataKey="value" nameKey="name" outerRadius={90} label><Cell fill="#16a34a" /><Cell fill="#f59e0b" /><Cell fill="#ef4444" /></Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">S / I / R by antibiotic</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.antibioticProfile.sirByAntibiotic ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="susceptible" stackId="sir" fill="#16a34a" /><Bar dataKey="intermediate" stackId="sir" fill="#f59e0b" /><Bar dataKey="resistant" stackId="sir" fill="#ef4444" /></BarChart></ResponsiveContainer></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Antibiogram matrix</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr><th className="text-left py-2 pr-3">Organism</th>{(data?.antibiogram.antibiotics ?? []).slice(0, 12).map((ab) => <th key={ab} className="text-left py-2 pr-3">{ab}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(data?.antibiogram.matrix ?? []).slice(0, 15).map((row) => (
                      <tr key={row.organism} className="border-t">
                        <td className="py-2 pr-3">{row.organism}</td>
                        {row.cells.slice(0, 12).map((cell) => <td key={cell.antibiotic} className="py-2 pr-3" title={`tested:${cell.tested}`}>{matrixMode === "tested" ? cell.tested : matrixMode === "susceptiblePct" ? `${cell.susceptiblePct}%` : `${cell.resistantPct}%`} {cell.lowData ? "!" : ""}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-base">Total cases over time</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={data?.trends.totalCasesOverTime ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" stroke="#0ea5e9" dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">S / I / R trend</CardTitle></CardHeader><CardContent className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.trends.sirTrend ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip /><Bar dataKey="susceptible" stackId="sir" fill="#16a34a" /><Bar dataKey="intermediate" stackId="sir" fill="#f59e0b" /><Bar dataKey="resistant" stackId="sir" fill="#ef4444" /></BarChart></ResponsiveContainer></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Drill-down data table</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3"><Input placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background text-left">
                    <tr><th className="py-2 pr-3">Case ID</th><th className="py-2 pr-3">Owner</th><th className="py-2 pr-3">Phone</th><th className="py-2 pr-3">Address</th><th className="py-2 pr-3">Animal</th><th className="py-2 pr-3">Species</th><th className="py-2 pr-3">Breed</th><th className="py-2 pr-3">Age</th><th className="py-2 pr-3">Sex</th><th className="py-2 pr-3">Sample Type</th><th className="py-2 pr-3">Sample Date</th><th className="py-2 pr-3">Organism</th><th className="py-2 pr-3">Antibiotic</th><th className="py-2 pr-3">Result</th></tr>
                  </thead>
                  <tbody>
                    {tableRows.slice(0, 300).map((r, i) => (
                      <tr key={`${r.caseId}-${i}`} className="border-t">
                        <td className="py-2 pr-3"><Link href={`${scope === "hospital" ? "/new-case/cases" : "/ast-report/cases"}/${r.caseId}?scope=${scope}`}><button className="text-primary underline">{r.caseNumber}</button></Link></td>
                        <td className="py-2 pr-3">{r.ownerName}</td><td className="py-2 pr-3">{r.phoneNumber}</td><td className="py-2 pr-3">{r.address}</td><td className="py-2 pr-3">{r.animalName}</td><td className="py-2 pr-3">{r.species}</td><td className="py-2 pr-3">{r.breed}</td><td className="py-2 pr-3">{r.age}</td><td className="py-2 pr-3">{r.sex}</td><td className="py-2 pr-3">{r.sampleType}</td><td className="py-2 pr-3">{r.sampleCollectionDate}</td><td className="py-2 pr-3">{r.organismIsolated}</td><td className="py-2 pr-3">{r.antibiotic}</td><td className="py-2 pr-3">{r.resultCategory}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </StickyScrollPage>
  );
}
