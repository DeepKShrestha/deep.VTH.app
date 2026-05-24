import { sql } from "drizzle-orm";
import { dbGet, dbRun } from "./db-query";
import { exportRangeWithinApproval } from "./download-request-range";

export type DownloadRequestSource = "ast_report" | "hospital_case";
export { exportRangeWithinApproval };

type DownloadRequestRow = {
  id: number;
  user_id: number;
  request_source: string;
  date_from: string | null;
  date_to: string | null;
  status: string;
};

/**
 * Find the newest approved, not-yet-used download approval for a student export.
 */
export async function findApprovedDownloadRequest(params: {
  userId: number;
  source: DownloadRequestSource;
  exportDateFrom?: string | null;
  exportDateTo?: string | null;
}): Promise<{ id: number; status: string } | undefined> {
  const row = await dbGet<DownloadRequestRow>(
    sql`SELECT id, user_id, request_source, date_from, date_to, status
        FROM download_requests
        WHERE user_id = ${params.userId}
          AND request_source = ${params.source}
          AND status = ${"approved"}
        ORDER BY created_at DESC
        LIMIT 1`,
  );
  if (!row) return undefined;

  if (
    !exportRangeWithinApproval(
      { dateFrom: row.date_from, dateTo: row.date_to },
      params.exportDateFrom,
      params.exportDateTo,
    )
  ) {
    return undefined;
  }

  return { id: row.id, status: row.status };
}

/**
 * Atomically mark an approval as used. Returns false if already consumed
 * (parallel export race) or not owned by the user.
 */
export async function consumeApprovedDownloadRequest(
  requestId: number,
  userId: number,
): Promise<boolean> {
  const result = await dbRun(
    sql`UPDATE download_requests
        SET status = ${"downloaded"},
            admin_note = ${"Download used"},
            resolved_at = ${new Date().toISOString()}
        WHERE id = ${requestId}
          AND user_id = ${userId}
          AND status = ${"approved"}`,
  );
  return Number(result.changes ?? 0) > 0;
}
