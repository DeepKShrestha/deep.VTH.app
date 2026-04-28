import { useState, useEffect, useMemo } from "react";
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
      enabled: boolean;
      required: boolean;
      displayOrder: number;
      isBuiltin: boolean;
    }>;
  }>;
};

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

export default function RegisterCase() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: caseInfo } = useQuery<{ caseNumber: string; dailyNumber: number; monthlyNumber: number }>({
    queryKey: ["/api/next-case-info"],
  });

  const { data: breakpointsData } = useQuery<Breakpoint[]>({
    queryKey: ["/api/breakpoints"],
  });
  const { data: speciesOptionsData } = useQuery<string[]>({
    queryKey: ["/api/species-options"],
  });
  const { data: formDefinition } = useQuery<FormDefinition>({
    queryKey: ["/api/form-definition"],
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
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [sampleType, setSampleType] = useState("");
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const todayInfo = getTodayBsAd();
  const [dateBs, setDateBs] = useState(todayInfo.bs);
  const [dateAd, setDateAd] = useState(todayInfo.ad);
  const [sampleDateBs, setSampleDateBs] = useState(todayInfo.bs);
  const [sampleDateAd, setSampleDateAd] = useState(todayInfo.ad);
  const [cultureResult, setCultureResult] = useState("");
  const [remarks, setRemarks] = useState("");
  const [autoMode, setAutoMode] = useState(true);

    // NEW: toggle to use preset antibiotics
  const [usePresetAntibiotics, setUsePresetAntibiotics] = useState(false);

  const [astRows, setAstRows] = useState<AstRow[]>([
    { breakpointId: null, antibiotic: "", symbol: "", discContent: "", zoneSize: "", sensitivity: "", autoSensitivity: "", manualOverride: false },
  ]);

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
    const out: Array<FormDefinition["sections"][number]["questions"][number]> = [];
    for (const s of formDefinition?.sections ?? []) {
      for (const q of s.questions ?? []) out.push(q);
    }
    return out;
  }, [formDefinition]);
  const questionByKey = useMemo(() => {
    return new Map(allQuestions.map((q) => [q.key, q]));
  }, [allQuestions]);
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
      const res = await apiRequest("POST", "/api/cases", data);
      return res.json();
    },
    onSuccess: (data: { id: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/next-case-info"] });
      toast({ title: "Case registered successfully" });
      setLocation(`/cases/${data.id}`);
    },
    onError: () => {
      toast({ title: "Failed to register case", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missingRequired =
      (isQuestionRequired("ownerName", true) && !ownerName.trim()) ||
      (isQuestionRequired("ownerAddress", true) && !ownerAddress.trim()) ||
      (isQuestionRequired("ownerPhone", true) && !ownerPhone.trim()) ||
      (isQuestionRequired("species", true) && !effectiveSpecies) ||
      (isQuestionRequired("breed", true) && !breed.trim()) ||
      (isQuestionRequired("animalName") && !animalName.trim()) ||
      (isQuestionRequired("age") && !age.trim()) ||
      (isQuestionRequired("sex") && !sex.trim()) ||
      (isQuestionRequired("sampleType") && !sampleType.trim()) ||
      (isQuestionRequired("sampleDate") && !sampleDateBs.trim()) ||
      (isQuestionRequired("cultureResult") && !cultureResult.trim()) ||
      (isQuestionRequired("remarks") && !remarks.trim()) ||
      allQuestions.some(
        (q) =>
          !q.isBuiltin &&
          q.enabled &&
          q.required &&
          !(customAnswers[q.key] || "").trim(),
      );

    if (missingRequired) {
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

    createMutation.mutate({
      caseNumber: caseInfo?.caseNumber || "AST-000",
      billNumber: billNumber || null,
      dailyNumber: caseInfo?.dailyNumber || 1,
      monthlyNumber: caseInfo?.monthlyNumber || 1,
      date: dateBs,
      dateAd: dateAd || null,
      ownerName,
      ownerAddress: isQuestionEnabled("ownerAddress", true) ? ownerAddress : "",
      ownerPhone: isQuestionEnabled("ownerPhone", true) ? ownerPhone : "",
      species: isQuestionEnabled("species", true) ? effectiveSpecies : "",
      breed: isQuestionEnabled("breed", true) ? breed : "",
      animalName: isQuestionEnabled("animalName") ? animalName || null : null,
      age: isQuestionEnabled("age") ? age || null : null,
      sex: isQuestionEnabled("sex") ? sex || null : null,
      sampleType: isQuestionEnabled("sampleType") ? sampleType || null : null,
      sampleDate: isQuestionEnabled("sampleDate") ? sampleDateBs || null : null,
      sampleDateAd: sampleDateAd || null,
      cultureResult: isQuestionEnabled("cultureResult") ? cultureResult || null : null,
      astResults: JSON.stringify(filteredAst),
      remarks: isQuestionEnabled("remarks") ? remarks || null : null,
      customFields:
        Object.keys(customAnswers).length > 0 ? JSON.stringify(customAnswers) : null,
    });
  };

  const effectiveDefinition: FormDefinition = useMemo(() => {
    if ((formDefinition?.sections?.length ?? 0) > 0) return formDefinition!;
    return DEFAULT_FORM_DEFINITION;
  }, [formDefinition]);

  const enabledSections = useMemo(() => {
    return (effectiveDefinition.sections ?? []).map((s) => ({
      ...s,
      questions: (s.questions ?? []).filter((q) => q.enabled),
    }));
  }, [effectiveDefinition]);

  const renderCustomQuestion = (q: NonNullable<FormDefinition["sections"]>[number]["questions"][number]) => {
    const value = customAnswers[q.key] || "";
    const required = q.required;
    if (q.inputType === "textarea") {
      return (
        <div className="space-y-1.5" key={q.key}>
          <Label>
            {q.label} {required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            value={value}
            onChange={(e) =>
              setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
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
          value={value}
          onChange={(e) =>
            setCustomAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
          }
        />
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold" data-testid="text-page-title">
            Register New AST Case
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Case #{caseInfo?.caseNumber || "..."}</span>
            <span>Day #{caseInfo?.dailyNumber || "..."}</span>
            <span>Month #{caseInfo?.monthlyNumber || "..."}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="Enter hospital bill or registration number"
                data-testid="input-bill-number"
              />
              <p className="text-xs text-muted-foreground">Links this AST case to the hospital billing system</p>
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
          if (section.key === "ast") {
            return (
              <div key={section.key} className="space-y-6">
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Antibiotic Sensitivity Test Results</CardTitle>
                      <div className="flex items-center gap-4">
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
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Antibiotic #{index + 1}</span>
                          <div className="flex items-center gap-2">
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
                            <div className="text-xs text-muted-foreground text-right">
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
                          <div key={i} className="flex items-center gap-3 text-sm">
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

          const enabledQuestions = section.questions ?? [];
          if (enabledQuestions.length === 0) return null;

          return (
            <Card key={section.key}>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {enabledQuestions.map((q) => {
                    if (!q.isBuiltin) return renderCustomQuestion(q);

                    const required = q.required;
                    switch (q.key) {
                      case "ownerName":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="ownerName">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="ownerName"
                              value={ownerName}
                              onChange={(e) => setOwnerName(e.target.value)}
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
                              <SelectTrigger data-testid="select-species">
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
                              <SelectTrigger data-testid="select-breed">
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
                              <SelectTrigger data-testid="select-sex">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Male">Male</SelectItem>
                                <SelectItem value="Female">Female</SelectItem>
                                <SelectItem value="Castrated">Castrated</SelectItem>
                                <SelectItem value="Spayed">Spayed</SelectItem>
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
                              value={ownerAddress}
                              onChange={(e) => setOwnerAddress(e.target.value)}
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
                              value={cultureResult}
                              onChange={(e) => setCultureResult(e.target.value)}
                              placeholder="e.g. Staphylococcus aureus, E. coli"
                              data-testid="input-culture-result"
                            />
                          </div>
                        );
                      case "remarks":
                        return (
                          <div className="space-y-1.5 sm:col-span-2" key={q.key}>
                            <Label>
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Textarea
                              value={remarks}
                              onChange={(e) => setRemarks(e.target.value)}
                              placeholder="Any additional notes, observations, or recommendations..."
                              rows={3}
                              data-testid="input-remarks"
                            />
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
                              placeholder="Optional"
                              data-testid="input-animal-name"
                            />
                          </div>
                        );
                      case "age":
                        return (
                          <div className="space-y-1.5" key={q.key}>
                            <Label htmlFor="age">
                              {q.label} {required && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              id="age"
                              value={age}
                              onChange={(e) => setAge(e.target.value)}
                              placeholder="e.g. 3 years"
                              data-testid="input-age"
                            />
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
                              value={sampleType}
                              onChange={(e) => setSampleType(e.target.value)}
                              placeholder="e.g. Milk, Wound swab, Urine"
                              data-testid="input-sample-type"
                            />
                          </div>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Link href="/">
            <Button type="button" variant="outline" data-testid="button-cancel">Cancel</Button>
          </Link>
          <Button type="submit" disabled={createMutation.isPending} className="gap-2" data-testid="button-submit">
            <Save className="w-4 h-4" />
            {createMutation.isPending ? "Saving..." : "Save Case"}
          </Button>
        </div>
      </form>
    </div>
  );
}
