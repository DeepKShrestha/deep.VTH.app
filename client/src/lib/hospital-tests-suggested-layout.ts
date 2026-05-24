/**
 * Builds ordered rows for hospital "Tests suggested" display:
 * - Simple tests (no extra text): up to 3 per row, left-aligned columns
 * - Detail tests (enzyme panel, X-ray, biopsy, etc.): one row each with label + value
 *
 * Always use raw customFields keys (e.g. testsSuggested), not display labels — labels can be customized in the form editor.
 */

import {
  isDetailSubQuestionKey,
  normalizeHospitalKey,
  parseStringList,
  resolvePanelDefinitions,
  shortenPanelTestName,
} from "@shared/hospital-tests-suggested";

type HospitalTestsLayoutRow =
  | { kind: "simple-row"; cells: [string, string, string] }
  | { kind: "detail"; label: string; value: string };

type HospitalTestCustomEntry = [string, string | string[] | number];

function normalizeKey(input: string): string {
  return normalizeHospitalKey(input);
}

function getEntryValue(
  entries: HospitalTestCustomEntry[],
  pred: (normKey: string) => boolean,
): string | string[] | number | undefined {
  const hit = entries.find(([key]) => pred(normalizeKey(key)));
  return hit?.[1];
}

function classifyMainTest(option: string):
  | "enzyme"
  | "rapid"
  | "xray"
  | "biopsy"
  | "cytology"
  | "ultrasound"
  | "culture"
  | "simple" {
  const n = option.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (n.includes("enzymepanel")) return "enzyme";
  if (n.includes("rapiddiagnostic")) return "rapid";
  if (n.includes("xray")) return "xray";
  if (n.includes("biopsy")) return "biopsy";
  if (n.includes("cytology")) return "cytology";
  if (n.includes("ultrasound")) return "ultrasound";
  if (/\bculture\b/i.test(option) && !/cytology/i.test(option)) return "culture";
  return "simple";
}

function flushSimpleBatch(batch: string[], out: HospitalTestsLayoutRow[]) {
  for (let i = 0; i < batch.length; i += 3) {
    const a = batch[i] ?? "";
    const b = batch[i + 1] ?? "";
    const c = batch[i + 2] ?? "";
    out.push({ kind: "simple-row", cells: [a, b, c] });
  }
}

function resolveMainTestsRaw(entries: HospitalTestCustomEntry[]): string | string[] | number | undefined {
  const byExact = getEntryValue(
    entries,
    (k) => k === "testsuggested" || k === "testssuggested",
  );
  if (byExact != null) return byExact;

  return getEntryValue(
    entries,
    (k) =>
      (k.includes("testsuggest") || k.includes("requiredtests")) &&
      !k.includes("enzymepanel") &&
      !k.includes("rapiddiagnostic"),
  );
}

/**
 * @param entries — [rawJsonKey, value] pairs for fields in the tests-suggested section (or all custom fields; unknown keys are ignored)
 */
export function buildHospitalTestsSuggestedLayout(
  entries: HospitalTestCustomEntry[],
): HospitalTestsLayoutRow[] {
  const mainList = parseStringList(resolveMainTestsRaw(entries));

  const subQuestions = entries
    .filter(([key]) => !isDetailSubQuestionKey(key))
    .filter(([key]) => !normalizeKey(key).includes("testssuggested"))
    .map(([key]) => ({ key, label: key, inputType: "multiSelect" as const }));
  const panelDefs = resolvePanelDefinitions(mainList, subQuestions);

  const xrayText = String(
    getEntryValue(entries, (k) => k.includes("xray") && k.includes("detail")) ?? "",
  ).trim();
  const biopsyText = String(
    getEntryValue(entries, (k) => k.includes("biopsy") && k.includes("detail")) ?? "",
  ).trim();
  const cytologyText = String(
    getEntryValue(entries, (k) => k.includes("cytology") && k.includes("detail")) ?? "",
  ).trim();
  const ultrasoundText = String(
    getEntryValue(entries, (k) => k.includes("ultrasound") && k.includes("detail")) ?? "",
  ).trim();
  const cultureText = String(
    getEntryValue(entries, (k) => k.includes("culture") && k.includes("detail")) ?? "",
  ).trim();

  const out: HospitalTestsLayoutRow[] = [];
  let simpleBatch: string[] = [];

  for (const test of mainList) {
    const kind = classifyMainTest(test);
    const panelDef = panelDefs.find((d) =>
      normalizeKey(test).includes(d.mainKeyword),
    );
    if (panelDef) {
      const subs = parseStringList(
        getEntryValue(entries, (k) => normalizeKey(k) === normalizeKey(panelDef.panelKey)),
      );
      flushSimpleBatch(simpleBatch, out);
      simpleBatch = [];
      out.push({
        kind: "detail",
        label: panelDef.mainLabel,
        value: subs.map(shortenPanelTestName).join(", ") || "—",
      });
      continue;
    }
    if (kind === "simple") {
      simpleBatch.push(test);
      continue;
    }
    flushSimpleBatch(simpleBatch, out);
    simpleBatch = [];

    switch (kind) {
      case "xray":
        out.push({ kind: "detail", label: "X-Ray", value: xrayText || "—" });
        break;
      case "ultrasound":
        out.push({
          kind: "detail",
          label: "Ultrasound",
          value: ultrasoundText || "—",
        });
        break;
      case "biopsy":
        out.push({ kind: "detail", label: "Biopsy", value: biopsyText || "—" });
        break;
      case "cytology":
        out.push({
          kind: "detail",
          label: "Cytology",
          value: cytologyText || "—",
        });
        break;
      case "culture":
        out.push({
          kind: "detail",
          label: "Culture",
          value: cultureText || "—",
        });
        break;
      default:
        break;
    }
  }
  flushSimpleBatch(simpleBatch, out);

  return out;
}
