import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, postFormDataWithProgress, queryClient } from "@/lib/queryClient";
import {
  CASE_ATTACHMENT_MAX_INPUT_BYTES,
  compressCaseAttachmentImages,
  isAllowedCaseAttachmentImage,
} from "@/lib/compress-case-attachment-image";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Sparkles,
  Info,
  Upload,
  Camera,
  ChevronDown,
  X,
  Loader2,
} from "lucide-react";
import type { Breakpoint, Veterinarian } from "@shared/schema";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import { BsDateInput } from "@/components/bs-date-input";
import { getTodayBsAd, formatBsDate, formatAdDate } from "@/lib/nepali-date";
import {
  getAstToggleDefaults,
  getHospitalToggleDefaults,
  TOGGLE_DEFAULTS_HYDRATED_EVENT,
} from "@/lib/module-toggle-defaults";
import {
  interpretZone as interpretAstZone,
  PENDING_AST_CSV_IMPORT_KEY,
  emptyAstRow,
  type AstCsvImportRow,
  type PendingAstCsvImportPayload,
} from "@/lib/ast-csv-import";
import {
  detailFieldParentKeyword,
  getSimpleTestLabels,
  hasMainSuggestedTest,
  isDetailSubQuestionKey,
  isLegacyTestsSuggestedDuplicateQuestion,
  isTestsSuggestedPanelSubQuestion,
  isTestsSuggestedSectionKey,
  parseStringList,
  parseTestsSuggestedOptions,
  resolvePanelDefForKey,
  resolvePanelDefinitions,
  shouldIncludeTestsSuggestedFormQuestion,
  type TestsSuggestedPanelDef,
} from "@shared/hospital-tests-suggested";
import {
  appendVaccinationToCustomFields,
  clearVaccinationFieldsForOtherSpecies,
  emptyVaccinationFormState,
  isCompanionVaccinationSpecies,
  isVaccinationStatusKey,
  isVaccinationStorageKey,
  vaccinationFieldsForSpecies,
  type VaccinationFormState,
} from "@shared/hospital-vaccination-history";
import { VaccinationHistoryFields } from "@/components/vaccination-history-fields";

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


type TreatmentMedicationEntry = {
  clientId?: string;
  medication: string;
  dose: string;
  doseUnit: string;
  route: string;
  frequency: string;
  duration: string;
  note: string;
  showNote?: boolean;
};

type TreatmentEntryOrderItem = {
  type: "medication" | "general";
  id: string;
};

type TreatmentFieldValue = {
  medications: TreatmentMedicationEntry[];
  generalInstructions: string;
  generalInstructionId?: string | null;
  entryOrder?: TreatmentEntryOrderItem[];
};

type TempCaseAttachment = {
  id: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  category: string;
  /** Local preview only; replaced after upload completes */
  pending?: boolean;
};

function treatmentAttachmentSourceLabel(category: string): string {
  return category === "handwritten" ? "Capture" : "Import";
}

