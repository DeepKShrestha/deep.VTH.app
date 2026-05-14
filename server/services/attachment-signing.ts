import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Keep signing secret path aligned with the primary DB file without importing
 * `server/db.ts` (that module opens SQLite at load time and breaks tests /
 * tooling that only need signing helpers).
 */
function resolveDbFileForSecretLocation(): string {
  const raw = process.env.DB_FILE?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(process.cwd(), "data.db");
}

/**
 * Short-lived HMAC-signed URLs for case attachment downloads.
 *
 * Why this exists:
 *   We previously served `/uploads/case-attachments/<file>` as a public static
 *   route, so anyone who could guess (or got handed) a storage filename could
 *   download patient images without authenticating. That was a real security
 *   bug — patient images now require a valid signature.
 *
 * Trust model:
 *   - Only the server (after a successful scope-check) issues signed URLs.
 *   - Each URL is valid for `getSigningTtlMs()` and grants read access to that one
 *     attachment id. It acts like an S3-style presigned URL.
 *   - This pattern is required because `<img src>` cannot send Authorization
 *     headers, so the URL itself must carry proof of authorization.
 *
 * Secret:
 *   Loaded from env `ATTACHMENT_SIGNING_SECRET` if set; otherwise a 32-byte
 *   random secret is generated on first use and persisted next to the SQLite
 *   db (so restarts don't invalidate previously issued URLs). For production
 *   deployments, `ATTACHMENT_SIGNING_SECRET` is required (see
 *   `assertProductionAttachmentSigningConfigured`).
 *
 * TTL:
 *   Override with `ATTACHMENT_SIGNING_TTL_MS` (60000–86400000). Default 30 minutes.
 */

const SECRET_FILENAME = ".attachment-signing-secret";

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

let cachedSecret: Buffer | null = null;
let cachedTtlMs: number | null = null;

/** Call at process startup in production — fails fast if signing secret is missing. */
export function assertProductionAttachmentSigningConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  const s = process.env.ATTACHMENT_SIGNING_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error(
      "Production requires ATTACHMENT_SIGNING_SECRET (at least 32 characters) for attachment and profile-photo URL signing.",
    );
  }
}

export function getSigningTtlMs(): number {
  if (cachedTtlMs != null) return cachedTtlMs;
  const raw = process.env.ATTACHMENT_SIGNING_TTL_MS?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= MIN_TTL_MS && n <= MAX_TTL_MS) {
      cachedTtlMs = n;
      return cachedTtlMs;
    }
  }
  cachedTtlMs = DEFAULT_TTL_MS;
  return cachedTtlMs;
}

function resolveSecretFilePath(): string {
  const dbDir = path.dirname(resolveDbFileForSecretLocation());
  return path.join(dbDir, SECRET_FILENAME);
}

function loadOrCreateSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const envSecret = process.env.ATTACHMENT_SIGNING_SECRET?.trim();
  if (envSecret && envSecret.length >= 32) {
    cachedSecret = Buffer.from(envSecret, "utf8");
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ATTACHMENT_SIGNING_SECRET must be set in production (assertProductionAttachmentSigningConfigured should run at startup).",
    );
  }
  const secretPath = resolveSecretFilePath();
  try {
    const raw = fs.readFileSync(secretPath, "utf8").trim();
    if (raw && raw.length >= 32) {
      cachedSecret = Buffer.from(raw, "hex");
      if (cachedSecret.length >= 16) return cachedSecret;
    }
  } catch {
    // file missing or unreadable — fall through to generation
  }
  const generated = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, generated.toString("hex"), { mode: 0o600 });
  } catch {
    // Persist failure isn't fatal; we'll just regenerate next boot.
  }
  cachedSecret = generated;
  return cachedSecret;
}

function computeSignature(id: number, expiresAtIso: string): string {
  const secret = loadOrCreateSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(`${id}:${expiresAtIso}`)
    .digest("hex");
}

/** Returns a relative signed URL like `/api/case-attachments/123?t=...&sig=...`. */
export function signAttachmentDownloadUrl(attachmentId: number): string {
  const expiresAt = new Date(Date.now() + getSigningTtlMs()).toISOString();
  const sig = computeSignature(attachmentId, expiresAt);
  const params = new URLSearchParams({ t: expiresAt, sig });
  return `/api/case-attachments/${attachmentId}?${params.toString()}`;
}

/** Verifies (id, t, sig) — returns true iff signature matches and t is not in the past. */
export function verifyAttachmentSignature(
  attachmentId: number,
  expiresAtIso: string,
  signature: string,
): boolean {
  if (!expiresAtIso || !signature) return false;
  const ts = Date.parse(expiresAtIso);
  if (!Number.isFinite(ts) || ts < Date.now()) return false;
  const expected = computeSignature(attachmentId, expiresAtIso);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function computeProfilePhotoSignature(userId: number, expiresAtIso: string): string {
  const secret = loadOrCreateSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(`profile_photo:${userId}:${expiresAtIso}`)
    .digest("hex");
}

/** Relative signed URL for `<img src>` (Bearer cannot be sent on image requests). */
export function signProfilePhotoViewUrl(userId: number): string {
  const expiresAt = new Date(Date.now() + getSigningTtlMs()).toISOString();
  const sig = computeProfilePhotoSignature(userId, expiresAt);
  const params = new URLSearchParams({ t: expiresAt, sig });
  return `/api/users/${userId}/profile-photo?${params.toString()}`;
}

export function verifyProfilePhotoSignature(
  userId: number,
  expiresAtIso: string,
  signature: string,
): boolean {
  if (!expiresAtIso || !signature) return false;
  const ts = Date.parse(expiresAtIso);
  if (!Number.isFinite(ts) || ts < Date.now()) return false;
  const expected = computeProfilePhotoSignature(userId, expiresAtIso);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
