/**
 * Role → capability matrix used by the API and mirrored on the client for UI gating.
 * Single source of truth — import from here in both server and client.
 */
export type PermissionCapability =
  | "hospital.case.create"
  | "hospital.case.view"
  | "ast.case.create"
  | "ast.case.view"
  | "ast.download"
  | "ast.admin";

export function resolveCapabilitiesForRole(role: string): PermissionCapability[] {
  const isAdmin = role === "superadmin" || role === "admin";
  const base: PermissionCapability[] = [];
  if (role === "student" || role === "intern" || role === "staff" || isAdmin) {
    base.push("hospital.case.view", "ast.case.view");
    base.push("hospital.case.create");
  }
  if (role === "staff" || role === "intern" || isAdmin) {
    base.push("ast.case.create");
  }
  if (role === "intern" || role === "staff" || isAdmin) {
    base.push("ast.download");
  }
  if (isAdmin) {
    base.push("ast.admin");
  }
  return base;
}

export function hasCapability(role: string, capability: PermissionCapability): boolean {
  return resolveCapabilitiesForRole(role).includes(capability);
}
