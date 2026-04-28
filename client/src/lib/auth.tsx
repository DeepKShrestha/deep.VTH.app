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

export type InactivityTimeoutOption =
  | "1m"
  | "3m"
  | "5m"
  | "10m"
  | "30m"
  | "never";
export type ConfirmLogoutPreference = "always" | "never";

export const INACTIVITY_TIMEOUT_LABELS: Record<InactivityTimeoutOption, string> = {
  "1m": "1 minute",
  "3m": "3 minutes",
  "5m": "5 minutes",
  "10m": "10 minutes",
  "30m": "30 minutes",
  never: "Never",
};

interface AuthContextType {
  user: SafeUser | null;
  token: string | null;
  isLoading: boolean;
  inactivityTimeout: InactivityTimeoutOption;
  setInactivityTimeout: (value: InactivityTimeoutOption) => void;
  confirmBeforeLogout: ConfirmLogoutPreference;
  setConfirmBeforeLogout: (value: ConfirmLogoutPreference) => void;
  login: (
    usernameOrEmail: string,
    password: string
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
}

interface SignupData {
  fullName: string;
  address: string;
  phone: string;
  email: string;
  designation: string;
  username: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

// In-memory token + sessionStorage (persists on reload, clears when tab/window closes)
let storedToken: string | null = null;
const TOKEN_STORAGE_KEY = "auth_token";
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
  // Fallback for page reload/HMR race: token may already be in sessionStorage
  // before in-memory state is rehydrated.
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
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

  const setAuth = useCallback((t: string | null, u: SafeUser | null) => {
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
        const safeUser = (await res.json()) as SafeUser & {
          dashboardVisible?: boolean;
        };
        setAuth(token, safeUser);
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
    async (usernameOrEmail: string, password: string) => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernameOrEmail, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            success: false,
            message: data.message || "Login failed",
          };
        }
        setAuth(data.token, data.user);
        return { success: true, message: "Login successful" };
      } catch {
        return { success: false, message: "Network error" };
      }
    },
    [setAuth]
  );

  const signup = useCallback(async (data: SignupData) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
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
  const canRegisterCase = isAdmin || isStaff || isIntern;
  const canDownload = isAdmin || isStaff || isIntern; // students must request
  const canViewDashboard =
    Boolean((user as (SafeUser & { dashboardVisible?: boolean }) | null)?.dashboardVisible) !==
    false;

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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}