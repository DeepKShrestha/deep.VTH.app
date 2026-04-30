import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, Sparkles, Info } from "lucide-react";
import type { Breakpoint } from "@shared/schema";
import { BsDateInput } from "@/components/bs-date-input";
import { getTodayBsAd, formatBsDate, formatAdDate } from "@/lib/nepali-date";

const DEFAULT_SPECIES_LIST = [
  "Bovine",
  "Canine",
  "Caprine",
  "Equine",
  "Feline",
  "Ovine",
  "Porcine",
  "Avian",
  "Bubaline",
] as const;


interface AstRow {
  breakpointId: number | null;
  antibiotic: string;
  symbol: string;
  discContent: string;
  zoneSize: string;
  sensitivity: "S" | "I" | "R" | "";
  autoSensitivity: "S" | "I" | "R" | "";
  manualOverride: boolean;
}

type FormDefinition = {
  sections: Array<{
    key: string;
    title: string;
    displayOrder: number;
    questions: Array<{
      id: number;
      key: string;
      label: string;
      inputType: string;
      options?: string[];
      enabled: boolean;
      required: boolean;
      displayOrder: number;
      isBuiltin: boolean;
    }>;
  }>;
};

interface RegisterCaseProps {
  pageTitle?: string;
  backHref?: string;
  onSuccessRedirect?: string;
  mode?: "ast" | "hospital";
  createEndpoint?: "/api/cases" | "/api/ast/cases";
  caseScope?: "ast" | "hospital";
}

function AutoGrowTextarea({
  value,
  className = "",
  onInput,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      {...props}
      ref={textareaRef}
      value={value}
      rows={1}
      className={`${className} min-h-[2.5rem] overflow-hidden resize-none`}
      onInput={(event) => {
        const target = event.currentTarget;
        target.style.height = "auto";
        target.style.height = `${target.scrollHeight}px`;
        onInput?.(event);
      }}
    />
  );
}

const DEFAULT_FORM_DEFINITION: FormDefinition = {
  sections: [
    {
      key: "owner",
      title: "Owner Information",
      displayOrder: 1000,
      questions: [
        { id: 1, key: "ownerName", label: "Owner Name", inputType: "text", enabled: true, required: true, displayOrder: 1000, isBuiltin: true },
        { id: 2, key: "ownerPhone", label: "Phone Number", inputType: "text", enabled: true, required: true, displayOrder: 2000, isBuiltin: true },
        { id: 3, key: "ownerAddress", label: "Address", inputType: "textarea", enabled: true, required: true, displayOrder: 3000, isBuiltin: true },
      ],
    },
    {
      key: "animal",
      title: "Animal Information",
      displayOrder: 2000,
      questions: [
        { id: 4, key: "species", label: "Species", inputType: "species", enabled: true, required: true, displayOrder: 1000, isBuiltin: true },
        { id: 5, key: "breed", label: "Breed", inputType: "breed", enabled: true, required: true, displayOrder: 2000, isBuiltin: true },
        { id: 6, key: "animalName", label: "Animal Name", inputType: "text", enabled: true, required: false, displayOrder: 3000, isBuiltin: true },
        { id: 7, key: "age", label: "Age", inputType: "text", enabled: true, required: false, displayOrder: 4000, isBuiltin: true },
        { id: 8, key: "sex", label: "Sex", inputType: "sex", enabled: true, required: false, displayOrder: 5000, isBuiltin: true },
      ],
    },
    {
      key: "sample",
      title: "Sample Information",
      displayOrder: 3000,
      questions: [
        { id: 9, key: "sampleType", label: "Sample Type", inputType: "text", enabled: true, required: false, displayOrder: 1000, isBuiltin: true },
        { id: 10, key: "sampleDate", label: "Sample Collection Date (BS)", inputType: "sampleDate", enabled: true, required: false, displayOrder: 2000, isBuiltin: true },
        { id: 11, key: "cultureResult", label: "Culture / Organism Isolated", inputType: "text", enabled: true, required: false, displayOrder: 3000, isBuiltin: true },
      ],
    },
    {
      key: "ast",
      title: "AST Results",
      displayOrder: 4000,
      questions: [{ id: 12, key: "astResults", label: "Antibiotic Sensitivity Test Results", inputType: "astResults", enabled: true, required: false, displayOrder: 1000, isBuiltin: true }],
    },
    {
      key: "final",
      title: "General Remarks",
      displayOrder: 5000,
      questions: [{ id: 13, key: "remarks", label: "General Remarks", inputType: "textarea", enabled: true, required: false, displayOrder: 1000, isBuiltin: true }],
    },
  ],
};

function interpretZone(zone: number, bp: Breakpoint): "S" | "I" | "R" | "" {
  if (isNaN(zone) || zone <= 0) return "";
  if (zone >= bp.sensitiveMin) return "S";
  if (zone <= bp.resistantMax) return "R";
  if (bp.intermediateLow != null && bp.intermediateHigh != null) {
    if (zone >= bp.intermediateLow && zone <= bp.intermediateHigh) return "I";
  }
  // If no intermediate range but between S and R, call it I
  if (zone > bp.resistantMax && zone < bp.sensitiveMin) return "I";
  return "";
}

