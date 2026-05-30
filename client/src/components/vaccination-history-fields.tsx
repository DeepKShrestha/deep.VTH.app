import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BsDateInput } from "@/components/bs-date-input";
import {
  VACCINATION_STATUS_OPTIONS,
  type VaccinationFieldDef,
  type VaccinationFormState,
} from "@shared/hospital-vaccination-history";

type VaccinationHistoryFieldsProps = {
  fields: VaccinationFieldDef[];
  state: VaccinationFormState;
  onChange: (next: VaccinationFormState) => void;
  isRequired: (statusKey: string) => boolean;
  isEnabled: (statusKey: string) => boolean;
};

export function VaccinationHistoryFields({
  fields,
  state,
  onChange,
  isRequired,
  isEnabled,
}: VaccinationHistoryFieldsProps) {
  const visible = fields.filter((f) => isEnabled(f.statusKey));
  if (visible.length === 0) return null;

  const patchStatus = (field: VaccinationFieldDef, status: string) => {
    const next: VaccinationFormState = { ...state, [field.statusKey]: status };
    if (status !== "Yes") {
      next[field.dateBsKey] = "";
      next[field.dateAdKey] = "";
    }
    onChange(next);
  };

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      data-testid="vaccination-history-fields"
    >
      {visible.map((field) => {
        const status = state[field.statusKey] ?? "";
        const required = isRequired(field.statusKey);
        return (
          <div
            key={field.statusKey}
            className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-2.5"
            data-testid={`vaccination-field-${field.statusKey}`}
          >
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {field.label}{" "}
                {required && <span className="text-destructive">*</span>}
              </Label>
              <Select
                value={status}
                onValueChange={(v) => patchStatus(field, v)}
              >
                <SelectTrigger
                  className="h-9 bg-background"
                  data-testid={`select-${field.statusKey}`}
                >
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {VACCINATION_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {status === "Yes" ? (
              <div className="pt-0.5 border-t border-border/60">
                <BsDateInput
                  value={state[field.dateBsKey] ?? ""}
                  onChange={(bs, ad) => {
                    onChange({
                      ...state,
                      [field.dateBsKey]: bs,
                      [field.dateAdKey]: ad,
                    });
                  }}
                  label="Last vaccination date"
                  required={false}
                  testIdPrefix={`${field.statusKey}-last`}
                />
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  Optional — leave blank if the date is unknown.
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Compact read-only grid for case view and print. */
export function VaccinationHistorySummary({
  rows,
  className = "",
}: {
  rows: Array<{
    vaccineLabel: string;
    status: string;
    lastDateDisplay: string | null;
  }>;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${className}`}
      data-testid="vaccination-history-summary"
    >
      {rows.map((row) => (
        <div
          key={row.vaccineLabel}
          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded border border-border/70 bg-muted/25 px-2.5 py-1.5 text-xs leading-snug"
        >
          <span className="font-semibold text-foreground">{row.vaccineLabel}:</span>
          <span>{row.status}</span>
          {row.lastDateDisplay ? (
            <span className="text-muted-foreground w-full sm:w-auto">
              · {row.lastDateDisplay}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
