"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Notice, PageHeader } from "@printloop/ui";
import { useSession } from "@printloop/auth/client";
import { TwoFactorPanel } from "@printloop/auth/two-factor";

export function TwoFactorGate() {
  const router = useRouter();
  const enabled = Boolean(useSession().data?.totpEnabled);
  useEffect(() => {
    if (enabled) router.refresh();
  }, [enabled, router]);
  return (
    <div>
      <PageHeader kicker="Required" title="Turn on two-step sign-in" description="Staff accounts can move money and impersonate shops, so a code from your phone is required before anything else loads." />
      <div className="mb-5 max-w-xl">
        <Notice tone="warn">Until this is on, every backoffice action is blocked.</Notice>
      </div>
      <TwoFactorPanel />
    </div>
  );
}
