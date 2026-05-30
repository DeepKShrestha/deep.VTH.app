import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Microscope, UserPlus, CheckCircle, Eye, EyeOff } from "lucide-react";
import { isPasswordPolicyMet, PASSWORD_MIN_LENGTH } from "@shared/schema";
import { PasswordPolicyChecklist } from "@/components/password-policy-checklist";
import { compressProfilePhotoImage } from "@/lib/compress-case-attachment-image";

const DESIGNATIONS = [
  { value: "veterinarian", label: "Veterinarian" },
  { value: "lab_assistant", label: "Lab Assistant" },
  { value: "intern", label: "Intern" },
  { value: "student", label: "Student" },
];

function ordinalBatch(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return `${n}th batch`;
  const s = String(n);
  const lastChar = s.slice(-1);
  const lastTwoChars = s.slice(-2);

  if (lastTwoChars === "11" || lastTwoChars === "12" || lastTwoChars === "13") {
    return `${n}th batch`;
  }

  switch (lastChar) {
    case "1":
      return `${n}st batch`;
    case "2":
      return `${n}nd batch`;
    case "3":
      return `${n}rd batch`;
    default:
      return `${n}th batch`;
  }
}

export default function SignupPage() {
  const { signup } = useAuth();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [studentBatch, setStudentBatch] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const photoObjectUrlRef = useRef<string | null>(null);

  // Admin-curated list of valid batches. We always fetch (cheap, public),
  // but only render the dropdown once the user picks "student". Loading
  // state is separated so we can show a clear "Contact admin" empty
  // state when the list is configured-empty vs. still in-flight — those
  // two need different copy to avoid confusing a new student.
  const [batchOptions, setBatchOptions] = useState<number[]>([]);
  const [batchOptionsLoaded, setBatchOptionsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student-batches")
      .then((r) => (r.ok ? r.json() : { batches: [] }))
      .then((data: { batches?: number[] }) => {
        if (cancelled) return;
        const arr = Array.isArray(data?.batches) ? data.batches : [];
        setBatchOptions(
          arr
            .map((v) => Number(v))
            .filter((v) => Number.isInteger(v) && v > 0)
            .sort((a, b) => a - b),
        );
        setBatchOptionsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setBatchOptionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (profilePhotoFile) {
      if (photoObjectUrlRef.current) {
        URL.revokeObjectURL(photoObjectUrlRef.current);
      }
      const url = URL.createObjectURL(profilePhotoFile);
      photoObjectUrlRef.current = url;
      setPhotoPreviewUrl(url);
    } else {
      if (photoObjectUrlRef.current) {
        URL.revokeObjectURL(photoObjectUrlRef.current);
        photoObjectUrlRef.current = null;
      }
      setPhotoPreviewUrl(null);
    }
    return () => {
      if (photoObjectUrlRef.current) {
        URL.revokeObjectURL(photoObjectUrlRef.current);
        photoObjectUrlRef.current = null;
      }
    };
  }, [profilePhotoFile]);

  const passwordStrength = (() => {
    if (!password) return { label: "Not set", score: 0, color: "bg-muted" };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (score <= 1) return { label: "Weak", score, color: "bg-red-500" };
    if (score <= 2) return { label: "Fair", score, color: "bg-amber-500" };
    if (score === 3) return { label: "Good", score, color: "bg-blue-500" };
    return { label: "Strong", score, color: "bg-emerald-500" };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !address || !phone || !email || !designation || !username || !password) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    if (!isPasswordPolicyMet(password)) {
      toast({
        title: "Password does not meet requirements",
        description: "Check the rules below your password field.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    let normalizedBatch: number | null = null;
    if (designation === "student") {
      normalizedBatch = Number.parseInt(studentBatch.trim(), 10);
      // Client-side validation mirrors the server gate so the user
      // sees the failure before submitting. The server check below is
      // still authoritative (a tampered request is rejected too).
      if (
        !studentBatch.trim() ||
        normalizedBatch == null ||
        !Number.isInteger(normalizedBatch) ||
        !batchOptions.includes(normalizedBatch)
      ) {
        toast({
          title: "Please pick a valid batch from the list.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    let photoForSignup: File | null = profilePhotoFile;
    if (profilePhotoFile) {
      try {
        photoForSignup = await compressProfilePhotoImage(profilePhotoFile);
      } catch (err: unknown) {
        setLoading(false);
        toast({
          title: err instanceof Error ? err.message : "Could not prepare photo",
          variant: "destructive",
        });
        return;
      }
    }
    const result = await signup({
      fullName,
      address,
      phone,
      email,
      designation,
      studentBatch: designation === "student" ? normalizedBatch : null,
      username,
      password,
      profilePhotoFile: photoForSignup,
    });
    setLoading(false);

    if (result.success) {
      setSubmitted(true);
    } else {
      toast({ title: result.message, variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold" data-testid="text-signup-success">Account Created</h2>
          <p className="text-sm text-muted-foreground">
            Your account has been submitted for approval. An administrator will review your request.
            You'll be able to log in once approved.
          </p>
          <Link href="/login">
            <Button variant="outline" className="mt-4" data-testid="button-back-to-login">Back to Login</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Microscope className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold" data-testid="text-signup-title">Create Account</h1>
          <p className="text-sm text-muted-foreground">Join the VTH Management System</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="fullName">Full Name <span className="text-destructive">*</span></Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" data-testid="input-signup-name" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="address">Address <span className="text-destructive">*</span></Label>
                  <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Your address" data-testid="input-signup-address" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 98XXXXXXXX" data-testid="input-signup-phone" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" data-testid="input-signup-email" />
                </div>
                <div className="space-y-1.5">
                  <Label>Designation <span className="text-destructive">*</span></Label>
                  <Select
                    value={designation}
                    onValueChange={(value) => {
                      setDesignation(value);
                      if (value !== "student") setStudentBatch("");
                    }}
                  >
                    <SelectTrigger data-testid="select-signup-designation">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      {DESIGNATIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username <span className="text-destructive">*</span></Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username" data-testid="input-signup-username" />
                </div>
                {designation === "student" && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="studentBatch">Batch <span className="text-destructive">*</span></Label>
                    {batchOptions.length > 0 ? (
                      <Select
                        value={studentBatch}
                        onValueChange={(value) => setStudentBatch(value)}
                      >
                        <SelectTrigger
                          id="studentBatch"
                          data-testid="select-signup-student-batch"
                        >
                          <SelectValue placeholder="Choose your batch" />
                        </SelectTrigger>
                        <SelectContent>
                          {batchOptions.map((b) => (
                            <SelectItem key={b} value={String(b)}>
                              {ordinalBatch(b)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div
                        className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                        data-testid="text-signup-batch-empty"
                      >
                        {batchOptionsLoaded
                          ? "No batches are enabled for student signup yet. Please contact an administrator."
                          : "Loading available batches\u2026"}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                      data-testid="input-signup-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-7 w-7"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    <PasswordPolicyChecklist password={password} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm Password <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      data-testid="input-signup-confirm-password"
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
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="profilePhoto">Identification photo (optional)</Label>
                  <Input
                    key={photoInputKey}
                    id="profilePhoto"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="cursor-pointer"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setProfilePhotoFile(f);
                    }}
                    data-testid="input-signup-profile-photo"
                  />
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, or WebP, up to 5MB each. Larger photos are automatically optimized to under 1MB before upload.
                  </p>
                  {photoPreviewUrl && (
                    <div className="flex items-center gap-3 pt-1">
                      <img
                        src={photoPreviewUrl}
                        alt="Preview"
                        className="h-16 w-16 rounded-md object-cover border border-border"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setProfilePhotoFile(null);
                          setPhotoInputKey((k) => k + 1);
                        }}
                      >
                        Clear photo
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {designation === "student" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2">
                  Student accounts can view cases but cannot register new ones or download data without admin approval.
                </p>
              )}

              <Button type="submit" className="w-full gap-2" disabled={loading} data-testid="button-signup">
                <UserPlus className="w-4 h-4" />
                {loading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline" data-testid="link-login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
