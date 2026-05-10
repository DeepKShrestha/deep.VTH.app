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
  type HospitalToggleDefaults,
} from "@/lib/module-toggle-defaults";

export default function HospitalSettingsPage() {
  const { canManageAstAdmin } = useAuth();
  const [toggleOpen, setToggleOpen] = useState(false);
  const togglePanelRef = useRef<HTMLDivElement | null>(null);
  const [toggleDefaults, setToggleDefaults] = useState<HospitalToggleDefaults>(
    getHospitalToggleDefaults(),
  );

  useEffect(() => {
    setHospitalToggleDefaults(toggleDefaults);
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Form Settings</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
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
                  <Button className="w-full bg-slate-700 hover:bg-slate-800 text-white">
                    Open Register Form Settings
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
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
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                    Open Treatment Settings
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
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
                  <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white">
                    Open Veterinarians
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
