export type TestsSuggestedOption =
  | string
  | { type: "simple"; label: string }
  | { type: "panel"; label: string; panelKey: string };

export type TestsSuggestedPanelDef = {
  mainLabel: string;
  mainKeyword: string;
  panelKey: string;
};

/** Only these Tests Suggested question keys are system built-ins (not user-created panels). */
export const BUILTIN_TESTS_SUGGESTED_QUESTION_KEYS = new Set([
  "testssuggested",
  "enzymepaneltests",
  "rapiddiagnostictests",
  "xraydetails",
  "ultrasounddetails",
  "biopsydetails",
  "cytologydetails",
  "culturedetails",
]);

export function isBuiltinTestsSuggestedQuestionKey(key: string): boolean {
  return BUILTIN_TESTS_SUGGESTED_QUESTION_KEYS.has(normalizeHospitalKey(key));
}

const LEGACY_PANEL_LINKS: Array<{ mainKeyword: string; panelKey: string }> = [
  { mainKeyword: "enzymepanel", panelKey: "enzymePanelTests" },
  { mainKeyword: "rapiddiagnostictest", panelKey: "rapidDiagnosticTests" },
];

const DETAIL_FIELD_KEY_FRAGMENTS = [
  "xraydetails",
  "ultrasounddetails",
  "culturedetails",
  "biopsydetails",
  "cytologydetails",
];

export function normalizeHospitalKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function panelSubQuestionKeyFromLabel(label: string): string {
  const parts = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "customPanelTests";
  const camel =
    parts[0] +
    parts
      .slice(1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("");
  if (camel.endsWith("Tests") || camel.endsWith("Test")) return camel;
  return `${camel}Tests`;
}

export function mainKeywordFromLabel(label: string): string {
  return normalizeHospitalKey(label);
}

export function parseTestsSuggestedOptions(raw: unknown): TestsSuggestedOption[] {
  if (!Array.isArray(raw)) return [];
  const out: TestsSuggestedOption[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const label = item.trim();
      if (label) out.push(label);
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const label = String(o.label ?? o.v ?? "").trim();
      if (!label) continue;
      if (o.type === "panel" || o.panelKey) {
        const panelKey = String(o.panelKey ?? "").trim() || panelSubQuestionKeyFromLabel(label);
        out.push({ type: "panel", label, panelKey });
      } else {
        out.push({ type: "simple", label });
      }
    }
  }
  return out;
}

export function serializeTestsSuggestedOptions(options: TestsSuggestedOption[]): unknown[] {
  return options.map((opt) => {
    if (typeof opt === "string") return opt;
    if (opt.type === "panel") {
      return { type: "panel", label: opt.label, panelKey: opt.panelKey };
    }
    return { type: "simple", label: opt.label };
  });
}

export function getSimpleTestLabels(options: TestsSuggestedOption[]): string[] {
  return options.map((opt) => (typeof opt === "string" ? opt : opt.label));
}

export function isDetailSubQuestionKey(key: string): boolean {
  const n = normalizeHospitalKey(key);
  return DETAIL_FIELD_KEY_FRAGMENTS.some((frag) => n.includes(frag));
}

/** Main testsSuggested keyword needed to show a conditional detail field (X-ray, biopsy, etc.). */
export function detailFieldParentKeyword(key: string): string | null {
  if (!isDetailSubQuestionKey(key)) return null;
  const n = normalizeHospitalKey(key);
  if (n.includes("xray")) return "xray";
  if (n.includes("ultrasound")) return "ultrasound";
  if (n.includes("biopsy")) return "biopsy";
  if (n.includes("cytology")) return "cytology";
  if (n.includes("culture")) return "culture";
  return null;
}

export function isTestsSuggestedSectionKey(sectionKey: string, sectionTitle: string): boolean {
  const nk = normalizeHospitalKey(sectionKey);
  const nt = normalizeHospitalKey(sectionTitle);
  return nk.includes("testsuggested") || nt.includes("testsuggested");
}

