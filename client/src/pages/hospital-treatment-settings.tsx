import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pill, Syringe, Clock3, Ruler } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adToBs, formatAdDate, formatBsDate } from "@/lib/nepali-date";

type FormEditLog = {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  targetKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function pickDisplayName(obj: Record<string, unknown> | null): string | null {
  if (!obj) return null;
  const name = obj.name ?? obj.Name;
  if (typeof name === "string" && name.trim()) return name.trim();
  const abbr = obj.abbreviation ?? obj.shortCode ?? obj.short_code;
  if (typeof abbr === "string" && abbr.trim()) return abbr.trim();
  return null;
}

function treatmentSettingLabel(kind: string): string {
  if (kind === "medication") return "Medications";
  if (kind === "route") return "Routes of administration";
  if (kind === "frequency") return "Frequencies";
  if (kind === "dose_unit") return "Dose units";
  if (kind === "duration") return "Durations";
  return kind.replace(/_/g, " ");
}

function verbLabel(verb: string): string {
  switch (verb) {
    case "add":
      return "Added";
    case "update":
      return "Updated";
    case "delete":
      return "Deleted";
    case "move":
      return "Reordered";
    default:
      return verb;
  }
}

function summarizeTreatmentMasterChange(log: FormEditLog): string {
  const m = log.action.match(/^(add|update|delete|move)_treatment_(.+)$/);
  if (!m) {
    return log.action;
  }
  const [, verb, kindRaw] = m;
  const setting = treatmentSettingLabel(kindRaw);
  const nv = parseJsonObject(log.newValue);
  const ov = parseJsonObject(log.oldValue);
  const name = pickDisplayName(nv) ?? pickDisplayName(ov);
  const idHint = log.targetKey ? ` (record #${log.targetKey})` : "";

  if (verb === "move") {
    return `${verbLabel(verb)} list order in ${setting}${idHint}`;
  }
  if (name) {
    return `${verbLabel(verb)} ${name} — ${setting}${idHint}`;
  }
  return `${verbLabel(verb)} entry in ${setting}${idHint}`;
}

export default function HospitalTreatmentSettingsPage() {
  const [showLogTable, setShowLogTable] = useState(false);
  const {
    data: treatmentLogs = [],
    isError,
    error,
    isFetching,
  } = useQuery<FormEditLog[]>({
    queryKey: ["/api/admin/form-edit-logs", "treatment_master"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/form-edit-logs?scope=treatment_master");
      return res.json();
    },
    enabled: showLogTable,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="rounded-2xl border bg-card px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/new-case/settings">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Treatment Master Data Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage medication and prescription option catalogs used in hospital case registration.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowLogTable((v) => !v)}
            className="shrink-0"
          >
            {showLogTable ? "Hide Edit Log" : "Edit Log"}
          </Button>
        </div>
      </div>

      {showLogTable && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Edit Log</CardTitle>
            <p className="text-xs text-muted-foreground">
              Who changed treatment master data (medications, routes, frequencies, dose units, durations), what
              changed, and when.
            </p>
          </CardHeader>
          <CardContent className="max-h-72 overflow-y-auto">
            {isError ? (
              <p className="text-xs text-destructive">
                Could not load edit log: {error instanceof Error ? error.message : "Unknown error"}
              </p>
            ) : isFetching ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : treatmentLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No treatment master-data changes logged yet. Edits made here will appear after you add, update,
                delete, or reorder catalog entries.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Date (AD / BS) & time</th>
                    <th className="py-2 pr-3 font-medium">Changed by</th>
                    <th className="py-2 font-medium">What changed</th>
                  </tr>
                </thead>
                <tbody>
                  {treatmentLogs.map((log) => {
                    const dt = new Date(log.createdAt);
                    const adIso = dt.toISOString().slice(0, 10);
                    const bs = adToBs(adIso);
                    return (
                      <tr key={log.id} className="border-b last:border-b-0 align-top">
                        <td className="py-2 pr-3">
                          <div>
                            {formatAdDate(adIso)} / {formatBsDate(bs || adIso)}
                          </div>
                          <div className="text-muted-foreground">{dt.toLocaleTimeString()}</div>
                        </td>
                        <td className="py-2 pr-3">
                          {log.actorName} <span className="text-muted-foreground">({log.actorRole})</span>
                        </td>
                        <td className="py-2">
                          <div className="font-medium text-foreground leading-snug">
                            {summarizeTreatmentMasterChange(log)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Pill className="w-4 h-4 text-primary shrink-0" />
              Medication Database
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <p className="text-sm text-muted-foreground">Manage medication records only.</p>
            <Link href="/new-case/settings/treatment/medications" className="mt-auto">
              <Button className="w-full">Open Medication Database</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Syringe className="w-4 h-4 text-primary shrink-0" />
              Route of Administration
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <p className="text-sm text-muted-foreground">Manage route records only.</p>
            <Link href="/new-case/settings/treatment/routes" className="mt-auto">
              <Button className="w-full">Open Route Options</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-primary shrink-0" />
              Frequency Options
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <p className="text-sm text-muted-foreground">Manage frequency records only.</p>
            <Link href="/new-case/settings/treatment/frequencies" className="mt-auto">
              <Button className="w-full">Open Frequency Options</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="w-4 h-4 text-primary shrink-0" />
              Dose Units
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <p className="text-sm text-muted-foreground">Manage dose unit records only.</p>
            <Link href="/new-case/settings/treatment/dose-units" className="mt-auto">
              <Button className="w-full">Open Dose Units</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
