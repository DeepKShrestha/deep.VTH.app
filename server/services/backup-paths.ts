import path from "node:path";

/** Same logic as `CASE_ATTACHMENT_UPLOAD_DIR` in `server/routes/cases.ts`. */
export function getCaseAttachmentUploadDir(): string {
  const raw = process.env.CASE_ATTACHMENTS_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), "uploads", "case-attachments");
}

export function getProfilePhotoUploadDir(): string {
  const raw = process.env.PROFILE_PHOTO_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), "uploads", "profile-photos");
}

/** Ephemeral forgot-password ID cards — excluded from site backups. */
export function getPasswordResetIdCardUploadDir(): string {
  const raw = process.env.PASSWORD_RESET_ID_CARD_DIR?.trim();
  return raw
    ? path.resolve(raw)
    : path.resolve(process.cwd(), "uploads", "password-reset-id-cards");
}

export function getSiteBackupDir(): string {
  const raw = process.env.BACKUP_LOCAL_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), "backups", "site");
}
