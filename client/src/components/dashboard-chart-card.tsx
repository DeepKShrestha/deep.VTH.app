import { useState, type ReactElement } from "react";
import { Maximize2 } from "lucide-react";
import { ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ChartRenderContext = {
  fullscreen: boolean;
  /** Useful for scaling pie outerRadius, axis label sizes, etc. */
  scale: number;
};

export type DashboardChartChildren =
  | ReactElement
  | ((ctx: ChartRenderContext) => ReactElement);

type DashboardChartCardProps = {
  title: string;
  children: DashboardChartChildren;
  height?: number;
  empty?: boolean;
  emptyMessage?: string;
  hint?: string;
  className?: string;
};

function renderChartChild(
  children: DashboardChartChildren,
  ctx: ChartRenderContext,
): ReactElement {
  return typeof children === "function" ? children(ctx) : children;
}

export function DashboardChartCard({
  title,
  children,
  height = 260,
  empty = false,
  emptyMessage = "No data for the current filters.",
  hint,
  className,
}: DashboardChartCardProps) {
  const [open, setOpen] = useState(false);
  const inlineCtx: ChartRenderContext = { fullscreen: false, scale: 1 };
  const fullCtx: ChartRenderContext = { fullscreen: true, scale: 1.55 };

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              {hint ? (
                <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
              ) : null}
            </div>
            {!empty && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setOpen(true)}
                aria-label={`View ${title} in full screen`}
                title="Full screen"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent style={{ height }}>
          {empty ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {renderChartChild(children, inlineCtx)}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "flex flex-col gap-3 p-3 sm:p-4 overflow-hidden",
            "w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)]",
            "h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)]",
          )}
        >
          <DialogHeader className="shrink-0 pr-8 text-left">
            <DialogTitle>{title}</DialogTitle>
            {hint ? (
              <p className="text-sm text-muted-foreground">{hint}</p>
            ) : null}
          </DialogHeader>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {renderChartChild(children, fullCtx)}
            </ResponsiveContainer>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
