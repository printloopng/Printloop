"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface ClientShop {
  id: string;
  slug: string;
  name: string;
  fromHost: boolean;
  logoUrl: string | null;
  primaryColor: string | null;
  tagline: string | null;
}

const ShopContext = createContext<ClientShop | null>(null);

export function ShopProvider({ shop, children }: { shop: ClientShop | null; children: ReactNode }) {
  return <ShopContext.Provider value={shop}>{children}</ShopContext.Provider>;
}

export function useShop(): ClientShop | null {
  return useContext(ShopContext);
}

export function shopSwitchHref(slug: string | null, path = "/"): string {
  const url = new URL(path, "http://x");
  url.searchParams.set("shop", slug ?? "none");
  return `${url.pathname}${url.search}`;
}
