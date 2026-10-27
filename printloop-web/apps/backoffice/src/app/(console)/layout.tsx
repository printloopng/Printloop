import type { ReactNode } from "react";
import { requireUser } from "@printloop/auth/server";
import { canAccessBackoffice } from "@/lib/access";
import { ConsoleFrame } from "@/components/ConsoleFrame";
import { TwoFactorGate } from "@/components/TwoFactorGate";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const user = await requireUser({ loginPath: "/login", allow: canAccessBackoffice, deniedPath: "/login?denied=1" });
  const mustEnrol = process.env.NODE_ENV === "production" && !user.totpEnabled;
  return (
    <ConsoleFrame user={user} warnNoTwoFactor={!user.totpEnabled && !mustEnrol}>
      {mustEnrol ? <TwoFactorGate /> : children}
    </ConsoleFrame>
  );
}
