import PDFDocument from "pdfkit";
import type { Case } from "@shared/schema";

type AstPdfRow = {
  antibiotic?: string;
  symbol?: string;
  zone?: string | number;
  zoneSize?: string | number;
  sensitivity?: string;
};

function pdfLine(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function parseAstRows(astResults: string | null | undefined): AstPdfRow[] {
  try {
    const parsed = JSON.parse(astResults || "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as AstPdfRow[]) : [];
  } catch {
    return [];
  }
}

/** Build a complete case PDF in memory so the HTTP response is never a truncated stream. */
export function buildCasePdfBuffer(caseData: Case): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "LETTER" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      doc.fontSize(18).text(`Case report — ${pdfLine(caseData.caseNumber)}`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#444").text(`Generated ${new Date().toISOString()}`);
      doc.fillColor("#000");
      doc.moveDown();

      doc.fontSize(12).text("Registration", { underline: true });
      doc.fontSize(10);
      doc.text(`Date (BS): ${pdfLine(caseData.date)}`);
      if (caseData.dateAd) doc.text(`Date (AD): ${pdfLine(caseData.dateAd)}`);
      if (caseData.billNumber) doc.text(`Bill #: ${pdfLine(caseData.billNumber)}`);
      doc.moveDown();

      doc.fontSize(12).text("Owner", { underline: true });
      doc.fontSize(10);
      doc.text(`Name: ${pdfLine(caseData.ownerName)}`);
      doc.text(`Address: ${pdfLine(caseData.ownerAddress)}`);
      doc.text(`Phone: ${pdfLine(caseData.ownerPhone)}`);
      doc.moveDown();

      doc.fontSize(12).text("Animal", { underline: true });
      doc.fontSize(10);
      doc.text(`Species: ${pdfLine(caseData.species)}`);
      doc.text(`Breed: ${pdfLine(caseData.breed)}`);
      if (caseData.animalName) doc.text(`Name: ${pdfLine(caseData.animalName)}`);
      if (caseData.age) doc.text(`Age: ${pdfLine(caseData.age)}`);
      if (caseData.sex) doc.text(`Sex: ${pdfLine(caseData.sex)}`);
      doc.moveDown();

      if (caseData.sampleType || caseData.cultureResult) {
        doc.fontSize(12).text("Sample / culture", { underline: true });
        doc.fontSize(10);
        if (caseData.sampleType) doc.text(`Sample type: ${pdfLine(caseData.sampleType)}`);
        if (caseData.sampleDate) doc.text(`Sample date (BS): ${pdfLine(caseData.sampleDate)}`);
        if (caseData.cultureResult) doc.text(`Culture: ${pdfLine(caseData.cultureResult)}`);
        doc.moveDown();
      }

      const astRows = parseAstRows(caseData.astResults);
      if (astRows.length > 0) {
        doc.addPage();
        doc.fontSize(12).text("Antibiotic susceptibility (AST)", { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9);
        const colDrug = 140;
        const colCode = 55;
        const colZone = 55;
        const colSens = 40;
        let y = doc.y;
        doc.text("Antibiotic", 48, y, { width: colDrug });
        doc.text("Code", 48 + colDrug, y, { width: colCode });
        doc.text("Zone (mm)", 48 + colDrug + colCode, y, { width: colZone });
        doc.text("S/I/R", 48 + colDrug + colCode + colZone, y, { width: colSens });
        y = doc.y + 4;
        doc.moveTo(48, y).lineTo(520, y).stroke();
        y += 6;
        for (const row of astRows) {
          if (y > 720) {
            doc.addPage();
            y = 48;
          }
          const drug = pdfLine(row.antibiotic || row.symbol || "—");
          const code = pdfLine(row.symbol || "—");
          const zoneRaw = row.zoneSize ?? row.zone;
          const zone =
            zoneRaw != null && String(zoneRaw).trim() !== "" ? String(zoneRaw) : "—";
          const sens = pdfLine(row.sensitivity || "—");
          doc.text(drug, 48, y, { width: colDrug });
          doc.text(code, 48 + colDrug, y, { width: colCode });
          doc.text(zone, 48 + colDrug + colCode, y, { width: colZone });
          doc.text(sens, 48 + colDrug + colCode + colZone, y, { width: colSens });
          y += 14;
        }
        doc.y = y + 8;
      }

      if (caseData.remarks) {
        doc.moveDown();
        doc.fontSize(12).text("Remarks", { underline: true });
        doc.fontSize(10).text(pdfLine(caseData.remarks), { width: 520 });
      }

      if (caseData.treatmentDetails) {
        doc.moveDown();
        doc.fontSize(12).text("Treatment", { underline: true });
        doc.fontSize(10).text(pdfLine(caseData.treatmentDetails), { width: 520 });
      }

      doc.end();
    } catch (err) {
      doc.destroy();
      reject(err);
    }
  });
}
