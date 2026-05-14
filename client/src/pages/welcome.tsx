import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

type NotificationSoundStyle =
  | "chime"
  | "ding"
  | "pulse"
  | "studio-confirm"
  | "ui-back"
  | "ui-start"
  | "ui-start-alt"
  | "correct-answer"
  | "notif-real"
  | "digital-quick";

const SOUND_FILE_BY_STYLE: Partial<Record<NotificationSoundStyle, string>> = {
  "studio-confirm": "/sounds/confirm_tone.wav",
  "ui-back": "/sounds/interface_back.wav",
  "ui-start": "/sounds/interface_start.wav",
  "ui-start-alt": "/sounds/interface_start_alt.wav",
  "correct-answer": "/sounds/correct_answer.wav",
  "notif-real": "/sounds/new_notification_09.mp3",
  "digital-quick": "/sounds/digital_quick.wav",
};

function playNotificationSound(style: NotificationSoundStyle, volume: number) {
  const clampedVolume = Math.max(0, Math.min(1, volume));
  const externalSound = SOUND_FILE_BY_STYLE[style];
  if (externalSound) {
    try {
      const audio = new Audio(externalSound);
      audio.volume = clampedVolume;
      void audio.play().catch(() => {
        // Autoplay policy or missing asset; ignore.
      });
    } catch {
      // Ignore if browser blocks autoplay.
    }
    return;
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const gain = audioCtx.createGain();
    // File-based styles use element volume 0–1; match perceived loudness for built-in tones.
    gain.gain.value = Math.min(0.85, 0.1 + clampedVolume * 0.55);
    gain.connect(audioCtx.destination);

    const addTone = (type: OscillatorType, freq: number, start: number, end: number) => {
      const osc = audioCtx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(audioCtx.currentTime + start);
      osc.stop(audioCtx.currentTime + end);
    };

    const schedule = () => {
      if (style === "ding") {
        addTone("sine", 1174, 0, 0.14); // D6
        return;
      }
      if (style === "pulse") {
        addTone("square", 880, 0, 0.06);
        addTone("square", 988, 0.1, 0.17);
        addTone("square", 1046, 0.2, 0.3);
        return;
      }
      // default: chime
      addTone("triangle", 1046, 0, 0.09); // C6
      addTone("sine", 1318, 0.1, 0.22); // E6
    };

    void audioCtx.resume().then(schedule).catch(() => {
      // Still try scheduling if resume is unsupported.
      schedule();
    });
  } catch {
    // Optional enhancement only; silently ignore when audio isn't allowed.
  }
}

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, logout, canRegisterHospitalCase, confirmBeforeLogout, isAdmin } = useAuth();
  const [enableToastAlerts, setEnableToastAlerts] = useState(() => {
    return true;
  });
  const [enableSoundAlerts, setEnableSoundAlerts] = useState(() => {
    return false;
  });
  const [soundStyle, setSoundStyle] = useState<NotificationSoundStyle>("chime");
  const [soundVolume, setSoundVolume] = useState<number>(0.7);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const previousUnreadKeysRef = useRef<Set<string> | null>(null);
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

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    const userKey = String(user.id);
    setEnableToastAlerts(window.localStorage.getItem(`vth:notifications:toast:${userKey}`) !== "0");
    setEnableSoundAlerts(window.localStorage.getItem(`vth:notifications:sound:${userKey}`) === "1");
    const storedStyle = window.localStorage.getItem(`vth:notifications:sound-style:${userKey}`);
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
    const storedVolume = Number(window.localStorage.getItem(`vth:notifications:sound-volume:${userKey}`));
    setSoundVolume(Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1 ? storedVolume : 0.7);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    window.localStorage.setItem(`vth:notifications:toast:${user.id}`, enableToastAlerts ? "1" : "0");
  }, [enableToastAlerts, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    window.localStorage.setItem(`vth:notifications:sound:${user.id}`, enableSoundAlerts ? "1" : "0");
  }, [enableSoundAlerts, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    window.localStorage.setItem(`vth:notifications:sound-style:${user.id}`, soundStyle);
  }, [soundStyle, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    window.localStorage.setItem(`vth:notifications:sound-volume:${user.id}`, String(soundVolume));
  }, [soundVolume, user?.id]);

  useEffect(() => {
    if (!isAdmin || !notificationsData) return;
    const unreadKeys = new Set(
      notificationsData.items.filter((item) => !item.isRead).map((item) => item.key),
    );
    const prev = previousUnreadKeysRef.current;
    previousUnreadKeysRef.current = unreadKeys;
    if (!prev) return; // don't notify on initial load
    let newItems = 0;
    unreadKeys.forEach((key) => {
      if (!prev.has(key)) newItems += 1;
    });
    if (newItems <= 0) return;
    if (enableToastAlerts) {
      toast({
        title: "New admin notifications",
        description: `${newItems} new request${newItems > 1 ? "s" : ""} waiting for review.`,
      });
    }
    if (enableSoundAlerts) {
      playNotificationSound(soundStyle, soundVolume);
    }
  }, [isAdmin, notificationsData, enableToastAlerts, enableSoundAlerts, soundStyle, soundVolume, toast]);

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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link href="/profile">
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-profile">
                <User className="w-3.5 h-3.5" />
                Profile
              </Button>
            </Link>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
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
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[360px]">
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
                  <div className="px-2 pb-2">
                    <div className="flex items-center gap-2">
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
                  </div>
                  {showNotificationSettings && (
                    <>
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
                          <label className="block px-2 pt-1 text-muted-foreground">
                            Sound style
                          </label>
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
                    </>
                  )}
                  <DropdownMenuSeparator />
                  {notificationItems.length === 0 ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No pending notifications.
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
