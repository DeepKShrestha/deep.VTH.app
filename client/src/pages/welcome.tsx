import { Link, useLocation } from "wouter";
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ClipboardPlus,
  FolderSearch,
  Microscope,
  Settings,
  Shield,
  Download,
  LogOut,
  User,
  BarChart3,
  Bell,
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

export default function Welcome() {
  const [, setLocation] = useLocation();
  const {
    user,
    logout,
    isAdmin,
    canRegisterCase,
    canViewDashboard,
    confirmBeforeLogout,
  } = useAuth();

  const { data: notificationData } = useQuery<{
    pendingDownloadRequests: Array<{ id: number }>;
    pendingPasswordResets: Array<{ id: number }>;
    recentFormChanges: Array<{ id: number }>;
  }>({
    queryKey: ["/ui/notifications/pending-actions", Boolean(isAdmin)],
    queryFn: async () => {
      if (!isAdmin) {
        return {
          pendingDownloadRequests: [],
          pendingPasswordResets: [],
          recentFormChanges: [],
        };
      }
      const [downloadsRes, resetsRes, formLogsRes] = await Promise.allSettled([
        apiRequest("GET", "/api/admin/download-requests"),
        apiRequest("GET", "/api/admin/password-reset-requests"),
        apiRequest("GET", "/api/admin/form-edit-logs"),
      ]);
      const downloadsRaw =
        downloadsRes.status === "fulfilled" ? await downloadsRes.value.json() : [];
      const resetsRaw =
        resetsRes.status === "fulfilled" ? await resetsRes.value.json() : [];
      const formLogsRaw =
        formLogsRes.status === "fulfilled" ? await formLogsRes.value.json() : [];
      const downloads = Array.isArray(downloadsRaw)
        ? downloadsRaw
        : Array.isArray(downloadsRaw?.items)
          ? downloadsRaw.items
          : [];
      const resets = Array.isArray(resetsRaw)
        ? resetsRaw
        : Array.isArray(resetsRaw?.items)
          ? resetsRaw.items
          : [];
      const formLogs = Array.isArray(formLogsRaw)
        ? formLogsRaw
        : Array.isArray(formLogsRaw?.items)
          ? formLogsRaw.items
          : [];
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      return {
        pendingDownloadRequests: downloads
          .filter((d: unknown) => (d as { status?: string; id?: number } | null)?.status === "pending")
          .map((d: unknown) => ({ id: Number((d as { id?: number }).id) }))
          .filter((d: { id: number }) => Number.isFinite(d.id)),
        pendingPasswordResets: resets
          .filter((r: unknown) => (r as { status?: string; id?: number } | null)?.status === "pending")
          .map((r: unknown) => ({ id: Number((r as { id?: number }).id) }))
          .filter((r: { id: number }) => Number.isFinite(r.id)),
        recentFormChanges: formLogs
          .filter((l: unknown) => {
            const log = l as { createdAt?: string; id?: number } | null;
            const ts = new Date(String(log?.createdAt ?? "")).getTime();
            return Number.isFinite(ts) && ts >= oneDayAgo;
          })
          .map((l: unknown) => ({ id: Number((l as { id?: number }).id) }))
          .filter((l: { id: number }) => Number.isFinite(l.id)),
      };
    },
    enabled: Boolean(isAdmin),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const { data: notificationStates = [] } = useQuery<
    Array<{ key: string; isRead: boolean; isDeleted: boolean }>
  >({
    queryKey: ["/api/admin/notifications/states", Boolean(isAdmin)],
    queryFn: async () => {
      if (!isAdmin) return [];
      const res = await apiRequest("GET", "/api/admin/notifications/states");
      return res.json();
    },
    enabled: Boolean(isAdmin),
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
  });

  const stateMap = useMemo(() => {
    const map = new Map<string, { isRead: boolean; isDeleted: boolean }>();
    for (const s of notificationStates) {
      map.set(s.key, { isRead: s.isRead, isDeleted: s.isDeleted });
    }
    return map;
  }, [notificationStates]);

  const notifications = useMemo(() => {
    const items: Array<{ key: string; title: string; href: string; read: boolean }> = [];
    for (const r of notificationData?.pendingPasswordResets ?? []) {
      const key = `password_reset:${r.id}`;
      items.push({
        key,
        title: `Password reset request #${r.id}`,
        href: "/admin?tab=password-resets",
        read: Boolean(stateMap.get(key)?.isRead),
      });
    }
    for (const d of notificationData?.pendingDownloadRequests ?? []) {
      const key = `download_request:${d.id}`;
      items.push({
        key,
        title: `Download request #${d.id}`,
        href: "/admin?tab=downloads",
        read: Boolean(stateMap.get(key)?.isRead),
      });
    }
    for (const f of notificationData?.recentFormChanges ?? []) {
      const key = `form_change:${f.id}`;
      items.push({
        key,
        title: `Form change log #${f.id}`,
        href: "/admin?tab=form-options",
        read: Boolean(stateMap.get(key)?.isRead),
      });
    }
    return items.filter((n) => !Boolean(stateMap.get(n.key)?.isDeleted));
  }, [notificationData, stateMap]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const readCount = notifications.filter((n) => n.read).length;

  const setNotificationStateMutation = useMutation({
    mutationFn: async (payload: { key: string; isRead?: boolean; isDeleted?: boolean }) => {
      await apiRequest("PATCH", "/api/admin/notifications/state", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/states"] });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      await apiRequest("POST", "/api/admin/notifications/mark-read-all", { keys });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/states"] });
    },
  });
  const deleteReadMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      await apiRequest("POST", "/api/admin/notifications/delete-read", { keys });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/states"] });
    },
  });

  const markRead = (key: string) => {
    setNotificationStateMutation.mutate({ key, isRead: true });
  };
  const markAllRead = () => {
    markAllReadMutation.mutate(notifications.map((n) => n.key));
  };
  const openNotification = (key: string, href: string) => {
    markRead(key);
    setLocation(href);
  };
  const deleteReadNotification = (key: string) => {
    if (!stateMap.get(key)?.isRead) return;
    setNotificationStateMutation.mutate({ key, isRead: true, isDeleted: true });
  };
  const deleteAllReadNotifications = () => {
    deleteReadMutation.mutate(notifications.filter((n) => n.read).map((n) => n.key));
  };

  const handleLogout = () => {
    if (confirmBeforeLogout === "always") {
      const ok = window.confirm("Are you sure you want to log out?");
      if (!ok) return;
    }
    logout();
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-60px)] px-4">
      <div className="w-full max-w-lg text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Microscope className="w-8 h-8 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-title">
            AST Report System
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Veterinary Teaching Hospital — Antibiotic Sensitivity Test Report Management
          </p>
        </div>

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
            {isAdmin && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-8 w-8" data-testid="button-notifications">
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] leading-4">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="center" className="w-72 p-2.5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Notifications</div>
                      <div className="text-[11px] text-muted-foreground">{unreadCount} unread</div>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No pending notifications.</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={markAllRead} disabled={unreadCount === 0}>
                            Mark all read
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={deleteAllReadNotifications} disabled={readCount === 0}>
                            Delete read
                          </Button>
                        </div>
                        <div className="space-y-1.5 max-h-56 overflow-auto pr-1">
                          {notifications.slice(0, 20).map((n) => (
                            <div key={n.key} className="rounded border p-2">
                              <div className="flex items-start justify-between gap-2">
                                <button type="button" className="text-left text-[13px] leading-5 hover:underline" onClick={() => openNotification(n.key, n.href)}>
                                  {n.title}
                                </button>
                                {!n.read && <Badge className="text-[10px]">New</Badge>}
                              </div>
                              <div className="pt-1.5 flex items-center justify-end gap-1.5">
                                {!n.read ? (
                                  <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => markRead(n.key)}>
                                    Mark read
                                  </Button>
                                ) : (
                                  <>
                                    <span className="text-[11px] text-muted-foreground pr-1">Read</span>
                                    <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => deleteReadNotification(n.key)}>
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

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

        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/export">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" data-testid="button-export">
              <Download className="w-3.5 h-3.5" />
              Export Data
            </Button>
          </Link>
          {canViewDashboard && (
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" data-testid="button-dashboard">
                <BarChart3 className="w-3.5 h-3.5" />
                Dashboard
              </Button>
            </Link>
          )}
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
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" data-testid="button-profile">
              <User className="w-3.5 h-3.5" />
              Profile
            </Button>
          </Link>
          <Button variant="ghost" size="sm" className="gap-1.5 text-red-500 hover:text-red-700" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
