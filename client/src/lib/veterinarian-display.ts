/** Avoid "Department: Department of …" when the stored value already includes a department title. */
export function formatVeterinarianDepartmentDisplay(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  return t.replace(/^\s*department\s*:\s*/i, "").trim();
}
