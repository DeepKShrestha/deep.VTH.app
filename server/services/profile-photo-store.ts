import fs from "node:fs/promises";
import path from "node:path";
import { getProfilePhotoUploadDir } from "./backup-paths";

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function profilePhotoMimeError(mimetype: string | undefined): string | null {
  if (!mimetype || !ALLOWED.has(mimetype)) {
    return "Only JPEG, PNG, or WebP images are allowed (max 2 MB).";
  }
  return null;
}

export function extForProfilePhotoMime(mimetype: string): string {
  return ALLOWED.get(mimetype) ?? "bin";
}

export async function ensureProfilePhotoDir(): Promise<void> {
  await fs.mkdir(getProfilePhotoUploadDir(), { recursive: true });
}

/** `storedFilename` must be a basename only (e.g. `12.jpg`). */
export function resolveProfilePhotoAbsolutePath(
  storedFilename: string | null | undefined,
): string | null {
  if (!storedFilename) return null;
  const base = path.basename(storedFilename);
  if (!base || base !== storedFilename || base.includes("..")) return null;
  return path.join(getProfilePhotoUploadDir(), base);
}

export async function removeProfilePhotoFilesForUser(userId: number): Promise<void> {
  const dir = getProfilePhotoUploadDir();
  for (const ext of ["jpg", "png", "webp"]) {
    await fs.unlink(path.join(dir, `${userId}.${ext}`)).catch(() => {});
  }
}

export async function replaceProfilePhotoForUser(
  userId: number,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  const err = profilePhotoMimeError(mimetype);
  if (err) throw new Error(err);
  const ext = extForProfilePhotoMime(mimetype);
  const filename = `${userId}.${ext}`;
  await removeProfilePhotoFilesForUser(userId);
  await ensureProfilePhotoDir();
  const full = path.join(getProfilePhotoUploadDir(), filename);
  await fs.writeFile(full, buffer);
  return filename;
}
