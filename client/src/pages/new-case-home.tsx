import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, ClipboardPlus, FolderSearch, Settings2, Download, BarChart3 } from "lucide-react";

export default function NewCaseHome() {
  const { canManageAstAdmin, canDownload, isStudent, canViewVthDashboard } = useAuth();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="rounded-2xl border bg-card px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">VTH Case Registration</h1>
            <p className="text-sm text-muted-foreground">
              Manage hospital case registration, previous records, and form settings.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardPlus className="w-4 h-4 text-primary shrink-0" />
              Register New Case
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Open the complete hospital case entry form for a new patient.
            </p>
            <Link href="/new-case/register" className="mt-auto">
              <Button className="w-full" data-testid="button-open-new-case-registration">
                Register New Case
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderSearch className="w-4 h-4 text-primary shrink-0" />
              View Case History
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              See all previously saved cases and open detailed records.
            </p>
            <Link href="/new-case/cases" className="mt-auto">
              <Button
                className="w-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300"
                data-testid="button-view-new-case-history"
              >
                View Previous Cases
              </Button>
            </Link>
          </CardContent>
        </Card>

        {(canDownload || isStudent) && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="w-4 h-4 text-primary shrink-0" />
                Export / Download
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Export hospital case registration data and generate downloadable reports.
              </p>
              <Link href="/new-case/export" className="mt-auto">
                <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                  Open Export Tools
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canViewVthDashboard && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary shrink-0" />
                Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                View trends and summary insights from hospital data.
              </p>
              <Link href="/new-case/dashboard" className="mt-auto">
                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                  data-testid="button-open-hospital-dashboard"
                >
                  Open Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canManageAstAdmin && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary shrink-0" />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Manage hospital register-form defaults, layout, and species/breed configuration.
              </p>
              <Link href="/new-case/settings" className="mt-auto">
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-open-hospital-settings"
                >
                  Open Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
