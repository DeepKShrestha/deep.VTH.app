import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    canDownloadAst,
    canViewDashboard,
    isStudent,
  } = useAuth();
  const canRegisterAstFromHome = canRegisterAstCase && !isStudent;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="rounded-2xl border bg-card px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">AST Report Module</h1>
            <p className="text-sm text-muted-foreground">
              Access AST case registration, history, and downloads.
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
        {canRegisterAstFromHome && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
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
                <Button className="w-full">Register AST Case</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canViewAstCases && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
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
              <Link href="/ast-report/cases" className="mt-auto">
                <Button variant="secondary" className="w-full">
                  View Previous Cases
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {(canDownloadAst || isStudent) && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
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
                <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                  Open Export Tools
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
                Manage downloads and AST form settings in one place.
              </p>
              <Link href="/ast-report/settings" className="mt-auto">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  Open Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {canViewDashboard && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
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
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                  Open Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
