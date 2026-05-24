import { useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BsDateInput } from "@/components/bs-date-input";
import {
  formatCaseListDateRangeLabel,
  getCaseListDatePresets,
} from "@/lib/case-list-date-presets";

type CaseListDateFilterDialogProps = {
  dateFrom: string;
  dateTo: string;
  onApply: (from: string, to: string) => void;
  onClear: () => void;
};

export function CaseListDateFilterDialog({
  dateFrom,
  dateTo,
  onApply,
  onClear,
}: CaseListDateFilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);

  const hasActiveFilter = Boolean(dateFrom || dateTo);
  const draftInvalid = Boolean(draftFrom && draftTo && draftFrom > draftTo);
  const presets = getCaseListDatePresets();

  useEffect(() => {
    if (!open) return;
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
  }, [open, dateFrom, dateTo]);

  const applyRange = (from: string, to: string) => {
    onApply(from, to);
    setOpen(false);
  };

  const activeLabel = formatCaseListDateRangeLabel(dateFrom, dateTo);

  return (
    <>
      <Button
        type="button"
        variant={hasActiveFilter ? "secondary" : "outline"}
        size="sm"
        className="h-9 gap-1.5 shrink-0"
        data-testid="button-case-date-filter"
        onClick={() => setOpen(true)}
        title={activeLabel || "Filter by case date (BS)"}
      >
        <CalendarRange className="w-3.5 h-3.5" />
        <span>Date</span>
        {hasActiveFilter ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal max-w-[8rem] truncate">
            {activeLabel}
          </Badge>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[min(90vh,32rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Case date filter</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Bikram Sambat dates on the case registration. Pick a shortcut or set a custom range.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Quick ranges</p>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 justify-start text-xs"
                    data-testid={`case-date-preset-${preset.id}`}
                    onClick={() => applyRange(preset.from, preset.to)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Custom range (BS)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <BsDateInput
                  key={`draft-from-${draftFrom || "empty"}-${open}`}
                  label="From"
                  value={draftFrom}
                  onChange={(bs) => setDraftFrom(bs)}
                  testIdPrefix="case-list-date-from"
                />
                <BsDateInput
                  key={`draft-to-${draftTo || "empty"}-${open}`}
                  label="To"
                  value={draftTo}
                  onChange={(bs) => setDraftTo(bs)}
                  testIdPrefix="case-list-date-to"
                />
              </div>
              {draftInvalid ? (
                <p className="text-xs text-destructive">From date must be on or before the to date.</p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              disabled={!hasActiveFilter && !draftFrom && !draftTo}
            >
              Clear filter
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={draftInvalid}
              data-testid="button-apply-case-date-filter"
              onClick={() => applyRange(draftFrom.trim(), draftTo.trim())}
            >
              Apply range
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
