import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Settings2, ListChecks, Pill, Stethoscope } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  getHospitalToggleDefaults,
  setHospitalToggleDefaults,
  hydrateToggleDefaultsFromServer,
  type HospitalToggleDefaults,
} from "@/lib/module-toggle-defaults";
import { getAuthToken } from "@/lib/auth";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { StickyScrollPage } from "@/components/sticky-scroll-page";

export default function HospitalSettingsPage() {
  const { canManageAstAdmin } = useAuth();
  const [toggleOpen, setToggleOpen] = useState(false);
  const togglePanelRef = useRef<HTMLDivElement | null>(null);
  const skipFirstPrefsSavedBanner = useRef(true);
  const [prefsSavedBanner, setPrefsSavedBanner] = useState(false);
  const [toggleDefaults, setToggleDefaults] = useState<HospitalToggleDefaults>(
    getHospitalToggleDefaults(),
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
        setToggleDefaults(getHospitalToggleDefaults());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    setHospitalToggleDefaults(toggleDefaults);
    const token = getAuthToken();
    if (!token) return;
    const tmr = window.setTimeout(() => {
      void fetch("/api/users/me/preferences", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hospitalToggleDefaults: toggleDefaults }),
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
              { label: "Hospital", href: "/new-case" },
              { label: "Settings" },
            ]}
          />
          <div className="mt-2 flex items-center gap-3">
            <Link href="/new-case">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Hospital Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage hospital form, catalogs, and register-form toggle defaults.
              </p>
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
              <span>History uses bullet points by default</span>
              <Switch
                checked={toggleDefaults.historyNotesBulletPoints}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({ ...prev, historyNotesBulletPoints: checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Previous medication uses bullet points by default</span>
              <Switch
                checked={toggleDefaults.previousMedicationNotesBulletPoints}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({
                    ...prev,
                    previousMedicationNotesBulletPoints: checked,
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Clinical signs use bullet points by default</span>
              <Switch
                checked={toggleDefaults.clinicalSignsSymptomsNotesBulletPoints}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({
                    ...prev,
                    clinicalSignsSymptomsNotesBulletPoints: checked,
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Chief complaint uses bullet points by default</span>
              <Switch
                checked={toggleDefaults.chiefComplaintBulletPoints}
                onCheckedChange={(checked) =>
                  setToggleDefaults((prev) => ({ ...prev, chiefComplaintBulletPoints: checked }))
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
              These defaults apply to hospital registration and print preview.
            </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      {canManageAstAdmin && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Form settings</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary shrink-0" />
                  Edit Register Form
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Control field visibility, requirements, built-in questions, and species/breed catalogs (third tab in the editor).
                </p>
                <Link href="/new-case/form-editor" className="mt-auto">
                  <Button className="w-full">
                    Open Register Form Settings
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pill className="w-4 h-4 text-primary shrink-0" />
                  Treatment Master Data
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Manage medications, administration routes, frequency options, and duration/day options.
                </p>
                <Link href="/new-case/settings/treatment" className="mt-auto">
                  <Button className="w-full">
                    Open Treatment Settings
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary shrink-0" />
                  Veterinarians
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Add or remove attending veterinarians (name, NVC registration no., department) for case registration.
                </p>
                <Link href="/new-case/settings/veterinarians" className="mt-auto">
                  <Button className="w-full">
                    Open Veterinarians
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </StickyScrollPage>
  );
}
