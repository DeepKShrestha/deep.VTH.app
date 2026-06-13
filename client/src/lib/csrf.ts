/**
 * Double-submit CSRF helper.
 *
 * The session token lives in an httpOnly cookie that JavaScript cannot read.
 * To prove a mutating request actually came from our app (and not a forged
 * cross-site request that rides on the browser's auto-sent cookie), the server
 * also sets a *readable* `vth_csrf` cookie. We echo its value back in the
 * `X-CSRF-Token` header; the server requires the two to match.
 */

const CSRF_COOKIE = "vth_csrf";

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)vth_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Header object to spread into a mutating (non-GET) request. Returns an empty
 * object when no token is present so callers can always spread it safely.
 */
export function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export { CSRF_COOKIE };
