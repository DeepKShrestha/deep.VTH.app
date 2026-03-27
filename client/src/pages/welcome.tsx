import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { ClipboardPlus, FolderSearch, Microscope, Settings, Shield, Download, LogOut, User } from "lucide-react";

function designationLabel(d: string) {
  const map: Record<string, string> = {
    veterinarian: "Veterinarian",
    lab_assistant: "Lab Assistant",
    intern: "Intern",
    student: "Student",
  };
  return map[d] || d;
}

export default function Welcome() {
  const { user, logout, isAdmin, canRegisterCase } = useAuth();

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-60px)] px-4">
      <div className="w-full max-w-lg text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Microscope className="w-8 h-8 text-primary" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-title">
            AST Report System
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Veterinary Teaching Hospital — Antibiotic Sensitivity Test Report Management
          </p>
        </div>

        {/* User info */}
        {user && (
          <div className="flex items-center justify-center gap-2 text-sm">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{user.fullName}</span>
            <Badge variant="outline" className="text-xs">{designationLabel(user.designation)}</Badge>
            <Badge className={`border-0 text-xs ${
              user.role === "superadmin"
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                : user.role === "admin"
                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                : user.role === "staff"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            }`}>
              {user.role === "superadmin" ? "Super Admin" : user.role}
            </Badge>
          </div>
        )}

        {/* Main Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {canRegisterCase && (
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto gap-2 px-8" data-testid="button-register-case">
                <ClipboardPlus className="w-4 h-4" />
                Register New Case
              </Button>
            </Link>
          )}
          <Link href="/cases">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto gap-2 px-8" data-testid="button-view-cases">
              <FolderSearch className="w-4 h-4" />
              View Previous Cases
            </Button>
          </Link>
        </div>

        {/* Secondary actions */}
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/export">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" data-testid="button-export">
              <Download className="w-3.5 h-3.5" />
              Export Data
            </Button>
          </Link>
          {isAdmin && (
            <>
              <Link href="/breakpoints">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" data-testid="button-breakpoints">
                  <Settings className="w-3.5 h-3.5" />
                  Breakpoints
                </Button>
              </Link>
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" data-testid="button-admin">
                  <Shield className="w-3.5 h-3.5" />
                  Admin Panel
                </Button>
              </Link>
            </>
          )}
            <Link href="/profile">
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      data-testid="button-profile"
    >
      <User className="w-3.5 h-3.5" />
      Profile
    </Button>
  </Link>
          <Button variant="ghost" size="sm" className="gap-1.5 text-red-500 hover:text-red-700" onClick={logout} data-testid="button-logout">
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
