import type { SessionUser } from "@printloop/auth/config";

export function backofficeAccessError(user: SessionUser): string | null {
  if (user.role === "super_admin") return null;
  return "The backoffice is for PrintLoop staff only.";
}

export function canAccessBackoffice(user: SessionUser): boolean {
  return backofficeAccessError(user) === null;
}
