import type { DownloadRequest } from "@shared/schema";

/**
 * The newest approved (not-yet-used) request for a given source.
 *
 * Mirrors the server's `findApprovedDownloadRequest` ordering so the UI
 * never claims an approval the server is about to refuse.
 */
export function findActiveApproval(
  requests: DownloadRequest[],
  source: "ast_report" | "hospital_case",
): DownloadRequest | undefined {
  return requests
    .filter(
      (r) => (r.requestSource || "ast_report") === source && r.status === "approved",
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

function isYmd(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * Check whether `[exportFrom, exportTo]` falls inside the approval window.
 * Returns a structured result the UI can use to gate the Download buttons.
 *
 * Mirrors `server/download-request-range.ts#exportRangeWithinApproval`.
 */
export function evaluateExportRange(
  approval: { dateFrom: string | null; dateTo: string | null } | undefined,
  exportFrom: string | undefined,
  exportTo: string | undefined,
): { ok: boolean; reason?: string } {
  if (!approval) return { ok: true };
  const approvedFrom = isYmd(approval.dateFrom) ? approval.dateFrom!.trim() : null;
  const approvedTo = isYmd(approval.dateTo) ? approval.dateTo!.trim() : null;
  if (!approvedFrom && !approvedTo) return { ok: true };

  const expFrom = isYmd(exportFrom) ? exportFrom!.trim() : null;
  const expTo = isYmd(exportTo) ? exportTo!.trim() : null;

  if (!expFrom && !expTo) {
    return {
      ok: false,
      reason:
        "Pick a date range — your approval is limited to a specific BS window.",
    };
  }
  const rangeStart = expFrom ?? expTo!;
  const rangeEnd = expTo ?? expFrom!;
  if (approvedFrom && rangeStart < approvedFrom) {
    return { ok: false, reason: `Start date is before the approved window (${approvedFrom}).` };
  }
  if (approvedTo && rangeEnd > approvedTo) {
    return { ok: false, reason: `End date is after the approved window (${approvedTo}).` };
  }
  return { ok: true };
}

export function describeApprovalWindow(
  approval: { dateFrom: string | null; dateTo: string | null } | undefined,
): string {
  if (!approval) return "";
  const from = approval.dateFrom?.trim();
  const to = approval.dateTo?.trim();
  if (from && to) return `${from} → ${to}`;
  if (from) return `from ${from}`;
  if (to) return `until ${to}`;
  return "any date";
}
