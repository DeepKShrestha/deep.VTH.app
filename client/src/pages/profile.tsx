import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ArrowLeft, User as UserIcon } from "lucide-react";
import {
  type ConfirmLogoutPreference,
  INACTIVITY_TIMEOUT_LABELS,
  type InactivityTimeoutOption,
} from "../lib/auth";
import { Eye, EyeOff } from "lucide-react";

export default function ProfilePage() {
  const {
    user,
    isSuperAdmin,
    isAdmin,
    updateCurrentUser,
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

  if (!user) {
    navigate("/login");
    return null;
  }

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
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast({ title: "Profile updated" });
        navigate("/");
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


  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
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
            Update your personal information and password.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="w-4 h-4" />
            Account details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
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

            {isSuperAdmin && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="superadmin@email.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="username">
                    Username <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="designation">
                    Designation <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="designation"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. veterinarian"
                  />
                </div>
              </>
            )}

            <div className="pt-4 border-t border-border space-y-3">
              <p className="text-sm font-medium">Change password (optional)</p>

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
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full ${passwordStrength.color}`}
                      style={{ width: `${Math.max(5, (passwordStrength.score / 4) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Password strength: {passwordStrength.label}
                  </p>
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
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {!isSuperAdmin && (
                <p className="text-xs text-muted-foreground">
                  Only superadmin can edit username, email, and designation here.
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-border space-y-2">
              <Label
                htmlFor="inactivity-timeout"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Session timeout
              </Label>
              <Select
                value={inactivityTimeout}
                onValueChange={(value) =>
                  setInactivityTimeout(value as InactivityTimeoutOption)
                }
              >
                <SelectTrigger id="inactivity-timeout" className="h-8 text-xs">
                  <SelectValue placeholder="Auto logout time" />
                </SelectTrigger>
                <SelectContent>
                  {(["1m", "3m", "5m", "10m", "30m"] as const).map((value) => (
                    <SelectItem key={value} value={value} className="text-xs">
                      {INACTIVITY_TIMEOUT_LABELS[value]}
                    </SelectItem>
                  ))}
                  {isAdmin && (
                    <SelectItem value="never" className="text-xs">
                      {INACTIVITY_TIMEOUT_LABELS.never}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Automatically logs out when inactive. "Never" is available only
                to admins.
              </p>
            </div>

            <div className="pt-4 border-t border-border space-y-2">
              <Label
                htmlFor="confirm-logout"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Logout confirmation
              </Label>
              <Select
                value={confirmBeforeLogout}
                onValueChange={(value) =>
                  setConfirmBeforeLogout(value as ConfirmLogoutPreference)
                }
              >
                <SelectTrigger id="confirm-logout" className="h-8 text-xs">
                  <SelectValue placeholder="Logout confirmation setting" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never" className="text-xs">
                    Do not ask
                  </SelectItem>
                  <SelectItem value="always" className="text-xs">
                    Ask before logout
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                If enabled, clicking Logout asks for confirmation first.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" className="gap-2" disabled={loading}>
                {loading ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
