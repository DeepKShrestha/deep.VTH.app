import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Settings2, SlidersHorizontal } from "lucide-react";

export default function AstSettingsPage() {
  const { canManageAstAdmin } = useAuth();

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
            <p className="text-sm text-muted-foreground">Manage AST form and breakpoint settings.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {canManageAstAdmin && (
          <Card className="h-full flex flex-col border-border/80 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary shrink-0" />
                Edit AST Form
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Configure AST form options and download request controls.
              </p>
              <Link href="/ast-report/form-editor" className="mt-auto">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  Open Form Editor
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
                <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                  Open Breakpoints
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
