import { filenameFromContentDisposition } from "@/lib/content-disposition-filename";

function isPdfBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const head = new TextDecoder().decode(buffer.slice(0, 5));
  return head === "%PDF-";
}

/**
 * Save a binary HTTP response as a file download (PDF, CSV, etc.).
 * Validates PDF magic bytes when fallbackFilename ends with .pdf.
 */
export async function downloadBlobResponse(
  res: Response,
  fallbackFilename: string,
): Promise<{ filename: string; byteLength: number }> {
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let message = errText || "Download failed";
    try {
      const json = JSON.parse(errText) as { message?: string };
      if (json.message) message = json.message;
    } catch {
      /* plain text */
    }
    throw new Error(message);
  }

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }

  if (fallbackFilename.toLowerCase().endsWith(".pdf") && !isPdfBytes(buffer)) {
    throw new Error("Server did not return a valid PDF file");
  }

  const disposition = res.headers.get("Content-Disposition");
  const filename = filenameFromContentDisposition(disposition, fallbackFilename);
  const contentType = res.headers.get("Content-Type");
  const blob = new Blob([buffer], {
    type: contentType?.split(";")[0]?.trim() || "application/octet-stream",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 250);

  return { filename, byteLength: buffer.byteLength };
}
