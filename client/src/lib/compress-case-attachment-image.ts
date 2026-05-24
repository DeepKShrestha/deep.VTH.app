/** Max size of the original file the user may pick (before compression). */
export const CASE_ATTACHMENT_MAX_INPUT_BYTES = 5 * 1024 * 1024;

/** Max size sent to the server after compression (matches server upload limits). */
export const CASE_ATTACHMENT_MAX_STORED_BYTES = 1024 * 1024;

export const PROFILE_PHOTO_MAX_INPUT_BYTES = CASE_ATTACHMENT_MAX_INPUT_BYTES;
export const PROFILE_PHOTO_MAX_STORED_BYTES = CASE_ATTACHMENT_MAX_STORED_BYTES;

const CASE_ATTACHMENT_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/pjpeg",
  "image/x-png",
]);

const CASE_ATTACHMENT_EXT = [".jpg", ".jpeg", ".png"];

const PROFILE_PHOTO_MIMES = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/pjpeg",
  "image/x-png",
  "image/webp",
]);

const PROFILE_PHOTO_EXT = [...CASE_ATTACHMENT_EXT, ".webp"];

const MAX_EDGE_PX = 2048;
const MIN_EDGE_PX = 640;
const MIN_JPEG_QUALITY = 0.35;

function isAllowedImage(
  file: File,
  allowedMimes: Set<string>,
  allowedExt: string[],
): boolean {
  const mime = (file.type || "").toLowerCase();
  const ext = file.name.match(/\.[^.]+$/);
  const extLower = (ext?.[0] || "").toLowerCase();
  const extOk = allowedExt.includes(extLower);
  const mimeOk =
    allowedMimes.has(mime) || mime === "" || mime === "application/octet-stream";
  return mimeOk && extOk;
}

export function isAllowedCaseAttachmentImage(file: File): boolean {
  return isAllowedImage(file, CASE_ATTACHMENT_MIMES, CASE_ATTACHMENT_EXT);
}

export function isAllowedProfilePhotoImage(file: File): boolean {
  return isAllowedImage(file, PROFILE_PHOTO_MIMES, PROFILE_PHOTO_EXT);
}

function scaledSize(width: number, height: number, maxEdge: number) {
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode image"));
      },
      "image/jpeg",
      quality,
    );
  });
}

function outputFileName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/i, "") || "image";
  return `${base}.jpg`;
}

async function compressImageToStoredLimit(
  file: File,
  isAllowed: (f: File) => boolean,
  maxInputBytes: number,
  maxStoredBytes: number,
): Promise<File> {
  if (file.size <= maxStoredBytes) {
    return file;
  }
  if (file.size > maxInputBytes) {
    throw new Error(`"${file.name}" is over 5MB.`);
  }
  if (!isAllowed(file)) {
    throw new Error(`"${file.name}" is not a supported image type.`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Could not read "${file.name}".`);
  }

  try {
    let maxEdge = MAX_EDGE_PX;
    while (maxEdge >= MIN_EDGE_PX) {
      const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not prepare image for compression.");
      }
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (let quality = 0.92; quality >= MIN_JPEG_QUALITY; quality -= 0.07) {
        const blob = await canvasToJpegBlob(canvas, quality);
        if (blob.size <= maxStoredBytes) {
          return new File([blob], outputFileName(file.name), {
            type: "image/jpeg",
            lastModified: file.lastModified,
          });
        }
      }
      maxEdge = Math.round(maxEdge * 0.72);
    }
  } finally {
    bitmap.close();
  }

  throw new Error(
    `Could not compress "${file.name}" below 1MB. Try a smaller or simpler image.`,
  );
}

/**
 * If the file is already under the stored limit, returns it unchanged.
 * Otherwise resizes and re-encodes as JPEG until under 1MB (or throws).
 */
export async function compressCaseAttachmentImage(file: File): Promise<File> {
  return compressImageToStoredLimit(
    file,
    isAllowedCaseAttachmentImage,
    CASE_ATTACHMENT_MAX_INPUT_BYTES,
    CASE_ATTACHMENT_MAX_STORED_BYTES,
  );
}

export async function compressProfilePhotoImage(file: File): Promise<File> {
  return compressImageToStoredLimit(
    file,
    isAllowedProfilePhotoImage,
    PROFILE_PHOTO_MAX_INPUT_BYTES,
    PROFILE_PHOTO_MAX_STORED_BYTES,
  );
}

export async function compressCaseAttachmentImages(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    out.push(await compressCaseAttachmentImage(file));
  }
  return out;
}
