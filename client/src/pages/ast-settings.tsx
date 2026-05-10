import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Settings2, SlidersHorizontal, ListChecks } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  getAstToggleDefaults,
  setAstToggleDefaults,
  type AstToggleDefaults,
} from "@/lib/module-toggle-defaults";

export default function AstSettingsPage() {
  const { canManageAstAdmin } = useAuth();
  const [toggleOpen, setToggleOpen] = useState(false);
  const togglePanelRef = useRef<HTMLDivElement | null>(null);
  const [toggleDefaults, setToggleDefaults] = useState<AstToggleDefaults>(
    getAstToggleDefaults(),
  );

  useEffect(() => {
    setAstToggleDefaults(toggleDefaults);
  }, [toggleDefaults]);
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!togglePanelRef.current) return;
      if (!togglePanelRef.current.contains(event.target as Node)) {
        setToggleOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="rounded-2xl border bg-card px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-center gap-3">
          <Link href="/ast-report">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">AST Settings</h1>
            <p className="text-sm text-muted-foreground">Manage AST form, toggles, and breakpoint settings.</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Default Toggle Behavior</h2>
        <Collapsible open={toggleOpen} onOpenChange={setToggleOpen}>
          <Card
            ref={togglePanelRef}
            className="border-border/80 shadow-sm cursor-pointer"
            onClick={() => setToggleOpen(true)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-primary shrink-0" />
                Register Form Toggle Defaults
              </CardTitle>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Quick register mode (default ON/OFF)</span>
              <Switch
                checked={toggleDefaults.quickRegisterMode}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({ ...prev, quickRegisterMode: checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Hide optional fields by default</span>
              <Switch
                checked={toggleDefaults.hideOptionalFields}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({ ...prev, hideOptionalFields: checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Use preset antibiotics by default</span>
              <Switch
                checked={toggleDefaults.usePresetAntibiotics}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({ ...prev, usePresetAntibiotics: checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Auto-interpretation mode by default</span>
              <Switch
                checked={toggleDefaults.autoMode}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({ ...prev, autoMode: checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Compact print mode by default</span>
              <Switch
                checked={toggleDefaults.compactPrintMode}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({ ...prev, compactPrintMode: checked }))
                }
              />
            </label>
            <p className="text-xs text-muted-foreground">
              These defaults apply to AST case registration and print preview.
            </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Form Settings</h2>
        <div className="grid gap-3 sm:grid-cols-2">

        {canManageAstAdmin && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary shrink-0" />
                Edit Register Form
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Configure field visibility, requirement status, form behavior, and species/breed catalogs (third tab in the editor).
              </p>
              <Link href="/ast-report/form-editor" className="mt-auto">
                <Button className="w-full bg-slate-700 hover:bg-slate-800 text-white">
                  Open Register Form Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canManageAstAdmin && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary shrink-0" />
                Breakpoints
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Manage antibiotic breakpoint references used in AST reports.
              </p>
              <Link href="/breakpoints" className="mt-auto">
                <Button className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
                  Open Breakpoints
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
