import { useEffect, useState } from "react";
import { Link } from "wouter";
import { INACTIVITY_LOGOUT_FLAG_KEY, useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Microscope, LogIn, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotReason, setForgotReason] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const wasInactiveLogout = sessionStorage.getItem(INACTIVITY_LOGOUT_FLAG_KEY);
    if (wasInactiveLogout === "1") {
      sessionStorage.removeItem(INACTIVITY_LOGOUT_FLAG_KEY);
      toast({ title: "Logged out due to inactivity" });
    }
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail || !password) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setLoading(true);
    const result = await login(usernameOrEmail, password);
    setLoading(false);
    if (!result.success) {
      toast({ title: result.message, variant: "destructive" });
    }
  };

  const submitForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier || !forgotNewPassword) {
      toast({
        title: "Please provide username/email and new password",
        variant: "destructive",
      });
      return;
    }
    setForgotLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/password-reset-requests", {
        usernameOrEmail: forgotIdentifier,
        newPassword: forgotNewPassword,
        reason: forgotReason || null,
      });
      const body = await res.json();
      toast({ title: body?.message || "Password reset request submitted" });
      setForgotIdentifier("");
      setForgotNewPassword("");
      setForgotReason("");
      setShowForgot(false);
    } catch (error: unknown) {
      toast({
        title: error instanceof Error ? error.message : "Failed to submit request",
        variant: "destructive",
      });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Microscope className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold" data-testid="text-login-title">VTH AST Report System</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="usernameOrEmail">Username or Email</Label>
                <Input
                  id="usernameOrEmail"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="Enter your username or email"
                  data-testid="input-login-username"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    data-testid="input-login-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading} data-testid="button-login">
                <LogIn className="w-4 h-4" />
                {loading ? "Signing in..." : "Sign In"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-primary hover:text-primary/80"
                onClick={() => setShowForgot((v) => !v)}
              >
                Forgot password?
              </Button>
            </form>
            {showForgot && (
              <form onSubmit={submitForgotPassword} className="mt-4 space-y-3 border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Submit a reset request. Admin can approve non-admin requests, and
                  superadmin can approve admin requests.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="forgotIdentifier">Username or Email</Label>
                  <Input
                    id="forgotIdentifier"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="Enter your username or email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="forgotNewPassword">New Password</Label>
                  <Input
                    id="forgotNewPassword"
                    type="password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="forgotReason">Reason (optional)</Label>
                  <Input
                    id="forgotReason"
                    value={forgotReason}
                    onChange={(e) => setForgotReason(e.target.value)}
                    placeholder="Why you need reset"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={forgotLoading}>
                  {forgotLoading ? "Submitting..." : "Submit Reset Request"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href="/signup" className="text-primary font-medium hover:underline" data-testid="link-signup">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
