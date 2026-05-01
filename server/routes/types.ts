import type { Request } from "express";
import type { DownloadRequest, SafeUser } from "@shared/schema";

export type CurrentUser = Pick<
  SafeUser,
  "id" | "role" | "approved" | "designation"
>;

type ApprovedDownloadRequest = Pick<DownloadRequest, "id" | "status">;

export type AuthenticatedRequest = Request & {
  currentUser: CurrentUser;
  approvedDownloadRequest?: ApprovedDownloadRequest;
};
