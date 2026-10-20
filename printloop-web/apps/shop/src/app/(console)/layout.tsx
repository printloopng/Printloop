import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isApiError } from "@printloop/api-client";
import { isImpersonating, requireUser, serverApi } from "@printloop/auth/server";
import { canAccessShop } from "@/lib/access";
import { ConsoleFrame } from "@/components/ConsoleFrame";
import type { ShopProfile } from "@/lib/shop-context";

async function loadShop(): Promise<ShopProfile | null> {
  try {
    const api = await serverApi();
    const { data } = await api.GET("/saas/me");
    return (data?.data as ShopProfile) ?? null;
  } catch (err) {
    if (isApiError(err) && (err.status === 401 || err.status === 403 || err.status === 404)) return null;
    throw err;
  }
}

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const user = await requireUser({ loginPath: "/login", allow: canAccessShop, deniedPath: "/login?denied=1" });
  const shop = await loadShop();
  if (!shop) redirect("/login?denied=1");
  const impersonating = await isImpersonating();
  return (
    <ConsoleFrame user={user} shop={shop} impersonating={Boolean(impersonating)}>
      {children}
    </ConsoleFrame>
  );
}
