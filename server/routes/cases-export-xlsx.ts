import ExcelJS from "exceljs";
import type { ExportRow } from "./cases-export";

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "-").trim();
  return (cleaned.slice(0, 31) || "Export").replace(/-+$/g, "") || "Export";
}

/**
 * Build a single-sheet .xlsx workbook (header row bold + frozen, light header fill).
 */
export async function rowsToXlsxBuffer(
  rows: ExportRow[],
  columnOrder: readonly string[],
  sheetName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VTH-app";
  const sheet = workbook.addWorksheet(sanitizeSheetName(sheetName));

  if (rows.length === 0) {
    sheet.addRow(["No data"]);
    const out = await workbook.xlsx.writeBuffer();
    return Buffer.from(out);
  }

  const headers =
    columnOrder.length > 0 ? [...columnOrder] : (Object.keys(rows[0]) as string[]);

  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE7EEF7" },
    };
  });

  for (const row of rows) {
    sheet.addRow(headers.map((h) => String(row[h] ?? "")));
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  headers.forEach((h, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = Math.min(48, Math.max(10, Math.min(h.length + 4, 36)));
  });

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
