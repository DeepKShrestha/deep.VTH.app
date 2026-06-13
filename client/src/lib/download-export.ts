import { API_BASE } from "@/lib/api-base";
import { filenameFromContentDisposition } from "@/lib/content-disposition-filename";
import { DownloadFailedError, readDownloadErrorMessage } from "@/lib/download-error";

export type ExportKind = "csv" | "xlsx";

export interface RunExportDownloadOptions {
  /** API path (with query string), relative to the API origin. */
  path: string;
  /** Filename to use if the server omits a Content-Disposition header. */
  fallbackName: string;
}

export interface RunExportDownloadResult {
  /** Parsed `X-Export-Row-Count`, or null when the header is absent/invalid. */
  rowCount: number | null;
}

/**
 * Fetch an export endpoint and save the response as a browser file download.
 *
 * Shared by the AST and Hospital export pages, which previously each inlined
 * this identical fetch → blob → anchor-click → cleanup routine. The session
 * cookie is sent automatically (`credentials: "same-origin"`); a non-OK
 * response throws `DownloadFailedError` carrying the server's reason so the
 * caller can surface it.
 */
export async function runExportDownload(
  options: RunExportDownloadOptions,
): Promise<RunExportDownloadResult> {
  const res = await fetch(`${API_BASE}${options.path}`, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!res.ok) {
    // Surface the server-side reason (visibility toggle off, validation error,
    // 5xx, etc.) instead of a generic message. The server returns JSON for
    // every status; falling back to the status line keeps this robust.
    const message = await readDownloadErrorMessage(res);
    throw new DownloadFailedError(message);
  }

  const disposition = res.headers.get("Content-Disposition");
  const downloadName = filenameFromContentDisposition(disposition, options.fallbackName);
  const rowCountHeader = res.headers.get("X-Export-Row-Count");
  const blob = await res.blob();

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  const parsed = rowCountHeader ? Number.parseInt(rowCountHeader, 10) : NaN;
  return { rowCount: Number.isFinite(parsed) ? parsed : null };
}