function revokeAttachmentPreviewUrl(url: string) {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

type AbbreviationOption = {
  abbreviation: string;
  name?: string;
};

type FilterableOption = {
  value: string;
  label: string;
  searchText?: string;
  rowKey?: string;
  meta?: {
    veterinarianId?: number;
    nvcRegistrationNumber?: string;
    department?: string;
  };
};

type AttendingVeterinarianField = {
  veterinarianId: number | null;
  name: string;
  nvc: string;
  department: string;
  customMode: boolean;
  isIntern: boolean;
};

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
      hideLabel?: boolean;
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

function createTreatmentEntryId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${randomPart}`;
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

function FilterableField({
  value,
  options,
  placeholder,
  customMode,
  onCustomModeChange,
  onChange,
  onPickOption,
  onInternSelect,
}: {
  value: string;
  options: FilterableOption[];
  placeholder: string;
  customMode: boolean;
  onCustomModeChange: (next: boolean) => void;
  onChange: (value: string) => void;
  onPickOption?: (option: FilterableOption) => void;
  onInternSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      const target = e.target;
      if (!el || !(target instanceof Node)) return;
      if (!el.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("touchstart", closeIfOutside, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", closeIfOutside);
      document.removeEventListener("touchstart", closeIfOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const q = value.trim().toLowerCase();
  const filtered = q
    ? options.filter((option) =>
        `${option.value} ${option.label} ${option.searchText ?? ""}`.toLowerCase().includes(q),
      )
    : options;
  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((prev) => !prev)}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div
          className="absolute z-40 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={() => {
              onCustomModeChange(true);
              onChange("");
              setOpen(false);
            }}
          >
            Other
          </button>
          {onInternSelect && (
            <button
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                onInternSelect();
                setOpen(false);
              }}
            >
              Intern
            </button>
          )}
          {filtered.map((option) => (
            <button
              key={option.rowKey ?? option.value}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                onCustomModeChange(false);
                onPickOption?.(option);
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches</p>
          )}
        </div>
      )}
    </div>
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
    normalizedSectionKey === "diagnosis" ||
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
    isVaccinationStatusKey(key) ||
    normalizedKey.includes("diagnosis") ||
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
    || normalizedLabel.includes("diagnosis")
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

function isDiagnosisKeyOrLabel(key: string, label?: string): boolean {
  const normalizedKey = normalizeQuestionId(key);
  const normalizedLabel = normalizeQuestionId(label || "");
  return normalizedKey.includes("diagnosis") || normalizedLabel.includes("diagnosis");
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
    normalizedKey === "attending_veterinarian" ||
    normalizedKey === "avian" ||
    normalizedKey === "vaccinationhistory" ||
    normalizedKey === "vitals" ||
    normalizedKey === "chief_complaint" ||
    normalizedKey === "chiefcomplaint" ||
    normalizedKey === "testssuggested" ||
    normalizedKey === "testsuggested" ||
    normalizedKey === "tests_suggested" ||
    normalizedTitle.includes("historyandpreviousmedication") ||
    normalizedTitle.includes("clinicalsignsandsymptoms") ||
    normalizedTitle.includes("avianinformation") ||
    normalizedTitle.includes("vitals") ||
    normalizedTitle.includes("chiefcomplaint") ||
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
    "chiefcomplaint",
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
    "veterinarian",
    "attending",
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

function isLegacyTestsSuggestedTextareaQuestion(question: {
  key: string;
  label: string;
  inputType: string;
  sectionKey?: string;
}): boolean {
  return (
    question.inputType === "textarea" && isLegacyTestsSuggestedDuplicateQuestion(question)
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
  const [toggleDefaultsVersion, setToggleDefaultsVersion] = useState(0);
  useEffect(() => {
    const onHydrate = () => setToggleDefaultsVersion((v) => v + 1);
    window.addEventListener(TOGGLE_DEFAULTS_HYDRATED_EVENT, onHydrate);
    return () => window.removeEventListener(TOGGLE_DEFAULTS_HYDRATED_EVENT, onHydrate);
  }, []);
  const astToggleDefaults = useMemo(() => getAstToggleDefaults(), [toggleDefaultsVersion]);
  const hospitalToggleDefaults = useMemo(
    () => (mode === "hospital" ? getHospitalToggleDefaults() : null),
    [mode, toggleDefaultsVersion],
  );
  const { data: caseInfo } = useQuery<{
    caseNumber: string;
    dailyNumber: number;
    monthlyNumber: number;
    yearlyNumber: number;
  }>({
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
  const { data: medicationOptionsData = [] } = useQuery<string[]>({
    queryKey: ["/api/medications"],
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: routeOptionsData = [] } = useQuery<Array<string | AbbreviationOption>>({
    queryKey: ["/api/routes-of-administration"],
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: frequencyOptionsData = [] } = useQuery<Array<string | AbbreviationOption>>({
    queryKey: ["/api/frequencies"],
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: doseUnitOptionsData = [] } = useQuery<string[]>({
    queryKey: ["/api/dose-units"],
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: durationOptionsData = [] } = useQuery<string[]>({
    queryKey: ["/api/durations"],
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: veterinariansData = [] } = useQuery<Veterinarian[]>({
    queryKey: ["/api/veterinarians"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/veterinarians");
      return res.json();
    },
    enabled: mode === "hospital",
    staleTime: 0,
    refetchOnMount: "always",
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
  const [treatmentAnswers, setTreatmentAnswers] = useState<Record<string, TreatmentFieldValue>>({});
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, string>>({});
  const [treatmentCustomSelectMode, setTreatmentCustomSelectMode] = useState<Record<string, boolean>>({});
  const [attendingVetByQuestion, setAttendingVetByQuestion] = useState<
    Record<string, AttendingVeterinarianField>
  >({});
  const [treatmentAttachments, setTreatmentAttachments] = useState<TempCaseAttachment[]>([]);
  const [uploadingTreatmentAttachments, setUploadingTreatmentAttachments] = useState(false);
  const [compressingTreatmentAttachments, setCompressingTreatmentAttachments] = useState(false);
  const [treatmentUploadProgress, setTreatmentUploadProgress] = useState<number | null>(null);
  const treatmentAttachmentBusy = uploadingTreatmentAttachments || compressingTreatmentAttachments;
  const [treatmentAttachmentPreviewIndex, setTreatmentAttachmentPreviewIndex] = useState<number | null>(
    null,
  );
  const [removingTreatmentAttachmentId, setRemovingTreatmentAttachmentId] = useState<number | null>(
    null,
  );
  const [attachmentRemovePrompt, setAttachmentRemovePrompt] = useState<TempCaseAttachment | null>(
    null,
  );
  const treatmentOptimisticIdRef = useRef(0);
  const treatmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const treatmentCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const [bulletPointModes, setBulletPointModes] = useState<Record<string, boolean>>({
    historyNotes: hospitalToggleDefaults?.historyNotesBulletPoints ?? true,
    previousMedicationNotes: hospitalToggleDefaults?.previousMedicationNotesBulletPoints ?? true,
    clinicalSignsSymptomsNotes: hospitalToggleDefaults?.clinicalSignsSymptomsNotesBulletPoints ?? true,
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
  const [vaccinationForm, setVaccinationForm] = useState<VaccinationFormState>(() =>
    emptyVaccinationFormState(),
  );
  const [testsSuggested, setTestsSuggested] = useState<string[]>([]);
  const [biopsyDetails, setBiopsyDetails] = useState("");
  const [cytologyDetails, setCytologyDetails] = useState("");
  const [xrayDetails, setXrayDetails] = useState("");
  const [ultrasoundDetails, setUltrasoundDetails] = useState("");
  const [cultureDetails, setCultureDetails] = useState("");
  const [remarks, setRemarks] = useState("");
  const [autoMode, setAutoMode] = useState(
    mode === "hospital" ? true : astToggleDefaults.autoMode,
  );

    // NEW: toggle to use preset antibiotics
  const [usePresetAntibiotics, setUsePresetAntibiotics] = useState(
    mode === "hospital" ? false : astToggleDefaults.usePresetAntibiotics,
  );

  const [astRows, setAstRows] = useState<AstCsvImportRow[]>([emptyAstRow()]);
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
  const isCompanionSpecies = isCompanionVaccinationSpecies(effectiveSpecies);

  useEffect(() => {
    setVaccinationForm((prev) => clearVaccinationFieldsForOtherSpecies(prev, effectiveSpecies));
  }, [effectiveSpecies]);
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

  // Reset breed when the user changes species, because the breed list is
  // species-specific. We must NOT do this when a saved draft is being
  // restored: `applyDraft` sets species and breed together, and without this
  // guard the species change here would immediately wipe the just-restored
  // breed. The ref is set in `applyDraft` and consumed on the next run.
  const skipBreedResetOnSpeciesChangeRef = useRef(false);
  useEffect(() => {
    if (skipBreedResetOnSpeciesChangeRef.current) {
      skipBreedResetOnSpeciesChangeRef.current = false;
      return;
    }
    setBreedChoice("");
    setCustomBreed("");
    setBreed("");
  }, [species, customSpecies]);

  useEffect(() => {
    const computed = breedChoice === "Other" ? customBreed.trim() : breedChoice;
    setBreed(computed);
  }, [breedChoice, customBreed]);

  /**
   * Form draft autosave.
   *
   * Why: this form is huge and users routinely lose 10+ minutes of typing
   * when the page reloads, the laptop sleeps, or they accidentally close the
   * tab. Autosave persists the user-typed text fields to localStorage every
   * ~750ms; on mount we check for an existing draft and offer to restore it.
   *
   * What we persist: only user-typed content (owner, animal, dates, notes,
   * answers, AST rows, custom answers, toggles). NOT persisted:
   *   - File attachments — those are already temp-staged on the server.
   *   - Server-generated identifiers (case number, daily/monthly/yearly).
   *   - UI-only ephemera (upload progress, preview index, etc.).
   *
   * Where: `localStorage` only, scoped by mode. Per-user scoping would need
   * the user id which isn't trivially available here; in practice a single
   * shared workstation will overwrite drafts between users which matches the
   * existing model of "one terminal, one operator at a time".
   */
  const DRAFT_KEY = `vth:case-draft:${mode}`;
  const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  type Draft = {
    savedAt: string;
    fields: {
      billNumber: string;
      ownerName: string;
      ownerAddress: string;
      ownerPhone: string;
      species: string;
      customSpecies: string;
      breedChoice: string;
      customBreed: string;
      animalName: string;
      ageValue: string;
      ageUnit: typeof ageUnit;
      sex: string;
      sampleType: string;
      dateBs: string;
      dateAd: string;
      sampleDateBs: string;
      sampleDateAd: string;
      cultureResult: string;
      historyNotes: string;
      previousMedicationNotes: string;
      clinicalSignsSymptomsNotes: string;
      temperatureValue: string;
      temperatureUnit: "C" | "F";
      weightUnit: "kg" | "g";
      crtValue: string;
      dehydrationPercentage: string;
      avianFlockSize: string;
      avianHatchery: string;
      avianFeedSupplier: string;
      avianFeedIntake: string;
      avianWaterIntake: string;
      avianMortality: string;
      vaccinationForm: VaccinationFormState;
      testsSuggested: string[];
      biopsyDetails: string;
      cytologyDetails: string;
      xrayDetails: string;
      ultrasoundDetails: string;
      cultureDetails: string;
      remarks: string;
      customAnswers: typeof customAnswers;
      treatmentAnswers: typeof treatmentAnswers;
      sectionAnswers: typeof sectionAnswers;
      attendingVetByQuestion: typeof attendingVetByQuestion;
      astRows: typeof astRows;
    };
  };

  const [draftPrompt, setDraftPrompt] = useState<Draft | null>(null);
  const [draftAutosavedAt, setDraftAutosavedAt] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Draft | null;
      if (!parsed?.savedAt || !parsed.fields) return;
      const age = Date.now() - Date.parse(parsed.savedAt);
      if (!Number.isFinite(age) || age > DRAFT_MAX_AGE_MS) {
        window.localStorage.removeItem(DRAFT_KEY);
        return;
      }
      setDraftPrompt(parsed);
    } catch {
      // Corrupt draft — clear and move on.
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [DRAFT_KEY, DRAFT_MAX_AGE_MS]);

  const applyDraft = (draft: Draft) => {
    const f = draft.fields;
    // Tell the species-change effect to skip its breed reset for this update:
    // we are restoring species AND breed together and must keep the breed.
    // Only arm the guard when species actually changes, so the effect that
    // consumes it is guaranteed to run (otherwise a no-op restore could leave
    // the flag armed and swallow a later genuine species change).
    const willSpeciesChange =
      (f.species ?? "") !== species || (f.customSpecies ?? "") !== customSpecies;
    skipBreedResetOnSpeciesChangeRef.current = willSpeciesChange;
    setBillNumber(f.billNumber ?? "");
    setOwnerName(f.ownerName ?? "");
    setOwnerAddress(f.ownerAddress ?? "");
    setOwnerPhone(f.ownerPhone ?? "");
    setSpecies(f.species ?? "");
    setCustomSpecies(f.customSpecies ?? "");
    setBreedChoice(f.breedChoice ?? "");
    setCustomBreed(f.customBreed ?? "");
    setAnimalName(f.animalName ?? "");
    setAgeValue(f.ageValue ?? "");
    setAgeUnit(f.ageUnit ?? "years");
    setSex(f.sex ?? "");
    setSampleType(f.sampleType ?? "");
    setDateBs(f.dateBs ?? dateBs);
    setDateAd(f.dateAd ?? dateAd);
    setSampleDateBs(f.sampleDateBs ?? sampleDateBs);
    setSampleDateAd(f.sampleDateAd ?? sampleDateAd);
    setCultureResult(f.cultureResult ?? "");
    setHistoryNotes(f.historyNotes ?? "");
    setPreviousMedicationNotes(f.previousMedicationNotes ?? "");
    setClinicalSignsSymptomsNotes(f.clinicalSignsSymptomsNotes ?? "");
    setTemperatureValue(f.temperatureValue ?? "");
    setTemperatureUnit(f.temperatureUnit ?? "C");
    setWeightUnit(f.weightUnit ?? "kg");
    setCrtValue(f.crtValue ?? "");
    setDehydrationPercentage(f.dehydrationPercentage ?? "");
    setAvianFlockSize(f.avianFlockSize ?? "");
    setAvianHatchery(f.avianHatchery ?? "");
    setAvianFeedSupplier(f.avianFeedSupplier ?? "");
    setAvianFeedIntake(f.avianFeedIntake ?? "");
    setAvianWaterIntake(f.avianWaterIntake ?? "");
    setAvianMortality(f.avianMortality ?? "");
    setVaccinationForm(f.vaccinationForm ?? emptyVaccinationFormState());
    setTestsSuggested(f.testsSuggested ?? []);
    setBiopsyDetails(f.biopsyDetails ?? "");
    setCytologyDetails(f.cytologyDetails ?? "");
    setXrayDetails(f.xrayDetails ?? "");
    setUltrasoundDetails(f.ultrasoundDetails ?? "");
    setCultureDetails(f.cultureDetails ?? "");
    setRemarks(f.remarks ?? "");
    setCustomAnswers(() => {
      const base = { ...(f.customAnswers ?? {}) };
      const draft = f as {
        enzymePanelTests?: string[];
        rapidDiagnosticTests?: string[];
      };
      if (draft.enzymePanelTests?.length && !base.enzymePanelTests) {
        base.enzymePanelTests = draft.enzymePanelTests;
      }
      if (draft.rapidDiagnosticTests?.length && !base.rapidDiagnosticTests) {
        base.rapidDiagnosticTests = draft.rapidDiagnosticTests;
      }
      return base;
    });
    setTreatmentAnswers(f.treatmentAnswers ?? {});
    setSectionAnswers(f.sectionAnswers ?? {});
    setAttendingVetByQuestion(f.attendingVetByQuestion ?? {});
    if (Array.isArray(f.astRows) && f.astRows.length > 0) {
      setAstRows(f.astRows);
    }
    draftLoadedRef.current = true;
    setDraftPrompt(null);
  };

  const discardDraft = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
    draftLoadedRef.current = true;
    setDraftPrompt(null);
    setDraftAutosavedAt(null);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draftPrompt) return;
    const handle = window.setTimeout(() => {
      try {
        const payload: Draft = {
          savedAt: new Date().toISOString(),
          fields: {
            billNumber,
            ownerName,
            ownerAddress,
            ownerPhone,
            species,
            customSpecies,
            breedChoice,
            customBreed,
            animalName,
            ageValue,
            ageUnit,
            sex,
            sampleType,
            dateBs,
            dateAd,
            sampleDateBs,
            sampleDateAd,
            cultureResult,
            historyNotes,
            previousMedicationNotes,
            clinicalSignsSymptomsNotes,
            temperatureValue,
            temperatureUnit,
            weightUnit,
            crtValue,
            dehydrationPercentage,
            avianFlockSize,
            avianHatchery,
            avianFeedSupplier,
            avianFeedIntake,
            avianWaterIntake,
            avianMortality,
            vaccinationForm,
            testsSuggested,
            biopsyDetails,
            cytologyDetails,
            xrayDetails,
            ultrasoundDetails,
            cultureDetails,
            remarks,
            customAnswers,
            treatmentAnswers,
            sectionAnswers,
            attendingVetByQuestion,
            astRows,
          },
        };
        const hasAnyContent =
          ownerName.trim() ||
          ownerAddress.trim() ||
          ownerPhone.trim() ||
          species.trim() ||
          customSpecies.trim() ||
          breed.trim() ||
          animalName.trim() ||
          historyNotes.trim() ||
          previousMedicationNotes.trim() ||
          clinicalSignsSymptomsNotes.trim() ||
          remarks.trim() ||
          Object.keys(customAnswers).length > 0 ||
          Object.keys(treatmentAnswers).length > 0 ||
          astRows.some((r) => r.antibiotic || r.zoneSize);
        if (!hasAnyContent) {
          window.localStorage.removeItem(DRAFT_KEY);
          setDraftAutosavedAt(null);
          return;
        }
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        setDraftAutosavedAt(payload.savedAt);
      } catch {
        // quota or serialization issue — silently skip this save
      }
    }, 750);
    return () => window.clearTimeout(handle);
  }, [
    DRAFT_KEY,
    draftPrompt,
    billNumber, ownerName, ownerAddress, ownerPhone,
    species, customSpecies, breedChoice, customBreed, breed,
    animalName, ageValue, ageUnit, sex, sampleType,
    dateBs, dateAd, sampleDateBs, sampleDateAd, cultureResult,
    historyNotes, previousMedicationNotes, clinicalSignsSymptomsNotes,
    temperatureValue, temperatureUnit, weightUnit,
    crtValue, dehydrationPercentage,
    avianFlockSize, avianHatchery, avianFeedSupplier,
    avianFeedIntake, avianWaterIntake, avianMortality, vaccinationForm,
    testsSuggested,
    biopsyDetails, cytologyDetails, xrayDetails, ultrasoundDetails,
    cultureDetails, remarks,
    customAnswers, treatmentAnswers, sectionAnswers,
    attendingVetByQuestion, astRows,
  ]);

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
  const testsSuggestedSectionKeys = useMemo(() => {
    return new Set(
      (formDefinition?.sections ?? [])
        .filter((s) => isTestsSuggestedSectionTitle(s.title))
        .map((s) => s.key),
    );
  }, [formDefinition]);
  const testsSuggestedQuestion = useMemo(
    () => allQuestions.find((q) => normalizeQuestionId(q.key) === "testssuggested"),
    [allQuestions],
  );
  const testsPanelDefs = useMemo((): TestsSuggestedPanelDef[] => {
    const subQuestions = allQuestions.filter(
      (q) =>
        testsSuggestedSectionKeys.has(q.sectionKey) &&
        q.inputType === "multiSelect" &&
        normalizeQuestionId(q.key) !== "testssuggested",
    );
    return resolvePanelDefinitions(testsSuggestedQuestion?.options ?? [], subQuestions);
  }, [allQuestions, testsSuggestedQuestion, testsSuggestedSectionKeys]);
  const testsPanelDefsByKey = useMemo(
    () => new Map(testsPanelDefs.map((d) => [d.panelKey, d])),
    [testsPanelDefs],
  );
  const getPanelAnswerList = (panelKey: string): string[] => {
    const v = customAnswers[panelKey];
    return parseStringList(Array.isArray(v) ? v : typeof v === "string" ? v : undefined);
  };
  const setPanelAnswerList = (panelKey: string, values: string[]) => {
    setCustomAnswers((prev) => ({ ...prev, [panelKey]: values }));
  };
  const getTestsSuggestedMainOptions = (fallback: string[]) => {
    const raw = testsSuggestedQuestion?.options ?? [];
    if (raw.length === 0) return fallback;
    return getSimpleTestLabels(parseTestsSuggestedOptions(raw));
  };
  const getQuestionOptions = (key: string, fallback: string[] = []) => {
    const options = questionByKey.get(key)?.options ?? [];
    return options.length > 0 ? options : fallback;
  };
  const isQuestionEnabled = (key: string, fallback = true) =>
    questionByKey.get(key)?.enabled ?? fallback;
  const isQuestionRequired = (key: string, fallback = false) =>
    questionByKey.get(key)?.required ?? fallback;

  // Build AST rows from the preset breakpoint list
  const buildPresetRows = (): AstCsvImportRow[] => {
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


  const addRow = () => {
    setAstRows([...astRows, emptyAstRow()]);
  };

  const skipPresetSyncRef = useRef(false);

  // Keep AST rows in sync with preset toggle state
  useEffect(() => {
    if (skipPresetSyncRef.current) {
      skipPresetSyncRef.current = false;
      return;
    }
    if (usePresetAntibiotics) {
      const rows = buildPresetRows();
      if (rows.length > 0) {
        setAstRows(rows);
      }
      return;
    }

    // Turning presets off should clear preset-selected rows
    setAstRows([emptyAstRow()]);
  }, [usePresetAntibiotics, breakpointsData]);

  // Apply AST rows staged from Breakpoints → Import CSV (sessionStorage).
  useEffect(() => {
    if (mode !== "ast" || !breakpointsData?.length) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_AST_CSV_IMPORT_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let payload: PendingAstCsvImportPayload;
    try {
      payload = JSON.parse(raw) as PendingAstCsvImportPayload;
    } catch {
      try {
        sessionStorage.removeItem(PENDING_AST_CSV_IMPORT_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    if (payload.version !== 1 || !Array.isArray(payload.rows)) {
      try {
        sessionStorage.removeItem(PENDING_AST_CSV_IMPORT_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      sessionStorage.removeItem(PENDING_AST_CSV_IMPORT_KEY);
    } catch {
      /* ignore */
    }
    skipPresetSyncRef.current = true;
    setUsePresetAntibiotics(false);
    if (payload.mode === "append") {
      setAstRows((prev) => [...prev, ...payload.rows]);
    } else {
      setAstRows(payload.rows.length > 0 ? payload.rows : [emptyAstRow()]);
    }
    const parsed = payload.parsed ?? payload.rows.length;
    const matched = payload.matched ?? 0;
    const um = payload.unmatched ?? [];
    toast({
      title: `Applied ${matched}/${parsed} AST row(s) from CSV`,
      description:
        um.length > 0
          ? `Some rows need manual antibiotic: ${um.slice(0, 4).join(", ")}${um.length > 4 ? "…" : ""}`
          : "Review the AST results section, then save your case.",
    });
  }, [mode, breakpointsData, toast]);

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
      const result = interpretAstZone(zone, bp);
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
        const result = interpretAstZone(zone, bp);
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
        const result = interpretAstZone(parseFloat(row.zoneSize), bp);
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
      if (mode === "hospital") {
        queryClient.invalidateQueries({ queryKey: ["/api/medications"] });
      }
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setDraftAutosavedAt(null);
      toast({ title: "Case registered successfully" });
      setLocation(onSuccessRedirect);
    },
    onError: (error: unknown) => {
      let description = "Please check required fields and try again.";
      if (error instanceof Error && error.message) {
        const raw = error.message;
        const jsonStart = raw.indexOf("{");
        if (jsonStart >= 0) {
          try {
            const parsed = JSON.parse(raw.slice(jsonStart)) as {
              message?: string;
              errors?: { fieldErrors?: Record<string, string[]> };
            };
            if (parsed.message) {
              description = parsed.message;
            }
            const firstFieldError = Object.values(parsed.errors?.fieldErrors ?? {}).find(
              (entries) => Array.isArray(entries) && entries.length > 0,
            )?.[0];
            if (firstFieldError) {
              description = firstFieldError;
            }
          } catch {
            description = raw;
          }
        } else {
          description = raw;
        }
      }
      toast({ title: "Failed to register case", description, variant: "destructive" });
    },
  });

  const uploadTreatmentAttachments = async (
    files: FileList | null,
    source: "diagnostic" | "handwritten",
  ) => {
    if (!files || files.length === 0) return;
    if (treatmentAttachments.length + files.length > 10) {
      toast({
        title: "Too many images",
        description: "You can upload up to 10 images per case.",
        variant: "destructive",
      });
      return;
    }
    const selected = Array.from(files);
    for (const file of selected) {
      if (!isAllowedCaseAttachmentImage(file)) {
        toast({
          title: "Invalid file type",
          description: "Only JPG, JPEG, and PNG images are allowed.",
          variant: "destructive",
        });
        return;
      }
      if (file.size > CASE_ATTACHMENT_MAX_INPUT_BYTES) {
        toast({
          title: "File too large",
          description: `${file.name} is over 5MB.`,
          variant: "destructive",
        });
        return;
      }
    }

    let prepared: File[];
    setCompressingTreatmentAttachments(true);
    setTreatmentUploadProgress(-1);
    try {
      prepared = await compressCaseAttachmentImages(selected);
    } catch (error) {
      setCompressingTreatmentAttachments(false);
      setTreatmentUploadProgress(null);
      toast({
        title: "Could not prepare image(s)",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      return;
    }
    setCompressingTreatmentAttachments(false);

    const compressedCount = prepared.filter(
      (f, i) => f.size < selected[i]!.size || f.name !== selected[i]!.name,
    ).length;

    const category = source === "handwritten" ? "handwritten" : "diagnostic";
    const optimistic: TempCaseAttachment[] = prepared.map((file) => {
      treatmentOptimisticIdRef.current -= 1;
      return {
        id: treatmentOptimisticIdRef.current,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "image/jpeg",
        url: URL.createObjectURL(file),
        category,
        pending: true,
      };
    });
    setTreatmentAttachments((prev) => [...prev, ...optimistic]);
    setUploadingTreatmentAttachments(true);
    setTreatmentUploadProgress(0);
    const optimisticIds = new Set(optimistic.map((o) => o.id));
    try {
      const formData = new FormData();
      for (const file of prepared) formData.append("files", file);
      formData.append("sectionKey", "treatment");
      formData.append("category", category);
      const payload = await postFormDataWithProgress<{ files: TempCaseAttachment[] }>(
        "/api/case-attachments/temp",
        formData,
        (pct) => setTreatmentUploadProgress(pct),
      );
      optimistic.forEach((o) => revokeAttachmentPreviewUrl(o.url));
      setTreatmentAttachments((prev) => {
        const without = prev.filter((a) => !optimisticIds.has(a.id));
        return [...without, ...(payload.files ?? [])];
      });
      toast({
        title: "Image(s) uploaded",
        description:
          compressedCount > 0
            ? `${compressedCount} image${compressedCount === 1 ? "" : "s"} optimized for upload.`
            : undefined,
      });
      if (treatmentFileInputRef.current) treatmentFileInputRef.current.value = "";
      if (treatmentCaptureInputRef.current) treatmentCaptureInputRef.current.value = "";
    } catch (error) {
      optimistic.forEach((o) => revokeAttachmentPreviewUrl(o.url));
      setTreatmentAttachments((prev) => prev.filter((a) => !optimisticIds.has(a.id)));
      toast({
        title: "Failed to upload image(s)",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploadingTreatmentAttachments(false);
      setTreatmentUploadProgress(null);
    }
  };

  const detachTreatmentAttachmentFromState = (attachment: TempCaseAttachment) => {
    revokeAttachmentPreviewUrl(attachment.url);
    setTreatmentAttachments((prev) => {
      const removedIdx = prev.findIndex((a) => a.id === attachment.id);
      const next = prev.filter((item) => item.id !== attachment.id);
      setTreatmentAttachmentPreviewIndex((pIdx) => {
        if (pIdx === null) return null;
        if (removedIdx === -1) return pIdx;
        if (pIdx === removedIdx) {
          if (next.length === 0) return null;
          return Math.min(removedIdx, next.length - 1);
        }
        if (removedIdx < pIdx) return pIdx - 1;
        return pIdx;
      });
      return next;
    });
  };

  const finalizeRemoveTreatmentAttachment = async (attachment: TempCaseAttachment) => {
    if (attachment.pending) {
      detachTreatmentAttachmentFromState(attachment);
      return;
    }
    setRemovingTreatmentAttachmentId(attachment.id);
    try {
      await apiRequest("DELETE", `/api/case-attachments/temp/${attachment.id}`);
      detachTreatmentAttachmentFromState(attachment);
    } catch (error) {
      toast({
        title: "Failed to remove image",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRemovingTreatmentAttachmentId(null);
    }
  };

  useEffect(() => {
    if (treatmentAttachmentPreviewIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setTreatmentAttachmentPreviewIndex((prev) =>
          prev === null ? prev : (prev - 1 + treatmentAttachments.length) % treatmentAttachments.length,
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setTreatmentAttachmentPreviewIndex((prev) =>
          prev === null ? prev : (prev + 1) % treatmentAttachments.length,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [treatmentAttachmentPreviewIndex, treatmentAttachments.length]);

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
    const shouldSkipQuestionValidation = (q: {
      key: string;
      label: string;
      sectionKey?: string;
    }) => {
      if (mode !== "hospital") return false;
      const normalizedSectionKey = normalizeQuestionId(q.sectionKey || "");
      if (normalizedSectionKey === "sample" || normalizedSectionKey === "ast") return true;
      if (normalizedSectionKey === "avian" && !isAvianSpecies) return true;
      if (normalizedSectionKey === "vaccinationhistory" && !isCompanionSpecies) return true;
      if (
        normalizedSectionKey === "vaccinationhistory" &&
        isVaccinationStatusKey(q.key) &&
        !vaccinationFieldsForSpecies(effectiveSpecies).some((f) => f.statusKey === q.key)
      ) {
        return true;
      }
      if (isAvianSpecies && shouldHideQuestionForAvian(q.key, q.label, q.sectionKey)) return true;
      return false;
    };
    const missingRequired =
      (isQuestionRequired("ownerName", true) && !ownerName.trim()) ||
      (isQuestionRequired("ownerAddress", true) && !ownerAddress.trim()) ||
      (isQuestionRequired("ownerPhone", true) && !ownerPhone.trim()) ||
      (isQuestionRequired("species", true) && !effectiveSpecies) ||
      (isQuestionRequired("breed", true) && !breed.trim()) ||
      (!isAvianSpecies && isQuestionRequired("animalName") && !animalName.trim()) ||
      (isQuestionRequired("age") && !ageValue.trim()) ||
      (isQuestionRequired("sex") && !sex.trim()) ||
      (mode !== "hospital" && isQuestionRequired("sampleType") && !sampleType.trim()) ||
      (mode !== "hospital" && isQuestionRequired("sampleDate") && !sampleDateBs.trim()) ||
      (mode !== "hospital" && isQuestionRequired("cultureResult") && !cultureResult.trim()) ||
      (isQuestionRequired("remarks") && !remarks.trim()) ||
      allQuestions.some(
        (q) =>
          !shouldSkipQuestionValidation(q) &&
          !q.isBuiltin &&
          !(mode === "hospital" && isHospitalBuiltinQuestionKeyOrLabel(q.key, q.label, q.sectionKey)) &&
          q.enabled &&
          q.required &&
          (q.inputType === "treatment_prescription"
            ? !(
                (treatmentAnswers[q.key]?.medications ?? []).some((entry) =>
                  [
                    entry.medication,
                    entry.dose,
                    entry.doseUnit,
                    entry.route,
                    entry.frequency,
                    entry.duration,
                    entry.note,
                  ].some((v) => v.trim().length > 0),
                ) || (treatmentAnswers[q.key]?.generalInstructions ?? "").trim().length > 0
              )
            : Array.isArray(mergedCustomAnswers[q.key])
              ? (mergedCustomAnswers[q.key] as string[]).length === 0
              : !String(mergedCustomAnswers[q.key] || "").trim()),
      ) ||
      (mode === "hospital" &&
        allQuestions.some((q) => {
          if (q.inputType !== "hospital_veterinarian" || !q.enabled || !q.required) return false;
          if (shouldSkipQuestionValidation(q)) return false;
          const hv = attendingVetByQuestion[q.key];
          if (hv?.isIntern) {
            return !String(hv?.name ?? "").trim();
          }
          return (
            !String(hv?.name ?? "").trim() ||
            !String(hv?.nvc ?? "").trim() ||
            !String(hv?.department ?? "").trim()
          );
        }));
    const missingHospitalBuiltinRequired =
      mode === "hospital" &&
      allQuestions.some((q) => {
        if (shouldSkipQuestionValidation(q)) return false;
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
        if (isVaccinationStatusKey(q.key) && isCompanionSpecies) {
          const visible = vaccinationFieldsForSpecies(effectiveSpecies).some(
            (f) => f.statusKey === q.key,
          );
          if (visible && !(vaccinationForm[q.key] ?? "").trim()) return true;
        }
        if (normalized === "testssuggested") return testsSuggested.length === 0;
        const panelDef = testsPanelDefsByKey.get(q.key);
        if (panelDef && hasMainSuggestedTest(testsSuggested, panelDef.mainKeyword)) {
          return getPanelAnswerList(q.key).length === 0;
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
        // Fallback for any other hospital built-in question that hasn't been
        // covered by an explicit case above (heart rate, respiration, rumen
        // motility, weight, chief complaint, custom diagnosis questions, etc.).
        // These are stored in customAnswers[q.key] just like custom questions,
        // so honour the Compulsory toggle from the form editor by validating
        // against that same bucket. Without this fallback, marking those
        // fields as Compulsory silently does nothing on save.
        const fallbackValue = mergedCustomAnswers[q.key];
        if (Array.isArray(fallbackValue)) {
          return fallbackValue.length === 0;
        }
        return !String(fallbackValue ?? "").trim();
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
      if (isVaccinationStorageKey(key)) continue;
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
    appendVaccinationToCustomFields(
      normalizedCustomAnswers,
      effectiveSpecies,
      vaccinationForm,
      (key) => isQuestionEnabled(key, true),
    );
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
    for (const def of testsPanelDefs) {
      if (
        hasMainSuggestedTest(testsSuggested, def.mainKeyword) &&
        isQuestionEnabled(def.panelKey)
      ) {
        const vals = getPanelAnswerList(def.panelKey);
        if (vals.length > 0) {
          normalizedCustomAnswers[def.panelKey] = vals.map((v) => toEnglishSentence(v));
        }
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

    if (
      treatmentAttachments.some((a) => a.pending) ||
      uploadingTreatmentAttachments ||
      compressingTreatmentAttachments
    ) {
      toast({
        title: "Please wait for images to finish uploading",
        description: compressingTreatmentAttachments
          ? "Images are being optimized for upload."
          : treatmentAttachments.some((a) => a.pending)
            ? "One or more attachments are still being saved to the server."
            : undefined,
        variant: "destructive",
      });
      return;
    }

    const attendingVetPayload = (() => {
      const q = allQuestions.find((x) => x.inputType === "hospital_veterinarian");
      if (mode !== "hospital" || !q?.enabled) {
        return {
          veterinarianId: null as number | null,
          veterinarianName: null as string | null,
          veterinarianNvc: null as string | null,
          veterinarianDepartment: null as string | null,
        };
      }
      const hv = attendingVetByQuestion[q.key];
      const name = String(hv?.name ?? "").trim();
      if (!name) {
        return {
          veterinarianId: null,
          veterinarianName: null,
          veterinarianNvc: null,
          veterinarianDepartment: null,
        };
      }
      if (hv?.isIntern) {
        return {
          veterinarianId: null,
          veterinarianName: toTitleCase(name),
          veterinarianNvc: null,
          veterinarianDepartment: "Intern",
        };
      }
      return {
        veterinarianId: hv?.veterinarianId ?? null,
        veterinarianName: toTitleCase(name),
        veterinarianNvc: String(hv?.nvc ?? "").trim() || null,
        veterinarianDepartment: String(hv?.department ?? "").trim() || null,
      };
    })();

    createMutation.mutate({
      caseNumber:
        mode === "hospital"
          ? (caseInfo?.caseNumber || "CASE-000").replace(/^AST-/i, "CASE-")
          : caseInfo?.caseNumber || "AST-000",
      billNumber: billNumber || null,
      dailyNumber: caseInfo?.dailyNumber || 1,
      monthlyNumber: caseInfo?.monthlyNumber || 1,
      yearlyNumber: caseInfo?.yearlyNumber || 1,
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
      treatmentDetails:
        Object.keys(treatmentAnswers).length > 0
          ? JSON.stringify(treatmentAnswers)
          : null,
      treatmentAttachmentIds: treatmentAttachments
        .filter((file) => !file.pending && file.id > 0)
        .map((file) => file.id),
      veterinarianId: attendingVetPayload.veterinarianId,
      veterinarianName: attendingVetPayload.veterinarianName,
      veterinarianNvc: attendingVetPayload.veterinarianNvc,
      veterinarianDepartment: attendingVetPayload.veterinarianDepartment,
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
    const hasVaccinationSection = nextSections.some((s) => s.key === "vaccination_history");
    if (!hasVaccinationSection) {
      const historyIdx = nextSections.findIndex((s) => {
        const n = normalizeQuestionId(s.key || s.title || "");
        return n === "history" || n.includes("historyandpreviousmedication");
      });
      const vaccinationSection = {
        key: "vaccination_history",
        title: "Vaccination History",
        displayOrder: 2550,
        questions: [
          {
            id: -1051,
            key: "canineRabies",
            label: "Rabies",
            inputType: "singleSelect",
            enabled: true,
            required: false,
            displayOrder: 1000,
            isBuiltin: true,
            options: ["Yes", "No", "Unknown"],
          },
          {
            id: -1052,
            key: "canineDhppil",
            label: "DHPPiL",
            inputType: "singleSelect",
            enabled: true,
            required: false,
            displayOrder: 2000,
            isBuiltin: true,
            options: ["Yes", "No", "Unknown"],
          },
          {
            id: -1053,
            key: "felineRabies",
            label: "Rabies",
            inputType: "singleSelect",
            enabled: true,
            required: false,
            displayOrder: 3000,
            isBuiltin: true,
            options: ["Yes", "No", "Unknown"],
          },
          {
            id: -1054,
            key: "felineTricat",
            label: "TriCat",
            inputType: "singleSelect",
            enabled: true,
            required: false,
            displayOrder: 4000,
            isBuiltin: true,
            options: ["Yes", "No", "Unknown"],
          },
        ],
      };
      if (historyIdx >= 0) {
        nextSections = [
          ...nextSections.slice(0, historyIdx + 1),
          vaccinationSection,
          ...nextSections.slice(historyIdx + 1),
        ];
      } else {
        nextSections = [...nextSections, vaccinationSection];
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
      const filteredExisting = (targetSection.questions ?? []).filter((q) =>
        shouldIncludeTestsSuggestedFormQuestion(q),
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
    const hasTreatmentSection = nextSections.some((s) => {
      const normalized = normalizeQuestionId(s.key || s.title || "");
      return normalized.includes("treatment");
    });
    if (!hasTreatmentSection) {
      nextSections = [
        ...nextSections,
        {
          key: "treatment",
          title: "Treatment / Prescription",
          displayOrder: 4700,
          questions: [
            {
              id: -1301,
              key: "treatmentPrescription",
              label: "Treatment / Prescription",
              inputType: "treatment_prescription",
              enabled: true,
              required: false,
              displayOrder: 1000,
              isBuiltin: true,
            },
          ],
        },
      ];
    }
    const hasAttendingVetSection = nextSections.some((s) => {
      const normalized = normalizeQuestionId(s.key || s.title || "");
      return normalized.includes("attendingveterinarian") || normalized === "attending_veterinarian";
    });
    if (!hasAttendingVetSection) {
      nextSections = [
        ...nextSections,
        {
          key: "attending_veterinarian",
          title: "Attending veterinarian",
          displayOrder: 4650,
          questions: [
            {
              id: -1350,
              key: "attendingVeterinarian",
              label: "Attending veterinarian",
              inputType: "hospital_veterinarian",
              enabled: true,
              required: false,
              displayOrder: 1000,
              isBuiltin: true,
            },
          ],
        },
      ];
    }
    return nextSections;
  }, [effectiveDefinition, mode, isAvianSpecies, isCompanionSpecies]);
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

  const registerJumpSections = useMemo(() => {
    const items: { id: string; label: string }[] = [
      { id: "register-section-registration", label: "Registration" },
    ];
    for (const s of enabledSections) {
      if (mode === "hospital" && s.key === "sample") continue;
      if (mode === "hospital" && s.key === "avian" && !isAvianSpecies) continue;
      if (mode === "hospital" && s.key === "vaccination_history" && !isCompanionSpecies) continue;
      items.push({ id: `register-section-${s.key}`, label: s.title });
    }
    return items;
  }, [enabledSections, mode, isAvianSpecies, isCompanionSpecies]);

  const scrollToRegisterSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  };

  const renderCustomQuestion = (q: NonNullable<FormDefinition["sections"]>[number]["questions"][number]) => {
    const value = customAnswers[q.key] ?? "";
    const required = q.required;
    const options = q.options ?? [];
    const showLabel = !q.hideLabel;
    if (q.inputType === "hospital_veterinarian") {
      const vetKey = q.key;
      const data =
        attendingVetByQuestion[vetKey] ?? {
          veterinarianId: null,
          name: "",
          nvc: "",
          department: "",
          customMode: false,
          isIntern: false,
        };
      const vetOptions: FilterableOption[] = veterinariansData.map((v) => ({
        value: v.fullName,
        label: `${v.fullName} — ${v.department}`,
        rowKey: `vet-${v.id}`,
        searchText: `${v.fullName} ${v.nvcRegistrationNumber} ${v.department}`,
        meta: {
          veterinarianId: v.id,
          nvcRegistrationNumber: v.nvcRegistrationNumber,
          department: v.department,
        },
      }));
      return (
        <div className="space-y-3 sm:col-span-2" key={q.key}>
          {showLabel && (
            <Label>
              {q.label} {required && <span className="text-destructive">*</span>}
            </Label>
          )}
          <FilterableField
            value={data.name}
            options={vetOptions}
            placeholder={
              data.isIntern
                ? "Intern name"
                : "Veterinarian name"
            }
            customMode={data.customMode}
            onCustomModeChange={(next) => {
              setAttendingVetByQuestion((prev) => ({
                ...prev,
                [vetKey]: next
                  ? {
                      veterinarianId: null,
                      name: "",
                      nvc: "",
                      department: "",
                      customMode: true,
                      isIntern: false,
                    }
                  : {
                      ...(prev[vetKey] ?? data),
                      customMode: false,
                      isIntern: false,
                    },
              }));
            }}
            onInternSelect={() => {
              setAttendingVetByQuestion((prev) => ({
                ...prev,
                [vetKey]: {
                  veterinarianId: null,
                  name: "",
                  nvc: "",
                  department: "",
                  customMode: false,
                  isIntern: true,
                },
              }));
            }}
            onPickOption={(option) => {
              const m = option.meta;
              const vid = m?.veterinarianId;
              if (vid == null) return;
              setAttendingVetByQuestion((prev) => ({
                ...prev,
                [vetKey]: {
                  veterinarianId: vid,
                  name: String(option.value),
                  nvc: String(m?.nvcRegistrationNumber ?? ""),
                  department: String(m?.department ?? ""),
                  customMode: false,
                  isIntern: false,
                },
              }));
            }}
            onChange={(name) => {
              setAttendingVetByQuestion((prev) => {
                const cur = prev[vetKey] ?? {
                  veterinarianId: null,
                  name: "",
                  nvc: "",
                  department: "",
                  customMode: false,
                  isIntern: false,
                };
                const next = { ...cur, name };
                if (cur.isIntern) {
                  return { ...prev, [vetKey]: next };
                }
                const match = veterinariansData.find((v) => v.fullName === name.trim());
                if (match && cur.veterinarianId === match.id) {
                  return { ...prev, [vetKey]: next };
                }
                return {
                  ...prev,
                  [vetKey]: {
                    ...next,
                    veterinarianId: null,
                  },
                };
              });
            }}
          />
          {data.isIntern && (
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                Intern
              </span>
              <span className="text-muted-foreground">
                NVC no. and department are not required.
              </span>
            </div>
          )}
          {!data.isIntern && (data.customMode || data.veterinarianId === null) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nepal Veterinary Council registration no.</Label>
                <Input
                  value={data.nvc}
                  onChange={(e) =>
                    setAttendingVetByQuestion((prev) => ({
                      ...prev,
                      [vetKey]: { ...(prev[vetKey] ?? data), nvc: e.target.value },
                    }))
                  }
                  placeholder="NVC no."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department</Label>
                <Input
                  value={data.department}
                  onChange={(e) =>
                    setAttendingVetByQuestion((prev) => ({
                      ...prev,
                      [vetKey]: { ...(prev[vetKey] ?? data), department: e.target.value },
                    }))
                  }
                  placeholder="Department"
                />
              </div>
            </div>
          )}
          {!data.customMode && !data.isIntern && data.veterinarianId !== null && (data.nvc || data.department) && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {data.nvc ? <p>NVC no.: {data.nvc}</p> : null}
              {data.department ? <p>Department: {data.department}</p> : null}
            </div>
          )}
        </div>
      );
    }
    if (q.inputType === "treatment_prescription") {
      const current = treatmentAnswers[q.key] ?? { medications: [], generalInstructions: "" };
      const medicationOptions = Array.from(new Set(medicationOptionsData.filter(Boolean)));
      const routeOptionItems = Array.from(
        new Map(
          routeOptionsData
            .map((item) => {
              if (typeof item === "string") {
                const value = item.trim();
                return value
                  ? {
                      value,
                      label: value,
                      search: value.toLowerCase(),
                    }
                  : null;
              }
              const abbreviation = String(item?.abbreviation ?? "").trim();
              const name = String(item?.name ?? "").trim();
              const value = abbreviation || name;
              if (!value) return null;
              const label = name && name.toLowerCase() !== value.toLowerCase() ? `${value} - ${name}` : value;
              return {
                value,
                label,
                search: `${value} ${name}`.toLowerCase(),
              };
            })
            .filter((item): item is { value: string; label: string; search: string } => Boolean(item))
            .map((item) => [item.value.toLowerCase(), item]),
        ).values(),
      );
      const frequencyOptionItems = Array.from(
        new Map(
          frequencyOptionsData
            .map((item) => {
              if (typeof item === "string") {
                const value = item.trim();
                return value
                  ? {
                      value,
                      label: value,
                      search: value.toLowerCase(),
                    }
                  : null;
              }
              const abbreviation = String(item?.abbreviation ?? "").trim();
              const name = String(item?.name ?? "").trim();
              const value = abbreviation || name;
              if (!value) return null;
              const label = name && name.toLowerCase() !== value.toLowerCase() ? `${value} - ${name}` : value;
              return {
                value,
                label,
                search: `${value} ${name}`.toLowerCase(),
              };
            })
            .filter((item): item is { value: string; label: string; search: string } => Boolean(item))
            .map((item) => [item.value.toLowerCase(), item]),
        ).values(),
      );
      const routeOptions = routeOptionItems.map((item) => item.value);
      const frequencyOptions = frequencyOptionItems.map((item) => item.value);
      const doseUnitOptions = Array.from(new Set(doseUnitOptionsData.filter(Boolean)));
      const durationOptions = Array.from(new Set(durationOptionsData.filter(Boolean)));

      const normalizedRows = current.medications.map((row) => ({
        ...row,
        clientId: row.clientId ?? createTreatmentEntryId("med"),
        showNote: row.showNote ?? Boolean(row.note?.trim()),
      }));
      const hasGeneralInstructionBlock = Boolean(current.generalInstructionId);
      const normalizedOrder: TreatmentEntryOrderItem[] =
        (current.entryOrder ?? []).filter((item) =>
          item.type === "general"
            ? hasGeneralInstructionBlock && item.id === current.generalInstructionId
            : normalizedRows.some((row) => row.clientId === item.id),
        );
      for (const row of normalizedRows) {
        if (!normalizedOrder.some((item) => item.type === "medication" && item.id === row.clientId)) {
          normalizedOrder.push({ type: "medication", id: row.clientId as string });
        }
      }
      if (
        hasGeneralInstructionBlock &&
        !normalizedOrder.some(
          (item) => item.type === "general" && item.id === current.generalInstructionId,
        )
      ) {
        normalizedOrder.push({ type: "general", id: current.generalInstructionId as string });
      }

      const updateMedicationRow = (rowId: string, patch: Partial<TreatmentMedicationEntry>) => {
        setTreatmentAnswers((prev) => {
          const existing = prev[q.key] ?? { medications: [], generalInstructions: "" };
          const nextRows = existing.medications.map((row) => {
            const normalizedRow = {
              ...row,
              clientId: row.clientId ?? createTreatmentEntryId("med"),
              showNote: row.showNote ?? Boolean(row.note?.trim()),
            };
            return normalizedRow.clientId === rowId ? { ...normalizedRow, ...patch } : normalizedRow;
          });
          const nextOrder = (existing.entryOrder ?? []).filter((item) =>
            item.type === "general"
              ? existing.generalInstructionId && item.id === existing.generalInstructionId
              : nextRows.some((row) => row.clientId === item.id),
          );
          for (const row of nextRows) {
            if (!nextOrder.some((item) => item.type === "medication" && item.id === row.clientId)) {
              nextOrder.push({ type: "medication", id: row.clientId as string });
            }
          }
          if (
            existing.generalInstructionId &&
            !nextOrder.some(
              (item) => item.type === "general" && item.id === existing.generalInstructionId,
            )
          ) {
            nextOrder.push({ type: "general", id: existing.generalInstructionId });
          }
          return { ...prev, [q.key]: { ...existing, medications: nextRows, entryOrder: nextOrder } };
        });
      };

      return (
        <div className="space-y-3 sm:col-span-2" key={q.key}>
          {showLabel && (
            <Label>
              {q.label} {required && <span className="text-destructive">*</span>}
            </Label>
          )}
          <div className="space-y-3 rounded border p-3">
            {normalizedOrder.map((item) => {
              if (item.type === "general") {
                return (
                  <div key={`${q.key}-general-${item.id}`} className="rounded border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">General treatment instruction</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() =>
                          setTreatmentAnswers((prev) => {
                            const existing = prev[q.key] ?? { medications: [], generalInstructions: "" };
                            return {
                              ...prev,
                              [q.key]: {
                                ...existing,
                                generalInstructions: "",
                                generalInstructionId: null,
                                entryOrder: (existing.entryOrder ?? []).filter(
                                  (entry) => !(entry.type === "general" && entry.id === item.id),
                                ),
                              },
                            };
                          })
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </Button>
                    </div>
                    <Textarea
                      value={current.generalInstructions}
                      onChange={(e) =>
                        setTreatmentAnswers((prev) => {
                          const existing = prev[q.key] ?? { medications: [], generalInstructions: "" };
                          return { ...prev, [q.key]: { ...existing, generalInstructions: e.target.value } };
                        })
                      }
                      placeholder="General treatment instructions (non-medication)"
                      rows={3}
                    />
                  </div>
                );
              }

              const row = normalizedRows.find((med) => med.clientId === item.id);
              if (!row) return null;
              const rowId = row.clientId as string;
              const doseUnitKey = `${q.key}:${rowId}:doseUnit`;
              const routeKey = `${q.key}:${rowId}:route`;
              const frequencyKey = `${q.key}:${rowId}:frequency`;
              const durationKey = `${q.key}:${rowId}:duration`;
              const doseUnitOptionItems: FilterableOption[] = doseUnitOptions.map((option) => ({
                value: option,
                label: option,
                searchText: option,
              }));
              const durationOptionItems: FilterableOption[] = durationOptions.map((option) => ({
                value: option,
                label: option,
                searchText: option,
              }));
              return (
                <div key={`${q.key}-med-${rowId}`} className="rounded border p-3 space-y-2">
                  <FilterableField
                    value={row.medication}
                    options={medicationOptions.map((option) => ({
                      value: option,
                      label: option,
                      searchText: option,
                    }))}
                    placeholder="Medication"
                    customMode={false}
                    onCustomModeChange={() => {}}
                    onChange={(value) => updateMedicationRow(rowId, { medication: value })}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <Input value={row.dose} onChange={(e) => updateMedicationRow(rowId, { dose: e.target.value })} placeholder="Dose" />
                    <FilterableField
                      value={row.doseUnit}
                      options={doseUnitOptionItems}
                      placeholder="Dose unit"
                      customMode={Boolean(treatmentCustomSelectMode[doseUnitKey])}
                      onCustomModeChange={(next) =>
                        setTreatmentCustomSelectMode((prev) => ({ ...prev, [doseUnitKey]: next }))
                      }
                      onChange={(value) => updateMedicationRow(rowId, { doseUnit: value })}
                    />
                    <FilterableField
                      value={row.route}
                      options={routeOptionItems}
                      placeholder="Route"
                      customMode={Boolean(treatmentCustomSelectMode[routeKey])}
                      onCustomModeChange={(next) =>
                        setTreatmentCustomSelectMode((prev) => ({ ...prev, [routeKey]: next }))
                      }
                      onChange={(value) => updateMedicationRow(rowId, { route: value })}
                    />
                    <FilterableField
                      value={row.frequency}
                      options={frequencyOptionItems}
                      placeholder="Frequency"
                      customMode={Boolean(treatmentCustomSelectMode[frequencyKey])}
                      onCustomModeChange={(next) =>
                        setTreatmentCustomSelectMode((prev) => ({ ...prev, [frequencyKey]: next }))
                      }
                      onChange={(value) => updateMedicationRow(rowId, { frequency: value })}
                    />
                    <FilterableField
                      value={row.duration}
                      options={durationOptionItems}
                      placeholder="Duration"
                      customMode={Boolean(treatmentCustomSelectMode[durationKey])}
                      onCustomModeChange={(next) =>
                        setTreatmentCustomSelectMode((prev) => ({ ...prev, [durationKey]: next }))
                      }
                      onChange={(value) => updateMedicationRow(rowId, { duration: value })}
                    />
                  </div>

                  {row.showNote ? (
                    <div className="space-y-2">
                      <Textarea
                        value={row.note}
                        onChange={(e) => updateMedicationRow(rowId, { note: e.target.value })}
                        placeholder="Optional note"
                        rows={2}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => updateMedicationRow(rowId, { note: "", showNote: false })}
                      >
                        Remove optional note
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updateMedicationRow(rowId, { showNote: true })}
                    >
                      Add optional note
                    </Button>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() =>
                        setTreatmentAnswers((prev) => {
                          const existing = prev[q.key] ?? { medications: [], generalInstructions: "" };
                          const nextRows = existing.medications.filter((med) => {
                            const normalizedRow = {
                              ...med,
                              clientId: med.clientId ?? createTreatmentEntryId("med"),
                            };
                            return normalizedRow.clientId !== rowId;
                          });
                          return {
                            ...prev,
                            [q.key]: {
                              ...existing,
                              medications: nextRows,
                              entryOrder: (existing.entryOrder ?? []).filter(
                                (entry) => !(entry.type === "medication" && entry.id === rowId),
                              ),
                            },
                          };
                        })
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove medication
                    </Button>
                  </div>
                </div>
              );
            })}
            {/* Add buttons sit BELOW the list so they stay close to the most
                recently added medication / general instruction — no need to
                scroll back to the top of the treatment card after each entry. */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() =>
                  setTreatmentAnswers((prev) => {
                    const existing = prev[q.key] ?? { medications: [], generalInstructions: "" };
                    const newId = createTreatmentEntryId("med");
                    const nextRows = [
                      ...existing.medications.map((row) => ({
                        ...row,
                        clientId: row.clientId ?? createTreatmentEntryId("med"),
                        showNote: row.showNote ?? Boolean(row.note?.trim()),
                      })),
                      {
                        clientId: newId,
                        medication: "",
                        dose: "",
                        doseUnit: "",
                        route: "",
                        frequency: "",
                        duration: "",
                        note: "",
                        showNote: false,
                      },
                    ];
                    const nextOrder = [...(existing.entryOrder ?? []), { type: "medication" as const, id: newId }];
                    return {
                      ...prev,
                      [q.key]: {
                        ...existing,
                        medications: nextRows,
                        entryOrder: nextOrder,
                      },
                    };
                  })
                }
              >
                <Plus className="w-3.5 h-3.5" />
                Add medication
              </Button>
              {!hasGeneralInstructionBlock && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    setTreatmentAnswers((prev) => {
                      const existing = prev[q.key] ?? { medications: [], generalInstructions: "" };
                      const generalId = createTreatmentEntryId("general");
                      return {
                        ...prev,
                        [q.key]: {
                          ...existing,
                          generalInstructionId: generalId,
                          generalInstructions: existing.generalInstructions ?? "",
                          entryOrder: [...(existing.entryOrder ?? []), { type: "general", id: generalId }],
                        },
                      };
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add general instruction
                </Button>
              )}
            </div>
            <div className="rounded border border-dashed p-3 space-y-3">
              <div>
                <p className="text-sm font-medium">Treatment attachments</p>
                <p className="text-xs text-muted-foreground">
                  Add up to 10 images (JPG/JPEG/PNG, up to 5MB each). Larger photos are
                  automatically optimized to under 1MB before upload.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={treatmentFileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  multiple
                  className="sr-only"
                  onChange={(e) => uploadTreatmentAttachments(e.target.files, "diagnostic")}
                  disabled={treatmentAttachmentBusy}
                />
                <input
                  ref={treatmentCaptureInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  capture="environment"
                  multiple
                  className="sr-only"
                  onChange={(e) => uploadTreatmentAttachments(e.target.files, "handwritten")}
                  disabled={treatmentAttachmentBusy}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={treatmentAttachmentBusy}
                  onClick={() => treatmentFileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import from files
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={treatmentAttachmentBusy}
                  onClick={() => treatmentCaptureInputRef.current?.click()}
                >
                  <Camera className="w-3.5 h-3.5" />
                  Scan / capture
                </Button>
              </div>
              {treatmentUploadProgress !== null && (
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    {treatmentUploadProgress < 0 ? (
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                    ) : (
                      <div
                        className="h-full bg-primary transition-[width] duration-150"
                        style={{ width: `${treatmentUploadProgress}%` }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {compressingTreatmentAttachments
                      ? "Optimizing image(s)…"
                      : treatmentUploadProgress < 0
                        ? "Uploading…"
                        : `${treatmentUploadProgress}% uploaded`}
                  </p>
                </div>
              )}
              {treatmentAttachments.length > 0 && (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {treatmentAttachments.map((attachment, idx) => (
                      <div
                        key={attachment.pending ? `p-${attachment.id}` : attachment.id}
                        className="relative rounded-md border bg-muted/30 overflow-hidden group aspect-square"
                      >
                        <button
                          type="button"
                          className="absolute inset-0 flex items-center justify-center"
                          onClick={() => setTreatmentAttachmentPreviewIndex(idx)}
                          aria-label={`View full size: ${attachment.fileName}`}
                        >
                          <img
                            src={attachment.url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                        {attachment.pending && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
                          </div>
                        )}
                        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                          {treatmentAttachmentSourceLabel(attachment.category)}
                        </span>
                        <button
                          type="button"
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                          aria-label={`Remove ${attachment.fileName}`}
                          disabled={
                            removingTreatmentAttachmentId === attachment.id ||
                            treatmentAttachmentBusy
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setAttachmentRemovePrompt(attachment);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <AlertDialog
                    open={attachmentRemovePrompt !== null}
                    onOpenChange={(open) => {
                      if (!open) setAttachmentRemovePrompt(null);
                    }}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this image?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {attachmentRemovePrompt?.pending
                            ? "This file has not finished uploading yet. It will be discarded."
                            : "This deletes the file from the server. You can upload it again if needed."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => {
                            const target = attachmentRemovePrompt;
                            setAttachmentRemovePrompt(null);
                            if (target) void finalizeRemoveTreatmentAttachment(target);
                          }}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Dialog
                    open={treatmentAttachmentPreviewIndex !== null}
                    onOpenChange={(open) => {
                      if (!open) setTreatmentAttachmentPreviewIndex(null);
                    }}
                  >
                    <DialogContent className="max-w-5xl w-[95vw]">
                      <DialogHeader>
                        <DialogTitle>
                          {treatmentAttachmentPreviewIndex !== null
                            ? treatmentAttachments[treatmentAttachmentPreviewIndex]?.fileName
                            : "Attachment"}
                        </DialogTitle>
                      </DialogHeader>
                      {treatmentAttachmentPreviewIndex !== null &&
                        treatmentAttachments[treatmentAttachmentPreviewIndex] && (
                          <div className="space-y-3">
                            <img
                              src={treatmentAttachments[treatmentAttachmentPreviewIndex].url}
                              alt={treatmentAttachments[treatmentAttachmentPreviewIndex].fileName}
                              className="max-h-[75vh] w-full object-contain bg-black/5 rounded-md"
                            />
                            {treatmentAttachments.length > 1 && (
                              <div className="flex justify-between gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setTreatmentAttachmentPreviewIndex((prev) =>
                                      prev === null
                                        ? prev
                                        : (prev - 1 + treatmentAttachments.length) %
                                          treatmentAttachments.length,
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
                                    setTreatmentAttachmentPreviewIndex((prev) =>
                                      prev === null
                                        ? prev
                                        : (prev + 1) % treatmentAttachments.length,
                                    )
                                  }
                                >
                                  Next
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }
    if (q.inputType === "singleSelect") {
  return (
        <div className="space-y-1.5" key={q.key}>
          {showLabel && (
            <Label>
              {q.label} {required && <span className="text-destructive">*</span>}
            </Label>
          )}
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
          {showLabel && (
            <Label>
              {q.label} {required && <span className="text-destructive">*</span>}
            </Label>
          )}
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
          {showLabel && (
            <Label>
              {q.label} {required && <span className="text-destructive">*</span>}
            </Label>
          )}
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
          {showLabel && (
            <Label>
              {q.label} {required && <span className="text-destructive">*</span>}
            </Label>
          )}
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
          {showLabel && (
            <Label>
              {q.label} {required && <span className="text-destructive">*</span>}
            </Label>
          )}
          <AutoGrowTextarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) =>
              setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
            }
            onBlur={(e) =>
              setCustomAnswers((prev) => ({ ...prev, [q.key]: toTitleCase(e.target.value) }))
            }
          />
        </div>
      );
    }
    return (
      <div className="space-y-1.5" key={q.key}>
        {showLabel && (
          <Label>
            {q.label} {required && <span className="text-destructive">*</span>}
          </Label>
        )}
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
  const shouldShowQuestion = (_required: boolean, key?: string) => {
    // Previously this consulted a "Hide optional fields" toggle to filter
    // out non-required questions. The toggle was removed because the
    // hospital form editor wasn't reliably writing the `required` flag on
    // every question, so the toggle appeared to do nothing in practice.
    // The `_required` argument is kept (with an underscore prefix) so all
    // existing call sites don't need to change.
    if (
      mode === "hospital" &&
      (key === "animalName" || key === "age" || key === "sex")
    ) {
      if (isAvianSpecies && key === "animalName") return false;
      return true;
    }
    return true;
  };
  const isBulletPointsEnabled = (fieldKey: string, fallback = false) => {
    if (bulletPointModes[fieldKey] !== undefined) return bulletPointModes[fieldKey]!;
    if (mode === "hospital") {
      if (fieldKey === "historyNotes") return hospitalToggleDefaults?.historyNotesBulletPoints ?? fallback;
      if (fieldKey === "previousMedicationNotes") {
        return hospitalToggleDefaults?.previousMedicationNotesBulletPoints ?? fallback;
      }
      if (fieldKey === "clinicalSignsSymptomsNotes") {
        return hospitalToggleDefaults?.clinicalSignsSymptomsNotesBulletPoints ?? fallback;
      }
      if (fieldKey.startsWith("chiefComplaint:")) {
        return hospitalToggleDefaults?.chiefComplaintBulletPoints ?? fallback;
      }
    }
    return fallback;
  };
  useEffect(() => {
    const hospitalDefaults = hospitalToggleDefaults ?? {
      historyNotesBulletPoints: true,
      previousMedicationNotesBulletPoints: true,
      clinicalSignsSymptomsNotesBulletPoints: true,
    };
    setBulletPointModes((prev) => ({
      ...prev,
      historyNotes: hospitalDefaults.historyNotesBulletPoints,
      previousMedicationNotes: hospitalDefaults.previousMedicationNotesBulletPoints,
      clinicalSignsSymptomsNotes: hospitalDefaults.clinicalSignsSymptomsNotesBulletPoints,
    }));
  }, [mode, hospitalToggleDefaults]);

  return (
    <StickyScrollPage
      sticky={
        <div className="space-y-3">
          {/* Restore-draft banner — only shown when localStorage has a recent
              autosaved form for this scope (autosave fires every ~750ms while
              typing; cleared on successful submit). */}
          {draftPrompt && (
            <div
              className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
            >
              <span className="font-medium">Unsaved draft from</span>
              <span title={new Date(draftPrompt.savedAt).toLocaleString()}>
                {new Date(draftPrompt.savedAt).toLocaleString()}
              </span>
              <span className="text-amber-700">
                Continue where you left off, or discard it.
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applyDraft(draftPrompt)}
                  data-testid="button-restore-draft"
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={discardDraft}
                  data-testid="button-discard-draft"
                >
                  Discard
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Link href={backHref}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold" data-testid="text-page-title">
                {pageTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-muted-foreground">
                <span>Case #{displayCaseNumber}</span>
                <span>Day #{caseInfo?.dailyNumber || "..."}</span>
                <span>Month #{caseInfo?.monthlyNumber || "..."}</span>
                <span>Year #{caseInfo?.yearlyNumber || "..."}</span>
              </div>
            </div>
          </div>
          {!draftPrompt && draftAutosavedAt && (
            <p className="text-[11px] text-muted-foreground" role="status">
              Draft saved locally {new Date(draftAutosavedAt).toLocaleTimeString()}.
            </p>
          )}
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  data-testid="button-jump-to-section"
                >
                  Jump to section
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-[min(70vh,24rem)] w-[min(20rem,calc(100vw-2rem))]"
              >
                {registerJumpSections.map((j) => (
                  <DropdownMenuItem
                    key={j.id}
                    className="cursor-pointer"
                    onSelect={() => scrollToRegisterSection(j.id)}
                  >
                    {j.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        {/* Registration / Bill Number */}
        <Card id="register-section-registration" className="scroll-mt-28">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="billNumber">Hospital Bill / Registration Number</Label>
              <Input
                id="billNumber"

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
          if (mode === "hospital" && section.key === "vaccination_history" && !isCompanionSpecies) {
            return null;
          }
          const configuredQuestions = section.questions ?? [];
          const hasTestsSuggestedMultiSelect = configuredQuestions.some(
            (q) => normalizeQuestionId(q.key) === "testssuggested" && q.inputType === "multiSelect",
          );
          const isTestsSuggestedSection =
            isTestsSuggestedSectionTitle(section.title) ||
            testsSuggestedSectionKeys.has(section.key) ||
            isTestsSuggestedSectionKey(section.key, section.title);
          const visibleQuestions = configuredQuestions.filter((q) => {
            if (isTestsSuggestedSection && !shouldIncludeTestsSuggestedFormQuestion(q)) {
              return false;
            }
            if (
              hasTestsSuggestedMultiSelect &&
              normalizeQuestionId(q.label) === normalizeQuestionId(section.title) &&
              q.inputType === "textarea"
            ) {
              return false;
            }
            if (isTestsSuggestedSection && isDetailSubQuestionKey(q.key)) {
              const parentKeyword = detailFieldParentKeyword(q.key);
              if (parentKeyword && !hasMainSuggestedTest(testsSuggested, parentKeyword)) {
                return false;
              }
            }
            if (isTestsSuggestedSection && isTestsSuggestedPanelSubQuestion(q)) {
              const panelDef = resolvePanelDefForKey(q.key, testsPanelDefsByKey);
              if (!panelDef || !hasMainSuggestedTest(testsSuggested, panelDef.mainKeyword)) {
                return false;
              }
            }
            if (
              normalizeQuestionId(section.key) === "vaccinationhistory" &&
              isVaccinationStatusKey(q.key) &&
              !vaccinationFieldsForSpecies(effectiveSpecies).some((f) => f.statusKey === q.key)
            ) {
              return false;
            }
            return (
              (q.inputType === "treatment_prescription" ||
                q.inputType === "hospital_veterinarian" ||
                shouldShowQuestion(q.required, q.key)) &&
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
          // For single-question sections whose field label is NOT visible (Box
          // only / hideLabel, or the section renders as one box using the title
          // as its label), the field's required "*" has nowhere to show. In that
          // case surface the "*" on the section title instead. Multi-question
          // sections keep their per-label "*" and never get a title "*".
          const onlyVisibleQuestion =
            visibleQuestions.length === 1 ? visibleQuestions[0] : null;
          const sectionTitleShowsRequiredMark =
            Boolean(onlyVisibleQuestion?.required) &&
            (sectionActsAsQuestion || onlyVisibleQuestion?.hideLabel === true);
          if (
            !sectionActsAsQuestion &&
            visibleQuestions.length === 0 &&
            !(
              mode === "hospital" &&
              section.key === "vaccination_history" &&
              isCompanionSpecies
            )
          ) {
            return null;
          }
          if (section.key === "ast") {
            if (mode === "hospital") return null;
            const astQuestion = visibleQuestions.find((q) => q.key === "astResults");
            const astIsRequired = Boolean(astQuestion?.required);
            return (
              <div key={section.key} id={`register-section-${section.key}`} className="space-y-3 sm:space-y-4 scroll-mt-28">
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

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow} data-testid="button-add-antibiotic">
                <Plus className="w-3.5 h-3.5" />
                Add Antibiotic
              </Button>
            </div>
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
            <Card key={section.key} id={`register-section-${section.key}`} className="scroll-mt-28">
          <CardHeader className="pb-4">
                <CardTitle className="text-base">
                  {section.title}
                  {sectionTitleShowsRequiredMark && (
                    <span className="text-destructive"> *</span>
                  )}
                </CardTitle>
          </CardHeader>
              <CardContent className="space-y-4">
                {mode === "hospital" && section.key === "vaccination_history" ? (
                  <VaccinationHistoryFields
                    fields={vaccinationFieldsForSpecies(effectiveSpecies)}
                    state={vaccinationForm}
                    onChange={setVaccinationForm}
                    isRequired={(key) => isQuestionRequired(key, false)}
                    isEnabled={(key) => isQuestionEnabled(key, true)}
                  />
                ) : sectionActsAsQuestion ? (
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
                    <AutoGrowTextarea
                      id={`section-answer-${section.key}`}

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
                      data-testid={`textarea-section-${section.key}`}
                    />
                  </div>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {visibleQuestions.map((q) => {
                    const required = q.required;
                    const showLabel = !q.hideLabel;
                    if (isTestsSuggestedSection && isTestsSuggestedPanelSubQuestion(q)) {
                      const panelDef = resolvePanelDefForKey(q.key, testsPanelDefsByKey);
                      if (!panelDef || !hasMainSuggestedTest(testsSuggested, panelDef.mainKeyword)) {
                        return null;
                      }
                      const options = getQuestionOptions(q.key, []);
                      const selected = getPanelAnswerList(q.key);
                      return (
                        <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                          <Label>
                            {panelDef.mainLabel}
                            {required && <span className="text-destructive">*</span>}
                          </Label>
                          <ToggleGrid
                            options={options}
                            selected={selected}
                            onToggle={(opt, checked) => {
                              const next = checked
                                ? [...selected, opt]
                                : selected.filter((v) => v !== opt);
                              setPanelAnswerList(q.key, next);
                            }}
                          />
                        </div>
                      );
                    }
                    if (q.inputType === "treatment_prescription" || q.inputType === "hospital_veterinarian") {
                      return renderCustomQuestion(q);
                    }
                    if (!q.isBuiltin && !(mode === "hospital" && isHospitalBuiltinQuestionKeyOrLabel(q.key, q.label, section.key))) {
                      return renderCustomQuestion(q);
                    }

                    switch (q.key) {
                      case "ownerName":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            {showLabel && (
                              <Label htmlFor="ownerName">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Input
                              id="ownerName"

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
                            {showLabel && (
                              <Label htmlFor="ownerPhone">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Input
                              id="ownerPhone"

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
                            {showLabel && (
                              <Label>
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Select value={species} onValueChange={setSpecies}>
                              <SelectTrigger  data-testid="select-species">
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
                                className="mt-2"
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
                            {showLabel && (
                              <Label>
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Select value={breedChoice} onValueChange={setBreedChoice}>
                              <SelectTrigger  data-testid="select-breed">
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
                                className="mt-2"
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
                            {showLabel && (
                              <Label>
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Select value={sex} onValueChange={setSex}>
                              <SelectTrigger  data-testid="select-sex">
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
                            {showLabel && (
                              <Label htmlFor="ownerAddress">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Textarea
                              id="ownerAddress"

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
                            {showLabel && (
                              <Label htmlFor="cultureResult">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Input
                              id="cultureResult"

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
                              {showLabel ? (
                                <Label htmlFor="historyNotes">
                                  {q.label} {required && <span className="text-destructive">*</span>}
                                </Label>
                              ) : <span />}
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
                              {showLabel ? (
                                <Label htmlFor="previousMedicationNotes">
                                  {q.label} {required && <span className="text-destructive">*</span>}
                                </Label>
                              ) : <span />}
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
                              {showLabel ? (
                                <Label htmlFor="clinicalSignsSymptomsNotes">
                                  {q.label} {required && <span className="text-destructive">*</span>}
                                </Label>
                              ) : <span />}
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

                                value={temperatureValue}
                                onChange={(e) => setTemperatureValue(e.target.value)}
                                data-testid="input-temperature"
                              />
                              <Select
                                value={temperatureUnit}
                                onValueChange={(v) => setTemperatureUnit(v as "C" | "F")}
                              >
                                <SelectTrigger className="w-[120px]">
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
                        const options = getTestsSuggestedMainOptions([
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
                            {showLabel && (
                              <Label>
                                {testsPromptLabel} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
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
                      case "xrayDetails":
                        if (!hasMainSuggestedTest(testsSuggested, "xray")) return null;
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            {showLabel && <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>}
                            <Textarea
                              className="min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none"
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
                            {showLabel && <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>}
                            <Textarea
                              className="min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none"
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
                            {showLabel && <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>}
                            <Textarea
                              className="min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none"
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
                            {showLabel && <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>}
                            <Textarea
                              className="min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none"
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
                            {showLabel && <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>}
                            <Textarea
                              className="min-h-[2.5rem] max-h-[6.5rem] overflow-y-auto resize-none"
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
                            {showLabel && (
                              <Label htmlFor="age">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <div className="flex gap-2">
                              <Input
                                id="age"
                                type="number"
                                min="0"
                                step="0.1"

                                value={ageValue}
                                onChange={(e) => setAgeValue(e.target.value)}
                                placeholder="e.g. 3"
                                data-testid="input-age"
                              />
                              <Select
                                value={ageUnit}
                                onValueChange={(v) => setAgeUnit(v as "years" | "months" | "weeks" | "days")}
                              >
                                <SelectTrigger className="w-[120px]">
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
                            {showLabel && (
                              <Label htmlFor="sampleType">
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Input
                              id="sampleType"

                              value={sampleType}
                              onChange={(e) => setSampleType(e.target.value)}
                              onBlur={(e) => setSampleType(toTitleCase(e.target.value))}
                              placeholder="e.g. Milk, Wound swab, Urine"
                              data-testid="input-sample-type"
                            />
                          </div>
                        );
                      default:
                        if (
                          mode === "hospital" &&
                          isTestsSuggestedSection &&
                          (isDetailSubQuestionKey(q.key) ||
                            isTestsSuggestedPanelSubQuestion(q) ||
                            resolvePanelDefForKey(q.key, testsPanelDefsByKey) !== null)
                        ) {
                          return null;
                        }
                        if (mode === "hospital" && isHospitalBuiltinQuestionKeyOrLabel(q.key, q.label, section.key)) {
                          const normalized = normalizeQuestionId(q.key || q.label || "");
                          if (normalized.includes("temperature")) {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                {showLabel && <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>}
                                <div className="flex gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"

                                    value={temperatureValue}
                                    onChange={(e) => setTemperatureValue(e.target.value)}
                                  />
                                  <Select value={temperatureUnit} onValueChange={(v) => setTemperatureUnit(v as "C" | "F")}>
                                    <SelectTrigger className="w-[120px]">
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
                                {showLabel && <Label>CRT {required && <span className="text-destructive">*</span>}</Label>}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"

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
                                {showLabel && <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"

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
                                {showLabel && <Label>Heart Rate {required && <span className="text-destructive">*</span>}</Label>}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="1"

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
                                {showLabel && <Label>Respiration {required && <span className="text-destructive">*</span>}</Label>}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="1"

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
                                {showLabel && <Label>Rumen Motility {required && <span className="text-destructive">*</span>}</Label>}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"

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
                                {showLabel && <Label>{q.label} {required && <span className="text-destructive">*</span>}</Label>}
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    step="0.1"

                                    value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                    onChange={(e) =>
                                      setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                    }
                                  />
                                  <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as "kg" | "g")}>
                                    <SelectTrigger className="w-[100px]">
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
                                  {showLabel ? (
                                    <Label>
                                      {q.label} {required && <span className="text-destructive">*</span>}
                                    </Label>
                                  ) : <span />}
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
                            const isDiagnosis = isDiagnosisKeyOrLabel(q.key, q.label);
                            return (
                              <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                                {showLabel && (
                                  <Label>
                                    {q.label} {required && <span className="text-destructive">*</span>}
                                  </Label>
                                )}
                                {isDiagnosis ? (
                                  <AutoGrowTextarea

                                    value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                    onChange={(e) =>
                                      setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                    }
                                  />
                                ) : (
                                  <Textarea

                                    value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                    onChange={(e) =>
                                      setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                    }
                                    rows={3}
                                  />
                                )}
                              </div>
                            );
                          }
                          if (q.inputType === "singleSelect" || q.inputType === "yesNo") {
                            return (
                              <div className="space-y-1.5" key={q.key}>
                                {showLabel && (
                                  <Label>
                                    {q.label} {required && <span className="text-destructive">*</span>}
                                  </Label>
                                )}
                                <Select
                                  value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                  onValueChange={(v) =>
                                    setCustomAnswers((prev) => ({ ...prev, [q.key]: v }))
                                  }
                                >
                                  <SelectTrigger >
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
                              {showLabel && (
                                <Label>
                                  {q.label} {required && <span className="text-destructive">*</span>}
                                </Label>
                              )}
                              <Input
                                type={q.inputType === "number" ? "number" : "text"}

                                value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                onChange={(e) =>
                                  setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                }
                              />
                            </div>
                          );
                        }
                        if (q.inputType === "textarea") {
                          const isDiagnosis = isDiagnosisKeyOrLabel(q.key, q.label);
                          return (
                            <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                              {showLabel && (
                                <Label>
                                  {q.label} {required && <span className="text-destructive">*</span>}
                                </Label>
                              )}
                              {isDiagnosis ? (
                                <AutoGrowTextarea

                                  value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                  onChange={(e) =>
                                    setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                  }
                                />
                              ) : (
                                <Textarea

                                  value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                  onChange={(e) =>
                                    setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                                  }
                                  rows={3}
                                />
                              )}
                            </div>
                          );
                        }
                        if (q.inputType === "singleSelect" || q.inputType === "yesNo") {
                          return (
                            <div className="space-y-1.5" key={q.key}>
                              {showLabel && (
                                <Label>
                                  {q.label} {required && <span className="text-destructive">*</span>}
                                </Label>
                              )}
                              <Select
                                value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                                onValueChange={(v) =>
                                  setCustomAnswers((prev) => ({ ...prev, [q.key]: v }))
                                }
                              >
                                <SelectTrigger >
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
                            {showLabel && (
                              <Label>
                                {q.label} {required && <span className="text-destructive">*</span>}
                              </Label>
                            )}
                            <Input
                              type={q.inputType === "number" ? "number" : "text"}

                              value={typeof customAnswers[q.key] === "string" ? (customAnswers[q.key] as string) : ""}
                              onChange={(e) =>
                                setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                              }
                            />
                          </div>
                        );
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
              className="w-full sm:w-auto"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="gap-2 w-full sm:w-auto"
            data-testid="button-submit"
          >
            <Save className="w-4 h-4" />
            {createMutation.isPending ? "Saving..." : "Save Case"}
          </Button>
        </div>
      </form>
    </StickyScrollPage>
  );
}
