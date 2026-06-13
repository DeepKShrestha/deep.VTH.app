/**
 * Base URL prefix for API requests.
 *
 * `""` means **same-origin**, which is the only supported deployment today:
 * the Express server serves both the built SPA and the `/api` routes from one
 * origin, so the browser can use relative paths.
 *
 * History: earlier code wrote this as
 * `"__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__"`. That token was a
 * build-time substitution slot from a previous hosting setup. This codebase
 * never wired up a replacement step, so it always evaluated to `""`. It is
 * kept here as an explicit empty default (no behaviour change) to remove the
 * cryptic placeholder. If you ever serve the SPA from a different origin than
 * the API, set this to that API origin and use `CORS_ALLOWED_ORIGINS` +
 * `credentials: "include"` on the requests.
 */
export const API_BASE = "";
