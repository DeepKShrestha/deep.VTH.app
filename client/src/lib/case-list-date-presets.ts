import { addBsDays, getBsMonthRange, getTodayBsAd } from "@/lib/nepali-date";

export type CaseListDatePreset = {
  id: string;
  label: string;
  from: string;
  to: string;
};

/** Quick BS date ranges for Previous Cases filters. */
export function getCaseListDatePresets(): CaseListDatePreset[] {
  const today = getTodayBsAd();
  const t = today.bs;
  const yesterday = addBsDays(t, -1);

  let prevYear = today.bsYear;
  let prevMonth = today.bsMonth - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const thisMonth = getBsMonthRange(today.bsYear, today.bsMonth);
  const lastMonth = getBsMonthRange(prevYear, prevMonth);

  return [
    { id: "today", label: "Today", from: t, to: t },
    { id: "yesterday", label: "Yesterday", from: yesterday, to: yesterday },
    { id: "last7", label: "Last 7 days", from: addBsDays(t, -6), to: t },
    { id: "last30", label: "Last 30 days", from: addBsDays(t, -29), to: t },
    { id: "thisMonth", label: "This month", from: thisMonth.from, to: t },
    { id: "lastMonth", label: "Last month", from: lastMonth.from, to: lastMonth.to },
  ];
}

export function formatCaseListDateRangeLabel(from: string, to: string): string {
  if (!from && !to) return "";
  if (from && to && from === to) return from;
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  return `Until ${to}`;
}
