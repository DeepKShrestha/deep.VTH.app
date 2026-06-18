/** Convert a form/storage key or label into a stable snake_case column name for analysis tools. */
export function toStatisticalColumnName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "field";
  const normalized = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  return normalized || "field";
}

/** Pick a unique snake_case header within an export batch. */
export function uniqueStatisticalColumnName(base: string, used: Set<string>): string {
  const root = toStatisticalColumnName(base);
  let candidate = root;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${root}_${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}
