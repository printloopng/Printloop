"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@printloop/api-client";
import type { SessionUser } from "./config";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, payload?.message || "Request failed", payload?.code, payload);
  }
  return payload?.data as T;
}

export interface Credentials {
  email: string;
  password: string;
  totpCode?: string;
}

export interface Registration {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

export function signIn(credentials: Credentials): Promise<{ user: SessionUser }> {
  return post("/api/auth/login", credentials);
}

export function register(details: Registration): Promise<{ user: SessionUser }> {
  return post("/api/auth/register", details);
}

export function adoptToken(token: string): Promise<{ user: SessionUser }> {
  return post("/api/auth/adopt", { token });
}

export async function signOut(redirectTo = "/login"): Promise<void> {
  await post("/api/auth/logout").catch(() => undefined);
  window.location.assign(redirectTo);
}

export const SESSION_QUERY_KEY = ["pl-session"] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      const body = await res.json().catch(() => null);
      return (body?.data?.user as SessionUser | null) ?? null;
    },
    staleTime: 60_000,
  });
}

export function useRefreshSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
}
