/** BS / AD case dates are stored as YYYY-MM-DD — lexical compare is safe. */
function normalizeYmd(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

/**
 * Export range must fall inside the approved BS window when the approval
 * specifies bounds. Empty export bounds mean "all data in the approved window".
 */
export function exportRangeWithinApproval(
  approval: { dateFrom: string | null; dateTo: string | null },
  exportFrom: string | null | undefined,
  exportTo: string | null | undefined,
): boolean {
  const approvedFrom = normalizeYmd(approval.dateFrom);
  const approvedTo = normalizeYmd(approval.dateTo);
  if (!approvedFrom && !approvedTo) return true;

  const expFrom = normalizeYmd(exportFrom);
  const expTo = normalizeYmd(exportTo);

  if (!expFrom && !expTo) {
    return false;
  }

  const rangeStart = expFrom ?? expTo!;
  const rangeEnd = expTo ?? expFrom!;

  if (approvedFrom && rangeStart < approvedFrom) return false;
  if (approvedTo && rangeEnd > approvedTo) return false;
  return true;
}
