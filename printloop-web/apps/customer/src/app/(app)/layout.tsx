import type { ReactNode } from "react";
import { requireUser } from "@printloop/auth/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser({ loginPath: "/login" });
  return <AppShell user={user}>{children}</AppShell>;
}
