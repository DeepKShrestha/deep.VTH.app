import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { SafeUser } from "@shared/schema";
import type { PermissionCapability } from "@shared/capabilities";
import { resolveCapabilitiesForRole } from "@shared/capabilities";
import { hydrateToggleDefaultsFromServer } from "@/lib/module-toggle-defaults";
import { csrfHeaders } from "@/lib/csrf";

export type InactivityTimeoutOption =
  | "1m"
  | "3m"
  | "5m"
  | "10m"
  | "30m"
  | "never";
export type ConfirmLogoutPreference = "always" | "never";
type AuthUser = SafeUser & {
  dashboardVisible?: boolean;
  astDashboardVisible?: boolean;
  vthDashboardVisible?: boolean;
  astExportVisible?: boolean;
  hospitalExportVisible?: boolean;
  astPrintVisible?: boolean;
  hospitalPrintVisible?: boolean;
  /**
   * Per-user resolved "can register a new case" flags, sent by the server
   * on login/me. They already factor in the per-role admin toggle AND the
   * per-batch student override, so the client can treat them as the
   * authoritative gate without re-running the resolver. When missing
   * (legacy session before the toggle shipped), the client falls back to
   * the static capability matrix to preserve old behaviour.
   */
  astRegisterVisible?: boolean;
  hospitalRegisterVisible?: boolean;
  capabilities?: PermissionCapability[];
};

export const INACTIVITY_TIMEOUT_LABELS: Record<InactivityTimeoutOption, string> = {
  "1m": "1 minute",
  "3m": "3 minutes",
  "5m": "5 minutes",
  "10m": "10 minutes",
  "30m": "30 minutes",
  never: "Never",
};

export type LoginOutcome =
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string }
  | { kind: "two_factor"; pendingToken: string };

async function syncPreferencesFromServer(userId: number) {
  try {
    const prefRes = await fetch("/api/users/me/preferences", {
      credentials: "same-origin",
    });
    if (!prefRes.ok) return;
    const prefs = (await prefRes.json()) as {
      astToggleDefaults: Record<string, unknown> | null;
      hospitalToggleDefaults: Record<string, unknown> | null;
      notificationPrefs: Record<string, unknown> | null;
    };
    hydrateToggleDefaultsFromServer({
      astToggleDefaults: prefs.astToggleDefaults,
      hospitalToggleDefaults: prefs.hospitalToggleDefaults,
    });
    hydrateNotificationPrefsFromServer(userId, prefs.notificationPrefs);
  } catch {
    /* ignore offline errors */
  }
}

const NOTIF_KEYS = {
  toast: (uid: number | string) => `vth:notifications:toast:${uid}`,
  sound: (uid: number | string) => `vth:notifications:sound:${uid}`,
  style: (uid: number | string) => `vth:notifications:sound-style:${uid}`,
  volume: (uid: number | string) => `vth:notifications:sound-volume:${uid}`,
};

function hydrateNotificationPrefsFromServer(
  userId: number,
  serverPrefs: Record<string, unknown> | null,
) {
  if (typeof window === "undefined") return;

  // No server record yet: if local storage already has values, migrate them
  // to the server so this device's prefs persist across devices going forward.
  if (!serverPrefs) {
    const local = readLocalNotificationPrefs(userId);
    if (local) {
      void fetch("/api/users/me/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ notificationPrefs: local }),
        credentials: "same-origin",
      }).catch(() => {});
    }
    return;
  }

  // Server is source of truth — overwrite localStorage cache.
  if (typeof serverPrefs.enableToastAlerts === "boolean") {
    window.localStorage.setItem(
      NOTIF_KEYS.toast(userId),
      serverPrefs.enableToastAlerts ? "1" : "0",
    );
  }
  if (typeof serverPrefs.enableSoundAlerts === "boolean") {
    window.localStorage.setItem(
      NOTIF_KEYS.sound(userId),
      serverPrefs.enableSoundAlerts ? "1" : "0",
    );
  }
  if (typeof serverPrefs.soundStyle === "string") {
    window.localStorage.setItem(NOTIF_KEYS.style(userId), serverPrefs.soundStyle);
  }
  if (typeof serverPrefs.soundVolume === "number") {
    window.localStorage.setItem(
      NOTIF_KEYS.volume(userId),
      String(serverPrefs.soundVolume),
    );
  }
  window.dispatchEvent(new Event("vth:notification-prefs-hydrated"));
}

/**
 * Persist notification preferences for the current user to the server so they
 * follow them across devices. Fire-and-forget; the localStorage write in the
 * caller is the authoritative cache for instant UI feedback.
 */
