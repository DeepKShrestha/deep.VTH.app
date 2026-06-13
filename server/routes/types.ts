import type { Request } from "express";
import type { DownloadRequest, SafeUser } from "@shared/schema";

export type CurrentUser = Pick<
  SafeUser,
  "id" | "role" | "approved" | "designation"
> & {
  /**
   * Batch number for students (e.g. 76, 77). Used by the per-batch
   * registration toggle in server/routes/context.ts. Optional + nullable
   * so non-student roles and legacy callers don't need to fill it in.
   */
  studentBatch?: number | null;
};

type ApprovedDownloadRequest = Pick<DownloadRequest, "id" | "status">;

export type AuthenticatedRequest = Request & {
  currentUser: CurrentUser;
  approvedDownloadRequest?: ApprovedDownloadRequest;
  /**
   * How the session token was presented on this request: the httpOnly cookie
   * (browser) or the Authorization header (tests / non-browser clients). Used
   * by `requireAuth` to decide whether CSRF protection applies.
   */
  authTokenSource?: "cookie" | "header";
};
