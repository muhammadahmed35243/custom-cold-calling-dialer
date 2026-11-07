// Role names shared by server routes and pages. Kept free of server imports so
// client components can use it.

export type Role = "super_admin" | "admin" | "agent";

// "admin" is an organization's own admin (a sub admin); the super admin is
// also an admin of their own organization, JETZT.
export const ADMIN_ROLES: Role[] = ["admin", "super_admin"];

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}
