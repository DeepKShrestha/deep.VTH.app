import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Lock,
  ShieldAlert,
  User as UserIcon,
} from "lucide-react";
import {
  type ConfirmLogoutPreference,
  INACTIVITY_TIMEOUT_LABELS,
  type InactivityTimeoutOption,
} from "../lib/auth";
import { Eye, EyeOff } from "lucide-react";

const LAST_PROFILE_UPDATE_AT_KEY = "profile_last_update_at";
const LAST_PASSWORD_CHANGE_AT_KEY = "profile_last_password_change_at";
const LAST_LOGIN_AT_KEY = "auth_last_login_at";

function formatDateTime(value?: string | null): string {
  if (!value) return "Not available yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available yet";
  return parsed.toLocaleString();
}

export default function ProfilePage() {
  const {
    user,
    isSuperAdmin,
    isAdmin,
    updateCurrentUser,
    canRegisterHospitalCase,
    canViewHospitalCases,
    canRegisterAstCase,
    canViewAstCases,
    canDownloadAst,
    canManageAstAdmin,
    inactivityTimeout,
    setInactivityTimeout,
    confirmBeforeLogout,
    setConfirmBeforeLogout,
  } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [designation, setDesignation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [resetReason, setResetReason] = useState("");
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [isLogoutAllSubmitting, setIsLogoutAllSubmitting] = useState(false);
  const [lastProfileUpdateAt, setLastProfileUpdateAt] = useState<string | null>(
    localStorage.getItem(LAST_PROFILE_UPDATE_AT_KEY),
  );
  const [lastPasswordChangeAt, setLastPasswordChangeAt] = useState<string | null>(
    localStorage.getItem(LAST_PASSWORD_CHANGE_AT_KEY),
  );
  const [lastLoginAt] = useState<string | null>(localStorage.getItem(LAST_LOGIN_AT_KEY));

  const roleBadgeClass = useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    if (role === "superadmin") return "bg-red-100 text-red-800 border-red-200";
    if (role === "admin") return "bg-purple-100 text-purple-800 border-purple-200";
    if (role === "staff") return "bg-blue-100 text-blue-800 border-blue-200";
    if (role === "intern") return "bg-cyan-100 text-cyan-800 border-cyan-200";
    if (role === "student") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-muted text-muted-foreground border-border";
  }, [user?.role]);

  const capabilityItems = [
    { label: "Register VTH cases", allowed: canRegisterHospitalCase },
    { label: "View VTH case history", allowed: canViewHospitalCases },
    { label: "Register AST cases", allowed: canRegisterAstCase },
    { label: "View AST case history", allowed: canViewAstCases },
    { label: "Download AST reports", allowed: canDownloadAst },
    { label: "Access AST admin settings", allowed: canManageAstAdmin },
  ];

  const passwordStrength = (() => {
    const p = newPassword;
    if (!p) return { label: "Not set", score: 0, color: "bg-muted" };
    let score = 0;
    if (p.length >= 8) score += 1;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score += 1;
    if (/\d/.test(p)) score += 1;
    if (/[^A-Za-z0-9]/.test(p)) score += 1;
    if (score <= 1) return { label: "Weak", score, color: "bg-red-500" };
    if (score <= 2) return { label: "Fair", score, color: "bg-amber-500" };
    if (score === 3) return { label: "Good", score, color: "bg-blue-500" };
    return { label: "Strong", score, color: "bg-emerald-500" };
  })();

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName || "");
    setAddress(user.address || "");
    setPhone(user.phone || "");
    setEmail(user.email || "");
    setUsername(user.username || "");
    setDesignation(user.designation || "");
  }, [user]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timeout = window.setTimeout(() => setSaveState("idle"), 2500);
    return () => window.clearTimeout(timeout);
  }, [saveState]);

  if (!user) {
    navigate("/login");
    return null;
  }

  const passwordLengthError =
    newPassword.length > 0 && newPassword.length < 6
      ? "Password must be at least 6 characters"
      : "";
  const passwordMismatchError =
    confirmPassword.length > 0 && newPassword !== confirmPassword
      ? "Passwords do not match"
      : "";
  const passwordSectionHasError = Boolean(passwordLengthError || passwordMismatchError);
  const isPasswordChangeRequested = Boolean(
    currentPassword || newPassword || confirmPassword,
  );

  const initialProfileState = {
    fullName: user.fullName || "",
    address: user.address || "",
    phone: user.phone || "",
    email: user.email || "",
    username: user.username || "",
    designation: user.designation || "",
  };
  const hasProfileChanges =
    fullName.trim() !== initialProfileState.fullName ||
    address.trim() !== initialProfileState.address ||
    phone.trim() !== initialProfileState.phone ||
    (isSuperAdmin && email.trim() !== initialProfileState.email) ||
    (isSuperAdmin && username.trim() !== initialProfileState.username) ||
    (isSuperAdmin && designation.trim() !== initialProfileState.designation);
  const hasUnsavedChanges =
    hasProfileChanges ||
    isPasswordChangeRequested ||
    passwordSectionHasError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!fullName.trim() || !address.trim() || !phone.trim()) {
      toast({
        title: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    if (isSuperAdmin && (!email.trim() || !username.trim() || !designation.trim())) {
      toast({
        title: "Please fill in all superadmin fields",
        variant: "destructive",
      });
      return;
    }

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        toast({
          title: "Enter your current password to change it",
          variant: "destructive",
        });
        return;
      }
      if (newPassword.length < 6) {
        toast({
          title: "New password must be at least 6 characters",
          variant: "destructive",
        });
        return;
      }
      if (newPassword !== confirmPassword) {
        toast({
          title: "New passwords do not match",
          variant: "destructive",
        });
        return;
      }
    }

    const payload: {
      fullName: string;
      address: string;
      phone: string;
      email?: string;
      username?: string;
      designation?: string;
      currentPassword?: string;
      newPassword?: string;
    } = {
      fullName: fullName.trim(),
      address: address.trim(),
      phone: phone.trim(),
    };
    if (isSuperAdmin) {
      payload.email = email.trim();
      payload.username = username.trim();
      payload.designation = designation.trim();
    }

    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }
    try {
      setLoading(true);
      const res = await apiRequest(
        "PATCH",
        "/api/users/me",
        payload
      );
      const body = await res.json();

      // Treat any non-throwing response as success and use res.user if present
      const updatedUser = body?.user ?? body;
      if (updatedUser) {
        updateCurrentUser(updatedUser);
        const nowIso = new Date().toISOString();
        localStorage.setItem(LAST_PROFILE_UPDATE_AT_KEY, nowIso);
        setLastProfileUpdateAt(nowIso);
        if (newPassword) {
          localStorage.setItem(LAST_PASSWORD_CHANGE_AT_KEY, nowIso);
          setLastPasswordChangeAt(nowIso);
        }
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setResetReason("");
        setSaveState("saved");
        toast({ title: "Profile updated" });
      } else {
        toast({
          title: body?.message || "Failed to update profile",
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update profile";
      toast({
        title: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestPasswordReset() {
    if (!newPassword || newPassword.length < 6 || newPassword !== confirmPassword) {
      toast({
        title: "Enter and confirm a valid new password first",
        variant: "destructive",
      });
      return;
    }
    const usernameOrEmail = user?.email || user?.username;
    if (!usernameOrEmail) {
      toast({
        title: "Could not resolve your account identifier",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsResetSubmitting(true);
      await apiRequest("POST", "/api/auth/password-reset-requests", {
        usernameOrEmail,
        newPassword,
        reason: resetReason.trim() || "Requested from profile security panel",
      });
      toast({
        title: "Password reset request submitted",
      });
    } catch (err: unknown) {
      toast({
        title: err instanceof Error ? err.message : "Failed to request reset",
        variant: "destructive",
      });
    } finally {
      setIsResetSubmitting(false);
    }
  }

  async function handleLogoutAllSessions() {
    try {
      setIsLogoutAllSubmitting(true);
      await apiRequest("POST", "/api/auth/logout-all-sessions");
      toast({ title: "Signed out from all sessions" });
      navigate("/login");
    } catch (err: unknown) {
      toast({
        title: err instanceof Error ? err.message : "Failed to sign out other sessions",
        variant: "destructive",
      });
    } finally {
      setIsLogoutAllSubmitting(false);
    }
  }

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const statusLabel = user.approved ? "Active" : "Pending Approval";

  const roleLabel = (user.role || "pending")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());


  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-28">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-profile-title">
            My Profile
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage account details, security, and session preferences.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
              {initials || "U"}
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold">{fullName || user.username}</p>
              <p className="text-sm text-muted-foreground capitalize">
                {user.designation?.replaceAll("_", " ") || "No designation"}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={roleBadgeClass}>
                  {roleLabel}
                </Badge>
                <Badge variant={user.approved ? "default" : "secondary"}>{statusLabel}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <form id="profile-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserIcon className="w-4 h-4" />
                Account Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">
                  Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Your address"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 98XXXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  {!isSuperAdmin && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled={!isSuperAdmin}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="username">Username</Label>
                  {!isSuperAdmin && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <Input
                  id="username"
                  value={username}
                  disabled={!isSuperAdmin}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="designation">Designation</Label>
                  {!isSuperAdmin && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <Input
                  id="designation"
                  value={designation}
                  disabled={!isSuperAdmin}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="Designation"
                />
              </div>
              {!isSuperAdmin && (
                <p className="text-xs text-muted-foreground">
                  <Lock className="w-3.5 h-3.5 inline mr-1" />
                  Only superadmin can edit username/email.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Role & Permissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-2.5">
                <p className="text-sm text-muted-foreground">Current role</p>
                <Badge variant="outline" className={roleBadgeClass}>
                  {roleLabel}
                </Badge>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">What you can do</p>
                <div className="space-y-1.5">
                  {capabilityItems.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded border px-2.5 py-1.5 text-sm"
                    >
                      <span>{item.label}</span>
                      <span
                        className={
                          item.allowed
                            ? "text-emerald-700 font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {item.allowed ? "Allowed" : "Not allowed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="password">
                  <AccordionTrigger className="text-sm py-2">
                    Change Password
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={() => setShowCurrentPassword((v) => !v)}
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="newPassword">New Password</Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={() => setShowNewPassword((v) => !v)}
                        >
                          {showNewPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                          <div
                            className={`h-full ${passwordStrength.color}`}
                            style={{
                              width: `${Math.max(5, (passwordStrength.score / 4) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Password strength: {passwordStrength.label}
                        </p>
                        {passwordLengthError && (
                          <p className="text-xs text-destructive">{passwordLengthError}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat new password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      {passwordMismatchError && (
                        <p className="text-xs text-destructive">{passwordMismatchError}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="resetReason">Reset request note (optional)</Label>
                      <Input
                        id="resetReason"
                        value={resetReason}
                        onChange={(e) => setResetReason(e.target.value)}
                        placeholder="Reason for admin-reviewed password reset request"
                      />
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="outline" className="w-full">
                          Request Password Reset (Admin Approval)
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Submit password reset request?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This sends your new password request for admin approval. Use this only
                            if you cannot change the password directly.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleRequestPasswordReset}
                            disabled={isResetSubmitting}
                          >
                            {isResetSubmitting ? "Submitting..." : "Submit request"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="pt-2 border-t space-y-2">
                <p className="text-sm font-medium">Sensitive actions</p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full">
                      <ShieldAlert className="w-4 h-4 mr-1.5" />
                      Logout All Sessions
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Logout from all devices?</AlertDialogTitle>
                      <AlertDialogDescription>
                        All active sessions will be removed and you will need to login again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleLogoutAllSessions}
                        disabled={isLogoutAllSubmitting}
                      >
                        {isLogoutAllSubmitting ? "Signing out..." : "Logout all sessions"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Session Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="inactivity-timeout"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Inactivity timeout
                </Label>
                <Select
                  value={inactivityTimeout}
                  onValueChange={(value) =>
                    setInactivityTimeout(value as InactivityTimeoutOption)
                  }
                >
                  <SelectTrigger id="inactivity-timeout" className="h-9">
                    <SelectValue placeholder="Auto logout time" />
                  </SelectTrigger>
                  <SelectContent>
                    {(["1m", "3m", "5m", "10m", "30m"] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {INACTIVITY_TIMEOUT_LABELS[value]}
                      </SelectItem>
                    ))}
                    {isAdmin && (
                      <SelectItem value="never">{INACTIVITY_TIMEOUT_LABELS.never}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Automatically logs out when inactive. "Never" is available only for admins.
                </p>
              </div>
              <div className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Confirm before logout</p>
                  <p className="text-xs text-muted-foreground">
                    Adds a confirmation prompt before ending your current session.
                  </p>
                </div>
                <Switch
                  checked={confirmBeforeLogout === "always"}
                  onCheckedChange={(checked) =>
                    setConfirmBeforeLogout((checked ? "always" : "never") as ConfirmLogoutPreference)
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Account Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm border rounded p-2.5">
              <span className="text-muted-foreground">Last profile update</span>
              <span>{formatDateTime(lastProfileUpdateAt)}</span>
            </div>
            <div className="flex items-center justify-between text-sm border rounded p-2.5">
              <span className="text-muted-foreground">Last password change</span>
              <span>{formatDateTime(lastPasswordChangeAt)}</span>
            </div>
            <div className="flex items-center justify-between text-sm border rounded p-2.5">
              <span className="text-muted-foreground">Last login</span>
              <span>{formatDateTime(lastLoginAt || user.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      </form>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="text-sm flex items-center gap-1.5">
            {saveState === "saved" ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Changes saved</span>
              </>
            ) : hasUnsavedChanges ? (
              <>
                <Circle className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span className="text-amber-700">You have unsaved changes</span>
              </>
            ) : (
              <span className="text-muted-foreground">No pending changes</span>
            )}
          </div>
          <Button
            form="profile-form"
            type="submit"
            className="w-full sm:w-auto"
            disabled={loading || passwordSectionHasError}
          >
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
