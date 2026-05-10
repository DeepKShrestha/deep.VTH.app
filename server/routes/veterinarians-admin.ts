import type { Express } from "express";
import { sql } from "drizzle-orm";
import { dbRun } from "../db-query";
import { veterinarianRepo } from "../repos";
import { getIdParam, requireAuth, requireRole } from "./context";
import type { AuthenticatedRequest } from "./types";

/** Mounted from `routes.ts` so hospital veterinarian CRUD is always registered with the API. */
export function registerVeterinarianAdminRoutes(app: Express) {
  app.get(
    "/api/admin/veterinarians",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const rows = await veterinarianRepo.getVeterinarians();
      return res.json(rows);
    },
  );

  app.post(
    "/api/admin/veterinarians",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const fullName = String(req.body?.fullName ?? "").trim();
      const nvcRegistrationNumber = String(req.body?.nvcRegistrationNumber ?? "").trim();
      const department = String(req.body?.department ?? "").trim();
      if (!fullName) return res.status(400).json({ message: "Veterinarian name is required" });
      if (!nvcRegistrationNumber) {
        return res
          .status(400)
          .json({ message: "Nepal Veterinary Council registration number is required" });
      }
      if (!department) return res.status(400).json({ message: "Department is required" });
      try {
        const created = await veterinarianRepo.createVeterinarian({
          fullName,
          nvcRegistrationNumber,
          department,
        });
        await dbRun(
          sql`INSERT INTO form_edit_audit_logs
              (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
              VALUES (
                ${currentUser.id},
                ${currentUser.role},
                ${"add_veterinarian"},
                ${String(created.id)},
                ${null},
                ${JSON.stringify(created)},
                ${new Date().toISOString()}
              )`,
        );
        return res.status(201).json(created);
      } catch {
        return res.status(500).json({ message: "Failed to save veterinarian" });
      }
    },
  );

  app.delete(
    "/api/admin/veterinarians/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const currentUser = (req as AuthenticatedRequest).currentUser;
      const id = getIdParam(req);
      const existing = await veterinarianRepo.getVeterinarian(id);
      if (!existing) return res.status(404).json({ message: "Veterinarian not found" });
      await veterinarianRepo.deleteVeterinarian(id);
      await dbRun(
        sql`INSERT INTO form_edit_audit_logs
            (actor_user_id, actor_role, action, target_key, old_value, new_value, created_at)
            VALUES (
              ${currentUser.id},
              ${currentUser.role},
              ${"delete_veterinarian"},
              ${String(id)},
              ${JSON.stringify(existing)},
              ${null},
              ${new Date().toISOString()}
            )`,
      );
      return res.json({ message: "Veterinarian removed" });
    },
  );
}