export function saveNotificationPrefsToServer(prefs: {
  enableToastAlerts: boolean;
  enableSoundAlerts: boolean;
  soundStyle: string;
  soundVolume: number;
}): void {
  void fetch("/api/users/me/preferences", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(),
    },
    body: JSON.stringify({ notificationPrefs: prefs }),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
}

function readLocalNotificationPrefs(userId: number): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const toastRaw = window.localStorage.getItem(NOTIF_KEYS.toast(userId));
  const soundRaw = window.localStorage.getItem(NOTIF_KEYS.sound(userId));
  const style = window.localStorage.getItem(NOTIF_KEYS.style(userId));
  const volumeRaw = window.localStorage.getItem(NOTIF_KEYS.volume(userId));
  if (toastRaw == null && soundRaw == null && style == null && volumeRaw == null) {
    return null;
  }
  const volume = Number(volumeRaw);
  return {
    enableToastAlerts: toastRaw == null ? true : toastRaw !== "0",
    enableSoundAlerts: soundRaw === "1",
    soundStyle: style ?? "chime",
    soundVolume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 0.7,
  };
}

interface AuthContextType {
  user: SafeUser | null;
  isLoading: boolean;
  inactivityTimeout: InactivityTimeoutOption;
  setInactivityTimeout: (value: InactivityTimeoutOption) => void;
  confirmBeforeLogout: ConfirmLogoutPreference;
  setConfirmBeforeLogout: (value: ConfirmLogoutPreference) => void;
  login: (usernameOrEmail: string, password: string) => Promise<LoginOutcome>;
  completeTwoFactor: (
    pendingToken: string,
    code: string,
  ) => Promise<{ success: boolean; message: string }>;
  signup: (data: SignupData) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  updateCurrentUser: (nextUser: SafeUser) => void;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isIntern: boolean;
  isStudent: boolean;
  canRegisterCase: boolean;
  canDownload: boolean;
  canViewDashboard: boolean;
  canViewVthDashboard: boolean;
  canRegisterHospitalCase: boolean;
  canViewHospitalCases: boolean;
  canRegisterAstCase: boolean;
  canViewAstCases: boolean;
  canDownloadAst: boolean;
  /** Admin per-role toggle for the AST export tile/route. */
  canExportAst: boolean;
  /** Admin per-role toggle for the Hospital export tile/route. */
  canExportHospital: boolean;
  /** Admin per-role toggle for the AST in-app print/PDF affordances. */
  canPrintAst: boolean;
  /** Admin per-role toggle for the Hospital in-app print/PDF affordances. */
  canPrintHospital: boolean;
  canManageAstAdmin: boolean;
}

