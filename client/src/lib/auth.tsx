import {
  createContext,
  useContext,
  useState,
  useCallback,
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
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean;
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

export function getAuthToken(): string | null {
  return storedToken;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading] = useState(false); // always false in this simple version

  const setAuth = useCallback((t: string | null, u: SafeUser | null) => {
    storedToken = t;
    setToken(t);
    setUser(u);
  }, []);

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

  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin = user?.role === "admin" || isSuperAdmin;
  const isStaff = user?.role === "staff";
  const isStudent = user?.role === "student";
  const canRegisterCase = isAdmin || isStaff;
  const canDownload = isAdmin || isStaff; // students must request

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    signup,
    logout,
    isSuperAdmin,
    isAdmin,
    isStaff,
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