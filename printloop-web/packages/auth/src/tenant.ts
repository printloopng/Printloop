import { apexDomains } from "./config";

export interface TenantHint {
  slug?: string;
  domain?: string;
}

const RESERVED = new Set(["www", "app", "api", "shop", "admin", "backoffice", "docs", "status", "mail", "help"]);
const SLUG = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;

export function isValidSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && SLUG.test(value) && !RESERVED.has(value);
}

function isIp(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

export function tenantFromHost(rawHost: string | null | undefined, apexes: string[] = apexDomains()): TenantHint {
  const host = (rawHost || "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!host || host === "localhost" || isIp(host)) return {};
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length).split(".").pop() ?? "";
    return isValidSlug(sub) ? { slug: sub } : {};
  }
  if (host.endsWith(".vercel.app") || host.endsWith(".onrender.com")) return {};
  for (const apex of apexes) {
    if (host === apex) return {};
    if (host.endsWith(`.${apex}`)) {
      const sub = host.slice(0, -(apex.length + 1)).split(".").pop() ?? "";
      return isValidSlug(sub) ? { slug: sub } : {};
    }
  }
  return { domain: host };
}
