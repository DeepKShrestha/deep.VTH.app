import type { Express } from "express";
import { insertBreakpointSchema, updateBreakpointSchema } from "@shared/schema";
import { domainRepo } from "../domain-repo";
import {
  getIdParam,
  requireAuth,
  requireRole,
  SEED_BREAKPOINTS,
} from "./context";
import { MESSAGES } from "./messages";

export function registerBreakpointRoutes(app: Express) {
  app.get("/api/breakpoints", requireAuth, async (_req, res) => {
    res.json(await domainRepo.getBreakpoints());
  });

  app.post(
    "/api/breakpoints",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const parsed = insertBreakpointSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
      }
      const bp = await domainRepo.createBreakpoint(parsed.data);
      res.status(201).json(bp);
    },
  );

  app.patch(
    "/api/breakpoints/:id",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (req, res) => {
      const parsed = updateBreakpointSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: MESSAGES.INVALID_DATA, errors: parsed.error.flatten() });
      }
      const id = getIdParam(req);
      const existing = await domainRepo.getBreakpoint(id);
      if (!existing) {
        return res.status(404).json({ message: MESSAGES.BREAKPOINT_NOT_FOUND });
      }
      if (existing.isPreset) {
        return res
          .status(403)
          .json({ message: "Preset breakpoints cannot be modified" });
      }
      const updated = await domainRepo.updateBreakpoint(id, parsed.data);
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
    async (req, res) => {
      const existing = await domainRepo.getBreakpoint(getIdParam(req));
      if (!existing) {
        return res.status(404).json({ message: MESSAGES.BREAKPOINT_NOT_FOUND });
      }
      if (existing.isPreset) {
        return res
          .status(403)
          .json({ message: "Preset breakpoints cannot be deleted" });
      }
      await domainRepo.deleteBreakpoint(getIdParam(req));
      res.json({ message: "Breakpoint deleted" });
    },
  );

  app.post(
    "/api/breakpoints/reset",
    requireAuth,
    requireRole("superadmin", "admin"),
    async (_req, res) => {
      const all = await domainRepo.getBreakpoints();
      for (const bp of all) {
        await domainRepo.deleteBreakpoint(bp.id);
      }
      for (const bp of SEED_BREAKPOINTS) {
        await domainRepo.createBreakpoint(bp);
      }
      res.json({
        message: "Breakpoints reset to defaults",
        breakpoints: await domainRepo.getBreakpoints(),
      });
    },
  );
}
