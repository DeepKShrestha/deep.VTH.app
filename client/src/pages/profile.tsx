import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { ArrowLeft, User as UserIcon } from "lucide-react";

export default function ProfilePage() {
  const { user, setUser } = useAuth() as any;
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName || "");
    setAddress(user.address || "");
    setPhone(user.phone || "");
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

    const payload: any = {
      fullName: fullName.trim(),
      address: address.trim(),
      phone: phone.trim(),
    };

    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }
              try {
      setLoading(true);
      const res = await apiRequest<"PATCH", any>(
        "PATCH",
        "api/users/me",
        payload
      );

      // Treat any non-throwing response as success and use res.user if present
      const updatedUser = (res as any)?.user ?? res;
      if (updatedUser) {
        setUser?.(updatedUser);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast({ title: "Profile updated" });
      } else {
        toast({
          title: (res as any)?.message || "Failed to update profile",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: err?.message || "Failed to update profile",
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

            <div className="pt-4 border-t border-border space-y-3">
              <p className="text-sm font-medium">Change password (optional)</p>

              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                You cannot change your username, email, or designation here.
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
