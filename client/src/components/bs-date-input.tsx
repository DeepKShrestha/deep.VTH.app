import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BS_MONTHS,
  BS_YEAR_MAX,
  BS_YEAR_MIN,
  bsToAd,
  isValidBsDate,
  getDaysInBsMonth,
  formatAdDate,
} from "@/lib/nepali-date";

interface BsDateInputProps {
  value: string; // BS date YYYY-MM-DD
  onChange: (bsDate: string, adDate: string) => void;
  label?: string;
  required?: boolean;
  testIdPrefix?: string;
}

export function BsDateInput({ value, onChange, label = "Date (BS)", required, testIdPrefix = "bs-date" }: BsDateInputProps) {
  // Parse initial value into year/month/day parts
  const initParts = value ? value.split("-") : [];
  const [year, setYear] = useState(initParts[0] || "");
  const [month, setMonth] = useState(initParts[1] ? String(parseInt(initParts[1])) : "");
  const [day, setDay] = useState(initParts[2] ? String(parseInt(initParts[2])) : "");

  // Calculate AD equivalent
  const adEquivalent = useMemo(() => {
    const bsStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (isValidBsDate(bsStr)) {
      return bsToAd(bsStr);
    }
    return "";
  }, [year, month, day]);

  // Days available for selected month
  const maxDays = useMemo(() => {
    if (year && month) {
      return getDaysInBsMonth(parseInt(year), parseInt(month));
    }
    return 32;
  }, [year, month]);

  // Trigger onChange when complete
  useEffect(() => {
    if (year && month && day) {
      const m = month.padStart(2, "0");
      const d = day.padStart(2, "0");
      const bsStr = `${year}-${m}-${d}`;
      if (isValidBsDate(bsStr)) {
        const ad = bsToAd(bsStr);
        onChange(bsStr, ad);
      }
    }
  }, [year, month, day]);

  // Full supported BS range (2070–2090 per calendar library) — not just ±5 around today.
  const yearOptions = useMemo(() => {
    const selectedYear = year ? parseInt(year, 10) : NaN;
    const years: number[] = [];
    for (let y = BS_YEAR_MIN; y <= BS_YEAR_MAX; y++) {
      years.push(y);
    }
    if (
      Number.isFinite(selectedYear) &&
      (selectedYear < BS_YEAR_MIN || selectedYear > BS_YEAR_MAX)
    ) {
      years.push(selectedYear);
      years.sort((a, b) => a - b);
    }
    return years;
  }, [year]);

  // Generate day options
  const dayOptions = useMemo(() => {
    const days: number[] = [];
    for (let d = 1; d <= maxDays; d++) {
      days.push(d);
    }
    return days;
  }, [maxDays]);

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-sm">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      <div className="grid grid-cols-3 gap-2">
        {/* Year */}
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger data-testid={`${testIdPrefix}-year`} className="h-9">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month */}
        <Select value={month} onValueChange={(v) => { setMonth(v); if (day && parseInt(day) > getDaysInBsMonth(parseInt(year || "2082"), parseInt(v))) setDay("1"); }}>
          <SelectTrigger data-testid={`${testIdPrefix}-month`} className="h-9">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {BS_MONTHS.map((name, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Day */}
        <Select value={day} onValueChange={setDay}>
          <SelectTrigger data-testid={`${testIdPrefix}-day`} className="h-9">
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            {dayOptions.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {String(d).padStart(2, "0")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* AD equivalent */}
      {adEquivalent && (
        <p className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-ad-equiv`}>
          AD: {formatAdDate(adEquivalent)}
        </p>
      )}
    </div>
  );
}
