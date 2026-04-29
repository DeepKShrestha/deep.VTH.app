import type { Express } from "express";
import { insertUserSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import {
  generateToken,
  isDashboardVisibleForRole,
  requireAuth,
  sessions,
} from "./context";
import type { AuthenticatedRequest } from "./types";
import { MESSAGES } from "./messages";
import { authSessionRepo } from "../auth-session-repo";

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
    }

    const { password, ...userData } = parsed.data;

    if (await authSessionRepo.getUserByUsername(userData.username)) {
      return res.status(409).json({ message: "Username already taken" });
    }
    if (await authSessionRepo.getUserByEmail(userData.email)) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    let role: string;
    if (userData.designation === "student") {
      role = "student";
    } else if (userData.designation === "intern") {
      role = "intern";
    } else {
      role = "staff";
    }

    const user = await authSessionRepo.createUser({
      ...userData,
      passwordHash,
      role,
      approved: false,
    });

    const { passwordHash: _pwd, ...safeUser } = user;
    res.status(201).json({
      message: "Account created. Waiting for admin approval.",
      user: safeUser,
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { usernameOrEmail, password } = req.body as {
      usernameOrEmail?: string;
      password?: string;
    };
    const identifier = (usernameOrEmail || "").trim();
    if (!identifier || !password) {
      return res
        .status(400)
        .json({ message: "Username/email and password required" });
    }

    let user = await authSessionRepo.getUserByUsername(identifier);
    if (!user) user = await authSessionRepo.getUserByEmail(identifier);
    if (!user) {
      const normalized = identifier.toLowerCase();
      user = (await authSessionRepo.getUsers()).find(
        (u) =>
          u.username.toLowerCase() === normalized || u.email.toLowerCase() === normalized,
      );
    }
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (!bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.approved) {
      return res
        .status(403)
        .json({ message: "Your account is pending admin approval" });
    }

    const token = generateToken();
    await sessions.set(token, user.id);

    const { passwordHash: _pwd, ...safeUser } = user;
    res.json({
      token,
      user: {
        ...safeUser,
        dashboardVisible: await isDashboardVisibleForRole(user.role),
      },
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      await sessions.delete(authHeader.substring(7));
    }
    res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const token = authHeader.substring(7);
    const userId = await sessions.get(token);
    if (!userId) return res.status(401).json({ message: "Session expired" });
    const user = await authSessionRepo.getUserById(userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    const { passwordHash: _pwd, ...safeUser } = user;
    res.json({
      ...safeUser,
      dashboardVisible: await isDashboardVisibleForRole(user.role),
    });
  });

  app.get("/api/auth/dashboard-access", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    return res.json({ allowed: await isDashboardVisibleForRole(currentUser.role) });
  });

  app.patch("/api/users/me", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;

    const user = await authSessionRepo.getUserById(currentUser.id);
    if (!user) {
      return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
    }

    const { fullName, address, phone, currentPassword, newPassword } =
      req.body as {
        fullName?: string;
        address?: string;
        phone?: string;
        email?: string;
        username?: string;
        designation?: string;
        currentPassword?: string;
        newPassword?: string;
      };

    const updates: Record<string, string> = {};
    if (typeof fullName === "string" && fullName.trim()) {
      updates.fullName = fullName.trim();
    }
    if (typeof address === "string" && address.trim()) {
      updates.address = address.trim();
    }
    if (typeof phone === "string" && phone.trim()) {
      updates.phone = phone.trim();
    }

    const isSuperAdmin = currentUser.role === "superadmin";
    if (isSuperAdmin) {
      const { email, username, designation } = req.body as {
        email?: string;
        username?: string;
        designation?: string;
      };

      if (typeof email === "string" && email.trim()) {
        const nextEmail = email.trim();
        const existing = await authSessionRepo.getUserByEmail(nextEmail);
        if (existing && existing.id !== user.id) {
          return res.status(409).json({ message: "Email already registered" });
        }
        updates.email = nextEmail;
      }

      if (typeof username === "string" && username.trim()) {
        const nextUsername = username.trim();
        const existing = await authSessionRepo.getUserByUsername(nextUsername);
        if (existing && existing.id !== user.id) {
          return res.status(409).json({ message: "Username already taken" });
        }
        updates.username = nextUsername;
      }

      if (typeof designation === "string" && designation.trim()) {
        updates.designation = designation.trim();
      }
    }

    if (newPassword || currentPassword) {
      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ message: "Current and new password are required" });
      }
      if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ message: "New password must be at least 6 characters" });
      }
      updates.passwordHash = bcrypt.hashSync(newPassword, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: MESSAGES.NO_CHANGES_PROVIDED });
    }

    const updated = await authSessionRepo.updateUser(currentUser.id, updates);
    if (!updated) {
      return res.status(500).json({ message: "Failed to update user" });
    }

    const { passwordHash: _pwd, ...safeUser } = updated;
    return res.json({ success: true, user: safeUser });
  });

  app.post("/api/auth/password-reset-requests", async (req, res) => {
    const { usernameOrEmail, newPassword, reason } = req.body as {
      usernameOrEmail?: string;
      newPassword?: string;
      reason?: string;
    };
    const identifier = (usernameOrEmail || "").trim();
    if (!identifier || !newPassword) {
      return res
        .status(400)
        .json({ message: "Username/email and new password are required" });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters" });
    }

    let user = await authSessionRepo.getUserByUsername(identifier);
    if (!user) user = await authSessionRepo.getUserByEmail(identifier);
    if (!user) {
      const normalized = identifier.toLowerCase();
      user = (await authSessionRepo.getUsers())
        .find(
          (u) =>
            u.username.toLowerCase() === normalized ||
            u.email.toLowerCase() === normalized,
        );
    }
    if (!user) {
      // Avoid disclosing account existence
      return res.json({
        message:
          "If the account exists, a password reset request has been submitted.",
      });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    await authSessionRepo.createPasswordResetRequest({
      userId: user.id,
      requestedByRole: user.role,
      passwordHash: hash,
      reason: reason?.trim() || null,
    });

    return res.json({
      message:
        "Password reset request submitted. An authorized admin will review it.",
    });
  });
}