interface SignupData {
  fullName: string;
  address: string;
  phone: string;
  email: string;
  designation: string;
  studentBatch?: number | null;
  username: string;
  password: string;
  profilePhotoFile?: File | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

// The session token now lives ONLY in an httpOnly cookie set by the server,
// so JavaScript can neither read nor persist it. Auth state on the client is
// therefore derived purely from `/api/auth/me` (the cookie rides along
// automatically) rather than from any stored token.
const LAST_LOGIN_AT_KEY = "auth_last_login_at";
export const INACTIVITY_LOGOUT_FLAG_KEY = "logged_out_inactivity";
const INACTIVITY_TIMEOUT_STORAGE_KEY = "inactivity_timeout";
const CONFIRM_LOGOUT_STORAGE_KEY = "confirm_logout_preference";
const DEFAULT_INACTIVITY_TIMEOUT: InactivityTimeoutOption = "10m";
const DEFAULT_CONFIRM_LOGOUT: ConfirmLogoutPreference = "never";
const INACTIVITY_TIMEOUT_MS: Record<
  Exclude<InactivityTimeoutOption, "never">,
  number
> = {
  "1m": 1 * 60 * 1000,
  "3m": 3 * 60 * 1000,
  "5m": 5 * 60 * 1000,
  "10m": 10 * 60 * 1000,
  "30m": 30 * 60 * 1000,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // We can't synchronously know whether the httpOnly session cookie is valid,
  // so we always start in a loading state and resolve it via `/api/auth/me`.
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [inactivityTimeout, setInactivityTimeoutState] =
    useState<InactivityTimeoutOption>(() => {
      const raw = localStorage.getItem(INACTIVITY_TIMEOUT_STORAGE_KEY);
      if (
        raw === "1m" ||
        raw === "3m" ||
        raw === "5m" ||
        raw === "10m" ||
        raw === "30m" ||
        raw === "never"
      ) {
        return raw;
      }
      return DEFAULT_INACTIVITY_TIMEOUT;
    });
  const [confirmBeforeLogout, setConfirmBeforeLogoutState] =
    useState<ConfirmLogoutPreference>(() => {
      const raw = localStorage.getItem(CONFIRM_LOGOUT_STORAGE_KEY);
      if (raw === "always" || raw === "never") return raw;
      return DEFAULT_CONFIRM_LOGOUT;
    });
  const inactivityTimerRef = useRef<number | null>(null);

  // Restore the session on load by asking the server who we are. The browser
  // sends the httpOnly session cookie automatically; a 401 simply means we're
  // logged out. Runs once on mount.
  useEffect(() => {
    let cancelled = false;
    const bootstrapAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setUser(null);
          return;
        }
        const safeUser = (await res.json()) as AuthUser;
        if (cancelled) return;
        setUser(safeUser);
        await syncPreferencesFromServer(safeUser.id);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (usernameOrEmail: string, password: string): Promise<LoginOutcome> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernameOrEmail, password }),
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!res.ok) {
          return { kind: "error", message: data.message || "Login failed" };
        }
        if (data.requiresTwoFactor && data.pendingToken) {
          return { kind: "two_factor", pendingToken: data.pendingToken };
        }
        if (!data.user) {
          return { kind: "error", message: "Login failed" };
        }
        setUser(data.user);
        localStorage.setItem(LAST_LOGIN_AT_KEY, new Date().toISOString());
        await syncPreferencesFromServer(data.user.id);
        return { kind: "ok", message: "Login successful" };
      } catch {
        return { kind: "error", message: "Network error" };
      }
    },
    [],
  );

  const completeTwoFactor = useCallback(
    async (pendingToken: string, code: string) => {
      try {
        const res = await fetch("/api/auth/login/2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingToken, code }),
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, message: data.message || "Verification failed" };
        }
        if (!data.user) {
          return { success: false, message: "Verification failed" };
        }
        setUser(data.user);
        localStorage.setItem(LAST_LOGIN_AT_KEY, new Date().toISOString());
        await syncPreferencesFromServer(data.user.id);
        return { success: true, message: "Login successful" };
      } catch {
        return { success: false, message: "Network error" };
      }
    },
    [],
  );

  const signup = useCallback(async (data: SignupData) => {
    try {
      const hasPhoto = data.profilePhotoFile instanceof File;
      let res: Response;
      if (hasPhoto) {
        const fd = new FormData();
        fd.append("fullName", data.fullName);
        fd.append("address", data.address);
        fd.append("phone", data.phone);
        fd.append("email", data.email);
        fd.append("designation", data.designation);
        fd.append("username", data.username);
        fd.append("password", data.password);
        if (data.designation === "student" && data.studentBatch != null) {
          fd.append("studentBatch", String(data.studentBatch));
        }
        fd.append("profilePhoto", data.profilePhotoFile!);
        res = await fetch("/api/auth/signup", {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: data.fullName,
            address: data.address,
            phone: data.phone,
            email: data.email,
            designation: data.designation,
            studentBatch: data.studentBatch,
            username: data.username,
            password: data.password,
          }),
        });
      }
      const result = await res.json();
      if (!res.ok) {
        return {
          success: false,
          message: result.message || "Signup failed",
        };
      }
      return { success: true, message: result.message };
    } catch {
      return { success: false, message: "Network error" };
    }
  }, []);

  const logout = useCallback(() => {
    // The cookie is sent automatically so the server can delete the right
    // session and clear the cookie. CSRF header is harmless here (logout is
    // not CSRF-gated server-side) but kept for uniformity.
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { ...csrfHeaders() },
      credentials: "same-origin",
    }).catch(() => {});
    sessionStorage.removeItem(INACTIVITY_LOGOUT_FLAG_KEY);
    setUser(null);
  }, []);

  const updateCurrentUser = useCallback(
    (nextUser: SafeUser) => {
      setUser(nextUser);
    },
    [setUser],
  );

  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin = user?.role === "admin" || isSuperAdmin;
  const isStaff = user?.role === "staff";
  const isIntern = user?.role === "intern";
  const isStudent = user?.role === "student";
  const capabilities = new Set(
    (user?.capabilities?.length ? user.capabilities : resolveCapabilitiesForRole(user?.role ?? "")),
  );
  // The "register a new case" capability has TWO layers from the server:
  //   1. Static capability matrix (what the role intrinsically allows).
  //   2. Admin-driven per-role + per-batch override carried on the user
  //      payload as `astRegisterVisible` / `hospitalRegisterVisible`.
  //
  // If the server sent the flag (modern session) we trust it as the
  // authoritative answer. If it's missing (older session that hasn't been
  // refreshed since this feature shipped) we fall back to the capability
  // matrix, which matches the historical behaviour and prevents a forced
  // logout. The server still enforces both gates on POST so a stale client
  // can never *actually* create a case it shouldn't.
  const canRegisterHospitalCase =
    user?.hospitalRegisterVisible ?? capabilities.has("hospital.case.create");
  const canViewHospitalCases = capabilities.has("hospital.case.view");
  const canRegisterAstCase =
    user?.astRegisterVisible ?? capabilities.has("ast.case.create");
  const canViewAstCases = capabilities.has("ast.case.view");
  const canDownloadAst = capabilities.has("ast.download");
  const canManageAstAdmin = capabilities.has("ast.admin");
  const canRegisterCase = canRegisterAstCase;
  const canDownload = canDownloadAst;
  const canViewDashboard = Boolean(
    user?.astDashboardVisible ?? user?.dashboardVisible ?? false,
  );
  const canViewVthDashboard = Boolean(
    user?.vthDashboardVisible ?? user?.dashboardVisible ?? false,
  );
  // Admin-driven per-role export visibility acts as an EXTRA gate on top of
  // capability + student-approval. Mirrors server `canDownloadBySource`:
  //   eligible = staff/intern/admin with `ast.download`, or any student
  //   allowed = eligible AND admin toggle (default true if flag missing)
  const astExportEligible = canDownloadAst || isStudent;
  const hospitalExportEligible = canDownloadAst || isStudent;
  const astExportFlag = user?.astExportVisible ?? true;
  const hospitalExportFlag = user?.hospitalExportVisible ?? true;
  const canExportAst = Boolean(astExportEligible && astExportFlag);
  const canExportHospital = Boolean(hospitalExportEligible && hospitalExportFlag);
  // Printing is an EXTRA admin-toggle gate on top of being able to view the
  // case. Anyone who can view a module's cases may print unless an admin turned
  // the toggle off for their role. A missing flag (legacy session) defaults to
  // visible to preserve historical behaviour; the server re-checks on the PDF
  // endpoint regardless.
  const canPrintAst = Boolean(canViewAstCases && (user?.astPrintVisible ?? true));
  const canPrintHospital = Boolean(
    canViewHospitalCases && (user?.hospitalPrintVisible ?? true),
  );

  const setInactivityTimeout = useCallback(
    (value: InactivityTimeoutOption) => {
      setInactivityTimeoutState(value);
      localStorage.setItem(INACTIVITY_TIMEOUT_STORAGE_KEY, value);
    },
    [],
  );
  const setConfirmBeforeLogout = useCallback((value: ConfirmLogoutPreference) => {
    setConfirmBeforeLogoutState(value);
    localStorage.setItem(CONFIRM_LOGOUT_STORAGE_KEY, value);
  }, []);

  useEffect(() => {
    if ((user?.role !== "admin" && user?.role !== "superadmin") && inactivityTimeout === "never") {
      setInactivityTimeout(DEFAULT_INACTIVITY_TIMEOUT);
    }
  }, [user?.role, inactivityTimeout, setInactivityTimeout]);

  useEffect(() => {
    const clearTimer = () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };

    if (!user || inactivityTimeout === "never") {
      clearTimer();
      return;
    }

    const timeoutMs = INACTIVITY_TIMEOUT_MS[inactivityTimeout];
    const resetTimer = () => {
      clearTimer();
      inactivityTimerRef.current = window.setTimeout(() => {
        sessionStorage.setItem(INACTIVITY_LOGOUT_FLAG_KEY, "1");
        logout();
      }, timeoutMs);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "focus",
    ];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      clearTimer();
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, [user, inactivityTimeout, logout]);

  // When the user closes the tab or navigates away, mark the server session as
  // away so admin presence shows Offline quickly. Uses fetch keepalive; the
  // session cookie rides along automatically. Does not delete the session — a
  // same-tab reload still works.
  useEffect(() => {
    if (!user) return;

    const markSessionAway = () => {
      fetch("/api/auth/session/away", {
        method: "POST",
        headers: { ...csrfHeaders() },
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {});
    };

    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      markSessionAway();
    };

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [user]);

  const value: AuthContextType = {
    user,
    isLoading,
    inactivityTimeout,
    setInactivityTimeout,
    confirmBeforeLogout,
    setConfirmBeforeLogout,
    login,
    completeTwoFactor,
    signup,
    logout,
    updateCurrentUser,
    isSuperAdmin,
    isAdmin,
    isStaff,
    isIntern,
    isStudent,
    canRegisterCase,
    canDownload,
    canViewDashboard,
    canViewVthDashboard,
    canRegisterHospitalCase,
    canViewHospitalCases,
    canRegisterAstCase,
    canViewAstCases,
    canDownloadAst,
    canExportAst,
    canExportHospital,
    canPrintAst,
    canPrintHospital,
    canManageAstAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}