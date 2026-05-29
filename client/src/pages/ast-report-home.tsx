import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { casesListQueryKey, fetchCasesPage } from "@/lib/cases-list-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import {
  ArrowLeft,
  ClipboardPlus,
  FolderSearch,
  Download,
  BarChart3,
  Settings2,
} from "lucide-react";

export default function AstReportHome() {
  const {
    canManageAstAdmin,
    canRegisterAstCase,
    canViewAstCases,
    canExportAst,
    canViewDashboard,
    isStudent,
  } = useAuth();
  const canRegisterAstFromHome = canRegisterAstCase && !isStudent;
  const queryClient = useQueryClient();
  const prefetchCaseHistory = () => {
    void queryClient.prefetchQuery({
      queryKey: casesListQueryKey("ast", "", "", "", "", 1, 20),
      queryFn: () => fetchCasesPage("ast", "", "", "", "", 1, 20),
    });
  };

  return (
    <StickyScrollPage
      maxWidthClass="max-w-5xl"
      contentPaddingClass="py-3 sm:py-5"
      bodyClassName="space-y-3 sm:space-y-4"
      sticky={
        <div className="space-y-1">
          <PageBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "AST module" }]} />
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">AST Report Module</h1>
              <p className="text-sm text-muted-foreground">
                Access AST case registration, history, and downloads.
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
        {canRegisterAstFromHome && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardPlus className="w-4 h-4 text-primary shrink-0" />
                AST Case Registration
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Register a new AST case with culture and sensitivity details.
              </p>
              <Link href="/register" className="mt-auto">
                <Button className="w-full min-h-10 sm:min-h-9">Register AST Case</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canViewAstCases && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderSearch className="w-4 h-4 text-primary shrink-0" />
                View Case History
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Browse previously recorded AST cases and open details.
              </p>
              <Link
                href="/ast-report/cases"
                className="mt-auto"
                onMouseEnter={prefetchCaseHistory}
                onFocus={prefetchCaseHistory}
              >
                <Button variant="outline" className="w-full min-h-10 sm:min-h-9">
                  View Previous Cases
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canExportAst && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="w-4 h-4 text-primary shrink-0" />
                Export / Download
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Export case data and generate downloadable reports.
              </p>
              <Link href="/export" className="mt-auto">
                <Button variant="secondary" className="w-full min-h-10 sm:min-h-9">
                  Open Export Tools
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
                Manage downloads and AST form settings in one place.
              </p>
              <Link href="/ast-report/settings" className="mt-auto">
                <Button variant="secondary" className="w-full min-h-10 sm:min-h-9">
                  Open Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canViewDashboard && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary shrink-0" />
                Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                View trends and summary insights from AST data.
              </p>
              <Link href="/dashboard" className="mt-auto">
                <Button variant="secondary" className="w-full min-h-10 sm:min-h-9">
                  Open Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

      </div>
    </StickyScrollPage>
  );
}
