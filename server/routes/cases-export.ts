import type { Case } from "@shared/schema";

export type AstItem = {
  antibiotic?: string;
  symbol?: string;
  zoneSize?: string | number;
  sensitivity?: string;
};

export type ExportRow = Record<string, string | number>;

export function parseAstResults(astResults: string | null): AstItem[] {
  try {
    const parsed = JSON.parse(astResults || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toExportRows(casesData: Case[]): ExportRow[] {
  return casesData.map((c) => {
    const astData = parseAstResults(c.astResults);
    const antibiotics = astData
      .map((a) => `${a.antibiotic ?? ""} (${a.symbol ?? ""})`)
      .join("; ");
    const zoneSizes = astData.map((a) => a.zoneSize ?? "").join("; ");
    const sensitivities = astData.map((a) => a.sensitivity ?? "").join("; ");

    return {
      "Case No": c.caseNumber,
      "Bill No": c.billNumber || "",
      "Date (BS)": c.date,
      "Date (AD)": c.dateAd || "",
      "Daily #": c.dailyNumber || "",
      "Monthly #": c.monthlyNumber || "",
      "Owner Name": c.ownerName,
      Address: c.ownerAddress,
      Phone: c.ownerPhone,
      Species: c.species,
      Breed: c.breed,
      "Animal Name": c.animalName || "",
      Age: c.age || "",
      Sex: c.sex || "",
      "Sample Type": c.sampleType || "",
      "Sample Date (BS)": c.sampleDate || "",
      "Sample Date (AD)": c.sampleDateAd || "",
      "Culture/Organism": c.cultureResult || "",
      "Antibiotics Tested": antibiotics,
      "Zone Sizes (mm)": zoneSizes,
      "Sensitivity Results": sensitivities,
      Remarks: c.remarks || "",
    };
  });
}

export function rowsToCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return "No data";

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? "").replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(","),
    ),
  ];

  return csvLines.join("\n");
}
