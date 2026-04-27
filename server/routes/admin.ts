import type { Express } from "express";
import { storage } from "../storage";
import {
  getIdParam,
  getPaginationParams,
  isAdminRole,
  requireAuth,
  requireRole,
} from "./context";
import type { AuthenticatedRequest } from "./types";
import { MESSAGES } from "./messages";

export function registerAdminRoutes(app: Express) {
  app.get(
    "/api/admin/users",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const pagination = getPaginationParams(req);
      const pageData = pagination.shouldPaginate
        ? storage.getUsersPage(pagination.pageSize, pagination.offset)
        : null;
      const allUsers = pageData?.items ?? storage.getUsers();
      const safeUsers = allUsers.map(({ passwordHash, ...u }) => u);
      if (!pagination.shouldPaginate) {
        return res.json(safeUsers);
      }
      const total = pageData?.total ?? safeUsers.length;
      return res.json({
        items: safeUsers,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      });
    },
  );

  app.get(
    "/api/admin/users/pending",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const pagination = getPaginationParams(req);
      const pageData = pagination.shouldPaginate
        ? storage.getUsersPage(pagination.pageSize, pagination.offset, false)
        : null;
      const pending = pageData?.items ?? storage.getPendingUsers();
      const safeUsers = pending.map(({ passwordHash, ...u }) => u);
      if (!pagination.shouldPaginate) {
        return res.json(safeUsers);
      }
      const total = pageData?.total ?? safeUsers.length;
      return res.json({
        items: safeUsers,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      });
    },
  );

  app.post(
    "/api/admin/users/:id/approve",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const { role } = req.body;
      const user = storage.approveUser(getIdParam(req), role || "staff");
      if (!user) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    },
  );

  app.delete(
    "/api/admin/users/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const targetUser = storage.getUserById(getIdParam(req));
      if (!targetUser) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      if (targetUser.id === currentUser.id) {
        return res.status(403).json({ message: "Cannot delete your own account" });
      }
      if (isAdminRole(targetUser.role) && currentUser.role !== "superadmin") {
        return res
          .status(403)
          .json({ message: "Only Super Admin can remove admins" });
      }
      storage.rejectUser(getIdParam(req));
      res.json({ message: "User removed" });
    },
  );

  app.patch(
    "/api/admin/users/:id/role",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const { role } = req.body;
      const targetUser = storage.getUserById(getIdParam(req));
      if (!targetUser) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      if (targetUser.id === currentUser.id) {
        return res.status(403).json({ message: "Cannot change your own role" });
      }
      if (
        (isAdminRole(role) || isAdminRole(targetUser.role)) &&
        currentUser.role !== "superadmin"
      ) {
        return res.status(403).json({
          message: "Only Super Admin can assign or modify admin roles",
        });
      }
      const user = storage.updateUserRole(getIdParam(req), role);
      if (!user) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    },
  );

  app.patch(
    "/api/admin/users/:id",
    requireAuth,
    requireRole("superadmin"),
    (req, res) => {
      const targetUser = storage.getUserById(getIdParam(req));
      if (!targetUser) return res.status(404).json({ message: MESSAGES.USER_NOT_FOUND });

      const { fullName, address, phone, email, username, designation } =
        req.body as {
          fullName?: string;
          address?: string;
          phone?: string;
          email?: string;
          username?: string;
          designation?: string;
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
      if (typeof email === "string" && email.trim()) {
        updates.email = email.trim();
      }
      if (typeof username === "string" && username.trim()) {
        updates.username = username.trim();
      }
      if (typeof designation === "string" && designation.trim()) {
        updates.designation = designation.trim();
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: MESSAGES.NO_CHANGES_PROVIDED });
      }

      const updated = storage.updateUser(getIdParam(req), updates);
      if (!updated)
        return res.status(500).json({ message: "Failed to update user" });

      const { passwordHash, ...safeUser } = updated;
      res.json(safeUser);
    },
  );

  app.get(
    "/api/admin/download-requests",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const pagination = getPaginationParams(req);
      const pageData = pagination.shouldPaginate
        ? storage.getDownloadRequestsPage(pagination.pageSize, pagination.offset)
        : null;
      const requests = pageData?.items ?? storage.getDownloadRequests();
      const enriched = requests.map((r) => {
        const user = storage.getUserById(r.userId);
        return {
          ...r,
          userName: user?.fullName || "Unknown",
          userDesignation: user?.designation || "",
        };
      });
      if (!pagination.shouldPaginate) {
        return res.json(enriched);
      }
      const total = pageData?.total ?? enriched.length;
      return res.json({
        items: enriched,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      });
    },
  );

  app.post(
    "/api/admin/download-requests/:id/resolve",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const { status, adminNote } = req.body;
      if (!["approved", "rejected"].includes(status)) {
        return res
          .status(400)
          .json({ message: "Status must be approved or rejected" });
      }
      const result = storage.resolveDownloadRequest(
        getIdParam(req),
        status,
        adminNote,
      );
      if (!result) return res.status(404).json({ message: "Request not found" });
      res.json(result);
    },
  );

  app.get(
    "/api/admin/password-reset-requests",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const pagination = getPaginationParams(req);
      const requests = pagination.shouldPaginate
        ? storage.getPasswordResetRequestsPage(pagination.pageSize, pagination.offset)
            .items
        : storage.getPasswordResetRequests();
      const visible = requests.filter((r) => {
        if (currentUser.role === "superadmin") return true;
        // Admins cannot handle admin/superadmin reset requests
        return r.requestedByRole !== "admin" && r.requestedByRole !== "superadmin";
      });
      const enriched = visible.map((r) => {
        const user = storage.getUserById(r.userId);
        return {
          ...r,
          userName: user?.fullName || "Unknown",
          userUsername: user?.username || "",
          userRole: user?.role || r.requestedByRole,
        };
      });
      if (!pagination.shouldPaginate) {
        return res.json(enriched);
      }
      const pageData = storage.getPasswordResetRequestsPage(
        pagination.pageSize,
        pagination.offset,
      );
      const filteredTotal =
        currentUser.role === "superadmin"
          ? pageData.total
          : storage
              .getPasswordResetRequests()
              .filter(
                (r) =>
                  r.requestedByRole !== "admin" &&
                  r.requestedByRole !== "superadmin",
              ).length;
      return res.json({
        items: enriched,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: filteredTotal,
        totalPages: Math.max(1, Math.ceil(filteredTotal / pagination.pageSize)),
      });
    },
  );

  app.post(
    "/api/admin/password-reset-requests/:id/resolve",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const { status, resolverNote } = req.body as {
        status?: string;
        resolverNote?: string;
      };
      if (!status || !["approved", "rejected"].includes(status)) {
        return res
          .status(400)
          .json({ message: "Status must be approved or rejected" });
      }

      const allRequests = storage.getPasswordResetRequests();
      const target = allRequests.find((r) => r.id === getIdParam(req));
      if (!target) {
        return res.status(404).json({ message: "Request not found" });
      }
      if (
        currentUser.role !== "superadmin" &&
        (target.requestedByRole === "admin" ||
          target.requestedByRole === "superadmin")
      ) {
        return res.status(403).json({
          message: "Only superadmin can resolve admin-level reset requests",
        });
      }

      if (status === "approved") {
        const user = storage.getUserById(target.userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        storage.updateUser(user.id, { passwordHash: target.passwordHash });
      }

      const resolved = storage.resolvePasswordResetRequest(
        target.id,
        status,
        currentUser.id,
        resolverNote,
      );
      if (!resolved) return res.status(404).json({ message: "Request not found" });
      res.json(resolved);
    },
  );
}
