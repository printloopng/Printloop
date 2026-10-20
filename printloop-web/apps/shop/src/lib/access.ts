import type { SessionUser } from "@printloop/auth/config";

export function shopAccessError(user: SessionUser): string | null {
  if (user.role === "admin" || user.role === "super_admin") return null;
  return "This is the shop console. Customers sign in on the PrintLoop app instead.";
}

export function canAccessShop(user: SessionUser): boolean {
  return shopAccessError(user) === null;
}
