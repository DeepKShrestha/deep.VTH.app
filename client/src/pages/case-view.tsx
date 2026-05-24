import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Case } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Printer, Trash2, Sparkles } from "lucide-react";
import { formatBsDate, formatAdDate } from "@/lib/nepali-date";
import { useAuth } from "@/lib/auth";
import { buildHospitalTestsSuggestedLayout } from "@/lib/hospital-tests-suggested-layout";
import { formatVeterinarianDepartmentDisplay } from "@/lib/veterinarian-display";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StickyScrollPage } from "@/components/sticky-scroll-page";

interface AstRow {
  antibiotic: string;
  symbol?: string;
  discContent?: string;
  sensitivity: "S" | "I" | "R";
  zoneSize?: string;
  manualOverride?: boolean;
}

type CustomEntry = [string, string | string[] | number];
type TreatmentMedicationEntry = {
  medication: string;
  dose: string;
  doseUnit: string;
  route: string;
  frequency: string;
  duration: string;
  note: string;
};
type TreatmentFieldValue = {
  medications: TreatmentMedicationEntry[];
  generalInstructions: string;
};
type CaseAttachment = {
  id: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  category: string;
};
type HospitalSectionKey =
  | "historyMedication"
  | "clinicalSigns"
  | "vitalsExam"
  | "avianDetails"
  | "testsSuggested"
  | "diagnosis"
  | "other";

function normalizeKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function prettifyCustomFieldLabel(key: string): string {
  let cleaned = key
    .replace(/^custom[_\-\s]*/i, "")
    .replace(/[_\-]?[a-z0-9]{3,6}$/i, (suffix) => {
      const hasLetter = /[a-z]/i.test(suffix);
      const hasDigit = /\d/.test(suffix);
      return hasLetter && hasDigit ? "" : suffix;
    });
  cleaned = cleaned
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    ? cleaned.replace(/\b\w/g, (c) => c.toUpperCase())
    : key.replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveHospitalSectionKey(key: string): HospitalSectionKey {
  const n = normalizeKey(key);
  if (n.includes("history") || n.includes("previousmedication")) return "historyMedication";
  if (n.includes("clinical") || n.includes("symptom") || n.includes("chiefcomplaint")) {
    return "clinicalSigns";
  }
  if (
    n.includes("temperature") ||
    n.includes("heartrate") ||
    n.includes("respiration") ||
    n.includes("resprate") ||
    n.includes("rumenmotility") ||
    n.includes("dehydration") ||
    n.includes("crt") ||
    n.includes("weight") ||
    n.includes("chiefcomplaint")
  ) {
    return "vitalsExam";
  }
  if (
    n.includes("flock") ||
    n.includes("hatchery") ||
    n.includes("feedsupplier") ||
    n.includes("feedintake") ||
    n.includes("waterintake") ||
    n.includes("mortality")
  ) {
    return "avianDetails";
  }
  if (n.includes("diagnosis")) return "diagnosis";
  if (
    n.includes("testssuggest") ||
    n.includes("testsuggest") ||
    n.includes("enzymepanel") ||
    n.includes("rapiddiagnostic") ||
    n.includes("xray") ||
    n.includes("ultrasound") ||
    n.includes("biopsy") ||
    n.includes("cytology") ||
    n.includes("culturedetails")
  ) {
    return "testsSuggested";
  }
  return "other";
}

const HOSPITAL_SECTION_TITLES: Record<HospitalSectionKey, string> = {
  historyMedication: "History & Previous Medication",
  clinicalSigns: "Chief Complaint / Clinical Signs",
  vitalsExam: "Physical Exam / Vitals",
  avianDetails: "Avian Details",
  testsSuggested: "Tests Suggested",
  diagnosis: "Diagnosis",
  other: "Other Clinical Details",
};

function resolveFieldOrderAndLabel(rawLabel: string, rawKey: string) {
  const source = normalizeKey(`${rawLabel}${rawKey}`);
  if (source.includes("history")) return { order: 10, label: "History" };
  if (source.includes("previousmedication")) {
    return { order: 20, label: "Previous Medication" };
  }
  if (source.includes("chiefcomplaint")) return { order: 30, label: "Chief Complaint" };
  if (source.includes("clinicalsign") || source.includes("symptom")) {
    return { order: 40, label: "Clinical Signs & Symptoms" };
  }
  if (source.includes("temperature")) return { order: 50, label: "Temperature" };
  if (source.includes("heartrate")) return { order: 60, label: "Heart Rate" };
  if (
    source.includes("respiratoryrate") ||
    source.includes("respirationrate") ||
    source.includes("resprate")
  ) {
    return { order: 70, label: "Respiration" };
  }
  if (source.includes("rumenmotility")) return { order: 80, label: "Rumen Motility" };
  if (source.includes("crt")) return { order: 90, label: "CRT" };
  if (source.includes("dehydration")) return { order: 100, label: "Dehydration %" };
  if (source.includes("weight")) return { order: 110, label: "Weight" };
  if (source.includes("diagnosis")) return { order: 115, label: "Diagnosis" };
  if (source.includes("testssuggested")) return { order: 120, label: "Tests Suggested" };
  if (source.includes("enzymepanel")) return { order: 130, label: "Enzyme Panel Tests" };
  if (source.includes("rapiddiagnostic")) return { order: 140, label: "Rapid Diagnostic Tests" };
  if (source.includes("xraydetails")) return { order: 150, label: "X-Ray Details" };
  if (source.includes("ultrasounddetails")) return { order: 160, label: "Ultrasound Details" };
  if (source.includes("biopsydetails")) return { order: 170, label: "Biopsy Details" };
  if (source.includes("cytologydetails")) return { order: 180, label: "Cytology Details" };
  if (source.includes("culturedetails")) return { order: 190, label: "Culture Details" };
  return { order: 999, label: rawLabel };
}

function withClinicalUnit(label: string, rawValue: string): string {
  const value = String(rawValue || "").trim();
  const n = normalizeKey(label);
  if (!value) return value;
  if (n === "temperature") {
    if (/°\s*[cf]/i.test(value)) return value;
    return `${value} °C`;
  }
  if (n === "heartrate") {
    if (/bpm/i.test(value)) return value;
    return `${value} bpm`;
  }
  if (n === "respiration") {
    if (/breath|\/min|per\s*min|bpm/i.test(value)) return value;
    return `${value} breaths/min`;
  }
  if (n === "rumenmotility") {
    if (/\/min|per\s*min/i.test(value)) return value;
    return `${value} /min`;
  }
  if (n === "crt") {
    if (/\bsec|second|s\b/i.test(value)) return value;
    return `${value} sec`;
  }
  if (n === "dehydrationpercentage") {
    if (/%/.test(value)) return value;
    return `${value}%`;
  }
  if (n === "weight") {
    if (/\bkg|g\b/i.test(value)) return value;
    return `${value} kg`;
  }
  return value;
}

function sensitivityBadge(s: string) {
  switch (s) {
    case "S": return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">Sensitive</Badge>;
    case "I": return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0">Intermediate</Badge>;
    case "R": return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0">Resistant</Badge>;
    default: return <Badge variant="secondary">{s}</Badge>;
  }
}

export default function CaseView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const scopeParam = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get("scope");
    return value === "hospital" || value === "ast" ? value : null;
  }, []);
  const scopeFromPath = useMemo(() => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/new-case/")) return "hospital" as const;
    if (path.includes("/ast-report/")) return "ast" as const;
    return null;
  }, []);
  const requestedScope = scopeParam ?? scopeFromPath;

  const { data: caseData, isLoading } = useQuery<Case>({
    queryKey: ["/api/cases", params.id, requestedScope ?? "all"],
    queryFn: async () => {
      const scopeQuery = requestedScope ? `?scope=${requestedScope}` : "";
      const res = await apiRequest("GET", `/api/cases/${params.id}${scopeQuery}`);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const scopeQuery = requestedScope ? `?scope=${requestedScope}` : "";
      await apiRequest("DELETE", `/api/cases/${params.id}${scopeQuery}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", effectiveScope] });
      toast({ title: "Case deleted" });
      setLocation(scopedBackHref);
    },
  });

  const astResults: AstRow[] = useMemo(() => {
    if (!caseData?.astResults) return [];
    try { return JSON.parse(caseData.astResults); } catch { return []; }
  }, [caseData]);

  const recommendations = useMemo(() => {
    return astResults
      .filter((r) => r.sensitivity === "S" && r.zoneSize && parseFloat(r.zoneSize) > 0)
      .sort((a, b) => parseFloat(b.zoneSize || "0") - parseFloat(a.zoneSize || "0"))
      .slice(0, 3);
  }, [astResults]);
  const isHospitalCase = (caseData?.caseNumber || "").toUpperCase().startsWith("CASE-");
  const effectiveScope: "hospital" | "ast" =
    requestedScope ?? (isHospitalCase ? "hospital" : "ast");
  const scopedBackHref =
    effectiveScope === "hospital" ? "/new-case/cases" : "/ast-report/cases";

  const customFieldEntries = useMemo(() => {
    if (!caseData?.customFields) return [] as CustomEntry[];
    try {
      const parsed = JSON.parse(caseData.customFields) as Record<
        string,
        string | string[] | number
      >;
      return Object.entries(parsed).filter(([, value]) =>
        Array.isArray(value)
          ? value.length > 0
          : String(value ?? "").trim().length > 0,
      );
    } catch {
      return [] as CustomEntry[];
    }
  }, [caseData?.customFields]);
  const groupedHospitalCustomFields = useMemo(() => {
    const grouped: Record<
      HospitalSectionKey,
      Array<{ label: string; value: string | string[] | number; order: number }>
    > = {
      historyMedication: [],
      clinicalSigns: [],
      vitalsExam: [],
      avianDetails: [],
      testsSuggested: [],
      diagnosis: [],
      other: [],
    };
    for (const [key, value] of customFieldEntries) {
      const normalizedLabel = prettifyCustomFieldLabel(key);
      const normalizedMeta = resolveFieldOrderAndLabel(normalizedLabel, key);
      grouped[resolveHospitalSectionKey(key)].push({
        label: normalizedMeta.label,
        value,
        order: normalizedMeta.order,
      });
    }
    for (const sectionKey of Object.keys(grouped) as HospitalSectionKey[]) {
      grouped[sectionKey].sort((a, b) =>
        a.order === b.order ? a.label.localeCompare(b.label) : a.order - b.order,
      );
    }
    return grouped;
  }, [customFieldEntries]);
  const treatmentFields = useMemo(() => {
    if (!caseData?.treatmentDetails) return {} as Record<string, TreatmentFieldValue>;
    try {
      return JSON.parse(caseData.treatmentDetails) as Record<string, TreatmentFieldValue>;
    } catch {
      return {} as Record<string, TreatmentFieldValue>;
    }
  }, [caseData?.treatmentDetails]);
  const [selectedAttachmentIndex, setSelectedAttachmentIndex] = useState<number | null>(null);
  const { data: caseAttachments = [] } = useQuery<CaseAttachment[]>({
    queryKey: ["/api/cases", params.id, "attachments", requestedScope ?? "all"],
    queryFn: async () => {
      const scopeQuery = requestedScope ? `?scope=${requestedScope}` : "";
      const res = await apiRequest("GET", `/api/cases/${params.id}/attachments${scopeQuery}`);
      return res.json();
    },
    enabled: Boolean(caseData?.id),
  });

  /**
   * Patient history — other cases that look like they belong to the same
   * owner (matched on phone OR name+address). The server already scope-filters
   * to what the current user is allowed to view.
   */
  type PatientHistoryEntry = {
    id: number;
    caseNumber: string;
    caseScope: "ast" | "hospital";
    date: string;
    ownerName: string;
    ownerPhone: string;
    species: string;
    breed: string;
    animalName: string | null;
    createdAt: string;
  };
  const { data: patientHistory = [] } = useQuery<PatientHistoryEntry[]>({
    queryKey: ["/api/cases", params.id, "patient-history", requestedScope ?? "all"],
    queryFn: async () => {
      const scopeQuery = requestedScope ? `?scope=${requestedScope}` : "";
      const res = await apiRequest(
        "GET",
        `/api/cases/${params.id}/patient-history${scopeQuery}`,
      );
      return res.json();
    },
    enabled: Boolean(caseData?.id),
  });

  useEffect(() => {
    if (selectedAttachmentIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedAttachmentIndex((prev) =>
          prev === null ? prev : (prev - 1 + caseAttachments.length) % caseAttachments.length,
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedAttachmentIndex((prev) =>
          prev === null ? prev : (prev + 1) % caseAttachments.length,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedAttachmentIndex, caseAttachments.length]);

  if (isLoading) {
    return (
      <StickyScrollPage
        bodyClassName="space-y-6"
        sticky={
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full min-w-0">
              <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
              <div className="space-y-2 flex-1 min-w-0">
                <Skeleton className="h-6 w-48 max-w-full" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
              <Skeleton className="h-9 w-full sm:w-28" />
            </div>
          </div>
        }
      >
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[88%]" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[80%]" />
          </CardContent>
        </Card>
      </StickyScrollPage>
    );
  }

  if (!caseData) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-muted-foreground">Case not found.</p>
        <Link href={scopedBackHref}><Button variant="outline">Back to Cases</Button></Link>
      </div>
    );
  }

    return (
    <StickyScrollPage
      bodyClassName="space-y-6"
      sticky={
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={scopedBackHref}>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1
              className="text-lg font-semibold"
              data-testid="text-case-number"
            >
              {caseData.caseNumber}
            </h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-muted-foreground">
              <span>{formatBsDate(caseData.date)}</span>
              {caseData.dateAd && (
                <span className="text-xs">
                  ({formatAdDate(caseData.dateAd)})
                </span>
              )}
              {caseData.dailyNumber && (
                <span>Day #{caseData.dailyNumber}</span>
              )}
              {caseData.monthlyNumber && (
                <span>Month #{caseData.monthlyNumber}</span>
              )}
              {caseData.yearlyNumber != null && (
                <span>Year #{caseData.yearlyNumber}</span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: last updated + buttons */}
        <div className="flex flex-col items-start sm:items-end gap-1 w-full sm:w-auto">
          {caseData.lastUpdatedBy && caseData.updatedAt && (
            <p className="text-[11px] text-muted-foreground">
              Last updated by{" "}
              {caseData.lastUpdatedByName ||
                `User ID ${caseData.lastUpdatedBy}`}{" "}
              on {new Date(caseData.updatedAt).toLocaleString()}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Link
              href={`${effectiveScope === "hospital" ? "/new-case/print" : "/ast-report/print"}/${caseData.id}?scope=${effectiveScope}`}
              className="w-full sm:w-auto"
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 w-full sm:w-auto"
                data-testid="button-print"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </Button>
            </Link>

            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-delete"
                    className="gap-1.5 text-destructive hover:text-destructive w-full sm:w-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this case?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete case {caseData.caseNumber}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>
      }
    >

      {/* Bill Number */}
      {caseData.billNumber && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs font-medium">Bill/Reg No:</span>
              <span className="font-semibold">{caseData.billNumber}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Owner Information */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Owner Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs font-medium mb-0.5">Name</dt>
              <dd>{caseData.ownerName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium mb-0.5">Phone</dt>
              <dd>{caseData.ownerPhone}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs font-medium mb-0.5">Address</dt>
              <dd>{caseData.ownerAddress}</dd>
            </div>
          </dl>
          {patientHistory.length > 0 && (
            <details className="mt-4 rounded border bg-muted/30 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium select-none">
                Other cases for this owner ({patientHistory.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs">
                {patientHistory.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase"
                    >
                      {entry.caseScope}
                    </Badge>
                    <Link
                      href={
                        entry.caseScope === "hospital"
                          ? `/new-case/cases/${entry.id}?scope=hospital`
                          : `/ast-report/cases/${entry.id}?scope=ast`
                      }
                      className="font-mono text-primary hover:underline"
                    >
                      {entry.caseNumber}
                    </Link>
                    <span className="text-muted-foreground">
                      {entry.date} · {entry.species}
                      {entry.breed ? ` / ${entry.breed}` : ""}
                      {entry.animalName ? ` · "${entry.animalName}"` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Animal Information */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Animal Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Species</dt><dd><Badge variant="secondary">{caseData.species}</Badge></dd></div>
            <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Breed</dt><dd>{caseData.breed}</dd></div>
            {caseData.animalName && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Name</dt><dd>{caseData.animalName}</dd></div>}
            {caseData.age && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Age</dt><dd>{caseData.age}</dd></div>}
            {caseData.sex && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Sex</dt><dd>{caseData.sex}</dd></div>}
          </dl>
        </CardContent>
      </Card>

      {/* Sample Information */}
      {!isHospitalCase && (caseData.sampleType || caseData.sampleDate || caseData.cultureResult) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Sample Information</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              {caseData.sampleType && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Sample Type</dt><dd>{caseData.sampleType}</dd></div>}
              {caseData.sampleDate && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Collection Date</dt><dd>{formatBsDate(caseData.sampleDate)}{caseData.sampleDateAd && <span className="text-xs text-muted-foreground ml-1">({formatAdDate(caseData.sampleDateAd)})</span>}</dd></div>}
              {caseData.cultureResult && <div className="sm:col-span-2"><dt className="text-muted-foreground text-xs font-medium mb-0.5">Organism Isolated</dt><dd className="font-medium">{caseData.cultureResult}</dd></div>}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* AST Results */}
      {!isHospitalCase && astResults.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">AST Results</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">S.N.</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Antibiotic</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Disc</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Zone (mm)</th>
                    <th className="text-left py-2 font-medium text-muted-foreground text-xs">Sensitivity</th>
                  </tr>
                </thead>
                <tbody>
                  {astResults.map((row, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4">{row.antibiotic}{row.symbol ? ` (${row.symbol})` : ""}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.discContent || "—"}</td>
                      <td className="py-2 pr-4">{row.zoneSize || "—"}</td>
                      <td className="py-2">{sensitivityBadge(row.sensitivity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {!isHospitalCase && recommendations.length > 0 && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Recommended Antibiotics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <span className="font-medium">{rec.antibiotic}{rec.symbol ? ` (${rec.symbol})` : ""}</span>
                  <span className="text-muted-foreground">— zone: {rec.zoneSize} mm</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remarks (AST flow) */}
      {caseData.remarks && !isHospitalCase && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Remarks</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{caseData.remarks}</p></CardContent>
        </Card>
      )}

      {customFieldEntries.length > 0 && isHospitalCase && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hospital Clinical Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(Object.keys(HOSPITAL_SECTION_TITLES) as HospitalSectionKey[]).map((sectionKey) => {
              const items = groupedHospitalCustomFields[sectionKey];
              if (!items || items.length === 0) return null;
              if (sectionKey === "other") return null;
              if (sectionKey === "vitalsExam") {
                const byLabel = new Map(items.map((item) => [normalizeKey(item.label), item.value]));
                const vitalsCells = [
                  ["Temperature", byLabel.get("temperature")],
                  ["Heart Rate", byLabel.get("heartrate")],
                  ["Respiration", byLabel.get("respiration")],
                  ["Rumen Motility", byLabel.get("rumenmotility")],
                  ["CRT", byLabel.get("crt")],
                  ["Dehydration %", byLabel.get("dehydrationpercentage")],
                  ["Weight", byLabel.get("weight")],
                ]
                  .filter(([, v]) => v !== undefined && String(v).trim().length > 0)
                  .map(([k, v]) => ({
                    label: String(k),
                    value: withClinicalUnit(String(k), String(v ?? "")),
                  }));
                const fallback = items
                  .map((item) => `${item.label}: ${withClinicalUnit(item.label, String(item.value))}`)
                  .join(" | ");
                return (
                  <div key={sectionKey} className="space-y-2 border-t border-slate-300 pt-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      {HOSPITAL_SECTION_TITLES[sectionKey]}
                    </h3>
                    {vitalsCells.length > 0 ? (
                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-xs">
                          <tbody>
                            <tr className="border-b">
                              {vitalsCells.slice(0, 4).map((cell) => (
                                <td key={cell.label} className="p-2 align-top border-r last:border-r-0">
                                  <p className="font-medium leading-4">
                                    <span className="text-slate-600">{cell.label}:</span>{" "}
                                    <span>{cell.value}</span>
                                  </p>
                                </td>
                              ))}
                            </tr>
                            <tr>
                              {[...vitalsCells.slice(4, 8), ...Array(Math.max(0, 4 - vitalsCells.slice(4, 8).length)).fill(null)].map((cell, idx) => (
                                <td key={cell ? cell.label : `empty-${idx}`} className="p-2 align-top border-r last:border-r-0">
                                  {cell ? (
                                    <p className="font-medium leading-4">
                                      <span className="text-slate-600">{cell.label}:</span>{" "}
                                      <span>{cell.value}</span>
                                    </p>
                                  ) : (
                                    <span>&nbsp;</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-md border p-2.5 text-sm leading-5">
                        <p>{fallback}</p>
                      </div>
                    )}
                  </div>
                );
              }
              if (sectionKey === "diagnosis") {
                const text = items
                  .map((entry) =>
                    Array.isArray(entry.value)
                      ? entry.value.join(", ")
                      : String(entry.value ?? ""),
                  )
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .join("; ");
                if (!text) return null;
                return (
                  <div key={sectionKey} className="border-t border-slate-300 pt-2">
                    <div className="rounded-md border px-2.5 py-2 text-sm">
                      <p className="leading-relaxed text-slate-700">
                        <span className="font-semibold text-slate-800">Diagnosis:</span>{" "}
                        <span className="whitespace-pre-wrap break-words">{text}</span>
                      </p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={sectionKey} className="space-y-2 border-t border-slate-300 pt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {HOSPITAL_SECTION_TITLES[sectionKey]}
                  </h3>
                  {sectionKey === "testsSuggested" ? (
                    <div className="rounded-md border overflow-hidden text-xs">
                      {(() => {
                        let mainTestSerial = 0;
                        return (
                      <table className="w-full table-fixed">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left px-2 py-1 font-semibold text-slate-800" colSpan={3}>
                              {HOSPITAL_SECTION_TITLES[sectionKey]}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {buildHospitalTestsSuggestedLayout(
                            customFieldEntries.filter(
                              ([key]) => resolveHospitalSectionKey(key) === "testsSuggested",
                            ),
                          ).map((row, idx) =>
                            row.kind === "simple-row" ? (
                              <tr key={`ts-s-${idx}`} className="border-b last:border-b-0">
                                {row.cells.map((cell, j) => (
                                  <td
                                    key={`ts-s-${idx}-${j}`}
                                    className="px-2 py-1 align-top w-1/3 bg-slate-50 text-slate-800 font-semibold"
                                  >
                                    {cell ? `${++mainTestSerial}. ${cell}` : "\u00a0"}
                                  </td>
                                ))}
                              </tr>
                            ) : (
                              <tr key={`ts-d-${idx}`} className="border-b last:border-b-0">
                                <td className="px-2 py-1 font-medium bg-slate-50 text-slate-800 align-top w-[22%] whitespace-nowrap">
                                  {`${++mainTestSerial}. ${row.label}`}
                                </td>
                                <td
                                  colSpan={2}
                                  className="px-2 py-1 font-normal text-slate-700 align-top whitespace-pre-wrap break-words leading-4"
                                >
                                  {row.value}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                        );
                      })()}
                    </div>
                  ) : sectionKey === "historyMedication" || sectionKey === "clinicalSigns" ? (
                    <div className="space-y-2">
                      {items.map((entry) => (
                        <div key={`${sectionKey}-${entry.label}`} className="text-xs">
                          <p className="text-[11px] font-medium text-slate-700 mb-0.5">
                            {entry.label}
                          </p>
                          {Array.isArray(entry.value) ? (
                            <p className="whitespace-pre-wrap break-words leading-4">
                              {entry.value.join(", ")}
                            </p>
                          ) : (
                            <p className="whitespace-pre-wrap break-words leading-4">
                              {withClinicalUnit(entry.label, String(entry.value))}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
                      {items.map((entry) => (
                        <div key={`${sectionKey}-${entry.label}`} className="text-xs">
                          <p className="text-[11px] font-medium text-slate-700 mb-0.5">
                            {entry.label}
                          </p>
                          {Array.isArray(entry.value) ? (
                            <p className="whitespace-pre-wrap break-words leading-4">
                              {entry.value.join(", ")}
                            </p>
                          ) : (
                            <p className="whitespace-pre-wrap break-words leading-4">
                              {withClinicalUnit(entry.label, String(entry.value))}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {Object.keys(treatmentFields).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Treatment / Prescription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(treatmentFields).map(([key, value]) => {
              const medications = (value?.medications ?? []).filter((entry) =>
                [
                  entry.medication,
                  entry.dose,
                  entry.doseUnit,
                  entry.route,
                  entry.frequency,
                  entry.duration,
                  entry.note,
                ].some((v) => String(v ?? "").trim().length > 0),
              );
              return (
                <div key={key} className="space-y-2 rounded border p-3">
                  {medications.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left p-2 border">Medication</th>
                            <th className="text-left p-2 border">Dose</th>
                            <th className="text-left p-2 border">Dose Unit</th>
                            <th className="text-left p-2 border">Route</th>
                            <th className="text-left p-2 border">Frequency</th>
                            <th className="text-left p-2 border">Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medications.map((entry, index) => {
                            const hasNote = String(entry.note ?? "").trim().length > 0;
                            return (
                              <Fragment key={`${key}-${index}`}>
                                <tr>
                                  <td className="p-2 border">{entry.medication || "—"}</td>
                                  <td className="p-2 border">{entry.dose || "—"}</td>
                                  <td className="p-2 border">{entry.doseUnit || "—"}</td>
                                  <td className="p-2 border">{entry.route || "—"}</td>
                                  <td className="p-2 border">{entry.frequency || "—"}</td>
                                  <td className="p-2 border">{entry.duration || "—"}</td>
                                </tr>
                                {hasNote && (
                                  <tr>
                                    <td className="p-2 border bg-muted/20 font-medium">Note</td>
                                    <td className="p-2 border whitespace-pre-wrap" colSpan={5}>
                                      {entry.note}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {value?.generalInstructions?.trim() && (
                    <div className="text-xs whitespace-pre-wrap leading-5">
                      <span className="font-medium text-muted-foreground">General instructions: </span>
                      {value.generalInstructions}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {isHospitalCase &&
        (caseData.veterinarianName?.trim() ||
          caseData.veterinarianNvc?.trim() ||
          caseData.veterinarianDepartment?.trim()) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Attending veterinarian</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              {caseData.veterinarianName?.trim() && (
                <p>
                  <span className="text-muted-foreground">Name: </span>
                  {caseData.veterinarianName.trim()}
                </p>
              )}
              {caseData.veterinarianNvc?.trim() && (
                <p>
                  <span className="text-muted-foreground">NVC no.: </span>
                  {caseData.veterinarianNvc.trim()}
                </p>
              )}
              {formatVeterinarianDepartmentDisplay(caseData.veterinarianDepartment) ? (
                <p>{formatVeterinarianDepartmentDisplay(caseData.veterinarianDepartment)}</p>
              ) : null}
            </CardContent>
          </Card>
        )}

      {caseAttachments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Treatment Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {caseAttachments.map((attachment, idx) => (
                <button
                  key={attachment.id}
                  type="button"
                  className="rounded border overflow-hidden text-left"
                  onClick={() => setSelectedAttachmentIndex(idx)}
                >
                  <img
                    src={attachment.url}
                    alt={attachment.fileName}
                    className="h-28 w-full object-cover"
                  />
                  <p className="px-2 py-1 text-[11px] truncate">{attachment.fileName}</p>
                </button>
              ))}
            </div>
            <Dialog
              open={selectedAttachmentIndex !== null}
              onOpenChange={(open) => {
                if (!open) setSelectedAttachmentIndex(null);
              }}
            >
              <DialogContent className="max-w-5xl w-[95vw]">
                <DialogHeader>
                  <DialogTitle>
                    {selectedAttachmentIndex !== null
                      ? caseAttachments[selectedAttachmentIndex]?.fileName
                      : "Attachment"}
                  </DialogTitle>
                </DialogHeader>
                {selectedAttachmentIndex !== null && (
                  <div className="space-y-3">
                    <img
                      src={caseAttachments[selectedAttachmentIndex].url}
                      alt={caseAttachments[selectedAttachmentIndex].fileName}
                      className="max-h-[75vh] w-full object-contain bg-black/5 rounded"
                    />
                    <div className="flex justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedAttachmentIndex((prev) =>
                            prev === null
                              ? prev
                              : (prev - 1 + caseAttachments.length) % caseAttachments.length,
                          )
                        }
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedAttachmentIndex((prev) =>
                            prev === null ? prev : (prev + 1) % caseAttachments.length,
                          )
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Remarks (Hospital flow follows register order) */}
      {caseData.remarks && isHospitalCase && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Remarks</CardTitle></CardHeader>
          <CardContent><p className="text-xs whitespace-pre-wrap break-words leading-5">{caseData.remarks}</p></CardContent>
        </Card>
      )}

      {customFieldEntries.length > 0 && !isHospitalCase && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Additional Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customFieldEntries.map(([key, value]) => (
              <div key={key}>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {prettifyCustomFieldLabel(key)}
                </p>
                {Array.isArray(value) ? (
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {value.map((item, idx) => (
                      <li key={`${key}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{String(value)}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </StickyScrollPage>
  );
}
