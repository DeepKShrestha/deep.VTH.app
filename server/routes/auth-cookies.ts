import crypto from "crypto";
import type { Request, Response } from "express";

/**
 * Cookie-based session + CSRF helpers.
 *
 * Sessions used to be carried purely as a `Authorization: Bearer <token>`
 * header with the token persisted in `sessionStorage` on the client. That
 * exposed the token to any JavaScript running on the page (XSS = full session
 * theft). We now ALSO set the session token in an `httpOnly` cookie so the
 * browser handles it and JS can never read it.
 *
 * The Bearer-header path is still accepted on the server (tests and any
 * non-browser caller use it), but the browser client no longer stores or
 * sends a token — it relies on the cookie. Because cookies are sent
 * automatically by the browser, cookie-authenticated *mutating* requests are
 * protected against CSRF with a double-submit token: a readable `vth_csrf`
 * cookie whose value must be echoed back in the `X-CSRF-Token` header.
 */

export const SESSION_COOKIE = "vth_session";
export const CSRF_COOKIE = "vth_csrf";
export const CSRF_HEADER = "x-csrf-token";

export type TokenSource = "cookie" | "header";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Read a single cookie value without depending on `cookie-parser`. Express
 * does not populate `req.cookies` unless that middleware is mounted, so we
 * parse the raw `Cookie` header ourselves.
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return undefined;
}

/**
 * Resolve the session token for a request. The httpOnly cookie wins over the
 * Authorization header so a browser that has both never accidentally uses a
 * stale header. Returns the source so callers can decide whether CSRF applies.
 */
export function extractSessionToken(
  req: Request,
): { token: string; source: TokenSource } | null {
  const cookieToken = readCookie(req, SESSION_COOKIE);
  if (cookieToken) return { token: cookieToken, source: "cookie" };
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token) return { token, source: "header" };
  }
  return null;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
  };
}

function csrfCookieOptions() {
  return {
    // Must be readable by client JS for the double-submit pattern.
    httpOnly: false,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
  };
}

// Some unit tests mock `res` with only `status`/`json`. Guard the Express
// cookie helpers so those tests keep working without a real response object.
function canSetCookies(res: Response): boolean {
  return typeof (res as { cookie?: unknown }).cookie === "function";
}

export function setSessionCookie(res: Response, token: string): void {
  if (!canSetCookies(res)) return;
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  if (!canSetCookies(res)) return;
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
}

/** Issue (or refresh) the double-submit CSRF cookie and return its value. */
export function issueCsrfToken(res: Response): string {
  const token = crypto.randomBytes(32).toString("hex");
  if (canSetCookies(res)) {
    res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  }
  return token;
}

export function clearCsrfCookie(res: Response): void {
  if (!canSetCookies(res)) return;
  res.clearCookie(CSRF_COOKIE, csrfCookieOptions());
}

export function isMutatingMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}

/**
 * Double-submit CSRF check: the `X-CSRF-Token` header must be present and
 * exactly equal to the `vth_csrf` cookie. Compared in constant time.
 */
export function verifyCsrf(req: Request): boolean {
  const cookieToken = readCookie(req, CSRF_COOKIE);
  const rawHeader = req.headers?.[CSRF_HEADER];
  const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
