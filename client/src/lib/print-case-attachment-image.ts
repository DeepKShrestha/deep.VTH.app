import { formatAdDate, formatBsDate } from "@/lib/nepali-date";

export type PrintCaseAttachmentResult =
  | { ok: true }
  | { ok: false; reason: "popup_blocked" | "image_load_failed" };

/** Case date for print header (BS, with AD in parentheses when available). */
export function formatCaseDateForAttachmentPrint(
  caseDateBs: string,
  caseDateAd?: string | null,
): string {
  const bs = (caseDateBs ?? "").trim();
  if (!bs) {
    const ad = (caseDateAd ?? "").trim();
    return ad ? formatAdDate(ad) : "";
  }
  const bsLabel = formatBsDate(bs);
  const ad = (caseDateAd ?? "").trim();
  return ad ? `${bsLabel} (${formatAdDate(ad)})` : bsLabel;
}

const PRINT_STYLES = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #000;
    background: #fff;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    max-width: 186mm;
    margin: 0 auto;
  }
  .header {
    flex-shrink: 0;
    text-align: center;
    padding-bottom: 6mm;
    border-bottom: 1px solid #ccc;
    margin-bottom: 6mm;
  }
  .header .case-number {
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .header .case-date {
    margin-top: 2mm;
    font-size: 11pt;
    color: #333;
  }
  .image-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
  }
  .image-area img {
    max-width: 100%;
    max-height: calc(297mm - 12mm - 12mm - 28mm);
    width: auto;
    height: auto;
    object-fit: contain;
  }
`;

/**
 * Opens an A4 print view for one case attachment image (hospital treatment photos).
 * Header shows case number and case date only — not filename or print timestamp.
 */
export function printCaseAttachmentImage(args: {
  imageUrl: string;
  caseNumber: string;
  caseDateBs: string;
  caseDateAd?: string | null;
}): PrintCaseAttachmentResult {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return { ok: false, reason: "popup_blocked" };
  }

  const doc = printWindow.document;
  doc.open();
  doc.write("<!DOCTYPE html><html><head><meta charset=\"utf-8\" /><title>Print attachment</title>");
  doc.write(`<style>${PRINT_STYLES}</style></head><body>`);
  doc.write('<div class="sheet"><header class="header">');
  doc.write('<div class="case-number"></div><div class="case-date"></div></header>');
  doc.write('<div class="image-area"><img id="vth-print-attachment-img" alt="" /></div></div>');
  doc.write("</body></html>");
  doc.close();

  const caseNumberEl = doc.querySelector(".case-number");
  const caseDateEl = doc.querySelector(".case-date");
  const img = doc.getElementById("vth-print-attachment-img") as HTMLImageElement | null;
  if (!caseNumberEl || !caseDateEl || !img) {
    printWindow.close();
    return { ok: false, reason: "image_load_failed" };
  }

  caseNumberEl.textContent = args.caseNumber.trim() || "—";
  const dateLabel = formatCaseDateForAttachmentPrint(args.caseDateBs, args.caseDateAd);
  caseDateEl.textContent = dateLabel;

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
  };

  img.onload = () => triggerPrint();
  img.onerror = () => {
    printWindow.close();
  };

  printWindow.onafterprint = () => {
    printWindow.close();
  };

  img.src = args.imageUrl;

  return { ok: true };
}
