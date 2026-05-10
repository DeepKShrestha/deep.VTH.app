import { sql } from "drizzle-orm";
import { dbGet, dbRun } from "./db-query";

/** Section rows referenced by questions but missing from form_sections (e.g. legacy DBs). */
const ORPHAN_SECTION_FALLBACK: Record<string, { title: string; displayOrder: number }> = {
  attending_veterinarian: { title: "Attending veterinarian", displayOrder: 4650 },
};

export function mergeOrphanFormSections<
  T extends { key: string; title: string; display_order: number },
>(sections: T[], questions: Array<{ section_key: string }>): T[] {
  const known = new Set(sections.map((s) => s.key));
  const extras: T[] = [];
  for (const q of questions) {
    if (known.has(q.section_key)) continue;
    known.add(q.section_key);
    const fb = ORPHAN_SECTION_FALLBACK[q.section_key];
    extras.push({
      key: q.section_key,
      title: fb?.title ?? q.section_key.replace(/_/g, " "),
      display_order: fb?.displayOrder ?? 999_999,
    } as T);
  }
  if (extras.length === 0) return [...sections];
  return [...sections, ...extras].sort((a, b) => a.display_order - b.display_order);
}

export async function ensureHospitalTreatmentDefinition() {
  const section = await dbGet<{ key: string }>(
    sql`SELECT key FROM form_sections WHERE key = ${"treatment"}`,
  );
  if (!section) {
    await dbRun(
      sql`INSERT INTO form_sections (key, title, display_order, form_scope)
          VALUES (${"treatment"}, ${"Treatment / Prescription"}, ${4700}, ${"hospital"})`,
    );
  } else {
    await dbRun(
      sql`UPDATE form_sections
          SET title = ${"Treatment / Prescription"},
              form_scope = ${"hospital"}
          WHERE key = ${"treatment"}`,
    );
  }

  const question = await dbGet<{ id: number }>(
    sql`SELECT id FROM form_questions WHERE key = ${"treatmentPrescription"}`,
  );
  if (!question) {
    await dbRun(
      sql`INSERT INTO form_questions
          (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at, form_scope)
          VALUES (
            ${"treatmentPrescription"},
            ${"treatment"},
            ${"Treatment / Prescription"},
            ${"treatment_prescription"},
            ${null},
            ${1},
            ${0},
            ${0},
            ${1000},
            ${1},
            ${new Date().toISOString()},
            ${"hospital"}
          )`,
    );
  } else {
    await dbRun(
      sql`UPDATE form_questions
          SET section_key = ${"treatment"},
              label = ${"Treatment / Prescription"},
              input_type = ${"treatment_prescription"},
              is_builtin = ${1},
              form_scope = ${"hospital"}
          WHERE key = ${"treatmentPrescription"}`,
    );
  }
}

export async function ensureHospitalVeterinarianDefinition() {
  const section = await dbGet<{ key: string }>(
    sql`SELECT key FROM form_sections WHERE key = ${"attending_veterinarian"}`,
  );
  if (!section) {
    await dbRun(
      sql`INSERT INTO form_sections (key, title, display_order, form_scope)
          VALUES (${"attending_veterinarian"}, ${"Attending veterinarian"}, ${4650}, ${"hospital"})`,
    );
  } else {
    await dbRun(
      sql`UPDATE form_sections
          SET title = ${"Attending veterinarian"},
              form_scope = ${"hospital"}
          WHERE key = ${"attending_veterinarian"}`,
    );
  }

  const question = await dbGet<{ id: number }>(
    sql`SELECT id FROM form_questions WHERE key = ${"attendingVeterinarian"}`,
  );
  if (!question) {
    await dbRun(
      sql`INSERT INTO form_questions
          (key, section_key, label, input_type, options_json, enabled, required, hide_label, display_order, is_builtin, created_at, form_scope)
          VALUES (
            ${"attendingVeterinarian"},
            ${"attending_veterinarian"},
            ${"Attending veterinarian"},
            ${"hospital_veterinarian"},
            ${null},
            ${1},
            ${0},
            ${0},
            ${1000},
            ${1},
            ${new Date().toISOString()},
            ${"hospital"}
          )`,
    );
  } else {
    await dbRun(
      sql`UPDATE form_questions
          SET section_key = ${"attending_veterinarian"},
              label = ${"Attending veterinarian"},
              input_type = ${"hospital_veterinarian"},
              is_builtin = ${1},
              form_scope = ${"hospital"}
          WHERE key = ${"attendingVeterinarian"}`,
    );
  }

  // Seed / legacy rows may have NULL form_scope and would be omitted from hospital form-definition queries.
  await dbRun(
    sql`UPDATE form_sections SET form_scope = ${"hospital"} WHERE key = ${"attending_veterinarian"}`,
  );
  await dbRun(
    sql`UPDATE form_questions SET form_scope = ${"hospital"} WHERE key = ${"attendingVeterinarian"}`,
  );
}
