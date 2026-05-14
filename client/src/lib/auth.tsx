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

async function syncPreferencesFromServer(token: string) {
  try {
    const prefRes = await fetch("/api/users/me/preferences", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!prefRes.ok) return;
    const prefs = (await prefRes.json()) as {
      astToggleDefaults: Record<string, unknown> | null;
      hospitalToggleDefaults: Record<string, unknown> | null;
    };
    hydrateToggleDefaultsFromServer({
      astToggleDefaults: prefs.astToggleDefaults,
      hospitalToggleDefaults: prefs.hospitalToggleDefaults,
    });
  } catch {
    /* ignore offline errors */
  }
}

interface AuthContextType {
  user: SafeUser | null;
  token: string | null;
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

// In-memory token + sessionStorage (persists on reload in same tab only)
let storedToken: string | null = null;
const TOKEN_STORAGE_KEY = "auth_token";
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

export function getAuthToken(): string | null {
  if (storedToken) return storedToken;
  // Fallback for page reload/HMR race in the same tab.
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return Boolean(sessionStorage.getItem(TOKEN_STORAGE_KEY));
  });
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

  const setAuth = useCallback((t: string | null, u: AuthUser | null) => {
    storedToken = t;
    if (t) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, t);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    setToken(t);
    setUser(u);
  }, []);

  useEffect(() => {
    storedToken = token;
  }, [token]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      if (!token) return;
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setAuth(null, null);
          return;
        }
        const safeUser = (await res.json()) as AuthUser;
        setAuth(token, safeUser);
        await syncPreferencesFromServer(token);
      } catch {
        setAuth(null, null);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrapAuth();
    if (!token) {
      setIsLoading(false);
    }
  }, [token, setAuth]);

  const login = useCallback(
    async (usernameOrEmail: string, password: string): Promise<LoginOutcome> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernameOrEmail, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { kind: "error", message: data.message || "Login failed" };
        }
        if (data.requiresTwoFactor && data.pendingToken) {
          return { kind: "two_factor", pendingToken: data.pendingToken };
        }
        if (!data.token || !data.user) {
          return { kind: "error", message: "Login failed" };
        }
        setAuth(data.token, data.user);
        localStorage.setItem(LAST_LOGIN_AT_KEY, new Date().toISOString());
        await syncPreferencesFromServer(data.token);
        return { kind: "ok", message: "Login successful" };
      } catch {
        return { kind: "error", message: "Network error" };
      }
    },
    [setAuth],
  );

  const completeTwoFactor = useCallback(
    async (pendingToken: string, code: string) => {
      try {
        const res = await fetch("/api/auth/login/2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pendingToken, code }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, message: data.message || "Verification failed" };
        }
        if (!data.token || !data.user) {
          return { success: false, message: "Verification failed" };
        }
        setAuth(data.token, data.user);
        localStorage.setItem(LAST_LOGIN_AT_KEY, new Date().toISOString());
        await syncPreferencesFromServer(data.token);
        return { success: true, message: "Login successful" };
      } catch {
        return { success: false, message: "Network error" };
      }
    },
    [setAuth],
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
    if (storedToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${storedToken}` },
      }).catch(() => {});
    }
    sessionStorage.removeItem(INACTIVITY_LOGOUT_FLAG_KEY);
    setAuth(null, null);
  }, [setAuth]);

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
  const canRegisterHospitalCase = capabilities.has("hospital.case.create");
  const canViewHospitalCases = capabilities.has("hospital.case.view");
  const canRegisterAstCase = capabilities.has("ast.case.create");
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

    if (!token || !user || inactivityTimeout === "never") {
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
  }, [token, user, inactivityTimeout, logout]);

  const value: AuthContextType = {
    user,
    token,
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
    canManageAstAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}