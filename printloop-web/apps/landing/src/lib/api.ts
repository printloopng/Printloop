import { apiOrigin } from "@printloop/auth/config";
import type { Schemas } from "@printloop/api-client";

export type BlogPost = Schemas["BlogPost"];
export type ShopSummary = Schemas["ShopSummary"];
export type ShopDetail = Schemas["ShopDetail"];

export class PublicApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function publicGet<T>(path: string, options: { revalidate?: number; tags?: string[] } = {}): Promise<T> {
  const res = await fetch(`${apiOrigin()}/api${path}`, {
    headers: { accept: "application/json" },
    next: { revalidate: options.revalidate ?? 60, tags: options.tags },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new PublicApiError(res.status, body?.message || `Request failed (${res.status})`);
  return body.data as T;
}

export async function publicGetOrNull<T>(path: string, options: { revalidate?: number; tags?: string[] } = {}): Promise<T | null> {
  try {
    return await publicGet<T>(path, options);
  } catch (err) {
    if (err instanceof PublicApiError && err.status === 404) return null;
    throw err;
  }
}
