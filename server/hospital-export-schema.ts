import { sql } from "drizzle-orm";
import {
  isTestsSuggestedSectionKey,
  shouldIncludeTestsSuggestedFormQuestion,
} from "@shared/hospital-tests-suggested";
import { resolveHospitalExportFieldLabel } from "@shared/hospital-export-field-labels";
import { uniqueStatisticalColumnName } from "@shared/hospital-export-statistical";
import { dbAll } from "./db-query";
import { mergeOrphanFormSections } from "./hospital-form-definition";

const NON_EXPORTABLE_INPUT_TYPES = new Set([
  "treatment_prescription",
  "hospital_veterinarian",
]);

export type HospitalExportHeaderMode = "clinical" | "statistical";

export type HospitalExportFormColumn = {
  key: string;
  header: string;
};

type FormQuestionRow = {
  key: string;
  section_key: string;
  label: string;
  input_type: string;
  enabled: number;
  display_order: number;
};

type FormSectionRow = {
  key: string;
  title: string;
  display_order: number;
};

/** Load enabled hospital form questions in section display order for export column layout. */
export async function loadHospitalExportFormColumns(): Promise<HospitalExportFormColumn[]> {
  let sections = await dbAll<FormSectionRow>(
    sql`SELECT key, title, display_order FROM form_sections
        WHERE form_scope = 'shared' OR form_scope = ${"hospital"}
        ORDER BY display_order ASC`,
  );
  const questions = await dbAll<FormQuestionRow>(
    sql`SELECT key, section_key, label, input_type, enabled, display_order
        FROM form_questions
        WHERE form_scope = 'shared' OR form_scope = ${"hospital"}
        ORDER BY section_key ASC, display_order ASC`,
  );
  sections = mergeOrphanFormSections(sections, questions);

  const sectionOrder = new Map(sections.map((s, i) => [s.key, i]));
  const sectionTitleByKey = new Map(sections.map((s) => [s.key, s.title]));

  const exportable = questions
    .filter((q) => Boolean(q.enabled))
    .filter((q) => !NON_EXPORTABLE_INPUT_TYPES.has(q.input_type))
    .filter((q) => {
      const title = sectionTitleByKey.get(q.section_key) ?? "";
      if (!isTestsSuggestedSectionKey(q.section_key, title)) return true;
      return shouldIncludeTestsSuggestedFormQuestion({
        key: q.key,
        label: q.label,
        inputType: q.input_type,
      });
    })
    .sort((a, b) => {
      const sa = sectionOrder.get(a.section_key) ?? 999_999;
      const sb = sectionOrder.get(b.section_key) ?? 999_999;
      if (sa !== sb) return sa - sb;
      return a.display_order - b.display_order;
    });

  const usedHeaders = new Set<string>();
  const columns: HospitalExportFormColumn[] = [];
  for (const q of exportable) {
    const baseHeader = (q.label?.trim() || resolveHospitalExportFieldLabel(q.key)).slice(0, 200);
    let header = baseHeader;
    let n = 2;
    while (usedHeaders.has(header)) {
      header = `${baseHeader} (${n})`;
      n += 1;
    }
    usedHeaders.add(header);
    columns.push({ key: q.key, header });
  }
  return columns;
}

/** Pure helper: merge form columns with legacy data keys not in the current form config. */
export function appendLegacyExportColumns(
  formColumns: HospitalExportFormColumn[],
  dataKeys: Iterable<string>,
  reservedHeaders: Set<string>,
  headerMode: HospitalExportHeaderMode = "clinical",
): HospitalExportFormColumn[] {
  const knownKeys = new Set(formColumns.map((c) => c.key));
  const usedHeaders = new Set([
    ...Array.from(reservedHeaders),
    ...formColumns.map((c) => c.header),
  ]);
  const legacy: HospitalExportFormColumn[] = [];
  for (const key of Array.from(dataKeys)) {
    if (!key.trim() || knownKeys.has(key)) continue;
    let header: string;
    if (headerMode === "statistical") {
      header = uniqueStatisticalColumnName(key, usedHeaders);
    } else {
      const baseHeader = resolveHospitalExportFieldLabel(key).slice(0, 200);
      header = baseHeader;
      let n = 2;
      while (usedHeaders.has(header)) {
        header = `${baseHeader} (${n})`;
        n += 1;
      }
      usedHeaders.add(header);
    }
    legacy.push({ key, header });
  }
  legacy.sort((a, b) => a.header.localeCompare(b.header));
  return [...formColumns, ...legacy];
}

/** Remap form column headers to snake_case for statistical export. */
export function toStatisticalFormColumns(
  formColumns: HospitalExportFormColumn[],
  reservedHeaders: Set<string>,
): HospitalExportFormColumn[] {
  const used = new Set(reservedHeaders);
  return formColumns.map((column) => ({
    key: column.key,
    header: uniqueStatisticalColumnName(column.key, used),
  }));
}
