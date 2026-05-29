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
  hydrateToggleDefaultsFromServer,
  type AstToggleDefaults,
} from "@/lib/module-toggle-defaults";
import { getAuthToken } from "@/lib/auth";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { StickyScrollPage } from "@/components/sticky-scroll-page";

export default function AstSettingsPage() {
  const { canManageAstAdmin } = useAuth();
  const [toggleOpen, setToggleOpen] = useState(false);
  const togglePanelRef = useRef<HTMLDivElement | null>(null);
  const skipFirstPrefsSavedBanner = useRef(true);
  const [prefsSavedBanner, setPrefsSavedBanner] = useState(false);
  const [toggleDefaults, setToggleDefaults] = useState<AstToggleDefaults>(
    getAstToggleDefaults(),
  );

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch("/api/users/me/preferences", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const p = (await res.json()) as {
          astToggleDefaults: Record<string, unknown> | null;
          hospitalToggleDefaults: Record<string, unknown> | null;
        };
        hydrateToggleDefaultsFromServer({
          astToggleDefaults: p.astToggleDefaults,
          hospitalToggleDefaults: p.hospitalToggleDefaults,
        });
        setToggleDefaults(getAstToggleDefaults());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    setAstToggleDefaults(toggleDefaults);
    const token = getAuthToken();
    if (!token) return;
    const tmr = window.setTimeout(() => {
      void fetch("/api/users/me/preferences", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ astToggleDefaults: toggleDefaults }),
      })
        .then((res) => {
          if (!res.ok) return;
          if (skipFirstPrefsSavedBanner.current) {
            skipFirstPrefsSavedBanner.current = false;
            return;
          }
          setPrefsSavedBanner(true);
          window.setTimeout(() => setPrefsSavedBanner(false), 2200);
        })
        .catch(() => {});
    }, 700);
    return () => window.clearTimeout(tmr);
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
    <StickyScrollPage
      maxWidthClass="max-w-5xl"
      contentPaddingClass="py-8"
      bodyClassName="space-y-6"
      sticky={
        <div className="space-y-1">
          <PageBreadcrumbs
            items={[
              { label: "AST module", href: "/ast-report" },
              { label: "Settings" },
            ]}
          />
          <div className="mt-2 flex items-center gap-3">
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
      }
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Default toggle behavior</h2>
          {prefsSavedBanner && (
            <span className="text-xs font-medium text-primary" role="status">
              Defaults saved
            </span>
          )}
        </div>
        <Collapsible open={toggleOpen} onOpenChange={setToggleOpen}>
          <Card
            ref={togglePanelRef}
            tabIndex={0}
            className="border-border/80 shadow-sm cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
        <h2 className="text-sm font-medium text-muted-foreground">Form settings</h2>
        <div className="grid gap-3 sm:grid-cols-2">

        {canManageAstAdmin && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
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
                <Button className="w-full">
                  Open Register Form Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canManageAstAdmin && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
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
                <Button className="w-full">
                  Open Breakpoints
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </StickyScrollPage>
  );
}
