import { sql } from "drizzle-orm";
import { authSessionRepo } from "../auth-session-repo";
import { dbRun } from "../db-query";
import { DB_PROVIDER } from "../db";
import { getPgPool } from "../pg-pool";

/** Clear FK links from case audit rows before removing user accounts. */
export async function detachUserCaseChangeLogs(userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  if (DB_PROVIDER === "postgres") {
    await getPgPool().query(
      `UPDATE case_change_logs SET actor_user_id = NULL WHERE actor_user_id = ANY($1::int[])`,
      [userIds],
    );
    return;
  }
  for (const id of userIds) {
    await dbRun(
      sql`UPDATE case_change_logs SET actor_user_id = NULL WHERE actor_user_id = ${id}`,
    );
  }
}

export async function deleteUsersByIds(userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  await detachUserCaseChangeLogs(userIds);
  await dbRun(
    sql`DELETE FROM users WHERE id IN (${sql.join(
      userIds.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  );
  for (const id of userIds) {
    await authSessionRepo.deleteSessionsByUserId(id).catch(() => {});
  }
}

export function userDeleteBlockedMessage(error: unknown): string | null {
  const text =
    error instanceof Error
      ? `${error.message} ${(error as { cause?: Error }).cause?.message ?? ""}`
      : String(error ?? "");
  const lower = text.toLowerCase();
  if (
    lower.includes("case_change_logs") ||
    lower.includes("foreign key") ||
    lower.includes("violates foreign key") ||
    lower.includes("restrict")
  ) {
    return "This account cannot be removed yet because it is linked to case history. Deploy the latest update (migration 0027) or contact support.";
  }
  return null;
}
