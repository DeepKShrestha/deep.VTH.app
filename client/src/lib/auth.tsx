import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { SafeUser } from "@shared/schema";

interface AuthContextType {
  user: SafeUser | null;
  token: string | null;
  isLoading: boolean;
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

// Simple in‑memory token (lost on reload, but stable during a session)
let storedToken: string | null = null;
const TOKEN_STORAGE_KEY = "auth_token";

export function getAuthToken(): string | null {
  return storedToken;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return Boolean(localStorage.getItem(TOKEN_STORAGE_KEY));
  });

  const setAuth = useCallback((t: string | null, u: SafeUser | null) => {
    storedToken = t;
    if (t) {
      localStorage.setItem(TOKEN_STORAGE_KEY, t);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
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
        const safeUser = (await res.json()) as SafeUser;
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

  const value: AuthContextType = {
    user,
    token,
    isLoading,
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}