import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Settings2, Trash2 } from "lucide-react";
import { adToBs, formatAdDate, formatBsDate } from "@/lib/nepali-date";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import {
  getSimpleTestLabels,
  isBuiltinTestsSuggestedQuestionKey,
  isTestsSuggestedPanelSubQuestion,
  parseTestsSuggestedOptions,
  resolvePanelDefinitions,
} from "@shared/hospital-tests-suggested";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type AdminFormDefinition = {
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

type FormEditLog = {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  targetKey: string | null;
  createdAt: string;
};

function normalizeQuestionId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isHospitalBuiltinSection(section: { key: string; title: string }): boolean {
  const normalizedKey = normalizeQuestionId(section.key);
  const normalizedTitle = normalizeQuestionId(section.title);
  if (
    ["owner", "animal", "chiefcomplaint", "history", "clinicalsignssymptoms", "avian", "vitals", "testssuggested", "diagnosis", "attendingveterinarian", "treatment", "final"].includes(normalizedKey)
  ) {
    return true;
  }
  return (
    normalizedTitle === "ownerinformation" ||
    normalizedTitle === "animalinformation" ||
    normalizedTitle === "chiefcomplaint" ||
    normalizedTitle === "historyandpreviousmedication" ||
    normalizedTitle === "clinicalsignsandsymptoms" ||
    normalizedTitle === "avianinformation" ||
    normalizedTitle === "vitals" ||
    normalizedTitle === "testssuggested" ||
    normalizedTitle === "testsuggested" ||
    normalizedTitle === "diagnosis" ||
    normalizedTitle === "attendingveterinarian" ||
    normalizedTitle === "treatmentprescription" ||
    normalizedTitle === "generalremarks"
  );
}

const PROTECTED_PANEL_KEYS = new Set(["enzymePanelTests", "rapidDiagnosticTests"]);

function formatTestsSuggestedOptionLabel(opt: unknown): string {
  if (typeof opt === "string") return opt;
  if (opt && typeof opt === "object" && "label" in opt) {
    return String((opt as { label: string }).label);
  }
  return String(opt ?? "");
}

const STANDARD_QUESTION_INPUT_TYPES = [
  "text",
  "textarea",
  "number",
  "singleSelect",
  "multiSelect",
  "yesNo",
  "date",
] as const;

const QUESTION_TYPE_LABELS: Record<(typeof STANDARD_QUESTION_INPUT_TYPES)[number], string> = {
  text: "Text",
  textarea: "Long text",
  number: "Number",
  singleSelect: "Dropdown (single)",
  multiSelect: "Multiple choice",
  yesNo: "Yes / No",
  date: "Date",
};

function questionTypesForSection(_section: { key: string; title: string }): string[] {
  return [...STANDARD_QUESTION_INPUT_TYPES];
}

function isTestsSuggestedBuiltinSection(section: { key: string; title: string }): boolean {
  const normalizedTitle = normalizeQuestionId(section.title);
  return (
    normalizedTitle.includes("testsuggested") ||
    normalizedTitle.includes("testssuggested")
  );
}

function isLegacyTestsSuggestedDuplicateQuestion(question: {
  key: string;
  label: string;
  inputType: string;
  sectionKey?: string;
}): boolean {
  const normalizedLabel = normalizeQuestionId(question.label || "");
  const normalizedKey = normalizeQuestionId(question.key || "");
  if (normalizedKey === "testssuggested" && question.inputType !== "multiSelect") {
    return true;
  }
  if (question.inputType !== "text" && question.inputType !== "textarea") {
    return false;
  }
  return (
    normalizedLabel === "testssuggested" ||
    normalizedLabel.includes("testsuggested") ||
    normalizedKey.includes("testssuggested")
  );
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

function isHospitalBuiltinQuestion(
  question: { key: string; label: string; isBuiltin: boolean; inputType?: string },
  section?: { key: string; title: string },
  sectionKey?: string,
): boolean {
  if (isBuiltinTestsSuggestedQuestionKey(question.key)) return true;
  if (question.inputType === "hospital_veterinarian") return true;
  if ((sectionKey || "").toLowerCase() === "vitals") return true;
  if (
    question.isBuiltin &&
    !(section && isTestsSuggestedBuiltinSection(section))
  ) {
    return true;
  }
  const normalizedKey = normalizeQuestionId(question.key);
  const normalizedLabel = normalizeQuestionId(question.label);
  return (
    normalizedKey.includes("heartrate") ||
    normalizedKey.includes("respiratoryrate") ||
    normalizedKey.includes("respirationrate") ||
    normalizedKey.includes("resprate") ||
    normalizedKey.includes("rumenmotility") ||
    normalizedKey.includes("clinicalsign") ||
    normalizedKey.includes("symptom") ||
    normalizedKey.includes("chiefcomplaint") ||
    normalizedKey.includes("colour") ||
    normalizedKey.includes("color") ||
    normalizedKey.includes("weight") ||
    normalizedKey.includes("temperature") ||
    normalizedKey === "crt" ||
    normalizedKey.includes("capillaryrefilltime") ||
    normalizedKey.includes("dehydration") ||
    normalizedKey.includes("treatmentprescription") ||
    normalizedKey.includes("attendingveterinarian") ||
    normalizedLabel.includes("heartrate") ||
    normalizedLabel.includes("respiratoryrate") ||
    normalizedLabel.includes("respirationrate") ||
    normalizedLabel.includes("resprate") ||
    normalizedLabel.includes("rumenmotility") ||
    normalizedLabel.includes("clinicalsign") ||
    normalizedLabel.includes("symptom") ||
    normalizedLabel.includes("chiefcomplaint") ||
    normalizedLabel.includes("colour") ||
    normalizedLabel.includes("color") ||
    normalizedLabel.includes("weight") ||
    normalizedLabel.includes("temperature") ||
    normalizedLabel === "crt" ||
    normalizedLabel.includes("capillaryrefilltime") ||
    normalizedLabel.includes("dehydration")
    || normalizedLabel.includes("testssuggested")
    || normalizedLabel.includes("testsuggested")
    || normalizedLabel.includes("enzymepanel")
    || normalizedLabel.includes("rapiddiagnostic")
    || normalizedLabel.includes("treatmentprescription")
    || normalizedLabel.includes("attendingveterinarian")
  );
}

export default function HospitalFormEditorPage() {
  const { toast } = useToast();
  const formScope = "hospital";
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newQuestionLabelBySection, setNewQuestionLabelBySection] = useState<Record<string, string>>({});
  const [newQuestionTypeBySection, setNewQuestionTypeBySection] = useState<Record<string, string>>({});
  const [newQuestionOptionsBySection, setNewQuestionOptionsBySection] = useState<Record<string, string>>({});
  const [newSpeciesName, setNewSpeciesName] = useState("");
  const [selectedBreedSpecies, setSelectedBreedSpecies] = useState("");
  const [newBreedName, setNewBreedName] = useState("");
  const [newOptionByQuestion, setNewOptionByQuestion] = useState<Record<number, string>>({});
  const [expandedOptionEditors, setExpandedOptionEditors] = useState<Record<number, boolean>>({});
  const [activeMode, setActiveMode] = useState<"layout" | "fields" | "catalog">("layout");
  const [showLogTable, setShowLogTable] = useState(false);
  const [openLayoutSectionKey, setOpenLayoutSectionKey] = useState<string | null>(null);
  const [openFieldSectionKey, setOpenFieldSectionKey] = useState<string | null>(null);
  const [openCatalogPanel, setOpenCatalogPanel] = useState<"species" | "breeds" | null>(null);
  const [panelDialogOpen, setPanelDialogOpen] = useState(false);
  const [panelDialogSectionKey, setPanelDialogSectionKey] = useState("tests_suggested");
  const [panelMainLabel, setPanelMainLabel] = useState("");
  const [panelSubOptionsText, setPanelSubOptionsText] = useState("");
  const editorRootRef = useRef<HTMLDivElement | null>(null);

  const { data: formDefinition } = useQuery<AdminFormDefinition>({
    queryKey: ["/api/admin/form-definition", formScope],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/form-definition?scope=${formScope}`);
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: speciesOptions = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/admin/species-options"],
  });
  const { data: breedOptions = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/admin/breed-options", selectedBreedSpecies],
    queryFn: async () => {
      if (!selectedBreedSpecies.trim()) return [];
      const res = await apiRequest(
        "GET",
        `/api/admin/breed-options?species=${encodeURIComponent(selectedBreedSpecies)}`,
      );
      return res.json();
    },
    enabled: Boolean(selectedBreedSpecies.trim()),
  });
  const { data: formEditLogs = [] } = useQuery<FormEditLog[]>({
    queryKey: ["/api/admin/form-edit-logs"],
  });
  /** Server-backed sections only — used for reorder so each click matches API adjacency. */
  const hospitalLayoutSections = useMemo(() => {
    const sections = (formDefinition?.sections ?? [])
      .filter((section) => section.key !== "ast" && section.key !== "sample")
      .map((section) => ({
        ...section,
        questions: (section.questions ?? []).filter(
          (q) => !isLegacyTestsSuggestedDuplicateQuestion({ ...q, sectionKey: section.key }),
        ),
      }));
    return [...sections].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.key.localeCompare(b.key),
    );
  }, [formDefinition]);

  /** Includes client fallback clinical section when missing in DB (register form only); not used for ↑/↓. */
  const hospitalSections = useMemo(() => {
    let sections = [...hospitalLayoutSections];

    const hasClinicalSignsSection = sections.some((section) => {
      const normalized = normalizeQuestionId(section.key || section.title || "");
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

      const historySectionIndex = sections.findIndex((section) => {
        const normalized = normalizeQuestionId(section.key || section.title || "");
        return normalized === "history" || normalized.includes("historyandpreviousmedication");
      });

      if (historySectionIndex >= 0) {
        sections = [
          ...sections.slice(0, historySectionIndex + 1),
          clinicalSection,
          ...sections.slice(historySectionIndex + 1),
        ];
      } else {
        sections = [...sections, clinicalSection];
      }
    }

    return [...sections].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.key.localeCompare(b.key),
    );
  }, [hospitalLayoutSections]);

  const syncFormDefinitionViews = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/form-definition", formScope] });
    await queryClient.refetchQueries({ queryKey: ["/api/admin/form-definition", formScope] });
    await queryClient.invalidateQueries({ queryKey: ["/api/form-definition", formScope] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/form-edit-logs"] });
  };

  const addSectionMutation = useMutation({
    mutationFn: async (title: string) => apiRequest("POST", "/api/admin/form-sections", { title, scope: formScope }),
    onSuccess: async () => {
      await syncFormDefinitionViews();
      setNewSectionTitle("");
    },
  });

  const moveSectionMutation = useMutation({
    mutationFn: async (payload: { key: string; direction: "up" | "down" }) =>
      apiRequest("PATCH", `/api/admin/form-sections/${payload.key}/move`, { ...payload, scope: formScope }),
    onSuccess: async () => {
      await syncFormDefinitionViews();
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (sectionKey: string) => apiRequest("DELETE", `/api/admin/form-sections/${sectionKey}?scope=${formScope}`),
    onSuccess: async () => {
      await syncFormDefinitionViews();
    },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async (payload: { sectionKey: string; label: string; inputType: string; options?: string[] }) =>
      apiRequest("POST", "/api/admin/form-questions", { ...payload, scope: formScope }),
    onSuccess: async () => {
      await syncFormDefinitionViews();
    },
  });

  const moveQuestionMutation = useMutation({
    mutationFn: async (payload: { id: number; direction: "up" | "down" }) =>
      apiRequest("PATCH", `/api/admin/form-questions/${payload.id}/move`, { ...payload, scope: formScope }),
    onSuccess: async () => {
      await syncFormDefinitionViews();
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async (payload: { id: number; enabled?: boolean; required?: boolean; hideLabel?: boolean; options?: string[] }) =>
      apiRequest("PATCH", `/api/admin/form-questions/${payload.id}`, { ...payload, scope: formScope }),
    onSuccess: async () => {
      await syncFormDefinitionViews();
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: number) =>
      apiRequest("DELETE", `/api/admin/form-questions/${questionId}?scope=${formScope}`),
    onSuccess: async () => {
      await syncFormDefinitionViews();
      toast({ title: "Question deleted" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not delete question",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const addTestsPanelMutation = useMutation({
    mutationFn: async (payload: { sectionKey: string; mainLabel: string; subOptions: string[] }) =>
      apiRequest("POST", "/api/admin/tests-suggested-panels", { ...payload, scope: formScope }),
    onSuccess: async () => {
      await syncFormDefinitionViews();
      setPanelDialogOpen(false);
      setPanelMainLabel("");
      setPanelSubOptionsText("");
      toast({ title: "Test with suboptions added" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not add test with suboptions",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteTestsPanelMutation = useMutation({
    mutationFn: async (payload: { panelKey: string; sectionKey: string }) =>
      apiRequest(
        "DELETE",
        `/api/admin/tests-suggested-panels/${encodeURIComponent(payload.panelKey)}?scope=${formScope}&sectionKey=${encodeURIComponent(payload.sectionKey)}`,
      ),
    onSuccess: async () => {
      await syncFormDefinitionViews();
      toast({ title: "Test with suboptions removed" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not remove test with suboptions",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteFormQuestion = (
    q: { id: number; key: string; inputType: string },
    section: { key: string; title: string },
  ) => {
    if (
      isTestsSuggestedBuiltinSection(section) &&
      isTestsSuggestedPanelSubQuestion(q) &&
      !PROTECTED_PANEL_KEYS.has(q.key) &&
      !isBuiltinTestsSuggestedQuestionKey(q.key)
    ) {
      deleteTestsPanelMutation.mutate({ panelKey: q.key, sectionKey: section.key });
      return;
    }
    deleteQuestionMutation.mutate(q.id);
  };

  const addSpeciesMutation = useMutation({
    mutationFn: async (name: string) => apiRequest("POST", "/api/admin/species-options", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/species-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/species-options"] });
      setNewSpeciesName("");
    },
  });

  const deleteSpeciesMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/species-options/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/species-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/species-options"] });
    },
  });

  const addBreedMutation = useMutation({
    mutationFn: async (payload: { species: string; name: string }) =>
      apiRequest("POST", "/api/admin/breed-options", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breed-options", selectedBreedSpecies] });
      queryClient.invalidateQueries({ queryKey: ["/api/breed-options"] });
      setNewBreedName("");
    },
  });

  const deleteBreedMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/breed-options/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/breed-options", selectedBreedSpecies] });
      queryClient.invalidateQueries({ queryKey: ["/api/breed-options"] });
    },
  });

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const insideCollapsible = target.closest("[data-editor-collapsible='true']");
      const insideRoot = editorRootRef.current?.contains(target);
      if (insideRoot && !insideCollapsible) {
        setOpenLayoutSectionKey(null);
        setOpenFieldSectionKey(null);
        setOpenCatalogPanel(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <StickyScrollPage
      ref={editorRootRef}
      maxWidthClass="max-w-6xl"
      bodyClassName="space-y-6"
      sticky={
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/new-case/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              Hospital Case Form Editor
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure hospital case form sections and options.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowLogTable((v) => !v)}
        >
          {showLogTable ? "Hide Edit Log" : "Edit Log"}
        </Button>
      </div>
      }
    >
      {showLogTable && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Edit Log</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto relative">
            {formEditLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No edits logged yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-card border-b shadow-sm">
                  <tr className="border-b text-left bg-muted/40">
                    <th className="py-2 pr-3 font-medium">Date (AD / BS) & Time</th>
                    <th className="py-2 pr-3 font-medium">Changed By</th>
                    <th className="py-2 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {formEditLogs.slice(0, 40).map((log) => {
                    const dt = new Date(log.createdAt);
                    const adIso = dt.toISOString().slice(0, 10);
                    const bs = adToBs(adIso);
                    return (
                      <tr key={log.id} className="border-b last:border-b-0 align-top">
                        <td className="py-2 pr-3">
                          <div>{formatAdDate(adIso)} / {formatBsDate(bs || adIso)}</div>
                          <div className="text-muted-foreground">{dt.toLocaleTimeString()}</div>
                        </td>
                        <td className="py-2 pr-3">
                          {log.actorName} ({log.actorRole})
                        </td>
                        <td className="py-2">
                          <div>{log.action}</div>
                          <div className="text-muted-foreground">Target: {log.targetKey || "n/a"}</div>
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

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={activeMode === "layout" ? "default" : "outline"}
              onClick={() => setActiveMode("layout")}
            >
              Form Layout (Sections & Questions)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeMode === "fields" ? "default" : "outline"}
              onClick={() => setActiveMode("fields")}
            >
              Edit Register Form Fields
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeMode === "catalog" ? "default" : "outline"}
              onClick={() => setActiveMode("catalog")}
            >
              Species and Breed by Species
            </Button>
          </div>
        </CardContent>
      </Card>

      {activeMode === "layout" && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Form Layout (Sections & Questions)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Tip: if a section has no questions, the section itself appears as a direct long-text input in the register form.
            {hospitalSections.length > hospitalLayoutSections.length ? (
              <>
                {" "}
                A built-in “Clinical signs and symptoms” block may still show on the register form; add a real section here if you want it in this list.
              </>
            ) : null}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="Add section title" />
            <Button size="sm" className="gap-1.5" onClick={() => addSectionMutation.mutate(newSectionTitle.trim())} disabled={!newSectionTitle.trim()}>
              <Plus className="w-3.5 h-3.5" />
              Add section
            </Button>
          </div>

          {hospitalLayoutSections.map((section, idx, arr) => (
            <div key={section.key} className="rounded border" data-editor-collapsible="true">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3 py-2 border-b hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="text-sm font-medium truncate text-left hover:underline w-full"
                    onClick={() =>
                      setOpenLayoutSectionKey((prev) => (prev === section.key ? null : section.key))
                    }
                  >
                    {section.title}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => moveSectionMutation.mutate({ key: section.key, direction: "up" })}
                    disabled={idx === 0 || moveSectionMutation.isPending}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => moveSectionMutation.mutate({ key: section.key, direction: "down" })}
                    disabled={idx === arr.length - 1 || moveSectionMutation.isPending}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  {!isHospitalBuiltinSection(section) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => deleteSectionMutation.mutate(section.key)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              {openLayoutSectionKey === section.key && (
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <Input
                      value={newQuestionLabelBySection[section.key] || ""}
                      onChange={(e) => setNewQuestionLabelBySection((prev) => ({ ...prev, [section.key]: e.target.value }))}
                      placeholder="Add question label"
                    />
                  </div>
                  <Select
                    value={newQuestionTypeBySection[section.key] || "text"}
                    onValueChange={(v) => setNewQuestionTypeBySection((prev) => ({ ...prev, [section.key]: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      {questionTypesForSection(section).map((type) => (
                        <SelectItem key={type} value={type}>
                          {QUESTION_TYPE_LABELS[type as keyof typeof QUESTION_TYPE_LABELS] ?? type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(newQuestionTypeBySection[section.key] === "singleSelect" || newQuestionTypeBySection[section.key] === "multiSelect") && (
                  <Input
                    value={newQuestionOptionsBySection[section.key] || ""}
                    onChange={(e) => setNewQuestionOptionsBySection((prev) => ({ ...prev, [section.key]: e.target.value }))}
                    placeholder="Options (comma separated)"
                  />
                )}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      addQuestionMutation.mutate({
                        sectionKey: section.key,
                        label: (newQuestionLabelBySection[section.key] || "").trim(),
                        inputType: newQuestionTypeBySection[section.key] || "text",
                        options:
                          (newQuestionTypeBySection[section.key] === "singleSelect" ||
                            newQuestionTypeBySection[section.key] === "multiSelect")
                            ? (newQuestionOptionsBySection[section.key] || "").split(",").map((v) => v.trim()).filter(Boolean)
                            : [],
                      })
                    }
                    disabled={!(newQuestionLabelBySection[section.key] || "").trim()}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add question
                  </Button>
                </div>

                <div className="space-y-2">
                  {(section.questions ?? []).map((q, qIdx) => (
                    <div key={q.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded border px-3 py-2">
                      <div className="min-w-0 w-full space-y-2">
                        <div className="text-sm truncate">{q.label} <span className="text-xs text-muted-foreground">({isHospitalBuiltinQuestion(q, section, section.key) ? "built-in" : "custom"})</span></div>
                        <div className="text-xs text-muted-foreground truncate">key: {q.key} · type: {q.inputType}</div>
                        {(q.inputType === "singleSelect" || q.inputType === "multiSelect") && (
                          <div className="space-y-2 pt-1">
                            <div className="flex flex-wrap gap-2">
                              {(q.options ?? []).map((opt, optIdx) => {
                                const label = formatTestsSuggestedOptionLabel(opt);
                                const parsedOpt = parseTestsSuggestedOptions([opt])[0];
                                const isPanelOpt =
                                  typeof parsedOpt !== "string" && parsedOpt?.type === "panel";
                                if (isPanelOpt) {
                                  return (
                                    <span
                                      key={`${q.id}-layout-panel-${optIdx}`}
                                      className="inline-flex h-7 items-center rounded border px-2 text-xs text-muted-foreground"
                                    >
                                      {label} (with suboptions)
                                    </span>
                                  );
                                }
                                return (
                                  <Button
                                    key={`${q.id}-layout-${optIdx}`}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7"
                                    onClick={() =>
                                      updateQuestionMutation.mutate({
                                        id: q.id,
                                        enabled: q.enabled,
                                        required: q.required,
                                        options: (q.options ?? []).filter((v) => v !== opt),
                                      })
                                    }
                                  >
                                    {label} ×
                                  </Button>
                                );
                              })}
                            </div>
                            <div className="flex gap-2">
                              <Input
                                value={newOptionByQuestion[q.id] || ""}
                                onChange={(e) =>
                                  setNewOptionByQuestion((prev) => ({
                                    ...prev,
                                    [q.id]: e.target.value,
                                  }))
                                }
                                placeholder="Add option"
                                className="h-8 text-xs"
                              />
                              <Button
                                type="button"
                                size="sm"
                                className="h-8"
                                disabled={!(newOptionByQuestion[q.id] || "").trim()}
                                onClick={() => {
                                  const nextOption = (newOptionByQuestion[q.id] || "").trim();
                                  if (!nextOption) return;
                                  updateQuestionMutation.mutate({
                                    id: q.id,
                                    enabled: q.enabled,
                                    required: q.required,
                                    options: Array.from(new Set([...(q.options ?? []), nextOption])),
                                  });
                                  setNewOptionByQuestion((prev) => ({ ...prev, [q.id]: "" }));
                                }}
                              >
                                Add option
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => moveQuestionMutation.mutate({ id: q.id, direction: "up" })}
                          disabled={
                            qIdx === 0 ||
                            moveQuestionMutation.isPending ||
                            q.id < 0
                          }
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => moveQuestionMutation.mutate({ id: q.id, direction: "down" })}
                          disabled={
                            qIdx === section.questions.length - 1 ||
                            moveQuestionMutation.isPending ||
                            q.id < 0
                          }
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        {!isHospitalBuiltinQuestion(q, section, section.key) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                            disabled={
                              deleteQuestionMutation.isPending || deleteTestsPanelMutation.isPending
                            }
                            onClick={() => deleteFormQuestion(q, section)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {isTestsSuggestedBuiltinSection(section) && (() => {
                  const testsMain = (section.questions ?? []).find(
                    (q) => normalizeQuestionId(q.key) === "testssuggested",
                  );
                  const panelDefs = resolvePanelDefinitions(
                    testsMain?.options ?? [],
                    (section.questions ?? [])
                      .filter((q) => q.inputType === "multiSelect")
                      .map((q) => ({
                        key: q.key,
                        label: q.label,
                        inputType: q.inputType,
                        enabled: q.enabled,
                      })),
                  );
                  return (
                    <div className="rounded border border-dashed p-3 space-y-2 bg-muted/20">
                      <p className="text-xs font-medium">Tests with suboptions</p>
                      <p className="text-xs text-muted-foreground">
                        Adds a main test to the list above; when selected on the register form, a
                        sub-multi-select appears (like Enzyme Panel → LFT, KFT).
                      </p>
                      {panelDefs.length > 0 ? (
                        <div className="space-y-1">
                          {panelDefs.map((def) => {
                            const subQ = (section.questions ?? []).find((q) => q.key === def.panelKey);
                            return (
                              <div
                                key={def.panelKey}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs"
                              >
                                <span>
                                  <span className="font-medium">{def.mainLabel}</span>
                                  <span className="text-muted-foreground">
                                    {" "}
                                    · {(subQ?.options ?? []).length} sub-options
                                  </span>
                                </span>
                                {!PROTECTED_PANEL_KEYS.has(def.panelKey) && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 border-red-200 text-red-600 hover:bg-red-50"
                                    disabled={deleteTestsPanelMutation.isPending}
                                    onClick={() =>
                                      deleteTestsPanelMutation.mutate({
                                        panelKey: def.panelKey,
                                        sectionKey: section.key,
                                      })
                                    }
                                  >
                                    Remove
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No custom panels yet.</p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        onClick={() => {
                          setPanelDialogSectionKey(section.key);
                          setPanelDialogOpen(true);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add test with suboptions
                      </Button>
                    </div>
                  );
                })()}
              </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      )}

      {activeMode === "fields" && (
      <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Edit Register Form Fields</CardTitle>
          <p className="text-xs text-muted-foreground">
            Built-in fields: control visibility and required status in a separate section.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {hospitalSections.map((section) => {
            const builtinQuestions = (section.questions ?? []).filter((q) =>
              isHospitalBuiltinQuestion(q, section, section.key),
            );
            if (builtinQuestions.length === 0 && !isTestsSuggestedBuiltinSection(section)) return null;
            const isTestsSuggestedSection = isTestsSuggestedBuiltinSection(section);
            const testsSuggestedPrimaryKeys = new Set([
              "testssuggested",
              "enzymepaneltests",
              "rapiddiagnostictests",
            ]);
            const testsSuggestedDetailKeys = new Set([
              "xraydetails",
              "ultrasounddetails",
              "culturedetails",
              "biopsydetails",
              "cytologydetails",
            ]);
            const groupedBuiltinQuestions = isTestsSuggestedSection
              ? [
                  {
                    title: "Primary tests",
                    questions: builtinQuestions.filter((q) =>
                      testsSuggestedPrimaryKeys.has(normalizeQuestionId(q.key)),
                    ),
                  },
                  {
                    title: "Conditional detail triggers",
                    questions: builtinQuestions.filter((q) =>
                      testsSuggestedDetailKeys.has(normalizeQuestionId(q.key)),
                    ),
                  },
                  {
                    title: "Other",
                    questions: builtinQuestions.filter((q) => {
                      const k = normalizeQuestionId(q.key);
                      return !testsSuggestedPrimaryKeys.has(k) && !testsSuggestedDetailKeys.has(k);
                    }),
                  },
                ].filter((g) => g.questions.length > 0)
              : [{ title: "", questions: builtinQuestions }];
            return (
              <div key={`builtin-${section.key}`} className="space-y-2" data-editor-collapsible="true">
                <button
                  type="button"
                  className="w-full rounded border px-3 py-2 text-left hover:bg-muted/30"
                  onClick={() =>
                    setOpenFieldSectionKey((prev) => (prev === section.key ? null : section.key))
                  }
                >
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </h4>
                </button>
                {openFieldSectionKey === section.key && (
                <>
                {builtinQuestions.length === 0 && isTestsSuggestedBuiltinSection(section) && null}
                {groupedBuiltinQuestions.map((group) => (
                  <div key={`${section.key}-${group.title || "default"}`} className="space-y-2">
                    {group.title ? (
                      <p className="text-xs font-medium text-muted-foreground">{group.title}</p>
                    ) : null}
                {group.questions.map((q) => {
                  const isTestsSuggestedQuestion =
                    normalizeQuestionId(q.key) === "testssuggested";
                  return (
                  <div
                    key={q.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded border px-3 py-2"
                  >
                    <div className="w-full space-y-2">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                          <span className="text-sm">
                            {isTestsSuggestedQuestion
                              ? "Please select the required tests"
                              : q.label}
                          </span>
                          {isTestsSuggestedQuestion && (
                            <p className="text-xs text-muted-foreground">
                              Manage selectable test options here (add/remove). This controls the multiselect shown in register form.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
                          <Button
                            type="button"
                            size="sm"
                            variant={q.enabled ? "default" : "outline"}
                            className="h-7 w-24 justify-center text-[11px]"
                            onClick={() =>
                              updateQuestionMutation.mutate({
                                id: q.id,
                                enabled: !q.enabled,
                                required: q.required,
                              })
                            }
                          >
                            {q.enabled ? "Shown" : "Hidden"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={q.required ? "default" : "outline"}
                            className="h-7 w-24 justify-center text-[11px]"
                            onClick={() =>
                              updateQuestionMutation.mutate({
                                id: q.id,
                                required: !q.required,
                                enabled: q.enabled,
                              })
                            }
                          >
                            {q.required ? "Compulsory" : "Optional"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={q.hideLabel ? "default" : "outline"}
                            className="h-7 w-24 justify-center text-[11px]"
                            onClick={() =>
                              updateQuestionMutation.mutate({
                                id: q.id,
                                hideLabel: !q.hideLabel,
                                enabled: q.enabled,
                                required: q.required,
                              })
                            }
                          >
                            {q.hideLabel ? "Box only" : "Show label"}
                          </Button>
                        </div>
                      </div>
                      {(q.inputType === "singleSelect" || q.inputType === "multiSelect") && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">
                              Options: {(q.options ?? []).length}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() =>
                                setExpandedOptionEditors((prev) => ({
                                  ...prev,
                                  [q.id]: !prev[q.id],
                                }))
                              }
                            >
                              {expandedOptionEditors[q.id] ? "Hide options" : "Manage options"}
                            </Button>
                          </div>
                          {expandedOptionEditors[q.id] && (
                            <>
                              <div className="flex flex-wrap gap-2">
                                {(q.options ?? []).map((opt) => (
                                  <Button
                                    key={`${q.id}-${opt}`}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7"
                                    onClick={() =>
                                      updateQuestionMutation.mutate({
                                        id: q.id,
                                        enabled: q.enabled,
                                        required: q.required,
                                        options: (q.options ?? []).filter((v) => v !== opt),
                                      })
                                    }
                                  >
                                    {opt} ×
                                  </Button>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <Input
                                  value={newOptionByQuestion[q.id] || ""}
                                  onChange={(e) =>
                                    setNewOptionByQuestion((prev) => ({
                                      ...prev,
                                      [q.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Add option"
                                  className="h-8 text-xs"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8"
                                  disabled={!(newOptionByQuestion[q.id] || "").trim()}
                                  onClick={() => {
                                    const nextOption = (newOptionByQuestion[q.id] || "").trim();
                                    if (!nextOption) return;
                                    updateQuestionMutation.mutate({
                                      id: q.id,
                                      enabled: q.enabled,
                                      required: q.required,
                                      options: Array.from(new Set([...(q.options ?? []), nextOption])),
                                    });
                                    setNewOptionByQuestion((prev) => ({ ...prev, [q.id]: "" }));
                                  }}
                                >
                                  Add option
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
                })}
                  </div>
                ))}
                </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Edit Custom Register Form Fields</CardTitle>
          <p className="text-xs text-muted-foreground">
            Custom fields: control visibility and required status for custom questions.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {hospitalSections.map((section) => {
            const customQuestions = (section.questions ?? []).filter(
              (q) => !isHospitalBuiltinQuestion(q, section, section.key),
            );
            if (customQuestions.length === 0) return null;
            return (
              <div key={`custom-${section.key}`} className="space-y-2" data-editor-collapsible="true">
                <button
                  type="button"
                  className="w-full rounded border px-3 py-2 text-left hover:bg-muted/30"
                  onClick={() =>
                    setOpenFieldSectionKey((prev) =>
                      prev === `custom-${section.key}` ? null : `custom-${section.key}`,
                    )
                  }
                >
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </h4>
                </button>
                {openFieldSectionKey === `custom-${section.key}` &&
                  customQuestions.map((q) => (
                    <div
                      key={`custom-toggle-${q.id}`}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm truncate">{q.label}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          key: {q.key} · type: {q.inputType}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
                        <Button
                          type="button"
                          size="sm"
                          variant={q.enabled ? "default" : "outline"}
                          className="h-7 w-24 justify-center text-[11px]"
                          onClick={() =>
                            updateQuestionMutation.mutate({
                              id: q.id,
                              enabled: !q.enabled,
                              required: q.required,
                            })
                          }
                        >
                          {q.enabled ? "Shown" : "Hidden"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={q.required ? "default" : "outline"}
                          className="h-7 w-24 justify-center text-[11px]"
                          onClick={() =>
                            updateQuestionMutation.mutate({
                              id: q.id,
                              required: !q.required,
                              enabled: q.enabled,
                            })
                          }
                        >
                          {q.required ? "Compulsory" : "Optional"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={q.hideLabel ? "default" : "outline"}
                          className="h-7 w-24 justify-center text-[11px]"
                          onClick={() =>
                            updateQuestionMutation.mutate({
                              id: q.id,
                              hideLabel: !q.hideLabel,
                              enabled: q.enabled,
                              required: q.required,
                            })
                          }
                        >
                          {q.hideLabel ? "Box only" : "Show label"}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
          {hospitalSections.every(
            (section) =>
              (section.questions ?? []).filter(
                (q) => !isHospitalBuiltinQuestion(q, section, section.key),
              ).length === 0,
          ) && (
            <p className="text-xs text-muted-foreground">
              No custom questions added yet.
            </p>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {activeMode === "catalog" && (
      <>
      <Card data-editor-collapsible="true">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <button
              type="button"
              className="w-full text-left"
              onClick={() =>
                setOpenCatalogPanel((prev) => (prev === "species" ? null : "species"))
              }
            >
              Species
            </button>
          </CardTitle>
        </CardHeader>
        {openCatalogPanel === "species" && (
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={newSpeciesName} onChange={(e) => setNewSpeciesName(e.target.value)} placeholder="Add species" />
            <Button size="sm" className="gap-1.5" onClick={() => addSpeciesMutation.mutate(newSpeciesName.trim())} disabled={!newSpeciesName.trim()}>
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {speciesOptions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded border px-3 py-2">
                <span className="text-sm">{s.name}</span>
                <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteSpeciesMutation.mutate(s.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
        )}
      </Card>

      <Card data-editor-collapsible="true">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <button
              type="button"
              className="w-full text-left"
              onClick={() =>
                setOpenCatalogPanel((prev) => (prev === "breeds" ? null : "breeds"))
              }
            >
              Breeds by Species
            </button>
          </CardTitle>
        </CardHeader>
        {openCatalogPanel === "breeds" && (
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Species</Label>
            <Select value={selectedBreedSpecies} onValueChange={setSelectedBreedSpecies}>
              <SelectTrigger><SelectValue placeholder="Select species" /></SelectTrigger>
              <SelectContent>
                {speciesOptions.map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={newBreedName} onChange={(e) => setNewBreedName(e.target.value)} placeholder="Add breed" disabled={!selectedBreedSpecies} />
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => addBreedMutation.mutate({ species: selectedBreedSpecies.trim(), name: newBreedName.trim() })}
              disabled={!selectedBreedSpecies.trim() || !newBreedName.trim()}
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {breedOptions.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded border px-3 py-2">
                <span className="text-sm">{b.name}</span>
                <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteBreedMutation.mutate(b.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
        )}
      </Card>

      </>
      )}

      <Dialog open={panelDialogOpen} onOpenChange={setPanelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add test with suboptions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="panel-main-label">Main test name</Label>
              <Input
                id="panel-main-label"
                value={panelMainLabel}
                onChange={(e) => setPanelMainLabel(e.target.value)}
                placeholder="e.g. Hormone Panel Test"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-sub-options">Sub-options (comma separated)</Label>
              <Input
                id="panel-sub-options"
                value={panelSubOptionsText}
                onChange={(e) => setPanelSubOptionsText(e.target.value)}
                placeholder="e.g. T4, TSH, Cortisol"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPanelDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={addTestsPanelMutation.isPending || !panelMainLabel.trim()}
                onClick={() => {
                  const subOptions = panelSubOptionsText
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean);
                  if (subOptions.length < 1) {
                    toast({
                      title: "Add at least one sub-option",
                      variant: "destructive",
                    });
                    return;
                  }
                  addTestsPanelMutation.mutate({
                    sectionKey: panelDialogSectionKey,
                    mainLabel: panelMainLabel.trim(),
                    subOptions,
                  });
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </StickyScrollPage>
  );
}
