/**
 * Display label for a veterinary student batch number (e.g. "9th batch", "21st batch").
 */
export function formatOrdinalBatch(n: number | string): string {
  const batch = typeof n === "number" ? Math.trunc(n) : Number.parseInt(String(n), 10);
  if (!Number.isInteger(batch) || batch <= 0) {
    return `${n}th batch`;
  }

  const mod100 = batch % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${batch}th batch`;
  }

  switch (batch % 10) {
    case 1:
      return `${batch}st batch`;
    case 2:
      return `${batch}nd batch`;
    case 3:
      return `${batch}rd batch`;
    default:
      return `${batch}th batch`;
  }
}
