import fs from "node:fs";
import path from "node:path";

/**
 * Upload a local backup zip to S3-compatible storage (optional).
 * Env: BACKUP_S3_BUCKET, BACKUP_S3_PREFIX (optional), BACKUP_S3_REGION,
 * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or provider-specific equivalents).
 */
export async function uploadSiteBackupToS3(localFilePath: string, objectKey: string): Promise<void> {
  const bucket = process.env.BACKUP_S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error("BACKUP_S3_BUCKET is not set");
  }
  const region = process.env.BACKUP_S3_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-east-1";
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  const body = fs.createReadStream(localFilePath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: body,
    }),
  );
}

export function buildS3ObjectKey(filename: string): string {
  const prefix = (process.env.BACKUP_S3_PREFIX || "site-backups").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${filename}` : filename;
}

export function isS3Configured(): boolean {
  return Boolean(
    process.env.BACKUP_S3_BUCKET?.trim() &&
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}
