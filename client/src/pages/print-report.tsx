import { Fragment, useMemo, useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Case } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Printer } from "lucide-react";
import { formatBsDate, formatAdDate } from "@/lib/nepali-date";
import {
  buildVaccinationDisplayRows,
  filterNonVaccinationCustomEntries,
} from "@shared/hospital-vaccination-history";
import { buildHospitalTestsSuggestedLayout } from "@/lib/hospital-tests-suggested-layout";
import { getAstToggleDefaults, getHospitalToggleDefaults } from "@/lib/module-toggle-defaults";
import { formatVeterinarianDepartmentDisplay } from "@/lib/veterinarian-display";
import {
  formatRespiratoryVitalValue,
  isHospitalRespiratoryFieldKey,
  isHospitalVitalExamFieldKey,
  resolveRespiratoryFieldLabel,
} from "@/lib/hospital-vitals-display";

interface AstRow {
  antibiotic: string;
  symbol?: string;
  discContent?: string;
  sensitivity: "S" | "I" | "R";
  zoneSize?: string;
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
  if (isHospitalVitalExamFieldKey(key) || n.includes("chiefcomplaint")) {
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
  if (source.includes("previousmedication")) return { order: 20, label: "Previous Medication" };
  if (source.includes("chiefcomplaint")) return { order: 30, label: "Chief Complaint" };
  if (source.includes("clinicalsign") || source.includes("symptom")) {
    return { order: 40, label: "Clinical Signs & Symptoms" };
  }
  if (source.includes("temperature")) return { order: 50, label: "Temperature" };
  if (source.includes("heartrate")) return { order: 60, label: "Heart Rate" };
  if (isHospitalRespiratoryFieldKey(rawKey, rawLabel)) {
    return { order: 70, label: resolveRespiratoryFieldLabel(rawLabel) };
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
  const respiratory = formatRespiratoryVitalValue(label, value);
  if (respiratory !== value) return respiratory;
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

export default function PrintReport() {
  const params = useParams<{ id: string }>();
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
  const scopedBackHref = requestedScope === "hospital" ? "/new-case/cases" : "/ast-report/cases";
  const [compactMode, setCompactMode] = useState(() => {
    if (requestedScope === "hospital") return getHospitalToggleDefaults().compactPrintMode;
    if (requestedScope === "ast") return getAstToggleDefaults().compactPrintMode;
    return false;
  });
  const lastCompactDefaultAppliedForCase = useRef<string | null>(null);

  const { data: caseData, isLoading } = useQuery<Case>({
    queryKey: ["/api/cases", params.id, requestedScope ?? "all"],
    queryFn: async () => {
      const scopeQuery = requestedScope ? `?scope=${requestedScope}` : "";
      const res = await apiRequest("GET", `/api/cases/${params.id}${scopeQuery}`);
      return res.json();
    },
  });

  const handlePrint = () => window.print();

  const astResults: AstRow[] = useMemo(() => {
    if (!caseData?.astResults) return [];
    try {
      return JSON.parse(caseData.astResults);
    } catch {
      return [];
    }
  }, [caseData]);

  const recommendations = useMemo(() => {
    return astResults
      .filter(
        (r) =>
          r.sensitivity === "S" &&
          r.zoneSize &&
          parseFloat(r.zoneSize) > 0
      )
      .sort(
        (a, b) =>
          parseFloat(b.zoneSize || "0") -
          parseFloat(a.zoneSize || "0")
      )
      .slice(0, 3);
  }, [astResults]);
  const isHospitalCase = (caseData?.caseNumber || "").toUpperCase().startsWith("CASE-");
  useEffect(() => {
    const caseId = params.id || "";
    if (!caseId) return;
    if (lastCompactDefaultAppliedForCase.current === caseId) return;
    if (requestedScope === "hospital" || requestedScope === "ast") {
      setCompactMode(
        requestedScope === "hospital"
          ? getHospitalToggleDefaults().compactPrintMode
          : getAstToggleDefaults().compactPrintMode,
      );
      lastCompactDefaultAppliedForCase.current = caseId;
      return;
    }
    if (!caseData) return;
    setCompactMode(
      isHospitalCase
        ? getHospitalToggleDefaults().compactPrintMode
        : getAstToggleDefaults().compactPrintMode,
    );
    lastCompactDefaultAppliedForCase.current = caseId;
  }, [params.id, requestedScope, caseData, isHospitalCase]);
  const backHref =
    requestedScope === "hospital"
      ? "/new-case/cases"
      : requestedScope === "ast"
        ? "/ast-report/cases"
        : isHospitalCase
          ? "/new-case/cases"
          : "/ast-report/cases";
  const customFieldEntries = useMemo(() => {
    if (!caseData?.customFields) return [] as CustomEntry[];
    try {
      const parsed = JSON.parse(caseData.customFields) as Record<
        string,
        string | string[] | number
      >;
      return filterNonVaccinationCustomEntries(
        Object.entries(parsed).filter(([, value]) =>
          Array.isArray(value)
            ? value.length > 0
            : String(value ?? "").trim().length > 0,
        ),
      );
    } catch {
      return [] as CustomEntry[];
    }
  }, [caseData?.customFields]);
  const vaccinationDisplayRows = useMemo(() => {
    if (!caseData?.customFields) return [];
    try {
      const parsed = JSON.parse(caseData.customFields) as Record<string, unknown>;
      return buildVaccinationDisplayRows(
        parsed,
        caseData.species ?? "",
        formatBsDate,
        formatAdDate,
      );
    } catch {
      return [];
    }
  }, [caseData?.customFields, caseData?.species]);
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
      const pretty = prettifyCustomFieldLabel(key);
      const meta = resolveFieldOrderAndLabel(pretty, key);
      grouped[resolveHospitalSectionKey(key)].push({
        label: meta.label,
        value,
        order: meta.order,
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

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-muted-foreground">Case not found.</p>
        <Link href={scopedBackHref}>
          <Button variant="outline">Back to Cases</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <span className="text-sm font-medium">Print Preview</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Compact</span>
            <Switch
              checked={compactMode}
              onCheckedChange={setCompactMode}
              aria-label="Compact print mode"
            />
          </div>
          <Button
            onClick={handlePrint}
            size="sm"
            className="gap-1.5 w-full sm:w-auto"
            data-testid="button-print"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </Button>
        </div>
      </div>

            {/* Printable Report */}
      <div
        id="print-root"
        className={`print-a4 ${compactMode ? "compact-mode" : ""} max-w-[210mm] mx-auto bg-white text-black ${isHospitalCase ? "p-1 sm:p-1.5" : "p-6 sm:p-10"} my-4 sm:my-8 print:m-0 print:p-0 print:max-w-none`}
      >
        {/* Header */}
        <div className="print-section text-center border-b-2 border-black pb-2 mb-2">
          <h1 className="text-xl font-bold uppercase tracking-wide text-black">
            Veterinary Teaching Hospital
          </h1>
          <p className="text-sm text-gray-700 mt-1">
            {isHospitalCase
              ? "Hospital Case Registration Report"
              : "Antibiotic Sensitivity Test (AST) Report"}
          </p>
        </div>

        {/* Case Info Row */}
        <div className="print-section flex flex-col sm:flex-row justify-between items-start gap-2 mb-2 text-sm">
          <div>
            <span className="font-semibold text-black">Case No: </span>
            <span className="text-black">{caseData.caseNumber}</span>
          </div>
          <div className="text-right text-black">
            <span className="font-semibold">Date (BS): </span>
            <span>{formatBsDate(caseData.date)}</span>
            {caseData.dateAd && (
              <>
                <span className="mx-2">|</span>
                <span className="font-semibold">AD: </span>
                <span>{formatAdDate(caseData.dateAd)}</span>
              </>
            )}
          </div>
        </div>
        <div className="print-section flex flex-col sm:flex-row justify-between items-start gap-2 mb-2 text-sm">
          {caseData.billNumber && (
            <div>
              <span className="font-semibold text-black">Bill/Reg No: </span>
              <span className="text-black">{caseData.billNumber}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-4 sm:gap-6">
            {caseData.dailyNumber && (
              <span className="text-black">
                <span className="font-semibold">Daily #: </span>
                {caseData.dailyNumber}
              </span>
            )}
            {caseData.monthlyNumber && (
              <span className="text-black">
                <span className="font-semibold">Monthly #: </span>
                {caseData.monthlyNumber}
              </span>
            )}
            {caseData.yearlyNumber != null && (
              <span className="text-black">
                <span className="font-semibold">Yearly #: </span>
                {caseData.yearlyNumber}
              </span>
            )}
          </div>
        </div>

        <div className={isHospitalCase ? "mb-2" : "mb-4"} />

       {/* Details Table */}
<div className={`print-section border border-gray-400 ${isHospitalCase ? "mb-2" : "mb-4"}`}>
  <table className={`w-full table-fixed ${isHospitalCase ? "text-[11px]" : "text-sm"} print-table`}>
    <tbody>
      <tr className="border-b border-gray-400">
  <td className="py-1 px-2 font-semibold bg-gray-50 w-24 text-black whitespace-nowrap">
    Owner Name
  </td>
  <td className="py-1 px-2 text-black whitespace-nowrap overflow-hidden text-ellipsis" colSpan={2}>{caseData.ownerName}</td>
  <td className="py-1 px-2 font-semibold bg-gray-50 w-20 text-black whitespace-nowrap">
    Address
  </td>
  <td className="py-1 px-2 text-black whitespace-nowrap overflow-hidden text-ellipsis" colSpan={2}>{caseData.ownerAddress}</td>
</tr>
      <tr className="border-b border-gray-400">
        <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
          Phone No.
        </td>
        <td className="py-1 px-2 text-black whitespace-nowrap" colSpan={3}>
          {caseData.ownerPhone}
        </td>
      </tr>
      <tr className="border-b border-gray-400">
        <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
          Species
        </td>
        <td className="py-1 px-2 text-black whitespace-nowrap overflow-hidden text-ellipsis">{caseData.species}</td>
        <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
          Breed
        </td>
        <td className="py-1 px-2 text-black whitespace-nowrap overflow-hidden text-ellipsis" colSpan={3}>{caseData.breed}</td>
      </tr>
      <tr className="border-b border-gray-400">
        <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
          Animal Name
        </td>
        <td className="py-1 px-2 text-black whitespace-nowrap overflow-hidden text-ellipsis" colSpan={2}>
          {caseData.animalName || "—"}
        </td>
        <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
          Age
        </td>
        <td className="py-1 px-2 text-black whitespace-nowrap" colSpan={1}>
          {caseData.age || "—"}
        </td>
        <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
          Sex
        </td>
        <td className="py-1 px-2 text-black whitespace-nowrap" colSpan={1}>
          {caseData.sex || "—"}
        </td>
      </tr>
      {isHospitalCase && vaccinationDisplayRows.length > 0 && (
        <tr className="border-b border-gray-400">
          <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap align-top">
            Vaccination
          </td>
          <td className="py-1 px-2 text-black leading-snug" colSpan={5}>
            <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] sm:text-[11px]">
              {vaccinationDisplayRows.map((row) => (
                <span key={row.vaccineLabel}>
                  <span className="font-semibold">{row.vaccineLabel}:</span> {row.status}
                  {row.lastDateDisplay ? (
                    <span className="text-gray-600"> ({row.lastDateDisplay})</span>
                  ) : null}
                </span>
              ))}
            </span>
          </td>
        </tr>
      )}
      {!isHospitalCase && caseData.sampleType && (
        <tr className="border-b border-gray-400">
          <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
            Sample Type
          </td>
          <td className="py-1 px-2 text-black" colSpan={5}>
            {caseData.sampleType}
          </td>
        </tr>
      )}
      {!isHospitalCase && caseData.sampleDate && (
        <tr className="border-b border-gray-400">
          <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
            Collection Date
          </td>
          <td className="py-1 px-2 text-black" colSpan={5}>
            {formatBsDate(caseData.sampleDate)}
            {caseData.sampleDateAd && (
              <span className="text-xs text-gray-500 ml-2">
                (AD: {formatAdDate(caseData.sampleDateAd)})
              </span>
            )}
          </td>
        </tr>
      )}
      {!isHospitalCase && caseData.cultureResult && (
        <tr>
          <td className="py-1 px-2 font-semibold bg-gray-50 text-black whitespace-nowrap">
            Organism Isolated
          </td>
          <td className="py-1 px-2 font-semibold text-black" colSpan={5}>
            {caseData.cultureResult}
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>

        {/* AST Results */}
        {!isHospitalCase && astResults.length > 0 && (
          <div className="print-section mb-2">
            <h2 className="text-sm font-bold uppercase mb-2 text-black">
              Antibiotic Sensitivity Test Results
            </h2>
            <table className="w-full text-sm border border-gray-400 print-table">
              <thead>
  <tr className="bg-gray-100">
    <th className="py-2 px-3 text-left border border-gray-400 font-semibold w-10 text-black">
      S.N.
    </th>
    <th className="py-2 px-3 text-left border border-gray-400 font-semibold text-black w-[45%]">
      Antibiotic
    </th>
    <th className="py-2 px-3 text-center border border-gray-400 font-semibold w-16 text-black">
      Disc
    </th>
    <th className="py-2 px-3 text-center border border-gray-400 font-semibold w-20 text-black">
      Zone (mm)
    </th>
    <th className="py-2 px-3 text-center border border-gray-400 font-semibold w-28 text-black">
      Sensitivity
    </th>
  </tr>
</thead>
              <tbody>
                {astResults.map((row, i) => (
                  <tr key={i}>
                    <td className="py-1.5 px-3 border border-gray-400 text-center text-black">
                      {i + 1}
                    </td>
                    <td className="py-1.5 px-3 border border-gray-400 text-black">
                      {row.antibiotic}
                      {row.symbol ? ` (${row.symbol})` : ""}
                    </td>
                    <td className="py-1.5 px-3 border border-gray-400 text-center text-gray-600">
                      {row.discContent || "—"}
                    </td>
                    <td className="py-1.5 px-3 border border-gray-400 text-center text-black">
                      {row.zoneSize || "—"}
                    </td>
                    <td className="py-1.5 px-3 border border-gray-400 text-center text-black">
                      <span
                        className={
                          row.sensitivity === "S"
                            ? "text-green-700"
                            : row.sensitivity === "R"
                            ? "text-red-700"
                            : "text-amber-700"
                        }
                      >
                        {row.sensitivity === "S"
                          ? "Sensitive (S)"
                          : row.sensitivity === "I"
                          ? "Intermediate (I)"
                          : "Resistant (R)"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex gap-6 text-xs text-gray-600">
              <span>
                <strong className="text-green-700">S</strong> = Sensitive
              </span>
              <span>
                <strong className="text-amber-700">I</strong> = Intermediate
              </span>
              <span>
                <strong className="text-red-700">R</strong> = Resistant
              </span>
            </div>
          </div>
        )}

        {customFieldEntries.length > 0 && (
          <div className="print-section mb-4">
            <h2 className="text-sm font-bold uppercase mb-2 text-black">
              {isHospitalCase ? "Hospital Clinical Details" : "Additional Details"}
            </h2>
            {isHospitalCase ? (
              <div className="space-y-2">
                {(Object.keys(HOSPITAL_SECTION_TITLES) as HospitalSectionKey[]).map((sectionKey) => {
                  const items = groupedHospitalCustomFields[sectionKey];
                  if (!items || items.length === 0) return null;
                  if (sectionKey === "other") return null;
                  if (sectionKey === "vitalsExam") {
                    // Print view: render every filled vital (including any
                    // admin-added custom vital from the Hospital Form Editor).
                    // Empty vitals (e.g. Rumen Motility on a dog) are excluded
                    // entirely — no labeled blank cell, no `&nbsp;` filler.
                    // The grid is chunked into rows of 4 with the final row
                    // padded by empty `<td>`s only when needed to keep table
                    // column widths consistent for print.
                    const vitalsCells = items
                      .map((item) => {
                        const text = Array.isArray(item.value)
                          ? item.value.join(", ")
                          : String(item.value ?? "");
                        const trimmed = text.trim();
                        if (!trimmed) return null;
                        return {
                          label: item.label,
                          value: withClinicalUnit(item.label, trimmed),
                        };
                      })
                      .filter((c): c is { label: string; value: string } => c !== null);
                    if (vitalsCells.length === 0) return null;
                    const columnsPerRow = 4;
                    const rows: Array<typeof vitalsCells> = [];
                    for (let i = 0; i < vitalsCells.length; i += columnsPerRow) {
                      rows.push(vitalsCells.slice(i, i + columnsPerRow));
                    }
                    return (
                      <table key={sectionKey} className="w-full table-fixed text-[10px] border border-gray-400 print-table">
                        <thead>
                          <tr className="bg-gray-100">
                            <th
                              colSpan={columnsPerRow}
                              className="py-1 px-2 text-left border border-gray-400 font-semibold text-black"
                            >
                              {HOSPITAL_SECTION_TITLES[sectionKey]}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((rowCells, rowIdx) => {
                            const padding = columnsPerRow - rowCells.length;
                            return (
                              <tr
                                key={`vitals-row-${rowIdx}`}
                                className="border-b border-gray-300"
                              >
                                {rowCells.map((cell) => (
                                  <td
                                    key={cell.label}
                                    className="py-1 px-2 text-black align-top"
                                  >
                                    <div className="break-words">
                                      <span className="font-semibold text-gray-700">
                                        {cell.label}:
                                      </span>{" "}
                                      <span>{cell.value}</span>
                                    </div>
                                  </td>
                                ))}
                                {padding > 0 &&
                                  Array.from({ length: padding }).map((_, padIdx) => (
                                    <td
                                      key={`vitals-row-${rowIdx}-pad-${padIdx}`}
                                      className="py-1 px-2 text-black align-top"
                                    />
                                  ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  }
                  if (sectionKey === "testsSuggested") {
                    const testFieldEntries = customFieldEntries.filter(
                      ([key]) => resolveHospitalSectionKey(key) === "testsSuggested",
                    );
                    const layoutRows = buildHospitalTestsSuggestedLayout(testFieldEntries);
                    let mainTestSerial = 0;
                    return (
                      <table
                        key={sectionKey}
                        className="w-full table-fixed text-[10px] border border-gray-400 print-table print-tests-suggested-table"
                      >
                        <colgroup>
                          <col className="print-tests-col-a" />
                          <col className="print-tests-col-b" />
                          <col className="print-tests-col-c" />
                        </colgroup>
                        <thead>
                          <tr className="bg-gray-100">
                            <th
                              className="py-1 px-2 text-left border border-gray-400 font-semibold text-black"
                              colSpan={3}
                            >
                              {HOSPITAL_SECTION_TITLES[sectionKey]}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {layoutRows.map((row, idx) =>
                            row.kind === "simple-row" ? (
                              <tr key={`${sectionKey}-s-${idx}`} className="border-b border-gray-300">
                                {row.cells.map((cell, j) => (
                                  <td
                                    key={`${sectionKey}-s-${idx}-${j}`}
                                    className="py-0.5 px-2 align-top bg-gray-50 text-black font-semibold"
                                  >
                                    {cell ? `${++mainTestSerial}. ${cell}` : "\u00a0"}
                                  </td>
                                ))}
                              </tr>
                            ) : (
                              <tr key={`${sectionKey}-d-${idx}`} className="border-b border-gray-300">
                                <td className="py-0.5 px-2 font-semibold bg-gray-50 text-black align-top whitespace-nowrap">
                                  {`${++mainTestSerial}. ${row.label}`}
                                </td>
                                <td
                                  colSpan={2}
                                  className="py-0.5 px-2 font-normal text-black align-top whitespace-pre-wrap break-words"
                                >
                                  {row.value}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
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
                      <div
                        key={sectionKey}
                        className="w-full text-[10px] border border-gray-400 px-2 py-1 text-black"
                      >
                        <span className="font-semibold">Diagnosis:</span>{" "}
                        <span className="whitespace-pre-wrap break-words">{text}</span>
                      </div>
                    );
                  }
                  return (
                    <table
                      key={sectionKey}
                      className="w-full table-fixed text-[10px] border border-gray-400 print-table print-clinical-field-table"
                    >
                      <colgroup>
                        <col className="print-clinical-label-col" />
                        <col className="print-clinical-value-col" />
                      </colgroup>
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-1 px-2 text-left border border-gray-400 font-semibold text-black" colSpan={2}>
                            {HOSPITAL_SECTION_TITLES[sectionKey]}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((entry) => (
                          <tr key={`${sectionKey}-${entry.label}`} className="border-b border-gray-300 last:border-b-0">
                            <td className="print-clinical-label py-0.5 px-2 font-semibold bg-gray-50 text-black align-top">
                              {entry.label}
                            </td>
                            <td className="print-clinical-value py-0.5 px-2 text-black whitespace-pre-wrap break-words">
                              {Array.isArray(entry.value)
                                ? entry.value.join(", ")
                                : withClinicalUnit(entry.label, String(entry.value))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })}
              </div>
            ) : (
              <table className="w-full text-sm border border-gray-400 print-table">
                <tbody>
                  {customFieldEntries.map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-300 last:border-b-0">
                      <td className="py-2 px-3 font-semibold bg-gray-50 w-64 text-black">
                        {prettifyCustomFieldLabel(key)}
                      </td>
                      <td className="py-2 px-3 text-black whitespace-pre-wrap">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {Object.keys(treatmentFields).length > 0 && (
          <div className="print-section mb-4">
            <h2 className="text-sm font-bold uppercase mb-2 text-black">
              Treatment / Prescription
            </h2>
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
                <div key={key} className="space-y-2 mb-3">
                  {medications.length > 0 && (
                    <table className="w-full text-[10px] border border-gray-400 print-table">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="py-1 px-2 text-left border border-gray-400 font-semibold text-black">Medication</th>
                          <th className="py-1 px-2 text-left border border-gray-400 font-semibold text-black">Dose</th>
                          <th className="py-1 px-2 text-left border border-gray-400 font-semibold text-black">Dose Unit</th>
                          <th className="py-1 px-2 text-left border border-gray-400 font-semibold text-black">Route</th>
                          <th className="py-1 px-2 text-left border border-gray-400 font-semibold text-black">Frequency</th>
                          <th className="py-1 px-2 text-left border border-gray-400 font-semibold text-black">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {medications.map((entry, index) => {
                          const hasNote = String(entry.note ?? "").trim().length > 0;
                          return (
                            <Fragment key={`${key}-${index}`}>
                              <tr className="border-b border-gray-300">
                                <td className="py-1 px-2 text-black">{entry.medication || "—"}</td>
                                <td className="py-1 px-2 text-black">{entry.dose || "—"}</td>
                                <td className="py-1 px-2 text-black">{entry.doseUnit || "—"}</td>
                                <td className="py-1 px-2 text-black">{entry.route || "—"}</td>
                                <td className="py-1 px-2 text-black">{entry.frequency || "—"}</td>
                                <td className="py-1 px-2 text-black">{entry.duration || "—"}</td>
                              </tr>
                              {hasNote && (
                                <tr className="border-b border-gray-300">
                                  <td className="py-1 px-2 text-black font-semibold bg-gray-50">Note</td>
                                  <td className="py-1 px-2 text-black whitespace-pre-wrap" colSpan={5}>
                                    {entry.note}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {value?.generalInstructions?.trim() && (
                    <div className="border border-gray-300 p-2 text-[10px] whitespace-pre-wrap text-black">
                      <span className="font-semibold">General instructions: </span>
                      {value.generalInstructions}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Remarks */}
        {caseData.remarks && (
          <div className="print-section mb-4">
            <h2 className="text-sm font-bold uppercase mb-2 text-black">
              Remarks
            </h2>
            <p className="text-[10px] border border-gray-300 p-2 whitespace-pre-wrap break-words text-black">
              {caseData.remarks}
            </p>
          </div>
        )}

        {isHospitalCase && (() => {
          // Interns are saved as { veterinarianId: null, veterinarianNvc: null,
          // veterinarianDepartment: "Intern" } (see register-case.tsx). For
          // them, suppress the "NVC no. ___" line so the signature block reads
          // cleanly as Name / Intern instead of leaving an empty NVC placeholder.
          const departmentDisplay =
            formatVeterinarianDepartmentDisplay(caseData.veterinarianDepartment);
          const isInternVet = departmentDisplay.toLowerCase() === "intern";
          return (
            <div className="print-section mt-4 mb-3 flex justify-end">
              <div className="text-[10px] text-black text-right w-[11rem] shrink-0 space-y-0.5">
                <div className="border-b-2 border-gray-800 min-h-[1.75rem] w-full max-w-[11rem] ml-auto" />
                <div className="pt-0.5 space-y-0.5 leading-snug">
                  <p className="text-[11px] font-semibold">
                    {caseData.veterinarianName?.trim() ? (
                      caseData.veterinarianName.trim()
                    ) : (
                      <span className="inline-block w-full border-b border-gray-400 min-h-[1em]" />
                    )}
                  </p>
                  {!isInternVet && (
                    <p className="text-[10px]">
                      <span className="text-gray-700">NVC no.</span>{" "}
                      {caseData.veterinarianNvc?.trim() ? (
                        caseData.veterinarianNvc.trim()
                      ) : (
                        <span className="inline-block w-16 border-b border-gray-300 align-bottom" />
                      )}
                    </p>
                  )}
                  <p className="text-[10px]">
                    {departmentDisplay ? (
                      departmentDisplay
                    ) : (
                      <span className="inline-block w-full border-b border-gray-300 min-h-[1em]" />
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Signature Area */}
        {!isHospitalCase && (
        <div className="print-section mt-14 flex justify-between items-end text-sm">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-1 px-8">
              <p className="font-semibold text-black">Laboratory Technician</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-1 px-8">
              <p className="font-semibold text-black">Veterinarian</p>
            </div>
          </div>
        </div>
        )}

        {/* Footer */}
        <div className={`print-section ${isHospitalCase ? "mt-2 pt-2" : "mt-5 pt-3"} border-t border-gray-300 text-center text-xs text-gray-500`}>
          <p>
            {isHospitalCase
              ? "This report is generated by the Veterinary Teaching Hospital Case Registration System."
              : "This report is generated by the Veterinary Teaching Hospital AST Report System."}
          </p>

          {caseData.lastUpdatedBy && caseData.updatedAt && (
            <p className="mt-1">
              Last updated by{" "}
              {caseData.lastUpdatedByName ||
                `User ID ${caseData.lastUpdatedBy}`}{" "}
              on {new Date(caseData.updatedAt).toLocaleString()}
            </p>
          )}

          <p className="mt-1">
            Report generated on {formatBsDate(caseData.date, "long")} (
            {formatAdDate(caseData.dateAd || "")})
          </p>
        </div>
      </div>
    </div>
  );
}