function getSensitivityLabel(s: string) {
  switch (s) {
    case "S": return { text: "Sensitive", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" };
    case "I": return { text: "Intermediate", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" };
    case "R": return { text: "Resistant", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" };
    default: return { text: "—", color: "bg-muted text-muted-foreground" };
  }
}

function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentenceCase(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
}

function toEnglishSentence(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim().toLowerCase();
  if (!cleaned) return "";
  return cleaned.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
}

function toPointList(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function toBulletedText(input: string): string {
  return toPointList(input)
    .map((line) => `• ${toEnglishSentence(line)}`)
    .join("\n");
}

function normalizeQuestionId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isHospitalBuiltinQuestionKeyOrLabel(key: string, label?: string, sectionKey?: string): boolean {
  const normalizedSectionKey = normalizeQuestionId(sectionKey || "");
  const normalizedKey = normalizeQuestionId(key);
  const normalizedLabel = normalizeQuestionId(label || "");
  return (
    normalizedSectionKey === "vitals" ||
    normalizedKey === "historynotes" ||
    normalizedKey === "previousmedicationnotes" ||
    normalizedKey.includes("clinicalsign") ||
    normalizedKey.includes("symptom") ||
    normalizedKey.includes("heartrate") ||
    normalizedKey.includes("respiratoryrate") ||
    normalizedKey.includes("respirationrate") ||
    normalizedKey.includes("resprate") ||
    normalizedKey.includes("rumenmotility") ||
    normalizedKey.includes("chiefcomplaint") ||
    normalizedKey.includes("colour") ||
    normalizedKey.includes("color") ||
    normalizedKey.includes("weight") ||
    normalizedKey.includes("temperature") ||
    normalizedKey === "crt" ||
    normalizedKey.includes("capillaryrefilltime") ||
    normalizedKey.includes("dehydration") ||
    normalizedLabel === "history" ||
    normalizedLabel === "previousmedication" ||
    normalizedLabel.includes("clinicalsign") ||
    normalizedLabel.includes("symptom") ||
    normalizedLabel.includes("heartrate") ||
    normalizedLabel.includes("respiratoryrate") ||
    normalizedLabel.includes("respirationrate") ||
    normalizedLabel.includes("resprate") ||
    normalizedLabel.includes("rumenmotility") ||
    normalizedLabel.includes("chiefcomplaint") ||
    normalizedLabel.includes("colour") ||
    normalizedLabel.includes("color") ||
    normalizedLabel.includes("weight") ||
    normalizedLabel.includes("temperature") ||
    normalizedLabel === "crt" ||
    normalizedLabel.includes("capillaryrefilltime") ||
    normalizedLabel.includes("dehydration")
  );
}

function isWeightKeyOrLabel(key: string, label?: string): boolean {
  const normalizedKey = normalizeQuestionId(key);
  const normalizedLabel = normalizeQuestionId(label || "");
  return normalizedKey.includes("weight") || normalizedLabel.includes("weight");
}

function isChiefComplaintKeyOrLabel(key: string, label?: string): boolean {
  const normalizedKey = normalizeQuestionId(key);
  const normalizedLabel = normalizeQuestionId(label || "");
  return normalizedKey.includes("chiefcomplaint") || normalizedLabel.includes("chiefcomplaint");
}

function isTestsSuggestedSectionTitle(title: string): boolean {
  const normalized = normalizeQuestionId(title);
  return (
    normalized.includes("testsuggested") ||
    normalized.includes("testssuggested")
  );
}

function isAvianSpeciesName(speciesName: string): boolean {
  return normalizeQuestionId(speciesName) === "avian";
}

function isHospitalOnlySectionForAst(sectionKey: string, sectionTitle?: string): boolean {
  const normalizedKey = normalizeQuestionId(sectionKey || "");
  const normalizedTitle = normalizeQuestionId(sectionTitle || "");
  return (
    normalizedKey === "history" ||
    normalizedKey.includes("clinical") ||
    normalizedKey === "avian" ||
    normalizedKey === "vitals" ||
    normalizedKey === "testssuggested" ||
    normalizedKey === "testsuggested" ||
    normalizedKey === "tests_suggested" ||
    normalizedTitle.includes("historyandpreviousmedication") ||
    normalizedTitle.includes("clinicalsignsandsymptoms") ||
    normalizedTitle.includes("avianinformation") ||
    normalizedTitle.includes("vitals") ||
    normalizedTitle.includes("testsuggested")
  );
}

function isHospitalOnlyQuestionForAst(question: {
  key: string;
  label: string;
  sectionKey?: string;
}): boolean {
  const normalizedKey = normalizeQuestionId(question.key || "");
  const normalizedLabel = normalizeQuestionId(question.label || "");
  const normalizedSectionKey = normalizeQuestionId(question.sectionKey || "");
  if (isHospitalOnlySectionForAst(normalizedSectionKey, "")) return true;
  const hospitalOnlyKeywords = [
    "history",
    "previousmedication",
    "clinical",
    "symptom",
    "testsuggested",
    "vital",
    "temperature",
    "heartrate",
    "respiratoryrate",
    "respirationrate",
    "resprate",
    "rumenmotility",
    "dehydration",
    "crt",
    "capillaryrefilltime",
    "flock",
    "hatchery",
    "feedsupplier",
    "feedintake",
    "waterintake",
    "mortality",
  ];
  return hospitalOnlyKeywords.some(
    (keyword) => normalizedKey.includes(keyword) || normalizedLabel.includes(keyword),
  );
}

function shouldHideQuestionForAvian(
  key: string,
  label?: string,
  sectionKey?: string,
): boolean {
  const normalizedKey = normalizeQuestionId(key);
  const normalizedLabel = normalizeQuestionId(label || "");
  const normalizedSectionKey = normalizeQuestionId(sectionKey || "");

  const isCrtField =
    normalizedKey === "crt" ||
    normalizedKey.includes("crtseconds") ||
    normalizedKey.includes("capillaryrefilltime") ||
    normalizedLabel === "crt" ||
    normalizedLabel.includes("capillaryrefilltime");
  const isDehydrationField =
    normalizedKey.includes("dehydration") || normalizedLabel.includes("dehydration");
  const isRumenMotilityField =
    normalizedKey.includes("rumenmotility") || normalizedLabel.includes("rumenmotility");
  if (isCrtField || isDehydrationField || isRumenMotilityField) return true;

  const isCoreAvianVital =
    normalizedKey.includes("temperature") ||
    normalizedLabel.includes("temperature") ||
    normalizedKey.includes("heartrate") ||
    normalizedLabel.includes("heartrate") ||
    normalizedKey.includes("respiratoryrate") ||
    normalizedLabel.includes("respiratoryrate") ||
    normalizedKey.includes("respirationrate") ||
    normalizedLabel.includes("respirationrate") ||
    normalizedKey.includes("resprate") ||
    normalizedLabel.includes("resprate");
  if (normalizedSectionKey === "vitals") return !isCoreAvianVital;
  if (normalizedKey === "animalname" || normalizedLabel === "animalname") return true;
  if (normalizedKey.includes("colour") || normalizedKey.includes("color")) return true;
  if (normalizedLabel.includes("colour") || normalizedLabel.includes("color")) return true;
  if (normalizedKey.includes("identification") || normalizedLabel.includes("identification")) return true;
  if (normalizedKey.includes("weight") || normalizedLabel.includes("weight")) return true;

  return false;
}

function isAvianBuiltinFieldKey(key: string): boolean {
  const normalized = normalizeQuestionId(key);
  return (
    normalized === "flocksize" ||
    normalized === "hatchery" ||
    normalized === "feedsupplier" ||
    normalized === "feedintake" ||
    normalized === "waterintake" ||
    normalized === "mortality"
  );
}

function getBirdPerDayUnit(value: string): "bird/day" | "birds/day" {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return "birds/day";
  return numeric === 1 ? "bird/day" : "birds/day";
}

function hasMainSuggestedTest(selected: string[], keyword: string): boolean {
  const normalizedKeyword = normalizeQuestionId(keyword);
  return selected.some((item) => normalizeQuestionId(item).includes(normalizedKeyword));
}

function isLegacyTestsSuggestedTextareaQuestion(question: {
  key: string;
  label: string;
  inputType: string;
  sectionKey?: string;
}): boolean {
  const normalizedLabel = normalizeQuestionId(question.label || "");
  const normalizedKey = normalizeQuestionId(question.key || "");
  return (
    question.inputType === "textarea" &&
    (normalizedLabel === "testssuggested" || normalizedKey.includes("testssuggested"))
  );
}

function ToggleGrid({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (option: string, checked: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded border p-2">
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <label key={opt} className="flex items-center gap-2 text-sm rounded px-2 py-1 hover:bg-muted/40">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onToggle(opt, e.target.checked)}
            />
            <span className="leading-snug">{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function RegisterCase({
  pageTitle = "Register New AST Case",
  backHref = "/",
  onSuccessRedirect = "/",
  mode = "ast",
  createEndpoint = "/api/ast/cases",
  caseScope = "ast",
}: RegisterCaseProps = {}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: caseInfo } = useQuery<{ caseNumber: string; dailyNumber: number; monthlyNumber: number }>({
    queryKey: ["/api/next-case-info", caseScope],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/next-case-info?scope=${caseScope}`);
      return res.json();
    },
  });
  const displayCaseNumber = useMemo(() => {
    const raw = caseInfo?.caseNumber || "...";
    if (mode !== "hospital") return raw;
    // Convert legacy AST prefix to a neutral hospital-case prefix for this flow.
    return raw.replace(/^AST-/i, "CASE-");
  }, [caseInfo?.caseNumber, mode]);

  const { data: breakpointsData } = useQuery<Breakpoint[]>({
    queryKey: ["/api/breakpoints"],
  });
  const { data: speciesOptionsData } = useQuery<string[]>({
    queryKey: ["/api/species-options"],
  });
  const { data: formDefinition } = useQuery<FormDefinition>({
    queryKey: ["/api/form-definition", mode],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/form-definition?scope=${mode}`);
      return res.json();
    },
  });

  // Form state
  const [billNumber, setBillNumber] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [species, setSpecies] = useState("");
  const [customSpecies, setCustomSpecies] = useState("");
  const [breedChoice, setBreedChoice] = useState("");
  const [customBreed, setCustomBreed] = useState("");
  const [breed, setBreed] = useState("");
  const [animalName, setAnimalName] = useState("");
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState<"years" | "months" | "weeks" | "days">("years");
  const [sex, setSex] = useState("");
  const [sampleType, setSampleType] = useState("");
  const [customAnswers, setCustomAnswers] = useState<Record<string, string | string[]>>({});
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, string>>({});
  const [bulletPointModes, setBulletPointModes] = useState<Record<string, boolean>>({
    historyNotes: true,
    previousMedicationNotes: true,
    clinicalSignsSymptomsNotes: true,
  });
  const todayInfo = getTodayBsAd();
  const [dateBs, setDateBs] = useState(todayInfo.bs);
  const [dateAd, setDateAd] = useState(todayInfo.ad);
  const [sampleDateBs, setSampleDateBs] = useState(todayInfo.bs);
  const [sampleDateAd, setSampleDateAd] = useState(todayInfo.ad);
  const [cultureResult, setCultureResult] = useState("");
  const [historyNotes, setHistoryNotes] = useState("");
  const [previousMedicationNotes, setPreviousMedicationNotes] = useState("");
  const [clinicalSignsSymptomsNotes, setClinicalSignsSymptomsNotes] = useState("");
  const [temperatureValue, setTemperatureValue] = useState("");
  const [temperatureUnit, setTemperatureUnit] = useState<"C" | "F">("C");
  const [weightUnit, setWeightUnit] = useState<"kg" | "g">("kg");
  const [crtValue, setCrtValue] = useState("");
  const [dehydrationPercentage, setDehydrationPercentage] = useState("");
  const [avianFlockSize, setAvianFlockSize] = useState("");
  const [avianHatchery, setAvianHatchery] = useState("");
  const [avianFeedSupplier, setAvianFeedSupplier] = useState("");
  const [avianFeedIntake, setAvianFeedIntake] = useState("");
  const [avianWaterIntake, setAvianWaterIntake] = useState("");
  const [avianMortality, setAvianMortality] = useState("");
  const [testsSuggested, setTestsSuggested] = useState<string[]>([]);
  const [enzymePanelTests, setEnzymePanelTests] = useState<string[]>([]);
  const [rapidDiagnosticTests, setRapidDiagnosticTests] = useState<string[]>([]);
  const [biopsyDetails, setBiopsyDetails] = useState("");
  const [cytologyDetails, setCytologyDetails] = useState("");
  const [xrayDetails, setXrayDetails] = useState("");
  const [ultrasoundDetails, setUltrasoundDetails] = useState("");
  const [cultureDetails, setCultureDetails] = useState("");
  const [remarks, setRemarks] = useState("");
  const [autoMode, setAutoMode] = useState(true);
  const [quickRegisterMode, setQuickRegisterMode] = useState(false);
  const [hideOptionalFields, setHideOptionalFields] = useState(false);

    // NEW: toggle to use preset antibiotics
  const [usePresetAntibiotics, setUsePresetAntibiotics] = useState(false);

  const [astRows, setAstRows] = useState<AstRow[]>([
    { breakpointId: null, antibiotic: "", symbol: "", discContent: "", zoneSize: "", sensitivity: "", autoSensitivity: "", manualOverride: false },
  ]);
  const age = ageValue.trim() ? `${ageValue.trim()} ${ageUnit}` : "";

  // Build unique antibiotic options from breakpoints
  const antibioticOptions = useMemo(() => {
    if (!breakpointsData) return [];
    return breakpointsData.map((bp) => ({
      id: bp.id,
      label: `${bp.antibiotic} (${bp.symbol}) — ${bp.content}`,
      bp,
    }));
  }, [breakpointsData]);
      // Breakpoints marked as preset in the Breakpoints admin page
  const presetBreakpoints = useMemo(
    () => (breakpointsData ?? []).filter((bp) => bp.isPreset),
    [breakpointsData]
  );

  const speciesOptions = useMemo(() => {
    const fromApi = (speciesOptionsData ?? []).filter(Boolean);
    const merged = fromApi.length > 0 ? fromApi : [...DEFAULT_SPECIES_LIST];
    return Array.from(new Set([...merged, "Other"]));
  }, [speciesOptionsData]);

  const effectiveSpecies = species === "Other" ? customSpecies.trim() : species;
  const isAvianSpecies = isAvianSpeciesName(effectiveSpecies);
  const { data: breedOptionsData = [] } = useQuery<string[]>({
    queryKey: ["/api/breed-options", effectiveSpecies],
    queryFn: async () => {
      if (!effectiveSpecies.trim()) return [];
      const res = await apiRequest(
        "GET",
        `/api/breed-options?species=${encodeURIComponent(effectiveSpecies.trim())}`,
      );
      return res.json();
    },
    enabled: Boolean(effectiveSpecies.trim()),
  });
  const breedOptions = useMemo(() => {
    const cleaned = (breedOptionsData ?? []).filter(Boolean);
    if (cleaned.length === 0) return ["Other"];
    return Array.from(new Set([...cleaned, "Other"]));
  }, [breedOptionsData]);

  useEffect(() => {
    setBreedChoice("");
    setCustomBreed("");
    setBreed("");
  }, [species, customSpecies]);

  useEffect(() => {
    const computed = breedChoice === "Other" ? customBreed.trim() : breedChoice;
    setBreed(computed);
  }, [breedChoice, customBreed]);

  const allQuestions = useMemo(() => {
    const out: Array<FormDefinition["sections"][number]["questions"][number] & { sectionKey: string }> = [];
    for (const s of formDefinition?.sections ?? []) {
      for (const q of s.questions ?? []) out.push({ ...q, sectionKey: s.key });
    }
    return out;
  }, [formDefinition]);
  const questionByKey = useMemo(() => {
    return new Map(allQuestions.map((q) => [q.key, q]));
  }, [allQuestions]);
  const getQuestionOptions = (key: string, fallback: string[] = []) => {
    const options = questionByKey.get(key)?.options ?? [];
    return options.length > 0 ? options : fallback;
  };
  const isQuestionEnabled = (key: string, fallback = true) =>
    questionByKey.get(key)?.enabled ?? fallback;
  const isQuestionRequired = (key: string, fallback = false) =>
    questionByKey.get(key)?.required ?? fallback;

  // Build AST rows from the preset breakpoint list
  const buildPresetRows = (): AstRow[] => {
    return presetBreakpoints.map((bp) => ({
      breakpointId: bp.id,
      antibiotic: bp.antibiotic,
      symbol: bp.symbol,
      discContent: bp.content,
      zoneSize: "",
      sensitivity: "",
      autoSensitivity: "",
      manualOverride: false,
    }));
  };


  // Keep AST rows in sync with preset toggle state
  useEffect(() => {
    if (usePresetAntibiotics) {
      const rows = buildPresetRows();
      if (rows.length > 0) {
        setAstRows(rows);
      }
      return;
    }

    // Turning presets off should clear preset-selected rows
    setAstRows([
      {
        breakpointId: null,
        antibiotic: "",
        symbol: "",
        discContent: "",
        zoneSize: "",
        sensitivity: "",
        autoSensitivity: "",
        manualOverride: false,
      },
    ]);
  }, [usePresetAntibiotics, breakpointsData]);

  const addRow = () => {
    setAstRows([...astRows, { breakpointId: null, antibiotic: "", symbol: "", discContent: "", zoneSize: "", sensitivity: "", autoSensitivity: "", manualOverride: false }]);
  };

  const removeRow = (index: number) => {
    setAstRows(astRows.filter((_, i) => i !== index));
  };

  const selectAntibiotic = (index: number, bpIdStr: string) => {
    const bpId = parseInt(bpIdStr);
    const bp = breakpointsData?.find((b) => b.id === bpId);
    if (!bp) return;

    const updated = [...astRows];
    const row = updated[index];
    row.breakpointId = bpId;
    row.antibiotic = bp.antibiotic;
    row.symbol = bp.symbol;
    row.discContent = bp.content;

    // Re-interpret if zone already entered
    if (row.zoneSize && autoMode && !row.manualOverride) {
      const zone = parseFloat(row.zoneSize);
      const result = interpretZone(zone, bp);
      row.autoSensitivity = result;
      row.sensitivity = result;
    }

    setAstRows(updated);
  };

  const updateZoneSize = (index: number, value: string) => {
    const updated = [...astRows];
    const row = updated[index];
    row.zoneSize = value;

    if (autoMode && !row.manualOverride && row.breakpointId) {
      const bp = breakpointsData?.find((b) => b.id === row.breakpointId);
      if (bp) {
        const zone = parseFloat(value);
        const result = interpretZone(zone, bp);
        row.autoSensitivity = result;
        row.sensitivity = result;
      }
    }

    setAstRows(updated);
  };

  const setManualSensitivity = (index: number, value: string) => {
    const updated = [...astRows];
    updated[index].sensitivity = value as "S" | "I" | "R" | "";
    updated[index].manualOverride = true;
    setAstRows(updated);
  };

  const toggleRowOverride = (index: number) => {
    const updated = [...astRows];
    const row = updated[index];
    row.manualOverride = !row.manualOverride;
    if (!row.manualOverride && row.breakpointId && row.zoneSize) {
      const bp = breakpointsData?.find((b) => b.id === row.breakpointId);
      if (bp) {
        const result = interpretZone(parseFloat(row.zoneSize), bp);
        row.autoSensitivity = result;
        row.sensitivity = result;
      }
    }
    setAstRows(updated);
  };

  // Recommendation: rank sensitive antibiotics by largest zone size
  const recommendations = useMemo(() => {
    const sensitiveRows = astRows.filter(
      (r) => r.sensitivity === "S" && r.zoneSize && parseFloat(r.zoneSize) > 0
    );
    return sensitiveRows
      .sort((a, b) => parseFloat(b.zoneSize) - parseFloat(a.zoneSize))
      .slice(0, 3)
      .map((r) => ({
        antibiotic: r.antibiotic,
        symbol: r.symbol,
        zoneSize: r.zoneSize,
      }));
  }, [astRows]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", createEndpoint, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/next-case-info"] });
      toast({ title: "Case registered successfully" });
      setLocation(onSuccessRedirect);
    },
    onError: () => {
      toast({ title: "Failed to register case", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mergedCustomAnswers: Record<string, string | string[]> = {
      ...customAnswers,
    };
    for (const [sectionKey, value] of Object.entries(sectionAnswers)) {
      const mappedQuestionKey = sectionLevelQuestionKeyBySection[sectionKey];
      if (!mappedQuestionKey) continue;
      mergedCustomAnswers[mappedQuestionKey] = value;
    }
    const missingRequired =
      (isQuestionRequired("ownerName", true) && !ownerName.trim()) ||
      (isQuestionRequired("ownerAddress", true) && !ownerAddress.trim()) ||
      (isQuestionRequired("ownerPhone", true) && !ownerPhone.trim()) ||
      (isQuestionRequired("species", true) && !effectiveSpecies) ||
      (isQuestionRequired("breed", true) && !breed.trim()) ||
      (!isAvianSpecies && isQuestionRequired("animalName") && !animalName.trim()) ||
      (isQuestionRequired("age") && !ageValue.trim()) ||
      (isQuestionRequired("sex") && !sex.trim()) ||
      (isQuestionRequired("sampleType") && !sampleType.trim()) ||
      (isQuestionRequired("sampleDate") && !sampleDateBs.trim()) ||
      (isQuestionRequired("cultureResult") && !cultureResult.trim()) ||
      (isQuestionRequired("remarks") && !remarks.trim()) ||
      allQuestions.some(
        (q) =>
          !q.isBuiltin &&
          !(mode === "hospital" && isHospitalBuiltinQuestionKeyOrLabel(q.key, q.label, q.sectionKey)) &&
          !(isAvianSpecies && shouldHideQuestionForAvian(q.key, q.label, q.sectionKey)) &&
          q.enabled &&
          q.required &&
          (Array.isArray(mergedCustomAnswers[q.key])
            ? (mergedCustomAnswers[q.key] as string[]).length === 0
            : !String(mergedCustomAnswers[q.key] || "").trim()),
      );
    const missingHospitalBuiltinRequired =
      mode === "hospital" &&
      allQuestions.some((q) => {
        if (!q.enabled || !q.required) return false;
        if (!isHospitalBuiltinQuestionKeyOrLabel(q.key, q.label, q.sectionKey)) return false;
        const normalized = normalizeQuestionId(q.key || q.label || "");
        if (normalized === "historynotes" || normalizeQuestionId(q.label || "") === "history") {
          const useBullets = isBulletPointsEnabled("historyNotes", true);
          return useBullets
            ? toPointList(historyNotes).length === 0
            : !historyNotes.trim();
        }
        if (
          normalized === "previousmedicationnotes" ||
          normalizeQuestionId(q.label || "") === "previousmedication"
        ) {
          const useBullets = isBulletPointsEnabled("previousMedicationNotes", true);
          return useBullets
            ? toPointList(previousMedicationNotes).length === 0
            : !previousMedicationNotes.trim();
        }
        if (normalized.includes("clinicalsign") || normalized.includes("symptom")) {
          const useBullets = isBulletPointsEnabled("clinicalSignsSymptomsNotes", true);
          return useBullets
            ? toPointList(clinicalSignsSymptomsNotes).length === 0
            : !clinicalSignsSymptomsNotes.trim();
        }
        if (normalized.includes("temperature") || normalizeQuestionId(q.label || "").includes("temperature")) {
          return !temperatureValue.trim();
        }
        if (
          normalized === "crt" ||
          normalized.includes("capillaryrefilltime") ||
          normalizeQuestionId(q.label || "") === "crt"
        ) {
          return !crtValue.trim();
        }
        if (normalized.includes("dehydration") || normalizeQuestionId(q.label || "").includes("dehydration")) {
          return !dehydrationPercentage.trim();
        }
        if (isAvianBuiltinFieldKey(q.key)) {
          if (normalized === "flocksize") return !avianFlockSize.trim();
          if (normalized === "hatchery") return !avianHatchery.trim();
          if (normalized === "feedsupplier") return !avianFeedSupplier.trim();
          if (normalized === "feedintake") return !avianFeedIntake.trim();
          if (normalized === "waterintake") return !avianWaterIntake.trim();
          if (normalized === "mortality") return !avianMortality.trim();
        }
        if (normalized === "testssuggested") return testsSuggested.length === 0;
        if (normalized === "enzymepaneltests" && hasMainSuggestedTest(testsSuggested, "enzymepanel")) {
          return enzymePanelTests.length === 0;
        }
        if (normalized === "rapiddiagnostictests" && hasMainSuggestedTest(testsSuggested, "rapiddiagnostictest")) {
          return rapidDiagnosticTests.length === 0;
        }
        if (normalized === "xraydetails" && hasMainSuggestedTest(testsSuggested, "xray")) {
          return !xrayDetails.trim();
        }
        if (normalized === "ultrasounddetails" && hasMainSuggestedTest(testsSuggested, "ultrasound")) {
          return !ultrasoundDetails.trim();
        }
        if (normalized === "biopsydetails" && hasMainSuggestedTest(testsSuggested, "biopsy")) {
          return !biopsyDetails.trim();
        }
        if (normalized === "cytologydetails" && hasMainSuggestedTest(testsSuggested, "cytology")) {
          return !cytologyDetails.trim();
        }
        if (normalized === "culturedetails" && hasMainSuggestedTest(testsSuggested, "culture")) {
          return !cultureDetails.trim();
        }
        return false;
      });

    if (missingRequired || missingHospitalBuiltinRequired) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    const filteredAst = astRows
      .filter((r) => r.antibiotic && r.sensitivity)
      .map((r) => ({
        antibiotic: r.antibiotic,
        symbol: r.symbol,
        discContent: r.discContent,
        zoneSize: r.zoneSize,
        sensitivity: r.sensitivity,
        manualOverride: r.manualOverride,
      }));
    const astRequiredButEmpty =
      mode === "ast" && isQuestionRequired("astResults") && filteredAst.length === 0;

    if (astRequiredButEmpty) {
      toast({
        title: "Please fill in all required fields",
        description: "At least one AST row is required.",
        variant: "destructive",
      });
      return;
    }

    const normalizedCustomAnswers: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(mergedCustomAnswers)) {
      if (isAvianSpecies) {
        const q = questionByKey.get(key);
        if (q && shouldHideQuestionForAvian(q.key, q.label, q.sectionKey)) {
          continue;
        }
      }
      if (typeof value === "string") {
        if (isWeightKeyOrLabel(key)) {
          const trimmed = value.trim();
          normalizedCustomAnswers[key] = trimmed ? `${trimmed} ${weightUnit}` : "";
        } else {
          normalizedCustomAnswers[key] = toTitleCase(value);
        }
      } else {
        normalizedCustomAnswers[key] = value;
      }
    }
    if (mode === "hospital") {
      const useHistoryBullets = isBulletPointsEnabled("historyNotes", true);
      const usePreviousMedicationBullets = isBulletPointsEnabled("previousMedicationNotes", true);
      const useClinicalSignsBullets = isBulletPointsEnabled("clinicalSignsSymptomsNotes", true);
      const historyPoints = toPointList(historyNotes);
      const previousMedicationPoints = toPointList(previousMedicationNotes);
      const clinicalSignsPoints = toPointList(clinicalSignsSymptomsNotes);
      if (useHistoryBullets) {
        if (historyPoints.length > 0) {
          normalizedCustomAnswers.history = historyPoints.map((point) =>
            toEnglishSentence(point),
          );
        }
      } else if (historyNotes.trim()) {
        normalizedCustomAnswers.history = toEnglishSentence(historyNotes.trim());
      }
      if (usePreviousMedicationBullets) {
        if (previousMedicationPoints.length > 0) {
          normalizedCustomAnswers.previousMedication = previousMedicationPoints.map((point) =>
            toEnglishSentence(point),
          );
        }
      } else if (previousMedicationNotes.trim()) {
        normalizedCustomAnswers.previousMedication = toEnglishSentence(previousMedicationNotes.trim());
      }
      if (useClinicalSignsBullets) {
        if (clinicalSignsPoints.length > 0) {
          normalizedCustomAnswers.clinicalSignsAndSymptoms = clinicalSignsPoints.map((point) =>
            toEnglishSentence(point),
          );
        }
      } else if (clinicalSignsSymptomsNotes.trim()) {
        normalizedCustomAnswers.clinicalSignsAndSymptoms = toEnglishSentence(
          clinicalSignsSymptomsNotes.trim(),
        );
      }
      if (temperatureValue.trim()) {
        normalizedCustomAnswers.temperature = `${temperatureValue.trim()} ${temperatureUnit === "C" ? "°C" : "°F"}`;
      }
      if (crtValue.trim()) {
        normalizedCustomAnswers.crtSeconds = crtValue.trim();
      }
      if (dehydrationPercentage.trim()) {
        normalizedCustomAnswers.dehydrationPercentage = dehydrationPercentage.trim();
      }
    }
    for (const [sectionKey, value] of Object.entries(sectionAnswers)) {
      const trimmed = value.trim();
      if (trimmed) {
        const sectionToggleKey = `section:${sectionKey}`;
        const sectionUsesBullets = isBulletPointsEnabled(sectionToggleKey, true);
        normalizedCustomAnswers[sectionKey] = sectionUsesBullets
          ? toPointList(trimmed).map((point) => toEnglishSentence(point))
          : toEnglishSentence(trimmed);
      }
    }
    if (isAvianSpecies) {
      if (isQuestionEnabled("flockSize") && avianFlockSize.trim()) {
        normalizedCustomAnswers.flockSize = toEnglishSentence(avianFlockSize.trim());
      }
      if (isQuestionEnabled("hatchery") && avianHatchery.trim()) {
        normalizedCustomAnswers.hatchery = toEnglishSentence(avianHatchery.trim());
      }
      if (isQuestionEnabled("feedSupplier") && avianFeedSupplier.trim()) {
        normalizedCustomAnswers.feedSupplier = toEnglishSentence(avianFeedSupplier.trim());
      }
      if (isQuestionEnabled("feedIntake") && avianFeedIntake.trim()) {
        normalizedCustomAnswers.feedIntake = `${avianFeedIntake.trim()} g/day`;
      }
      if (isQuestionEnabled("waterIntake") && avianWaterIntake.trim()) {
        normalizedCustomAnswers.waterIntake = `${avianWaterIntake.trim()} ml/day`;
      }
      if (isQuestionEnabled("mortality") && avianMortality.trim()) {
        normalizedCustomAnswers.mortality = `${avianMortality.trim()} ${getBirdPerDayUnit(
          avianMortality,
        )}`;
      }
    }
    if (isQuestionEnabled("testsSuggested") && testsSuggested.length > 0) {
      normalizedCustomAnswers.testsSuggested = testsSuggested.map((v) => toEnglishSentence(v));
    }
    if (hasMainSuggestedTest(testsSuggested, "enzymepanel") && isQuestionEnabled("enzymePanelTests")) {
      if (enzymePanelTests.length > 0) {
        normalizedCustomAnswers.enzymePanelTests = enzymePanelTests.map((v) => toEnglishSentence(v));
      }
    }
    if (hasMainSuggestedTest(testsSuggested, "rapiddiagnostictest") && isQuestionEnabled("rapidDiagnosticTests")) {
      if (rapidDiagnosticTests.length > 0) {
        normalizedCustomAnswers.rapidDiagnosticTests = rapidDiagnosticTests.map((v) =>
          toEnglishSentence(v),
        );
      }
    }
    if (hasMainSuggestedTest(testsSuggested, "xray") && isQuestionEnabled("xrayDetails") && xrayDetails.trim()) {
      normalizedCustomAnswers.xrayDetails = toEnglishSentence(xrayDetails.trim());
    }
    if (hasMainSuggestedTest(testsSuggested, "biopsy") && isQuestionEnabled("biopsyDetails") && biopsyDetails.trim()) {
      normalizedCustomAnswers.biopsyDetails = toEnglishSentence(biopsyDetails.trim());
    }
    if (hasMainSuggestedTest(testsSuggested, "cytology") && isQuestionEnabled("cytologyDetails") && cytologyDetails.trim()) {
      normalizedCustomAnswers.cytologyDetails = toEnglishSentence(cytologyDetails.trim());
    }
    if (
      hasMainSuggestedTest(testsSuggested, "ultrasound") &&
      isQuestionEnabled("ultrasoundDetails") &&
      ultrasoundDetails.trim()
    ) {
      normalizedCustomAnswers.ultrasoundDetails = toEnglishSentence(ultrasoundDetails.trim());
    }
    if (
      hasMainSuggestedTest(testsSuggested, "culture") &&
      isQuestionEnabled("cultureDetails") &&
      cultureDetails.trim()
    ) {
      normalizedCustomAnswers.cultureDetails = toEnglishSentence(cultureDetails.trim());
    }
    for (const q of allQuestions) {
      if (!isChiefComplaintKeyOrLabel(q.key, q.label)) continue;
      const raw = mergedCustomAnswers[q.key];
      if (typeof raw !== "string" || !raw.trim()) continue;
      const chiefKey = `chiefComplaint:${q.key}`;
      normalizedCustomAnswers[q.key] = isBulletPointsEnabled(chiefKey, true)
        ? toPointList(raw).map((point) => toEnglishSentence(point))
        : toEnglishSentence(raw.trim());
    }

    createMutation.mutate({
      caseNumber:
        mode === "hospital"
          ? (caseInfo?.caseNumber || "CASE-000").replace(/^AST-/i, "CASE-")
          : caseInfo?.caseNumber || "AST-000",
      billNumber: billNumber || null,
      dailyNumber: caseInfo?.dailyNumber || 1,
      monthlyNumber: caseInfo?.monthlyNumber || 1,
      date: dateBs,
      dateAd: dateAd || null,
      ownerName: toTitleCase(ownerName),
      ownerAddress: isQuestionEnabled("ownerAddress", true) ? toTitleCase(ownerAddress) : "",
      ownerPhone: isQuestionEnabled("ownerPhone", true) ? ownerPhone : "",
      species: isQuestionEnabled("species", true) ? toTitleCase(effectiveSpecies) : "",
      breed: isQuestionEnabled("breed", true) ? toTitleCase(breed) : "",
      animalName:
        !isAvianSpecies && isQuestionEnabled("animalName")
          ? toTitleCase(animalName) || null
          : null,
      age: isQuestionEnabled("age") ? age || null : null,
      sex: isQuestionEnabled("sex") ? toTitleCase(sex) || null : null,
      sampleType: isQuestionEnabled("sampleType") ? toTitleCase(sampleType) || null : null,
      sampleDate: isQuestionEnabled("sampleDate") ? sampleDateBs || null : null,
      sampleDateAd: sampleDateAd || null,
      cultureResult: isQuestionEnabled("cultureResult") ? toTitleCase(cultureResult) || null : null,
      astResults: JSON.stringify(mode === "ast" ? filteredAst : []),
      remarks: isQuestionEnabled("remarks") ? toSentenceCase(remarks) || null : null,
      customFields:
        Object.keys(normalizedCustomAnswers).length > 0
          ? JSON.stringify(normalizedCustomAnswers)
          : null,
    });
  };

  const effectiveDefinition: FormDefinition = useMemo(() => {
    if ((formDefinition?.sections?.length ?? 0) > 0) return formDefinition!;
    return DEFAULT_FORM_DEFINITION;
  }, [formDefinition]);

  const enabledSections = useMemo(() => {
    const baseSections = (effectiveDefinition.sections ?? [])
      .filter((section) =>
        mode === "ast" ? !isHospitalOnlySectionForAst(section.key, section.title) : true,
      )
      .map((s) => ({
        ...s,
        questions: (s.questions ?? []).filter((q) => {
          if (mode === "ast" && isHospitalOnlyQuestionForAst({ ...q, sectionKey: s.key })) {
            return false;
          }
          if (
            mode === "hospital" &&
            (q.key === "animalName" || q.key === "age" || q.key === "sex")
          ) {
            if (isAvianSpecies && q.key === "animalName") return false;
            return true;
          }
          return q.enabled;
        }),
      }));
    if (mode !== "hospital") return baseSections;
    let nextSections = [...baseSections];
    const hasHistorySection = nextSections.some((s) => s.key === "history");
    if (!hasHistorySection) {
      nextSections = [
        ...nextSections,
        {
          key: "history",
          title: "History and Previous Medication",
          displayOrder: 2500,
          questions: [
            {
              id: -1001,
              key: "historyNotes",
              label: "History",
              inputType: "textarea",
              enabled: true,
              required: false,
              displayOrder: 1000,
              isBuiltin: true,
            },
            {
              id: -1002,
              key: "previousMedicationNotes",
              label: "Previous Medication",
              inputType: "textarea",
              enabled: true,
              required: false,
              displayOrder: 2000,
              isBuiltin: true,
            },
          ],
        },
      ];
    }
    const hasClinicalSignsSection = nextSections.some((s) => {
      const normalized = normalizeQuestionId(s.key || s.title || "");
      return normalized.includes("clinicalsign") || normalized.includes("symptom");
    });
    if (!hasClinicalSignsSection) {
      const clinicalSection = {
        key: "clinical_signs_symptoms",
        title: "Clinical Signs and Symptoms",
        displayOrder: 2550,
        questions: [
          {
            id: -1003,
            key: "clinicalSignsSymptomsNotes",
              label: "List the clinical signs and symptoms",
            inputType: "textarea",
            enabled: true,
            required: false,
            displayOrder: 1000,
            isBuiltin: true,
          },
        ],
      };
      const historySectionIndex = nextSections.findIndex((s) => {
        const normalized = normalizeQuestionId(s.key || s.title || "");
        return normalized === "history" || normalized.includes("historyandpreviousmedication");
      });
      if (historySectionIndex >= 0) {
        nextSections = [
          ...nextSections.slice(0, historySectionIndex + 1),
          clinicalSection,
          ...nextSections.slice(historySectionIndex + 1),
        ];
      } else {
        nextSections = [...nextSections, clinicalSection];
      }
    }
    const hasAvianSection = nextSections.some((s) => s.key === "avian");
    if (!hasAvianSection) {
      nextSections = [
        ...nextSections,
        {
          key: "avian",
          title: "Avian Information",
          displayOrder: 2600,
          questions: [
            { id: -1101, key: "flockSize", label: "Flock Size", inputType: "number", enabled: true, required: false, displayOrder: 1000, isBuiltin: true },
            { id: -1102, key: "hatchery", label: "Hatchery", inputType: "text", enabled: true, required: false, displayOrder: 2000, isBuiltin: true },
            { id: -1103, key: "feedSupplier", label: "Feed Supplier", inputType: "text", enabled: true, required: false, displayOrder: 3000, isBuiltin: true },
            { id: -1104, key: "feedIntake", label: "Feed Intake", inputType: "text", enabled: true, required: false, displayOrder: 4000, isBuiltin: true },
            { id: -1105, key: "waterIntake", label: "Water Intake", inputType: "text", enabled: true, required: false, displayOrder: 5000, isBuiltin: true },
            { id: -1106, key: "mortality", label: "Mortality", inputType: "text", enabled: true, required: false, displayOrder: 6000, isBuiltin: true },
          ],
        },
      ];
    }
    const testsSuggestedQuestionBlueprint = [
      {
        id: -1201,
        key: "testsSuggested",
        label: "Please select the required tests",
        inputType: "multiSelect",
        enabled: true,
        required: false,
        displayOrder: 1000,
        isBuiltin: true,
        options: [
          "Complete Blood Count (CBC)",
          "Enzyme Panel Test",
          "Fecal Test",
          "Urinalysis",
          "Rapid Diagnostic Test",
          "X-Ray",
          "Ultrasound",
          "Electro Cardio Gram (ECG)",
          "Skin Scraping",
          "Cytology",
          "Biopsy",
          "Culture",
        ],
      },
      {
        id: -1202,
        key: "enzymePanelTests",
        label: "Enzyme Panel Tests",
        inputType: "multiSelect",
        enabled: true,
        required: false,
        displayOrder: 2000,
        isBuiltin: true,
        options: ["Liver Function Test (LFT)", "Kidney Function Test (KFT)", "Thyroid Test"],
      },
      {
        id: -1203,
        key: "rapidDiagnosticTests",
        label: "Rapid Diagnostic Tests",
        inputType: "multiSelect",
        enabled: true,
        required: false,
        displayOrder: 3000,
        isBuiltin: true,
        options: ["Parvo", "Distemper", "Rabies", "Anaplasma", "Babesia", "Ehrlichia"],
      },
      { id: -1204, key: "biopsyDetails", label: "Biopsy Details", inputType: "text", enabled: true, required: false, displayOrder: 4000, isBuiltin: true },
      { id: -1205, key: "cytologyDetails", label: "Cytology Details", inputType: "text", enabled: true, required: false, displayOrder: 5000, isBuiltin: true },
      { id: -1206, key: "xrayDetails", label: "X-Ray Details", inputType: "text", enabled: true, required: false, displayOrder: 6000, isBuiltin: true },
      { id: -1207, key: "ultrasoundDetails", label: "Ultrasound Details", inputType: "text", enabled: true, required: false, displayOrder: 7000, isBuiltin: true },
      { id: -1208, key: "cultureDetails", label: "Culture Details", inputType: "text", enabled: true, required: false, displayOrder: 8000, isBuiltin: true },
    ];
    const testsSuggestedSectionIndex = nextSections.findIndex((s) => {
      const normalized = normalizeQuestionId(s.title || s.key || "");
      return normalized.includes("testsuggested") || normalized.includes("testssuggested");
    });
    if (testsSuggestedSectionIndex >= 0) {
      const targetSection = nextSections[testsSuggestedSectionIndex];
      const filteredExisting = (targetSection.questions ?? []).filter(
        (q) => !isLegacyTestsSuggestedTextareaQuestion({ ...q, sectionKey: targetSection.key }),
      );
      const existingKeys = new Set(filteredExisting.map((q) => normalizeQuestionId(q.key)));
      const missingQuestions = testsSuggestedQuestionBlueprint.filter(
        (q) => !existingKeys.has(normalizeQuestionId(q.key)),
      );
      nextSections[testsSuggestedSectionIndex] = {
        ...targetSection,
        key: targetSection.key || "tests_suggested",
        title: "Tests Suggested",
        displayOrder: targetSection.displayOrder ?? 4500,
        questions: [...filteredExisting, ...missingQuestions].sort(
          (a, b) => a.displayOrder - b.displayOrder,
        ),
      };
    }
    const hasTestsSuggestedSection = testsSuggestedSectionIndex >= 0;
    if (!hasTestsSuggestedSection) {
      nextSections = [
        ...nextSections,
        {
          key: "tests_suggested",
          title: "Tests Suggested",
          displayOrder: 4500,
          questions: testsSuggestedQuestionBlueprint,
        },
      ];
    }
    return nextSections;
  }, [effectiveDefinition, mode, isAvianSpecies]);
  const sectionLevelQuestionKeyBySection = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of enabledSections) {
      const qs = section.questions ?? [];
      if (qs.length !== 1) continue;
      const only = qs[0];
      if (only.isBuiltin) continue;
      if (normalizeQuestionId(only.label) === normalizeQuestionId(section.title)) {
        map[section.key] = only.key;
      }
    }
    return map;
  }, [enabledSections]);

  const renderCustomQuestion = (q: NonNullable<FormDefinition["sections"]>[number]["questions"][number]) => {
    const value = customAnswers[q.key] ?? "";
    const required = q.required;
    const options = q.options ?? [];
    if (q.inputType === "singleSelect") {
  return (
        <div className="space-y-1.5" key={q.key}>
          <Label>
            {q.label} {required && <span className="text-destructive">*</span>}
          </Label>
          <Select
            value={typeof value === "string" ? value : ""}
            onValueChange={(v) => setCustomAnswers((prev) => ({ ...prev, [q.key]: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select option" />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (q.inputType === "multiSelect") {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1.5" key={q.key}>
          <Label>
            {q.label} {required && <span className="text-destructive">*</span>}
          </Label>
          <div className="space-y-2 rounded border p-2">
            {options.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, opt]
                        : selected.filter((s) => s !== opt);
                      setCustomAnswers((prev) => ({ ...prev, [q.key]: next }));
                    }}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
      );
    }
    if (q.inputType === "yesNo") {
      return (
        <div className="space-y-1.5" key={q.key}>
          <Label>
            {q.label} {required && <span className="text-destructive">*</span>}
          </Label>
          <Select
            value={typeof value === "string" ? value : ""}
            onValueChange={(v) => setCustomAnswers((prev) => ({ ...prev, [q.key]: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (q.inputType === "date") {
      return (
        <div className="space-y-1.5" key={q.key}>
          <Label>
            {q.label} {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) =>
              setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
            }
          />
        </div>
      );
    }
    if (q.inputType === "textarea") {
      return (
        <div className="space-y-1.5" key={q.key}>
          <Label>
            {q.label} {required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) =>
              setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
            }
            onBlur={(e) =>
              setCustomAnswers((prev) => ({ ...prev, [q.key]: toTitleCase(e.target.value) }))
            }
            rows={2}
          />
        </div>
      );
    }
    return (
      <div className="space-y-1.5" key={q.key}>
        <Label>
          {q.label} {required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          type={q.inputType === "number" ? "number" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) =>
            setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
          }
          onBlur={(e) => {
            if (q.inputType !== "number") {
              setCustomAnswers((prev) => ({ ...prev, [q.key]: toTitleCase(e.target.value) }));
            }
          }}
        />
      </div>
    );
  };
  const shouldShowQuestion = (required: boolean, key?: string) => {
    if (
      mode === "hospital" &&
      (key === "animalName" || key === "age" || key === "sex")
    ) {
      if (isAvianSpecies && key === "animalName") return false;
      return true;
    }
    return !hideOptionalFields || required;
  };
  const isBulletPointsEnabled = (fieldKey: string, fallback = false) =>
    bulletPointModes[fieldKey] ?? fallback;
  useEffect(() => {
    setBulletPointModes((prev) => ({
      ...prev,
      historyNotes: true,
      previousMedicationNotes: true,
      clinicalSignsSymptomsNotes: true,
    }));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold" data-testid="text-page-title">
            {pageTitle}
          </h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-muted-foreground">
            <span>Case #{displayCaseNumber}</span>
            <span>Day #{caseInfo?.dailyNumber || "..."}</span>
            <span>Month #{caseInfo?.monthlyNumber || "..."}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="pt-4 pb-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Quick register mode</p>
                <p className="text-xs text-muted-foreground">
                  Optimized for tablet/mobile field work with bigger touch targets.
                </p>
              </div>
              <Switch
                checked={quickRegisterMode}
                onCheckedChange={setQuickRegisterMode}
                data-testid="switch-quick-register-mode"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Hide optional fields
              </p>
              <Switch
                checked={hideOptionalFields}
                onCheckedChange={setHideOptionalFields}
                data-testid="switch-hide-optional-fields"
              />
            </div>
          </CardContent>
        </Card>

        {/* Registration / Bill Number */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="billNumber">Hospital Bill / Registration Number</Label>
              <Input
                id="billNumber"
                className={quickRegisterMode ? "h-11 text-base" : ""}
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="Enter hospital bill or registration number"
                data-testid="input-bill-number"
              />
              <p className="text-xs text-muted-foreground">
                {mode === "ast"
                  ? "Links this AST case to the hospital billing system"
                  : "Links this hospital case to the billing or registration system"}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <BsDateInput
                value={dateBs}
                onChange={(bs, ad) => { setDateBs(bs); setDateAd(ad); }}
                label="Case Date (BS)"
                required
                testIdPrefix="case-date"
              />
            </div>
          </CardContent>
        </Card>

        {enabledSections.map((section) => {
          if (mode === "hospital" && section.key === "sample") return null;
          if (mode === "hospital" && section.key === "avian" && !isAvianSpecies) return null;
          const configuredQuestions = section.questions ?? [];
          const hasTestsSuggestedMultiSelect = configuredQuestions.some(
            (q) => normalizeQuestionId(q.key) === "testssuggested" && q.inputType === "multiSelect",
          );
          const visibleQuestions = configuredQuestions.filter((q) => {
            if (isLegacyTestsSuggestedTextareaQuestion({ ...q, sectionKey: section.key })) {
              return false;
            }
            if (
              hasTestsSuggestedMultiSelect &&
              normalizeQuestionId(q.label) === normalizeQuestionId(section.title) &&
              q.inputType === "textarea"
            ) {
              return false;
            }
            return (
              shouldShowQuestion(q.required, q.key) &&
              !(isAvianSpecies && shouldHideQuestionForAvian(q.key, q.label, section.key))
            );
          });
          const hasDuplicateSectionQuestion =
            visibleQuestions.length === 1 &&
            !visibleQuestions[0].isBuiltin &&
            normalizeQuestionId(visibleQuestions[0].label) ===
              normalizeQuestionId(section.title);
          const sectionActsAsQuestion =
            section.key !== "ast" &&
            (configuredQuestions.length === 0 || hasDuplicateSectionQuestion);
          if (!sectionActsAsQuestion && visibleQuestions.length === 0) return null;
          if (section.key === "ast") {
            if (mode === "hospital") return null;
            const astQuestion = visibleQuestions.find((q) => q.key === "astResults");
            const astIsRequired = Boolean(astQuestion?.required);
            return (
              <div key={section.key} className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <CardTitle className="text-base">
                        Antibiotic Sensitivity Test Results{" "}
                        {astIsRequired && <span className="text-destructive">*</span>}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="preset-antibiotics"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Use preset panel
                  </Label>
                  <Switch
                    id="preset-antibiotics"
                    checked={usePresetAntibiotics}
                    onCheckedChange={setUsePresetAntibiotics}
                  />
                </div>
                <div className="flex items-center gap-2">
                          <Label
                            htmlFor="auto-mode"
                            className="text-xs text-muted-foreground cursor-pointer"
                          >
                    Auto-interpret
                  </Label>
                  <Switch
                    id="auto-mode"
                    checked={autoMode}
                    onCheckedChange={setAutoMode}
                    data-testid="switch-auto-mode"
                  />
                </div>
              </div>
            </div>
            {autoMode && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Info className="w-3 h-3" />
                Zone sizes are auto-interpreted using breakpoint data. Toggle off or override per row for manual entry.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {astRows.map((row, index) => (
              <div key={index} className="border border-border rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Antibiotic #{index + 1}</span>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                    {autoMode && row.breakpointId && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.manualOverride}
                          onChange={() => toggleRowOverride(index)}
                          className="rounded"
                        />
                        Manual override
                      </label>
                    )}
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(index)}
                      disabled={astRows.length === 1}
                      data-testid={`button-remove-row-${index}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Antibiotic</Label>
                    <Select
                      value={row.breakpointId ? String(row.breakpointId) : ""}
                      onValueChange={(val) => selectAntibiotic(index, val)}
                    >
                      <SelectTrigger data-testid={`select-antibiotic-${index}`}>
                        <SelectValue placeholder="Select antibiotic" />
                      </SelectTrigger>
                      <SelectContent>
                        {antibioticOptions.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Zone of Inhibition (mm)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={row.zoneSize}
                      onChange={(e) => updateZoneSize(index, e.target.value)}
                      placeholder="Enter zone size in mm"
                      data-testid={`input-zone-${index}`}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {(!autoMode || row.manualOverride) ? (
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-xs">Sensitivity (Manual)</Label>
                      <Select
                        value={row.sensitivity}
                        onValueChange={(val) => setManualSensitivity(index, val)}
                      >
                        <SelectTrigger data-testid={`select-sensitivity-${index}`}>
                          <SelectValue placeholder="Select result" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="S">S (Sensitive)</SelectItem>
                          <SelectItem value="I">I (Intermediate)</SelectItem>
                          <SelectItem value="R">R (Resistant)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <Label className="text-xs block mb-1.5">Interpretation</Label>
                      {row.sensitivity ? (
                        <Badge className={`${getSensitivityLabel(row.sensitivity).color} border-0 text-xs`}>
                          {getSensitivityLabel(row.sensitivity).text} ({row.sensitivity})
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {row.breakpointId ? "Enter zone size to auto-interpret" : "Select an antibiotic first"}
                        </span>
                      )}
                    </div>
                  )}

                  {row.breakpointId && (
                            <div className="text-xs text-muted-foreground sm:text-right">
                      {(() => {
                        const bp = breakpointsData?.find((b) => b.id === row.breakpointId);
                        if (!bp) return null;
                        return (
                          <div>
                            <span className="text-emerald-600 dark:text-emerald-400">S≥{bp.sensitiveMin}</span>
                            {bp.intermediateLow != null && bp.intermediateHigh != null && (
                              <span className="text-amber-600 dark:text-amber-400 ml-2">I:{bp.intermediateLow}–{bp.intermediateHigh}</span>
                            )}
                            <span className="text-red-600 dark:text-red-400 ml-2">R≤{bp.resistantMax}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow} data-testid="button-add-antibiotic">
              <Plus className="w-3.5 h-3.5" />
              Add Antibiotic
            </Button>
          </CardContent>
        </Card>

        {recommendations.length > 0 && (
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Recommended Antibiotics
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Based on sensitivity results — ranked by largest zone of inhibition among sensitive antibiotics
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recommendations.map((rec, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="font-medium">{rec.antibiotic} ({rec.symbol})</span>
                    <span className="text-muted-foreground">— zone: {rec.zoneSize} mm</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
              </div>
            );
          }

          return (
            <Card key={section.key}>
          <CardHeader className="pb-4">
                <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
              <CardContent className="space-y-4">
                {sectionActsAsQuestion ? (
                  <div className="space-y-1.5">
                    {isTestsSuggestedSectionTitle(section.title) && (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-muted-foreground">Bullet points</span>
                        <Switch
                          checked={isBulletPointsEnabled(`section:${section.key}`, true)}
                          onCheckedChange={(checked) =>
                            setBulletPointModes((prev) => ({
                              ...prev,
                              [`section:${section.key}`]: checked,
                            }))
                          }
                        />
                      </div>
                    )}
                    <Textarea
                      id={`section-answer-${section.key}`}
                      className={quickRegisterMode ? "text-base" : ""}
                      value={sectionAnswers[section.key] ?? ""}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setSectionAnswers((prev) => ({
                          ...prev,
                          [section.key]: nextValue,
                        }));
                        const mappedQuestionKey =
                          sectionLevelQuestionKeyBySection[section.key];
                        if (mappedQuestionKey) {
                          setCustomAnswers((prev) => ({
                            ...prev,
                            [mappedQuestionKey]: nextValue,
                          }));
                        }
                      }}
                      onBlur={(e) => {
                        if (isTestsSuggestedSectionTitle(section.title) && isBulletPointsEnabled(`section:${section.key}`, true)) {
                          const bulleted = toBulletedText(e.target.value);
                          setSectionAnswers((prev) => ({ ...prev, [section.key]: bulleted }));
                          const mappedQuestionKey = sectionLevelQuestionKeyBySection[section.key];
                          if (mappedQuestionKey) {
                            setCustomAnswers((prev) => ({ ...prev, [mappedQuestionKey]: bulleted }));
                          }
                        }
                      }}
                      rows={4}
                      data-testid={`textarea-section-${section.key}`}
                    />
                  </div>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {visibleQuestions.map((q) => {
                    const required = q.required;
                    if (!q.isBuiltin && !(mode === "hospital" && isHospitalBuiltinQuestionKeyOrLabel(q.key, q.label, section.key))) {
                      return renderCustomQuestion(q);
                    }

                    switch (q.key) {
                      case "ownerName":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="ownerName">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="ownerName"
                              className={quickRegisterMode ? "h-11 text-base" : ""}
                              value={ownerName}
                              onChange={(e) => setOwnerName(e.target.value)}
                              onBlur={(e) => setOwnerName(toTitleCase(e.target.value))}
                              placeholder="Full name"
                              data-testid="input-owner-name"
                            />
                          </div>
                        );
                      case "ownerPhone":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="ownerPhone">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="ownerPhone"
                              className={quickRegisterMode ? "h-11 text-base" : ""}
                              value={ownerPhone}
                              onChange={(e) => setOwnerPhone(e.target.value)}
                              placeholder="e.g. 98XXXXXXXX"
                              data-testid="input-owner-phone"
                            />
                          </div>
                        );
                      case "species":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label>
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Select value={species} onValueChange={setSpecies}>
                              <SelectTrigger className={quickRegisterMode ? "h-11 text-base" : ""} data-testid="select-species">
                                <SelectValue placeholder="Select species" />
                              </SelectTrigger>
                              <SelectContent>
                                {speciesOptions.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {species === "Other" && (
                              <Input
                                className={quickRegisterMode ? "mt-2 h-11 text-base" : "mt-2"}
                                value={customSpecies}
                                onChange={(e) => setCustomSpecies(e.target.value)}
                                onBlur={(e) => setCustomSpecies(toTitleCase(e.target.value))}
                                placeholder="Type species manually"
                                data-testid="input-custom-species"
                              />
                            )}
                          </div>
                        );
                      case "breed":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label>
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Select value={breedChoice} onValueChange={setBreedChoice}>
                              <SelectTrigger className={quickRegisterMode ? "h-11 text-base" : ""} data-testid="select-breed">
                                <SelectValue placeholder="Select breed" />
                              </SelectTrigger>
                              <SelectContent>
                                {breedOptions.map((b) => (
                                  <SelectItem key={b} value={b}>
                                    {b}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {breedChoice === "Other" && (
                              <Input
                                className={quickRegisterMode ? "mt-2 h-11 text-base" : "mt-2"}
                                value={customBreed}
                                onChange={(e) => setCustomBreed(e.target.value)}
                                onBlur={(e) => setCustomBreed(toTitleCase(e.target.value))}
                                placeholder="Type breed manually"
                                data-testid="input-custom-breed"
                              />
                            )}
                          </div>
                        );
                      case "sex":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label>
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Select value={sex} onValueChange={setSex}>
                              <SelectTrigger className={quickRegisterMode ? "h-11 text-base" : ""} data-testid="select-sex">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Male">Male</SelectItem>
                                <SelectItem value="Female">Female</SelectItem>
                                {!isAvianSpecies && <SelectItem value="Castrated">Castrated</SelectItem>}
                                {!isAvianSpecies && <SelectItem value="Spayed">Spayed</SelectItem>}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      case "sampleDate":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <BsDateInput
                              value={sampleDateBs}
                              onChange={(bs, ad) => { setSampleDateBs(bs); setSampleDateAd(ad); }}
                              label={q.label}
                              required={required}
                              testIdPrefix="sample-date"
                            />
                          </div>
                        );
                      case "ownerAddress":
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label htmlFor="ownerAddress">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Textarea
                              id="ownerAddress"
                              className={quickRegisterMode ? "text-base" : ""}
                              value={ownerAddress}
                              onChange={(e) => setOwnerAddress(e.target.value)}
                              onBlur={(e) => setOwnerAddress(toTitleCase(e.target.value))}
                              placeholder="Full address"
                              rows={2}
                              data-testid="input-owner-address"
                            />
                          </div>
                        );
                      case "cultureResult":
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label htmlFor="cultureResult">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="cultureResult"
                              className={quickRegisterMode ? "h-11 text-base" : ""}
                              value={cultureResult}
                              onChange={(e) => setCultureResult(e.target.value)}
                              onBlur={(e) => setCultureResult(toTitleCase(e.target.value))}
                              placeholder="e.g. Staphylococcus aureus, E. coli"
                              data-testid="input-culture-result"
                            />
                          </div>
                        );
                      case "remarks":
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <AutoGrowTextarea
                              className={quickRegisterMode ? "text-base" : ""}
                              value={remarks}
                              onChange={(e) => setRemarks(e.target.value)}
                              onBlur={(e) => setRemarks(toSentenceCase(e.target.value))}
                              placeholder="Any additional notes, observations, or recommendations..."
                              data-testid="input-remarks"
                            />
                          </div>
                        );
                      case "historyNotes":
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="historyNotes">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Bullet points</span>
                                <Switch
                                  checked={isBulletPointsEnabled("historyNotes", true)}
                                  onCheckedChange={(checked) =>
                                    setBulletPointModes((prev) => ({ ...prev, historyNotes: checked }))
                                  }
                                />
                              </div>
                            </div>
                            <AutoGrowTextarea
                              id="historyNotes"
                              className={quickRegisterMode ? "text-base" : ""}
                              value={historyNotes}
                              onChange={(e) => setHistoryNotes(e.target.value)}
                              onBlur={(e) => {
                                if (isBulletPointsEnabled("historyNotes", true)) {
                                  setHistoryNotes(toBulletedText(e.target.value));
                                }
                              }}
                              placeholder=""
                              data-testid="input-history-notes"
                            />
                          </div>
                        );
                      case "previousMedicationNotes":
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="previousMedicationNotes">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Bullet points</span>
                                <Switch
                                  checked={isBulletPointsEnabled("previousMedicationNotes", true)}
                                  onCheckedChange={(checked) =>
                                    setBulletPointModes((prev) => ({
                                      ...prev,
                                      previousMedicationNotes: checked,
                                    }))
                                  }
                                />
                              </div>
                            </div>
                            <AutoGrowTextarea
                              id="previousMedicationNotes"
                              className={quickRegisterMode ? "text-base" : ""}
                              value={previousMedicationNotes}
                              onChange={(e) => setPreviousMedicationNotes(e.target.value)}
                              onBlur={(e) => {
                                if (isBulletPointsEnabled("previousMedicationNotes", true)) {
                                  setPreviousMedicationNotes(toBulletedText(e.target.value));
                                }
                              }}
                              placeholder=""
                              data-testid="input-previous-medication-notes"
                            />
                          </div>
                        );
                      case "clinicalSignsSymptomsNotes":
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="clinicalSignsSymptomsNotes">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Bullet points</span>
                                <Switch
                                  checked={isBulletPointsEnabled("clinicalSignsSymptomsNotes", true)}
                                  onCheckedChange={(checked) =>
                                    setBulletPointModes((prev) => ({
                                      ...prev,
                                      clinicalSignsSymptomsNotes: checked,
                                    }))
                                  }
                                />
                              </div>
                            </div>
                            <AutoGrowTextarea
                              id="clinicalSignsSymptomsNotes"
                              className={quickRegisterMode ? "text-base" : ""}
                              value={clinicalSignsSymptomsNotes}
                              onChange={(e) => setClinicalSignsSymptomsNotes(e.target.value)}
                              onBlur={(e) => {
                                if (isBulletPointsEnabled("clinicalSignsSymptomsNotes", true)) {
                                  setClinicalSignsSymptomsNotes(toBulletedText(e.target.value));
                                }
                              }}
                              placeholder=""
                              data-testid="input-clinical-signs-symptoms-notes"
                            />
                          </div>
                        );
                      case "temperature":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="temperature">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id="temperature"
                                type="number"
                                step="0.1"
                                className={quickRegisterMode ? "h-11 text-base" : ""}
                                value={temperatureValue}
                                onChange={(e) => setTemperatureValue(e.target.value)}
                                data-testid="input-temperature"
                              />
                              <Select
                                value={temperatureUnit}
                                onValueChange={(v) => setTemperatureUnit(v as "C" | "F")}
                              >
                                <SelectTrigger className={quickRegisterMode ? "h-11 text-base w-[120px]" : "w-[120px]"}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="C">°C</SelectItem>
                                  <SelectItem value="F">°F</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      case "crt":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="crt">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id="crt"
                                type="number"
                                step="0.1"
                                className={quickRegisterMode ? "h-11 text-base" : ""}
                                value={crtValue}
                                onChange={(e) => setCrtValue(e.target.value)}
                                data-testid="input-crt"
                              />
                              <span className="text-sm text-muted-foreground min-w-[60px]">Seconds</span>
                            </div>
                          </div>
                        );
                      case "dehydrationPercentage":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="dehydrationPercentage">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id="dehydrationPercentage"
                                type="number"
                                step="0.1"
                                className={quickRegisterMode ? "h-11 text-base" : ""}
                                value={dehydrationPercentage}
                                onChange={(e) => setDehydrationPercentage(e.target.value)}
                                data-testid="input-dehydration-percentage"
                              />
                              <span className="text-sm text-muted-foreground min-w-[20px]">%</span>
                            </div>
                          </div>
                        );
                      case "animalName":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="animalName">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="animalName"
                              className={quickRegisterMode ? "h-11 text-base" : ""}
                              value={animalName}
                              onChange={(e) => setAnimalName(e.target.value)}
                              onBlur={(e) => setAnimalName(toTitleCase(e.target.value))}
                              placeholder="Optional"
                              data-testid="input-animal-name"
                            />
                          </div>
                        );
                      case "flockSize":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="flockSize">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="flockSize"
                              type="number"
                              min="0"
                              step="1"
                              className={quickRegisterMode ? "h-11 text-base" : ""}
                              value={avianFlockSize}
                              onChange={(e) => setAvianFlockSize(e.target.value)}
                              data-testid="input-avian-flock-size"
                            />
                          </div>
                        );
                      case "hatchery":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="hatchery">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="hatchery"
                              className={quickRegisterMode ? "h-11 text-base" : ""}
                              value={avianHatchery}
                              onChange={(e) => setAvianHatchery(e.target.value)}
                              onBlur={(e) => setAvianHatchery(toEnglishSentence(e.target.value))}
                              data-testid="input-avian-hatchery"
                            />
                          </div>
                        );
                      case "feedSupplier":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="feedSupplier">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="feedSupplier"
                              className={quickRegisterMode ? "h-11 text-base" : ""}
                              value={avianFeedSupplier}
                              onChange={(e) => setAvianFeedSupplier(e.target.value)}
                              onBlur={(e) => setAvianFeedSupplier(toEnglishSentence(e.target.value))}
                              data-testid="input-avian-feed-supplier"
                            />
                          </div>
                        );
                      case "feedIntake":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="feedIntake">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id="feedIntake"
                                type="number"
                                min="0"
                                step="0.1"
                                className={quickRegisterMode ? "h-11 text-base" : ""}
                                value={avianFeedIntake}
                                onChange={(e) => setAvianFeedIntake(e.target.value)}
                                data-testid="input-avian-feed-intake"
                              />
                              <span className="text-sm text-muted-foreground min-w-[48px]">
                                g/day
                              </span>
                            </div>
                          </div>
                        );
                      case "waterIntake":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="waterIntake">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id="waterIntake"
                                type="number"
                                min="0"
                                step="0.1"
                                className={quickRegisterMode ? "h-11 text-base" : ""}
                                value={avianWaterIntake}
                                onChange={(e) => setAvianWaterIntake(e.target.value)}
                                data-testid="input-avian-water-intake"
                              />
                              <span className="text-sm text-muted-foreground min-w-[52px]">
                                ml/day
                              </span>
                            </div>
                          </div>
                        );
                      case "mortality":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="mortality">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id="mortality"
                                type="number"
                                min="0"
                                step="1"
                                className={quickRegisterMode ? "h-11 text-base" : ""}
                                value={avianMortality}
                                onChange={(e) => setAvianMortality(e.target.value)}
                                data-testid="input-avian-mortality"
                              />
                              <span className="text-sm text-muted-foreground min-w-[72px]">
                                {getBirdPerDayUnit(avianMortality)}
                              </span>
                            </div>
                          </div>
                        );
                      case "testsSuggested": {
                        const testsPromptLabel = "Please select the required tests";
                        const options = getQuestionOptions("testsSuggested", [
                          "Complete Blood Count (CBC)",
                          "Enzyme Panel Test",
                          "Fecal Test",
                          "Urinalysis",
                          "Rapid Diagnostic Test",
                          "X-Ray",
                          "Ultrasound",
                          "Electro Cardio Gram (ECG)",
                          "Skin Scraping",
                          "Cytology",
                          "Biopsy",
                          "Culture",
                        ]);
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>
                              {testsPromptLabel} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <ToggleGrid
                              options={options}
                              selected={testsSuggested}
                              onToggle={(opt, checked) => {
                                const next = checked
                                  ? [...testsSuggested, opt]
                                  : testsSuggested.filter((v) => v !== opt);
                                setTestsSuggested(next);
                              }}
                            />
                          </div>
                        );
                      }
                      case "enzymePanelTests": {
                        if (!hasMainSuggestedTest(testsSuggested, "enzymepanel")) return null;
                        const options = getQuestionOptions("enzymePanelTests", [
                          "Liver Function Test (LFT)",
                          "Kidney Function Test (KFT)",
                          "Thyroid Test",
                        ]);
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <ToggleGrid
                              options={options}
                              selected={enzymePanelTests}
                              onToggle={(opt, checked) => {
                                const next = checked
                                  ? [...enzymePanelTests, opt]
                                  : enzymePanelTests.filter((v) => v !== opt);
                                setEnzymePanelTests(next);
                              }}
                            />
                          </div>
                        );
                      }
                      case "rapidDiagnosticTests": {
                        if (!hasMainSuggestedTest(testsSuggested, "rapiddiagnostictest")) return null;
                        const options = getQuestionOptions("rapidDiagnosticTests", [
                          "Parvo",
                          "Distemper",
                          "Rabies",
                          "Anaplasma",
                          "Babesia",
                          "Ehrlichia",
                        ]);
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <ToggleGrid
                              options={options}
                              selected={rapidDiagnosticTests}
                              onToggle={(opt, checked) => {
                                const next = checked
                                  ? [...rapidDiagnosticTests, opt]
                                  : rapidDiagnosticTests.filter((v) => v !== opt);
                                setRapidDiagnosticTests(next);
                              }}
                            />
                          </div>
                        );
                      }
                      case "xrayDetails":
                        if (!hasMainSuggestedTest(testsSuggested, "xray")) return null;
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>
                            <Textarea
                              className={`${quickRegisterMode ? "text-base" : ""} min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none`}
                              value={xrayDetails}
                              onChange={(e) => setXrayDetails(e.target.value)}
                              onBlur={(e) => setXrayDetails(toEnglishSentence(e.target.value))}
                              rows={1}
                            />
                          </div>
                        );
                      case "biopsyDetails":
                        if (!hasMainSuggestedTest(testsSuggested, "biopsy")) return null;
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>
                            <Textarea
                              className={`${quickRegisterMode ? "text-base" : ""} min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none`}
                              value={biopsyDetails}
                              onChange={(e) => setBiopsyDetails(e.target.value)}
                              onBlur={(e) => setBiopsyDetails(toEnglishSentence(e.target.value))}
                              rows={1}
                            />
                          </div>
                        );
                      case "cytologyDetails":
                        if (!hasMainSuggestedTest(testsSuggested, "cytology")) return null;
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>
                            <Textarea
                              className={`${quickRegisterMode ? "text-base" : ""} min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none`}
                              value={cytologyDetails}
                              onChange={(e) => setCytologyDetails(e.target.value)}
                              onBlur={(e) => setCytologyDetails(toEnglishSentence(e.target.value))}
                              rows={1}
                            />
                          </div>
                        );
                      case "ultrasoundDetails":
                        if (!hasMainSuggestedTest(testsSuggested, "ultrasound")) return null;
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>
                            <Textarea
                              className={`${quickRegisterMode ? "text-base" : ""} min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none`}
                              value={ultrasoundDetails}
                              onChange={(e) => setUltrasoundDetails(e.target.value)}
                              onBlur={(e) => setUltrasoundDetails(toEnglishSentence(e.target.value))}
                              rows={1}
                            />
                          </div>
                        );
                      case "cultureDetails":
                        if (!hasMainSuggestedTest(testsSuggested, "culture")) return null;
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>
                            <Textarea
                              className={`${quickRegisterMode ? "text-base" : ""} min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none`}
                              value={cultureDetails}
                              onChange={(e) => setCultureDetails(e.target.value)}
                              onBlur={(e) => setCultureDetails(toEnglishSentence(e.target.value))}
                              rows={1}
                            />
                          </div>
                        );
                      case "age":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="age">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id="age"
                                type="number"
                                min="0"
                                step="0.1"
                                className={quickRegisterMode ? "h-11 text-base" : ""}
                                value={ageValue}
                                onChange={(e) => setAgeValue(e.target.value)}
                                placeholder="e.g. 3"
                                data-testid="input-age"
                              />
                              <Select
                                value={ageUnit}
                                onValueChange={(v) => setAgeUnit(v as "years" | "months" | "weeks" | "days")}
                              >
                                <SelectTrigger className={quickRegisterMode ? "h-11 text-base w-[120px]" : "w-[120px]"}>
                                  <SelectValue placeholder="Unit" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="years">Years</SelectItem>
                                  <SelectItem value="months">Months</SelectItem>
                                  {isAvianSpecies && <SelectItem value="weeks">Weeks</SelectItem>}
                                  {isAvianSpecies && <SelectItem value="days">Days</SelectItem>}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      case "sampleType":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="sampleType">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="sampleType"
                              className={quickRegisterMode ? "h-11 text-base" : ""}
                              value={sampleType}
                              onChange={(e) => setSampleType(e.target.value)}
                              onBlur={(e) => setSampleType(toTitleCase(e.target.value))}
                              placeholder="e.g. Milk, Wound swab, Urine"
                              data-testid="input-sample-type"
                            />
                          </div>
                        );
                      default:
                        if (mode === "hospital" && isHospitalBuiltinQuestionKeyOrLabel(q.key, q.label, section.key)) {
                          const normalized = normalizeQuestionId(q.key || q.label || "");
                          if (normalized.includes("temperature")) {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>
                                <div className="flex gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    className={quickRegisterMode ? "h-11 text-base" : ""}
                                    value={temperatureValue}
                                    onChange={(e) => setTemperatureValue(e.target.value)}
                                  />
                                  <Select value={temperatureUnit} onValueChange={(v) => setTemperatureUnit(v as "C" | "F")}>
                                    <SelectTrigger className={quickRegisterMode ? "h-11 text-base w-[120px]" : "w-[120px]"}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="C">°C</SelectItem>
                                      <SelectItem value="F">°F</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            );
                          }
                          if (normalized === "crt" || normalized.includes("capillaryrefilltime")) {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                <Label>CRT {required && <span className="text-destructive">*</span>}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    className={quickRegisterMode ? "h-11 text-base" : ""}
                                    value={crtValue}
                                    onChange={(e) => setCrtValue(e.target.value)}
                                  />
                                  <span className="text-sm text-muted-foreground min-w-[60px]">Seconds</span>
                                </div>
                              </div>
                            );
                          }
                          if (normalized.includes("dehydration")) {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    className={quickRegisterMode ? "h-11 text-base" : ""}
                                    value={dehydrationPercentage}
                                    onChange={(e) => setDehydrationPercentage(e.target.value)}
                                  />
                                  <span className="text-sm text-muted-foreground min-w-[20px]">%</span>
                                </div>
                              </div>
                            );
                          }
                          if (normalized.includes("heartrate")) {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                <Label>Heart Rate {required && <span className="text-destructive">*</span>}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="1"
                                    className={quickRegisterMode ? "h-11 text-base" : ""}
                                    value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                    onChange={(e) =>
                                      setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                    }
                                  />
                                  <span className="text-sm text-muted-foreground min-w-[45px]">bpm</span>
                                </div>
                              </div>
                            );
                          }
                          if (
                            normalized.includes("respiratoryrate") ||
                            normalized.includes("respirationrate") ||
                            normalized.includes("resprate")
                          ) {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                <Label>Respiration {required && <span className="text-destructive">*</span>}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="1"
                                    className={quickRegisterMode ? "h-11 text-base" : ""}
                                    value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                    onChange={(e) =>
                                      setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                    }
                                  />
                                  <span className="text-sm text-muted-foreground min-w-[50px]">BrPM</span>
                                </div>
                              </div>
                            );
                          }
                          if (normalized.includes("rumenmotility")) {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                <Label>Rumen Motility {required && <span className="text-destructive">*</span>}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    className={quickRegisterMode ? "h-11 text-base" : ""}
                                    value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                    onChange={(e) =>
                                      setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                    }
                                  />
                                  <span className="text-sm text-muted-foreground min-w-[45px]">/min</span>
                                </div>
                              </div>
                            );
                          }
                          if (normalized.includes("weight")) {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    className={quickRegisterMode ? "h-11 text-base" : ""}
                                    value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                    onChange={(e) =>
                                      setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                    }
                                  />
                                  <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as "kg" | "g")}>
                                    <SelectTrigger className={quickRegisterMode ? "h-11 text-base w-[100px]" : "w-[100px]"}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="kg">kg</SelectItem>
                                      <SelectItem value="g">g</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            );
                          }
                          if (isChiefComplaintKeyOrLabel(q.key, q.label)) {
                            const chiefToggleKey = `chiefComplaint:${q.key}`;
                            return (
                              <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                                <div className="flex items-center justify-between gap-2">
                                  <Label>
                                    {q.label} {required && <span className="text-destructive">*</span>}
                                  </Label>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Bullet points</span>
                                    <Switch
                                      checked={isBulletPointsEnabled(chiefToggleKey, true)}
                                      onCheckedChange={(checked) =>
                                        setBulletPointModes((prev) => ({
                                          ...prev,
                                          [chiefToggleKey]: checked,
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                                <AutoGrowTextarea
                                  className={quickRegisterMode ? "text-base" : ""}
                                  value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                  onChange={(e) =>
                                    setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                  }
                                  onBlur={(e) => {
                                    if (isBulletPointsEnabled(chiefToggleKey, true)) {
                                      setCustomAnswers((prev) => ({
                                        ...prev,
                                        [q.key]: toBulletedText(e.target.value),
                                      }));
                                    }
                                  }}
                                />
                              </div>
                            );
                          }
                          if (q.inputType === "textarea") {
                            return (
                              <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                                <Label>
                                  {q.label} {required && <span className="text-destructive">*</span>}
                                </Label>
                                <Textarea
                                  className={quickRegisterMode ? "text-base" : ""}
                                  value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                  onChange={(e) =>
                                    setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                  }
                                  rows={3}
                                />
                              </div>
                            );
                          }
                          if (q.inputType === "singleSelect" || q.inputType === "yesNo") {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                <Label>
                                  {q.label} {required && <span className="text-destructive">*</span>}
                                </Label>
                                <Select
                                  value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                  onValueChange={(v) =>
                                    setCustomAnswers((prev) => ({ ...prev, [q.key]: v }))
                                  }
                                >
                                  <SelectTrigger className={quickRegisterMode ? "h-11 text-base" : ""}>
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(q.inputType === "yesNo" ? ["Yes", "No"] : q.options || []).map((opt) => (
                                      <SelectItem key={opt} value={opt}>
                                        {opt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }
                          return (
                            <div className="space-y-1.5" key={q.key}>
                              <Label>
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                              <Input
                                type={q.inputType === "number" ? "number" : "text"}
                                className={quickRegisterMode ? "h-11 text-base" : ""}
                                value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                onChange={(e) =>
                                  setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                }
                              />
                            </div>
                          );
                        }
                        return null;
                    }
                  })}
                </div>
                )}
          </CardContent>
        </Card>
          );
        })}

        {/* Submit */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end">
          <Link href={backHref} className="w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className={`${quickRegisterMode ? "h-11 px-5 text-base" : ""} w-full sm:w-auto`}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className={`gap-2 ${quickRegisterMode ? "h-11 px-5 text-base" : ""} w-full sm:w-auto`}
            data-testid="button-submit"
          >
            <Save className="w-4 h-4" />
            {createMutation.isPending ? "Saving..." : "Save Case"}
          </Button>
        </div>
      </form>
    </div>
  );
}
