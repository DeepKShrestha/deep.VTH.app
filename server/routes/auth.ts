import type { Express, NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { sql } from "drizzle-orm";
import { dbRun } from "../db-query";
import { insertUserSchema, validateStrongPassword } from "@shared/schema";
import type { User } from "@shared/schema";
import bcrypt from "bcryptjs";
import {
  generateToken,
  resolveCapabilitiesForRole,
  canCreateCaseInScope,
  isAstExportVisibleForRole,
  isDashboardVisibleForRole,
  isHospitalExportVisibleForRole,
  isVthDashboardVisibleForRole,
  requireAuth,
  sessions,
} from "./context";
import type { AuthenticatedRequest } from "./types";
import { MESSAGES } from "./messages";
import { authSessionRepo } from "../auth-session-repo";
import {
  isUserLocked,
  clearLoginFailures,
  recordLoginFailure,
  createPendingTwoFactorToken,
  consumePendingTwoFactorToken,
  verifyTotpToken,
  generateTotpSecret,
  buildTotpAuthUrl,
  saveTotpSecret,
  LOCKOUT_MAX_ATTEMPTS,
} from "../login-security";
import { getUserPreferences, upsertUserPreferences } from "../user-preferences-store";
import { verifyProfilePhotoSignature } from "../services/attachment-signing";
import {
  replaceProfilePhotoForUser,
  resolveProfilePhotoAbsolutePath,
  removeProfilePhotoFilesForUser,
  profilePhotoMimeError,
} from "../services/profile-photo-store";
import { toClientSafeUser } from "../user-public";
import {
  isAllowedPasswordResetIdCardFile,
  passwordResetIdCardMimeError,
  savePasswordResetIdCardForRequest,
  PASSWORD_RESET_ID_CARD_MAX_BYTES,
} from "../services/password-reset-id-card-store";

function publicAuthUser(user: User) {
  return toClientSafeUser(user);
}

const PROFILE_PHOTO_MAX_UPLOAD_BYTES = 1024 * 1024;

const signupPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_PHOTO_MAX_UPLOAD_BYTES },
  fileFilter(_req, file, cb) {
    const err = profilePhotoMimeError(file.mimetype);
    if (err) {
      cb(new Error(err));
      return;
    }
    cb(null, true);
  },
});

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_PHOTO_MAX_UPLOAD_BYTES },
  fileFilter(_req, file, cb) {
    const err = profilePhotoMimeError(file.mimetype);
    if (err) {
      cb(new Error(err));
      return;
    }
    cb(null, true);
  },
});

const passwordResetIdCardUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PASSWORD_RESET_ID_CARD_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (!isAllowedPasswordResetIdCardFile(file.mimetype, file.originalname)) {
      cb(
        new Error(
          passwordResetIdCardMimeError(file.mimetype) ??
            "Only JPEG or PNG university ID card images are allowed.",
        ),
      );
      return;
    }
    cb(null, true);
  },
});

function passwordResetMultipart(req: Request, res: Response, next: NextFunction) {
  const ct = String(req.headers?.["content-type"] ?? "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    res.status(400).json({
      message: "University ID card photo is required.",
    });
    return;
  }
  passwordResetIdCardUpload.single("universityIdCard")(req, res, (err: unknown) => {
    if (err) {
      const message =
        err instanceof Error ? err.message : "Invalid university ID card upload.";
      res.status(400).json({ message });
      return;
    }
    next();
  });
}

function signupMultipartMaybe(req: Request, res: Response, next: NextFunction) {
  const ct = String(req.headers?.["content-type"] ?? "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    return next();
  }
  signupPhotoUpload.single("profilePhoto")(req, res, (err: unknown) => {
    if (err) {
      const message =
        err instanceof Error ? err.message : "Invalid profile photo upload.";
      res.status(400).json({ message });
      return;
    }
    next();
  });
}

