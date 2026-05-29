/**
 * Helpers for translating a failed `/api/export/*` response into a
 * human-readable toast description.
 *
 * Why a dedicated module: every export page used to swallow the server
 * response and toast a generic "Download failed. You may not have
 * permission." — which made it impossible for admins to tell apart
 * "your role has export turned off", "your session expired", "the date
 * range was rejected", or a 500. The server already returns a JSON
 * `{ message: "..." }` for every non-success status; this module reads
 * that and degrades gracefully when the body isn't JSON (HTML 502 from a
 * proxy, plain-text 429 from the rate limiter, etc.).
 */

/** A thrown error whose `message` is safe to render in a toast. */
export class DownloadFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadFailedError";
  }
}

/**
 * Read the best-effort error message off a non-OK `fetch` Response.
 *
 * Never throws — falls back through these layers:
 *   1. JSON body's `message` / `error` field (the server's normal shape).
 *   2. Plain-text body (proxy / rate-limit responses sometimes do this).
 *   3. HTTP status line ("403 Forbidden", "500 Internal Server Error").
 *   4. The literal string "Request failed" as a last resort.
 */
export async function readDownloadErrorMessage(res: Response): Promise<string> {
  const statusFallback = res.statusText
    ? `${res.status} ${res.statusText}`
    : `HTTP ${res.status}`;

  try {
    const text = await res.text();
    if (!text) return statusFallback;
    try {
      const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
      const msg =
        typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.error === "string"
            ? parsed.error
            : "";
      return msg.trim() || statusFallback;
    } catch {
      const trimmed = text.trim();
      return trimmed.length > 0 && trimmed.length < 500 ? trimmed : statusFallback;
    }
  } catch {
    return statusFallback || "Request failed";
  }
}
