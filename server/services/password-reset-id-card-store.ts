import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getPasswordResetIdCardUploadDir } from "./backup-paths";

export const PASSWORD_RESET_ID_CARD_MAX_BYTES = 1024 * 1024;

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/pjpeg", "jpg"],
  ["image/x-png", "png"],
]);

export function passwordResetIdCardMimeError(mimetype: string | undefined): string | null {
  if (!mimetype || !ALLOWED.has(mimetype.toLowerCase())) {
    return "Only JPEG or PNG images are allowed (max 1 MB after compression).";
  }
  return null;
}

export function isAllowedPasswordResetIdCardFile(
  mimetype: string | undefined,
  originalname: string,
): boolean {
  if (!passwordResetIdCardMimeError(mimetype)) return true;
  const ext = path.extname(originalname || "").toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(ext)) return false;
  const mime = (mimetype || "").toLowerCase();
  return mime === "" || mime === "application/octet-stream";
}

export async function ensurePasswordResetIdCardDir(): Promise<void> {
  await fs.mkdir(getPasswordResetIdCardUploadDir(), { recursive: true });
}

/** `storedFilename` must be a basename only (e.g. `12-a1b2c3d4.jpg`). */
export function resolvePasswordResetIdCardAbsolutePath(
  storedFilename: string | null | undefined,
): string | null {
  if (!storedFilename) return null;
  const base = path.basename(storedFilename);
  if (!base || base !== storedFilename || base.includes("..")) return null;
  return path.join(getPasswordResetIdCardUploadDir(), base);
}

export async function savePasswordResetIdCardForRequest(
  requestId: number,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  const err = passwordResetIdCardMimeError(mimetype);
  if (err) throw new Error(err);
  if (buffer.length > PASSWORD_RESET_ID_CARD_MAX_BYTES) {
    throw new Error("University ID card image must be 1 MB or smaller.");
  }
  const ext = ALLOWED.get(mimetype.toLowerCase()) ?? "jpg";
  const filename = `${requestId}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  await ensurePasswordResetIdCardDir();
  await fs.writeFile(path.join(getPasswordResetIdCardUploadDir(), filename), buffer);
  return filename;
}

export async function deletePasswordResetIdCardFile(
  storedFilename: string | null | undefined,
): Promise<void> {
  const abs = resolvePasswordResetIdCardAbsolutePath(storedFilename);
  if (!abs) return;
  await fs.unlink(abs).catch(() => {});
}
