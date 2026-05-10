import path from "node:path";

/** Same logic as `CASE_ATTACHMENT_UPLOAD_DIR` in `server/routes/cases.ts`. */
export function getCaseAttachmentUploadDir(): string {
  const raw = process.env.CASE_ATTACHMENTS_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), "uploads", "case-attachments");
}

export function getSiteBackupDir(): string {
  const raw = process.env.BACKUP_LOCAL_DIR?.trim();
  return raw ? path.resolve(raw) : path.resolve(process.cwd(), "backups", "site");
}
