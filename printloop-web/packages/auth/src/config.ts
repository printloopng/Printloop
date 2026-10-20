import type { Schemas } from "@printloop/api-client";

export type SessionUser = Schemas["PublicUser"];
export type AppName = "landing" | "customer" | "shop" | "backoffice";

const production = process.env.NODE_ENV === "production";

export const SESSION_COOKIE = production ? "__Host-pl_session" : "pl_session";
export const SHOP_COOKIE = "pl_shop";
export const IMPERSONATION_COOKIE = "pl_impersonating";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export const TENANT_SLUG_HEADER = "x-pl-tenant-slug";
export const TENANT_DOMAIN_HEADER = "x-pl-tenant-domain";
export const PATHNAME_HEADER = "x-pl-pathname";
export const TENANT_SOURCE_HEADER = "x-pl-tenant-source";

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function apiOrigin(): string {
  return trimSlash(process.env.PL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");
}

export function publicApiOrigin(): string {
  return trimSlash(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");
}

export function apexDomains(): string[] {
  return (process.env.PL_APEX_DOMAINS || "printloop.app,printloop.test")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const appUrls = {
  landing: trimSlash(process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3000"),
  customer: trimSlash(process.env.NEXT_PUBLIC_CUSTOMER_URL || "http://localhost:3001"),
  shop: trimSlash(process.env.NEXT_PUBLIC_SHOP_URL || "http://localhost:3002"),
  backoffice: trimSlash(process.env.NEXT_PUBLIC_BACKOFFICE_URL || "http://localhost:3003"),
};

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw.startsWith("/api/")) return fallback;
  return raw;
}
