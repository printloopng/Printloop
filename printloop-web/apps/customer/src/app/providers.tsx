"use client";

import type { ReactNode } from "react";
import { ApiProvider } from "@printloop/api-client/react";
import { Toaster } from "@printloop/ui";
import { ShopProvider, type ClientShop } from "@/lib/shop-context";

export function Providers({
  children,
  apiOrigin,
  shop,
}: {
  children: ReactNode;
  apiOrigin: string;
  shop: ClientShop | null;
}) {
  const tenantHeaders: Record<string, string> = shop ? { "X-Tenant-Slug": shop.slug } : {};
  return (
    <ApiProvider
      apiOrigin={apiOrigin}
      tenantHeaders={tenantHeaders}
      onUnauthorized={() => {
        if (!window.location.pathname.startsWith("/login")) {
          window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        }
      }}
    >
      <ShopProvider shop={shop}>
        {children}
        <Toaster />
      </ShopProvider>
    </ApiProvider>
  );
}
