import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient, isApiError, type ApiClient } from "@printloop/api-client";
import {
  IMPERSONATION_COOKIE,
  PATHNAME_HEADER,
  SESSION_COOKIE,
  TENANT_DOMAIN_HEADER,
  TENANT_SLUG_HEADER,
  TENANT_SOURCE_HEADER,
  apiOrigin,
  type SessionUser,
} from "./config";

export function clientIpFrom(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return h.get("x-real-ip");
}

export function upstreamHeaders(h: Headers, token?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const slug = h.get(TENANT_SLUG_HEADER);
  const domain = h.get(TENANT_DOMAIN_HEADER);
  if (domain) out["X-Tenant-Domain"] = domain;
  else if (slug) out["X-Tenant-Slug"] = slug;
  const secret = process.env.PL_EDGE_SECRET;
  const ip = clientIpFrom(h);
  if (secret && ip) {
    out["X-PL-Edge-Secret"] = secret;
    out["X-PL-Client-IP"] = ip;
  }
  if (token) out.Authorization = `Bearer ${token}`;
  return out;
}

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function isImpersonating(): Promise<string | null> {
  return (await cookies()).get(IMPERSONATION_COOKIE)?.value ?? null;
}

export async function tenantHint(): Promise<{ slug: string | null; domain: string | null; fromHost: boolean }> {
  const h = await headers();
  return {
    slug: h.get(TENANT_SLUG_HEADER),
    domain: h.get(TENANT_DOMAIN_HEADER),
    fromHost: h.get(TENANT_SOURCE_HEADER) === "host",
  };
}

export async function serverApi(options: { auth?: boolean } = {}): Promise<ApiClient> {
  const token = options.auth === false ? null : await getSessionToken();
  return createApiClient({
    baseUrl: `${apiOrigin()}/api`,
    headers: upstreamHeaders(await headers(), token),
    fetch: (input) => fetch(input, { cache: "no-store" }),
  });
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const api = await serverApi();
    const { data } = await api.GET("/customer/auth/me");
    return (data?.data as SessionUser | undefined) ?? null;
  } catch (err) {
    if (isApiError(err) && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
});

export async function currentPath(): Promise<string> {
  return (await headers()).get(PATHNAME_HEADER) ?? "/";
}

export async function requireUser(
  options: { loginPath?: string; allow?: (user: SessionUser) => boolean; deniedPath?: string } = {},
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(await currentPath());
    redirect(`${options.loginPath ?? "/login"}?next=${next}`);
  }
  if (options.allow && !options.allow(user)) redirect(options.deniedPath ?? "/login?denied=1");
  return user;
}
