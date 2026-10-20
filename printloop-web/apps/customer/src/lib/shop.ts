import "server-only";
import { cache } from "react";
import type { Schemas } from "@printloop/api-client";
import { serverApi, tenantHint } from "@printloop/auth/server";

export interface ShopContext {
  id: string;
  slug: string;
  name: string;
  fromHost: boolean;
  branding: Schemas["Branding"] | null;
}

export const getShop = cache(async (): Promise<ShopContext | null> => {
  const hint = await tenantHint();
  if (!hint.slug && !hint.domain) return null;
  try {
    const api = await serverApi({ auth: false });
    const { data } = await api.GET("/branding");
    const tenant = data?.data?.tenant;
    if (!tenant?.id || !tenant.slug) return null;
    if (hint.slug && tenant.slug !== hint.slug) return null;
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: data?.data?.branding?.wordmark || tenant.name || tenant.slug,
      fromHost: hint.fromHost,
      branding: data?.data?.branding ?? null,
    };
  } catch {
    return null;
  }
});

export function brandRgb(hex: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
