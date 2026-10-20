"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";

export type ShopProfile = Schemas["ShopProfile"];

const ShopContext = createContext<ShopProfile | null>(null);

export function ShopProfileProvider({ initial, children }: { initial: ShopProfile; children: ReactNode }) {
  const $api = useApi();
  const q = $api.useQuery("get", "/saas/me", {}, { initialData: { success: true, data: initial }, staleTime: 30_000 });
  return <ShopContext.Provider value={(q.data?.data as ShopProfile) ?? initial}>{children}</ShopContext.Provider>;
}

export function useShopProfile(): ShopProfile {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShopProfile must be used inside the console");
  return ctx;
}

export function useCanManage(): boolean {
  const role = useShopProfile().myRole;
  return role === "owner" || role === "admin";
}

export function useIsOwner(): boolean {
  return useShopProfile().myRole === "owner";
}
