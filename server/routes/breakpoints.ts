import type { Express } from "express";
import { insertBreakpointSchema } from "@shared/schema";
import { storage } from "../storage";
import {
  getIdParam,
  requireAuth,
  requireRole,
  SEED_BREAKPOINTS,
} from "./context";
import { MESSAGES } from "./messages";

export function registerBreakpointRoutes(app: Express) {
  app.get("/api/breakpoints", requireAuth, (_req, res) => {
    res.json(storage.getBreakpoints());
  });

  app.post(
    "/api/breakpoints",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const parsed = insertBreakpointSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
      }
      const bp = storage.createBreakpoint(parsed.data);
      res.status(201).json(bp);
    },
  );

  app.patch(
    "/api/breakpoints/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const updated = storage.updateBreakpoint(getIdParam(req), req.body);
      if (!updated) {
        return res.status(404).json({ message: MESSAGES.BREAKPOINT_NOT_FOUND });
      }
      res.json(updated);
    },
  );

  app.delete(
    "/api/breakpoints/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    (req, res) => {
      const existing = storage.getBreakpoint(getIdParam(req));
      if (!existing) {
        return res.status(404).json({ message: MESSAGES.BREAKPOINT_NOT_FOUND });
      }
      storage.deleteBreakpoint(getIdParam(req));
      res.json({ message: "Breakpoint deleted" });
    },
  );

  app.post(
    "/api/breakpoints/reset",
    requireAuth,
    requireRole("superadmin", "admin"),
    (_req, res) => {
      const all = storage.getBreakpoints();
      for (const bp of all) {
        storage.deleteBreakpoint(bp.id);
      }
      for (const bp of SEED_BREAKPOINTS) {
        storage.createBreakpoint(bp);
      }
      res.json({
        message: "Breakpoints reset to defaults",
        breakpoints: storage.getBreakpoints(),
      });
    },
  );
}
