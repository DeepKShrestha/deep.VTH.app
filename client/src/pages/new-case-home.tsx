import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { casesListQueryKey, fetchCasesPage } from "@/lib/cases-list-query";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import { ArrowLeft, ClipboardPlus, FolderSearch, Settings2, Download, BarChart3 } from "lucide-react";

export default function NewCaseHome() {
  const { canManageAstAdmin, canDownload, isStudent, canViewVthDashboard } = useAuth();
  const queryClient = useQueryClient();
  const prefetchCaseHistory = () => {
    void queryClient.prefetchQuery({
      queryKey: casesListQueryKey("hospital", "", "", "", "", 1, 20),
      queryFn: () => fetchCasesPage("hospital", "", "", "", "", 1, 20),
    });
  };

  return (
    <StickyScrollPage
      maxWidthClass="max-w-5xl"
      contentPaddingClass="py-8"
      bodyClassName="space-y-6"
      sticky={
        <div className="space-y-1">
          <PageBreadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Case registration" },
            ]}
          />
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">VTH Case Registration</h1>
              <p className="text-sm text-muted-foreground">
                Manage hospital case registration, previous records, and form settings.
              </p>
            </div>
            <Link href="/">
              <Button variant="outline" className="h-9 gap-2 w-full sm:w-auto shrink-0">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
          </div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
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
              <Button className="w-full min-h-10 sm:min-h-9" data-testid="button-open-new-case-registration">
                Register New Case
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
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
            <Link
              href="/new-case/cases"
              className="mt-auto"
              onMouseEnter={prefetchCaseHistory}
              onFocus={prefetchCaseHistory}
            >
              <Button variant="outline" className="w-full min-h-10 sm:min-h-9" data-testid="button-view-new-case-history">
                View Previous Cases
              </Button>
            </Link>
          </CardContent>
        </Card>

        {(canDownload || isStudent) && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
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
                <Button variant="secondary" className="w-full min-h-10 sm:min-h-9">
                  Open Export Tools
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canViewVthDashboard && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
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
                <Button variant="secondary" className="w-full min-h-10 sm:min-h-9" data-testid="button-open-hospital-dashboard">
                  Open Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canManageAstAdmin && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
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
                <Button variant="secondary" className="w-full min-h-10 sm:min-h-9" data-testid="button-open-hospital-settings">
                  Open Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </StickyScrollPage>
  );
}
