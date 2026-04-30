import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import {
  ClipboardPlus,
  FileSpreadsheet,
  Microscope,
  LogOut,
  User,
  Shield,
} from "lucide-react";

function designationLabel(d: string) {
  const map: Record<string, string> = {
    veterinarian: "Veterinarian",
    lab_assistant: "Lab Assistant",
    intern: "Intern",
    student: "Student",
  };
  return map[d] || d;
}

function designationBadgeClass(designation: string) {
  if (designation === "student") {
    return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800";
  }
  return "";
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    superadmin: "Super Admin",
    admin: "Admin",
    staff: "Staff",
    intern: "Intern",
  };
  return map[role] || role;
}

function roleBadgeClass(role: string) {
  const map: Record<string, string> = {
    superadmin:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
    admin:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
    staff:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    intern:
      "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800",
  };
  return map[role] || "bg-muted text-muted-foreground";
}

export default function Welcome() {
  const { user, logout, canRegisterHospitalCase, confirmBeforeLogout, isAdmin } = useAuth();
  const handleLogout = () => {
    if (confirmBeforeLogout === "always") {
      const ok = window.confirm("Are you sure you want to log out?");
      if (!ok) return;
    }
    logout();
  };

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{user?.fullName}</span>
            {user && (
              <Badge
                variant="outline"
                className={`text-xs ${designationBadgeClass(user.designation)}`}
              >
                {designationLabel(user.designation)}
              </Badge>
            )}
            {user && user.role !== "student" && (
              <Badge variant="outline" className={`text-xs ${roleBadgeClass(user.role)}`}>
                {roleLabel(user.role)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/profile">
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-profile">
                <User className="w-3.5 h-3.5" />
                Profile
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-red-500 hover:text-red-700"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </Button>
          </div>
        </div>

        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Microscope className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-title">
            Veterinary Teaching Hospital
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Choose one of the core modules to continue.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardPlus className="w-4 h-4 text-primary" />
                VTH Case Registration
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Add patient details, diagnosis, tests, and treatment plan for a new hospital case.
              </p>
              {canRegisterHospitalCase ? (
                <Link href="/new-case" className="mt-auto">
                  <Button className="w-full" data-testid="button-register-case">
                    Open Case Registration
                  </Button>
                </Link>
              ) : (
                <Button className="w-full mt-auto" disabled>
                  Registration permission required
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                AST Report
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Open the AST module with case registration, previous cases, downloads, and related tools.
              </p>
              <Link href="/ast-report" className="mt-auto">
                <Button
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
                  data-testid="button-view-cases"
                >
                  Open AST Reports
                </Button>
              </Link>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="md:col-span-2 flex flex-col">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Admin Panel
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Manage pending approvals, users, password resets, and pending download requests.
                </p>
                <Link href="/admin" className="mt-auto">
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    data-testid="button-admin-panel"
                  >
                    Open Admin Panel
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