/**
 * bcrypt cost factor. `bcryptjs` is JS-only and notably slower than native
 * bcrypt, so we keep 10 for the hot path (~60ms on a modest server) while
 * still being well above the per-2016 NIST baseline.
 */
const BCRYPT_COST = 10;

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/signup", signupMultipartMaybe, async (req, res) => {
    const rawBody = { ...(req.body as Record<string, unknown>) };
    if (typeof rawBody.studentBatch === "string" && rawBody.studentBatch.trim() !== "") {
      rawBody.studentBatch = Number(rawBody.studentBatch);
    } else if (rawBody.studentBatch === "") {
      delete rawBody.studentBatch;
    }

    const parsed = insertUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
    }

    const { password, ...userData } = parsed.data;
    const studentBatch =
      userData.designation === "student" ? userData.studentBatch ?? null : null;

    const passwordError = validateStrongPassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    if (await authSessionRepo.getUserByUsername(userData.username)) {
      return res.status(409).json({ message: "Username already taken" });
    }
    if (await authSessionRepo.getUserByEmail(userData.email)) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    let role: string;
    if (userData.designation === "student") {
      role = "student";
    } else if (userData.designation === "intern") {
      role = "intern";
    } else {
      role = "staff";
    }

    const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
    let user = await authSessionRepo.createUser({
      ...userData,
      studentBatch,
      passwordHash,
      role,
      approved: false,
    });

    if (file?.buffer) {
      try {
        const filename = await replaceProfilePhotoForUser(
          user.id,
          file.buffer,
          file.mimetype,
        );
        user =
          (await authSessionRepo.updateUser(user.id, { profilePhotoPath: filename })) ?? user;
      } catch {
        // Account exists; optional identification photo is best-effort.
      }
    }

    res.status(201).json({
      message: "Account created. Waiting for admin approval.",
      user: publicAuthUser(user),
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
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (isUserLocked(user.lockedUntil)) {
      return res.status(403).json({
        message:
          "This account is temporarily locked after too many failed sign-in attempts. Please try again later.",
      });
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const fails = await recordLoginFailure(user.id);
      if (fails >= LOCKOUT_MAX_ATTEMPTS) {
        return res.status(403).json({
          message:
            "Too many failed attempts. This account is now locked for 15 minutes. You can retry after that window or contact an administrator.",
        });
      }
      return res.status(401).json({ message: "Invalid credentials" });
    }

    await clearLoginFailures(user.id);

    if (user.role === "admin" && user.totpEnforced && !user.totpEnabled) {
      return res.status(403).json({
        message:
          "Two-factor authentication is required for this administrator account but is not set up yet. Ask a Super Admin to turn off the requirement temporarily, then sign in and enable 2FA in your Profile.",
      });
    }

    if (!user.approved) {
      return res
        .status(403)
        .json({ message: "Your account is pending admin approval" });
    }

    if (
      (user.role === "admin" || user.role === "superadmin") &&
      user.totpEnabled
    ) {
      const pendingToken = await createPendingTwoFactorToken(user.id);
      return res.json({
        requiresTwoFactor: true,
        pendingToken,
      });
    }

    const token = generateToken();
    await sessions.set(token, user.id);

    const base = publicAuthUser(user);
    res.json({
      token,
      user: {
        ...base,
        dashboardVisible: await isDashboardVisibleForRole(user.role),
        astDashboardVisible: await isDashboardVisibleForRole(user.role),
        vthDashboardVisible: await isVthDashboardVisibleForRole(user.role),
        astExportVisible: await isAstExportVisibleForRole(user.role),
        hospitalExportVisible: await isHospitalExportVisibleForRole(user.role),
        astRegisterVisible: await canCreateCaseInScope(user, "ast"),
        hospitalRegisterVisible: await canCreateCaseInScope(user, "hospital"),
        capabilities: resolveCapabilitiesForRole(user.role),
      },
    });
  });

  app.post("/api/auth/login/2fa", async (req, res) => {
    const { pendingToken, code } = req.body as {
      pendingToken?: string;
      code?: string;
    };
    if (!pendingToken?.trim() || !code?.trim()) {
      return res.status(400).json({
        message: "Verification code and pending session are required",
      });
    }
    const userId = await consumePendingTwoFactorToken(pendingToken.trim());
    if (!userId) {
      return res.status(401).json({
        message: "Invalid or expired two-factor session. Please sign in again.",
      });
    }
    const user = await authSessionRepo.getUserById(userId);
    if (!user?.totpEnabled || !user.totpSecret) {
      return res.status(401).json({
        message: "Two-factor authentication is not active for this account.",
      });
    }
    if (!verifyTotpToken(user.totpSecret, code)) {
      await recordLoginFailure(userId);
      return res.status(401).json({ message: "Invalid verification code" });
    }
    await clearLoginFailures(userId);
    if (!user.approved) {
      return res
        .status(403)
        .json({ message: "Your account is pending admin approval" });
    }
    const token = generateToken();
    await sessions.set(token, user.id);
    const base = publicAuthUser(user);
    res.json({
      token,
      user: {
        ...base,
        dashboardVisible: await isDashboardVisibleForRole(user.role),
        astDashboardVisible: await isDashboardVisibleForRole(user.role),
        vthDashboardVisible: await isVthDashboardVisibleForRole(user.role),
        astExportVisible: await isAstExportVisibleForRole(user.role),
        hospitalExportVisible: await isHospitalExportVisibleForRole(user.role),
        astRegisterVisible: await canCreateCaseInScope(user, "ast"),
        hospitalRegisterVisible: await canCreateCaseInScope(user, "hospital"),
        capabilities: resolveCapabilitiesForRole(user.role),
      },
    });
  });

  app.get("/api/auth/2fa/setup", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const user = await authSessionRepo.getUserById(currentUser.id);
    if (!user) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
    if (user.totpEnabled) {
      return res.status(400).json({
        message:
          "Two-factor authentication is already enabled. Disable it before generating a new secret.",
      });
    }
    const secret = generateTotpSecret();
    const otpauthUrl = buildTotpAuthUrl({
      secret,
      issuer: "VTH",
      accountName: user.username,
    });
    return res.json({ secret, otpauthUrl });
  });

  app.post("/api/auth/2fa/enable", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const { secret, code } = req.body as { secret?: string; code?: string };
    if (!secret?.trim() || !code?.trim()) {
      return res.status(400).json({ message: "Secret and verification code are required" });
    }
    if (!verifyTotpToken(secret.trim(), code.trim())) {
      return res.status(400).json({
        message: "The code does not match this authenticator secret",
      });
    }
    await saveTotpSecret(currentUser.id, secret.trim(), true);
    const user = await authSessionRepo.getUserById(currentUser.id);
    return res.json({ success: true, user: user ? publicAuthUser(user) : undefined });
  });

  app.post("/api/auth/2fa/disable", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return res.status(403).json({ message: MESSAGES.INSUFFICIENT_PERMISSIONS });
    }
    const { password, code } = req.body as { password?: string; code?: string };
    const user = await authSessionRepo.getUserById(currentUser.id);
    if (!user?.totpEnabled) {
      return res.status(400).json({ message: "Two-factor authentication is not enabled" });
    }
    if (user.totpEnforced) {
      return res.status(403).json({
        message:
          "Two-factor authentication is required for your account and cannot be turned off. Contact a Super Admin if you need an exception.",
      });
    }
    const hasPassword = typeof password === "string" && password.length > 0;
    const hasCode = typeof code === "string" && code.trim().length > 0;
    if (hasPassword) {
      if (!(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
    } else if (hasCode && user.totpSecret && verifyTotpToken(user.totpSecret, code)) {
      // verified via TOTP
    } else {
      return res.status(400).json({
        message:
          "Provide your current account password or a valid authenticator code to disable 2FA",
      });
    }
    await saveTotpSecret(currentUser.id, null, false);
    const next = await authSessionRepo.getUserById(currentUser.id);
    return res.json({ success: true, user: next ? publicAuthUser(next) : undefined });
  });

  app.get("/api/users/me/preferences", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const prefs = await getUserPreferences(currentUser.id);
    return res.json(prefs);
  });

  app.put("/api/users/me/preferences", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const body = req.body as Record<string, unknown>;
    const patch: Parameters<typeof upsertUserPreferences>[1] = {};
    if ("astToggleDefaults" in body) {
      const v = body.astToggleDefaults;
      patch.astToggleDefaults =
        v == null
          ? null
          : typeof v === "object" && !Array.isArray(v)
            ? (v as Record<string, unknown>)
            : null;
    }
    if ("hospitalToggleDefaults" in body) {
      const v = body.hospitalToggleDefaults;
      patch.hospitalToggleDefaults =
        v == null
          ? null
          : typeof v === "object" && !Array.isArray(v)
            ? (v as Record<string, unknown>)
            : null;
    }
    if ("notificationPrefs" in body) {
      const v = body.notificationPrefs;
      patch.notificationPrefs =
        v == null
          ? null
          : typeof v === "object" && !Array.isArray(v)
            ? (v as Record<string, unknown>)
            : null;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: MESSAGES.NO_CHANGES_PROVIDED });
    }
    const prefs = await upsertUserPreferences(currentUser.id, patch);
    return res.json(prefs);
  });

  app.post("/api/auth/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      await sessions.delete(authHeader.substring(7));
    }
    res.json({ message: "Logged out" });
  });

  /** Soft presence end on tab close — session stays valid for same-tab reload. */
  app.post("/api/auth/session/away", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      await sessions.markAway(authHeader.substring(7));
    }
    res.status(204).end();
  });

  app.post("/api/auth/logout-all-sessions", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    await authSessionRepo.deleteSessionsByUserId(currentUser.id);
    return res.json({ message: "All sessions logged out" });
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
    const base = publicAuthUser(user);
    res.json({
      ...base,
      dashboardVisible: await isDashboardVisibleForRole(user.role),
      astDashboardVisible: await isDashboardVisibleForRole(user.role),
      vthDashboardVisible: await isVthDashboardVisibleForRole(user.role),
      astExportVisible: await isAstExportVisibleForRole(user.role),
      hospitalExportVisible: await isHospitalExportVisibleForRole(user.role),
      astRegisterVisible: await canCreateCaseInScope(user, "ast"),
      hospitalRegisterVisible: await canCreateCaseInScope(user, "hospital"),
      capabilities: resolveCapabilitiesForRole(user.role),
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
      if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      const passwordError = validateStrongPassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      updates.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: MESSAGES.NO_CHANGES_PROVIDED });
    }

    const updated = await authSessionRepo.updateUser(currentUser.id, updates);
    if (!updated) {
      return res.status(500).json({ message: "Failed to update user" });
    }

    // After a successful password change, terminate every *other* session
    // for this user. The current session (this request's bearer token) is
    // preserved so the response can still complete. Without this, an
    // attacker who had stolen a session token could keep using it even
    // after the legitimate owner rotated the password.
    if (updates.passwordHash) {
      const authHeader = req.headers.authorization || "";
      const currentToken = authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : "";
      try {
        if (currentToken) {
          await dbRun(
            sql`DELETE FROM sessions WHERE user_id = ${currentUser.id} AND token <> ${currentToken}`,
          );
        } else {
          await authSessionRepo.deleteSessionsByUserId(currentUser.id);
        }
      } catch {
        // Best-effort: failure to clean other sessions must not undo the
        // password change itself; the user can manually click "Sign out
        // everywhere" from Profile if needed.
      }
    }

    return res.json({ success: true, user: publicAuthUser(updated) });
  });

  app.post(
    "/api/users/me/profile-photo",
    requireAuth,
    profilePhotoUpload.single("profilePhoto"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
      if (!file?.buffer) {
        return res.status(400).json({
          message: "No image file provided (form field name: profilePhoto).",
        });
      }
      try {
        const filename = await replaceProfilePhotoForUser(
          currentUser.id,
          file.buffer,
          file.mimetype,
        );
        const updated = await authSessionRepo.updateUser(currentUser.id, {
          profilePhotoPath: filename,
        });
        if (!updated) {
          return res.status(500).json({ message: "Failed to save profile photo" });
        }
        return res.json({ success: true, user: publicAuthUser(updated) });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed";
        return res.status(400).json({ message });
      }
    },
  );

  app.delete("/api/users/me/profile-photo", requireAuth, async (req, res) => {
    const currentUser = (req as AuthenticatedRequest).currentUser;
    const existing = await authSessionRepo.getUserById(currentUser.id);
    if (!existing) {
      return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
    }
    await removeProfilePhotoFilesForUser(currentUser.id);
    const updated = await authSessionRepo.updateUser(currentUser.id, {
      profilePhotoPath: null,
    });
    if (!updated) {
      return res.status(500).json({ message: "Failed to clear profile photo" });
    }
    return res.json({ success: true, user: publicAuthUser(updated) });
  });

  app.get("/api/users/:userId/profile-photo", async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const t = typeof req.query.t === "string" ? req.query.t : "";
    const sig = typeof req.query.sig === "string" ? req.query.sig : "";
    const sigOk = verifyProfilePhotoSignature(userId, t, sig);

    let allowed = sigOk;
    if (!allowed) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const sessionUserId = await sessions.get(token);
        if (sessionUserId != null) {
          const viewer = await authSessionRepo.getUserById(sessionUserId);
          const target = await authSessionRepo.getUserById(userId);
          if (viewer && target?.profilePhotoPath) {
            if (
              viewer.id === userId ||
              viewer.role === "admin" ||
              viewer.role === "superadmin"
            ) {
              allowed = true;
            }
          }
        }
      }
    }

    if (!allowed) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const user = await authSessionRepo.getUserById(userId);
    const abs = resolveProfilePhotoAbsolutePath(user?.profilePhotoPath ?? null);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).end();
    }

    const ext = path.extname(abs).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.sendFile(abs);
  });

  app.post(
    "/api/auth/password-reset-requests",
    passwordResetMultipart,
    async (req, res) => {
      const body = req.body as Record<string, string | undefined>;
      const identifier = (body.usernameOrEmail || "").trim();
      const newPassword = body.newPassword || "";
      const reason = body.reason?.trim() || null;
      const file = req.file;

      if (!identifier || !newPassword) {
        return res
          .status(400)
          .json({ message: "Username/email and new password are required" });
      }
      const passwordError = validateStrongPassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }

      let user = await authSessionRepo.getUserByUsername(identifier);
      if (!user) user = await authSessionRepo.getUserByEmail(identifier);
      if (!user) {
        // Avoid disclosing account existence; discard uploaded file
        return res.json({
          message:
            "If the account exists, a password reset request has been submitted.",
        });
      }

      if (!file) {
        return res.status(400).json({
          message: "A photo of your university ID card is required.",
        });
      }

      const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
      const request = await authSessionRepo.createPasswordResetRequest({
        userId: user.id,
        requestedByRole: user.role,
        passwordHash: hash,
        reason,
      });

      try {
        const filename = await savePasswordResetIdCardForRequest(
          request.id,
          file.buffer,
          file.mimetype,
        );
        await authSessionRepo.setPasswordResetRequestIdCard(request.id, filename);
        await authSessionRepo.supersedePendingPasswordResetRequests(user.id, request.id);
      } catch (err) {
        await dbRun(
          sql`DELETE FROM password_reset_requests WHERE id = ${request.id}`,
        );
        const message =
          err instanceof Error
            ? err.message
            : "Could not save university ID card photo.";
        return res.status(400).json({ message });
      }

      return res.json({
        message:
          "Password reset request submitted. An authorized admin will review it.",
      });
    },
  );
}