export function isLegacyTestsSuggestedDuplicateQuestion(question: {
  key: string;
  label: string;
  inputType: string;
}): boolean {
  const normalizedLabel = normalizeHospitalKey(question.label || "");
  const normalizedKey = normalizeHospitalKey(question.key || "");
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

export function isTestsSuggestedPanelSubQuestion(question: {
  key: string;
  inputType: string;
}): boolean {
  return (
    question.inputType === "multiSelect" &&
    normalizeHospitalKey(question.key) !== "testssuggested"
  );
}

export function legacyPanelDefForKey(panelKey: string): TestsSuggestedPanelDef | null {
  const nk = normalizeHospitalKey(panelKey);
  for (const link of LEGACY_PANEL_LINKS) {
    if (nk.includes(normalizeHospitalKey(link.panelKey))) {
      const mainLabel =
        link.mainKeyword === "enzymepanel" ? "Enzyme Panel Test" : "Rapid Diagnostic Test";
      return {
        mainLabel,
        mainKeyword: link.mainKeyword,
        panelKey,
      };
    }
  }
  return null;
}

export function resolvePanelDefForKey(
  panelKey: string,
  defsByKey: Map<string, TestsSuggestedPanelDef>,
): TestsSuggestedPanelDef | null {
  return defsByKey.get(panelKey) ?? legacyPanelDefForKey(panelKey);
}

/** Drop orphan free-text rows in Tests Suggested; keep main multi-select, panels, and detail fields. */
export function shouldIncludeTestsSuggestedFormQuestion(question: {
  key: string;
  label: string;
  inputType: string;
}): boolean {
  if (isLegacyTestsSuggestedDuplicateQuestion(question)) return false;
  if (
    (question.inputType === "text" || question.inputType === "textarea") &&
    !isDetailSubQuestionKey(question.key)
  ) {
    return false;
  }
  return true;
}

export function resolvePanelDefinitions(
  testsSuggestedOptions: unknown,
  subQuestions: Array<{ key: string; label: string; inputType: string; enabled?: boolean }>,
): TestsSuggestedPanelDef[] {
  const parsed = parseTestsSuggestedOptions(testsSuggestedOptions);
  const defs: TestsSuggestedPanelDef[] = [];
  const seenKeys = new Set<string>();

  const addDef = (mainLabel: string, panelKey: string) => {
    const pk = panelKey.trim();
    if (!pk || seenKeys.has(pk)) return;
    seenKeys.add(pk);
    defs.push({
      mainLabel,
      mainKeyword: mainKeywordFromLabel(mainLabel),
      panelKey: pk,
    });
  };

  for (const opt of parsed) {
    if (typeof opt === "string") {
      const legacy = LEGACY_PANEL_LINKS.find((l) => opt.toLowerCase().includes(l.mainKeyword));
      if (legacy) addDef(opt, legacy.panelKey);
      continue;
    }
    if (opt.type === "panel") {
      addDef(opt.label, opt.panelKey);
    }
  }

  for (const q of subQuestions) {
    if (q.inputType !== "multiSelect") continue;
    if (normalizeHospitalKey(q.key) === "testssuggested") continue;
    if (isDetailSubQuestionKey(q.key)) continue;
    if (q.enabled === false) continue;
    if (seenKeys.has(q.key)) continue;
    const legacy = LEGACY_PANEL_LINKS.find((l) =>
      normalizeHospitalKey(q.key).includes(normalizeHospitalKey(l.panelKey)),
    );
    if (legacy) {
      const mainLabel = parsed.find(
        (o) => typeof o === "string" && normalizeHospitalKey(o).includes(legacy.mainKeyword),
      );
      addDef(typeof mainLabel === "string" ? mainLabel : q.label, q.key);
      continue;
    }
    const keyStem = normalizeHospitalKey(q.key).replace(/tests$/, "");
    const mainLabel = getSimpleTestLabels(parsed).find((label) => {
      const ln = mainKeywordFromLabel(label);
      return (
        ln.includes(keyStem) ||
        keyStem.includes(ln) ||
        (keyStem.length >= 4 && ln.includes(keyStem.slice(0, Math.min(8, keyStem.length))))
      );
    });
    if (mainLabel) addDef(mainLabel, q.key);
  }

  return defs;
}

export function hasMainSuggestedTest(selected: string[], keyword: string): boolean {
  const normalizedKeyword = normalizeHospitalKey(keyword);
  return selected.some((item) => normalizeHospitalKey(item).includes(normalizedKeyword));
}

export function parseStringList(raw: string | string[] | number | undefined): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return s
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function shortenPanelTestName(name: string): string {
  const paren = name.match(/\(([A-Za-z0-9]+)\)/);
  if (paren) return paren[1]!.toUpperCase();
  const n = name.trim();
  if (/liver function/i.test(n)) return "LFT";
  if (/kidney function/i.test(n)) return "KFT";
  if (/thyroid/i.test(n)) return "Thyroid";
  return n;
}
