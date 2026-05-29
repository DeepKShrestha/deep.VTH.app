import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveNotificationPrefsToServer, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ClipboardPlus,
  FileSpreadsheet,
  Microscope,
  LogOut,
  User,
  Shield,
  Bell,
  Settings2,
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

function formatTimeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "just now";
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Sound styles + the playback helper now live in
// `components/admin-notification-center.tsx` so the global toaster and this
// Welcome bell UI share the same implementation. Re-import them here so the
// rest of the file (state types, Test button, select options) is unchanged.
import {
  playNotificationSound,
  type NotificationSoundStyle,
} from "@/components/admin-notification-center";

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, logout, canRegisterHospitalCase, confirmBeforeLogout, isAdmin } = useAuth();
  const [enableToastAlerts, setEnableToastAlerts] = useState(true);
  // Default ON. The actual play happens in `<AdminNotificationCenter />` so
  // sounds fire on every page; this Welcome page just controls the prefs UI.
  // Previously this defaulted to OFF and was buried behind a settings cog,
  // so admins reported never hearing notifications.
  const [enableSoundAlerts, setEnableSoundAlerts] = useState(true);
  const [soundStyle, setSoundStyle] = useState<NotificationSoundStyle>("chime");
  const [soundVolume, setSoundVolume] = useState<number>(0.7);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const {
    data: notificationsData,
    isLoading: notificationsLoading,
  } = useQuery<{
    items: Array<{
      key: string;
      type: "pending-approval" | "download-request" | "password-reset";
      title: string;
      message: string;
      href: string;
      createdAt: string;
      isRead: boolean;
    }>;
    unreadCount: number;
  }>({
    queryKey: ["/api/admin/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/notifications");
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    // Previously polled every 5s in the background of every tab. With ~5
    // admin users that's 5 × 17 280 = 86k requests/day for a feature that
    // doesn't need that granularity. Pause polling when the tab is hidden;
    // a focus refetch picks up any backlog when the user returns.
    refetchIntervalInBackground: false,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? false
        : 30000,
  });
  const markNotificationReadMutation = useMutation({
    mutationFn: async (key: string) => {
      await apiRequest("PATCH", "/api/admin/notifications/state", {
        key,
        isRead: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/notifications/mark-read-all", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      toast({ title: "All notifications marked as read" });
    },
  });
  const deleteReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/notifications/delete-read", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      toast({ title: "All read notifications deleted" });
    },
  });
  const notificationItems = notificationsData?.items ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;

  // Read the per-user notification prefs from the localStorage cache that
  // `syncPreferencesFromServer` populates after login. Re-read whenever the
  // hydrate event fires (e.g. user switches devices and the server pushes a
  // fresh copy).
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    const userKey = String(user.id);

    const readFromCache = () => {
      setEnableToastAlerts(
        window.localStorage.getItem(`vth:notifications:toast:${userKey}`) !== "0",
      );
      setEnableSoundAlerts(
        // Treat unset/missing as ON; only explicit "0" disables sound.
        window.localStorage.getItem(`vth:notifications:sound:${userKey}`) !== "0",
      );
      const storedStyle = window.localStorage.getItem(
        `vth:notifications:sound-style:${userKey}`,
      );
      if (
        storedStyle === "chime" ||
        storedStyle === "ding" ||
        storedStyle === "pulse" ||
        storedStyle === "studio-confirm" ||
        storedStyle === "ui-back" ||
        storedStyle === "ui-start" ||
        storedStyle === "ui-start-alt" ||
        storedStyle === "correct-answer" ||
        storedStyle === "notif-real" ||
        storedStyle === "digital-quick"
      ) {
        setSoundStyle(storedStyle);
      } else {
        setSoundStyle("chime");
      }
      const storedVolume = Number(
        window.localStorage.getItem(`vth:notifications:sound-volume:${userKey}`),
      );
      setSoundVolume(
        Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1
          ? storedVolume
          : 0.7,
      );
    };

    readFromCache();
    window.addEventListener("vth:notification-prefs-hydrated", readFromCache);
    return () =>
      window.removeEventListener("vth:notification-prefs-hydrated", readFromCache);
  }, [user?.id]);

  // Write through to the localStorage cache (instant UI on this device) AND
  // to the server (so the prefs follow the user to other devices).
  const isInitialPrefsSyncRef = useRef(true);
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    window.localStorage.setItem(`vth:notifications:toast:${user.id}`, enableToastAlerts ? "1" : "0");
    window.localStorage.setItem(`vth:notifications:sound:${user.id}`, enableSoundAlerts ? "1" : "0");
    window.localStorage.setItem(`vth:notifications:sound-style:${user.id}`, soundStyle);
    window.localStorage.setItem(`vth:notifications:sound-volume:${user.id}`, String(soundVolume));
    if (isInitialPrefsSyncRef.current) {
      isInitialPrefsSyncRef.current = false;
      return;
    }
    saveNotificationPrefsToServer({
      enableToastAlerts,
      enableSoundAlerts,
      soundStyle,
      soundVolume,
    });
  }, [enableToastAlerts, enableSoundAlerts, soundStyle, soundVolume, user?.id]);

  // NOTE: the new-unread diff + sound + toast side-effect used to live here
  // but it only fired while the user was on `/`. It now lives in
  // `<AdminNotificationCenter />` (mounted at the app shell) so admins get
  // alerts on every page. The Welcome page still owns the prefs UI inside
  // the bell dropdown — both share cache via React Query queryKey dedupe.

  const handleOpenNotification = (
    key: string,
    type: "pending-approval" | "download-request" | "password-reset",
    href: string,
  ) => {
    if (!key) return;
    markNotificationReadMutation.mutate(key);
    if (type === "pending-approval") {
      setLocation("/admin?tab=pending");
      return;
    }
    if (type === "download-request") {
      setLocation("/admin?tab=downloads");
      return;
    }
    if (type === "password-reset") {
      setLocation("/admin?tab=password-resets");
      return;
    }
    setLocation(href || "/admin");
  };

  const handleLogout = () => {
    if (confirmBeforeLogout === "always") {
      const ok = window.confirm("Are you sure you want to log out?");
      if (!ok) return;
    }
    logout();
  };

  const userBadges = user ? (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Badge
        variant="outline"
        className={`text-xs ${designationBadgeClass(user.designation)}`}
      >
        {designationLabel(user.designation)}
      </Badge>
      {user.role !== "student" && (
        <Badge variant="outline" className={`text-xs ${roleBadgeClass(user.role)}`}>
          {roleLabel(user.role)}
        </Badge>
      )}
    </div>
  ) : null;

  const welcomeHero = (
    // Internal hero spacing: a touch more breathing room between the icon
    // and the title at `sm+` so the icon doesn't sit shoulder-to-shoulder
    // with the title text. The mobile values are unchanged.
    <div className="text-center space-y-2 sm:space-y-4">
      <div className="flex justify-center">
        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Microscope className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-lg sm:text-xl font-bold tracking-tight" data-testid="text-title">
        Veterinary Teaching Hospital
      </h1>
      <p className="hidden sm:block text-sm text-muted-foreground max-w-xl mx-auto">
        Choose one of the core modules to continue.
      </p>
    </div>
  );

  const mobileActionBtn =
    "w-full h-auto min-h-[4.25rem] flex flex-col items-center justify-center gap-1.5 px-1";

  const notificationsDropdown = (trigger: ReactElement) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="w-[min(360px,calc(100vw-2rem))] sm:align-end sm:w-[360px]"
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Admin notifications</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {notificationsLoading ? "Loading..." : `${unreadCount} unread`}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowNotificationSettings((value) => !value);
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Notification settings"
              data-testid="button-notification-settings"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 pb-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={markAllReadMutation.isPending || notificationItems.length === 0}
              onClick={() => markAllReadMutation.mutate()}
              data-testid="button-notification-mark-all-read"
            >
              Mark all as read
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={deleteReadMutation.isPending || notificationItems.length === 0}
              onClick={() => deleteReadMutation.mutate()}
              data-testid="button-notification-delete-read"
            >
              Delete read
            </Button>
          </div>
          {/*
            Sound state pill + Test button promoted out of the buried
            "settings cog" panel below. Most admins reported never hearing
            sounds because they never discovered the toggle. Now a single
            tap toggles sound, and "Test" plays the current style at the
            current volume so they can verify their audio routing works.
          */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Button
              type="button"
              size="sm"
              variant={enableSoundAlerts ? "default" : "outline"}
              className="h-8 text-xs gap-1.5"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setEnableSoundAlerts((v) => !v);
              }}
              data-testid="button-notification-sound-toggle"
            >
              {enableSoundAlerts ? "🔊 Sound on" : "🔇 Sound off"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                playNotificationSound(soundStyle, soundVolume);
              }}
              data-testid="button-notification-test-sound"
            >
              Test
            </Button>
          </div>
        </div>
        {showNotificationSettings && (
          <div className="px-2 pb-2">
            <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setEnableToastAlerts((v) => !v);
                }}
                className="w-full text-left rounded px-2 py-1 hover:bg-muted"
              >
                Toast alerts: {enableToastAlerts ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setEnableSoundAlerts((v) => !v);
                }}
                className="w-full text-left rounded px-2 py-1 hover:bg-muted"
              >
                Sound alerts: {enableSoundAlerts ? "On" : "Off"}
              </button>
              <label className="block px-2 pt-1 text-muted-foreground">Sound style</label>
              <select
                value={soundStyle}
                onChange={(event) => {
                  const nextStyle = event.target.value as NotificationSoundStyle;
                  setSoundStyle(nextStyle);
                  if (enableSoundAlerts) {
                    playNotificationSound(nextStyle, soundVolume);
                  }
                }}
                className="w-full rounded border bg-background px-2 py-1 text-xs"
              >
                <option value="chime">Chime (classic)</option>
                <option value="ding">Ding (classic)</option>
                <option value="pulse">Pulse (classic)</option>
                <option value="studio-confirm">Studio Confirm</option>
                <option value="ui-back">UI Back</option>
                <option value="ui-start">UI Start</option>
                <option value="ui-start-alt">UI Start Alt</option>
                <option value="correct-answer">Correct Answer</option>
                <option value="notif-real">Real Notification</option>
                <option value="digital-quick">Digital Quick</option>
              </select>
              <label className="block px-2 pt-1 text-muted-foreground">
                Volume ({Math.round(soundVolume * 100)}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(soundVolume * 100)}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  const nextVolume = Math.max(0, Math.min(1, parsed / 100));
                  setSoundVolume(nextVolume);
                  if (enableSoundAlerts) {
                    playNotificationSound(soundStyle, nextVolume);
                  }
                }}
                className="w-full"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  playNotificationSound(soundStyle, soundVolume);
                }}
              >
                Test sound
              </Button>
            </div>
          </div>
        )}
        <DropdownMenuSeparator />
        {notificationItems.length === 0 ? (
          <div className="px-2 py-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No pending notifications.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setLocation("/admin?tab=pending");
              }}
            >
              Open admin — Pending
            </Button>
          </div>
        ) : (
          notificationItems.slice(0, 12).map((item) => (
            <DropdownMenuItem
              key={item.key}
              className="items-start whitespace-normal py-2 cursor-pointer"
              onClick={() => handleOpenNotification(item.key, item.type, item.href)}
            >
              <div className="space-y-0.5">
                <p className={`text-sm ${item.isRead ? "font-normal" : "font-semibold"}`}>
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground">{item.message}</p>
                <p className="text-[11px] text-muted-foreground/80">
                  {formatTimeAgo(item.createdAt)}
                </p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <StickyScrollPage
      maxWidthClass="max-w-3xl w-full"
      className="min-h-[calc(100vh-60px)]"
      contentPaddingClass="py-4 sm:py-6"
      bodyClassName="space-y-4 sm:space-y-6"
      sticky={
        <>
        {/* Phones: one centered column (account card + hero) so nothing fights left vs center alignment */}
        <div className="sm:hidden space-y-4">
          <div className="rounded-xl border border-border/80 bg-card shadow-sm px-4 py-4 space-y-3">
            <div className="flex flex-col items-center gap-2 text-center">
              <UserAvatar
                photoUrl={user?.profilePhotoUrl}
                name={user?.fullName}
                size={48}
                tone="tinted"
              />
              <p className="font-semibold text-sm leading-snug">{user?.fullName}</p>
              {userBadges}
            </div>
            <div className={cn("grid gap-2", isAdmin ? "grid-cols-3" : "grid-cols-2")}>
              <Link href="/profile">
                <Button
                  variant="outline"
                  size="sm"
                  className={mobileActionBtn}
                  data-testid="button-profile"
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span className="text-[11px] font-medium leading-none">Profile</span>
                </Button>
              </Link>
              {isAdmin &&
                notificationsDropdown(
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(mobileActionBtn, "relative")}
                    data-testid="button-notifications"
                  >
                    <Bell className="h-4 w-4 shrink-0" />
                    <span className="text-[11px] font-medium leading-none">Alerts</span>
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-0.5 rounded-full bg-red-600 text-white text-[10px] leading-4 text-center">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Button>,
                )}
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  mobileActionBtn,
                  "text-destructive border-destructive/35 hover:bg-destructive/5 hover:text-destructive",
                )}
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="text-[11px] font-medium leading-none">Logout</span>
              </Button>
            </div>
          </div>
          {welcomeHero}
        </div>

        {/*
          Tablet / desktop: compact toolbar row + centered hero.
          Spacing between the two blocks is intentionally larger than the
          default body rhythm (`space-y-6 md:space-y-8`) — the previous
          `space-y-4` made the microscope hero icon sit too close to the
          toolbar, giving a cluttered "all one chunk" feel. The extra gap
          cues that the toolbar is page-chrome and the hero is content.
        */}
        <div className="hidden sm:block space-y-6 md:space-y-8">
          <div className="flex flex-row items-center justify-between gap-3">
            <div className="flex flex-row items-center flex-wrap gap-2 text-sm min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <UserAvatar
                  photoUrl={user?.profilePhotoUrl}
                  name={user?.fullName}
                  size={28}
                  tone="muted"
                />
                <span className="font-medium truncate">{user?.fullName}</span>
              </div>
              {user && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs ${designationBadgeClass(user.designation)}`}
                  >
                    {designationLabel(user.designation)}
                  </Badge>
                  {user.role !== "student" && (
                    <Badge variant="outline" className={`text-xs ${roleBadgeClass(user.role)}`}>
                      {roleLabel(user.role)}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
              <Link href="/profile">
                <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-profile">
                  <User className="w-3.5 h-3.5" />
                  Profile
                </Button>
              </Link>
              {isAdmin &&
                notificationsDropdown(
                  <Button
                    variant="outline"
                    size="sm"
                    className="relative gap-1.5"
                    data-testid="button-notifications"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    Notifications
                    {unreadCount > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] leading-5 text-center">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Button>,
                )}
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
          {welcomeHero}
        </div>
        </>
      }
    >
      {/*
        Mobile-first grid:
          - 1 col below `sm` (phones): full-width cards, easy thumb scroll.
          - 2 cols at `sm+` (tablet portrait): side-by-side, no wasted space.
          - Admin card spans both columns at `md+` via `md:col-span-2`.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
          <Card className="h-full flex flex-col max-sm:text-center">
            <CardHeader className="max-sm:items-center">
              <CardTitle className="text-base flex items-center gap-2 max-sm:justify-center">
                <ClipboardPlus className="w-4 h-4 text-primary shrink-0" />
                VTH Case Registration
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 max-sm:items-center">
              <p className="text-sm text-muted-foreground max-sm:max-w-[280px]">
                Add patient details, diagnosis, tests, and treatment plan for a new hospital case.
              </p>
              {canRegisterHospitalCase ? (
                <Link href="/new-case" className="mt-auto">
                  <Button className="w-full min-h-10 sm:min-h-9" data-testid="button-register-case">
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

          <Card className="h-full flex flex-col max-sm:text-center">
            <CardHeader className="max-sm:items-center">
              <CardTitle className="text-base flex items-center gap-2 max-sm:justify-center">
                <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                AST Report
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 max-sm:items-center">
              <p className="text-sm text-muted-foreground max-sm:max-w-[280px]">
                Open the AST module with case registration, previous cases, downloads, and related tools.
              </p>
              <Link href="/ast-report" className="mt-auto">
                <Button className="w-full min-h-10 sm:min-h-9" data-testid="button-view-cases">
                  Open AST Reports
                </Button>
              </Link>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="sm:col-span-2 flex flex-col max-sm:text-center">
              <CardHeader className="max-sm:items-center">
                <CardTitle className="text-base flex items-center gap-2 max-sm:justify-center">
                  <Shield className="w-4 h-4 text-primary shrink-0" />
                  Admin Panel
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 max-sm:items-center">
                <p className="text-sm text-muted-foreground max-sm:max-w-[280px]">
                  Manage pending approvals, users, password resets, and pending download requests.
                </p>
                <Link href="/admin" className="mt-auto">
                  <Button variant="destructive" className="w-full min-h-10 sm:min-h-9" data-testid="button-admin-panel">
                    Open Admin Panel
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
    </StickyScrollPage>
  );
}
