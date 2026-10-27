"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageHeader, Tabs } from "@printloop/ui";
import { LocationTab } from "./LocationTab";
import { BrandingTab } from "./BrandingTab";
import { PayoutsTab } from "./PayoutsTab";
import { DomainsTab } from "./DomainsTab";
import { WebhooksTab } from "./WebhooksTab";
import { SecurityTab } from "./SecurityTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { AccountTab } from "./AccountTab";
import { SETTINGS_TABS, type SettingsTab } from "./tabs";

export function SettingsView({ initialTab }: { initialTab: SettingsTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const change = (next: SettingsTab) => {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };
  return (
    <div>
      <PageHeader kicker="Setup" title="Settings" description="How your shop appears, gets paid and connects to other tools." />
      <Tabs value={tab} onChange={change} items={[...SETTINGS_TABS]} />
      {tab === "location" ? <LocationTab /> : null}
      {tab === "branding" ? <BrandingTab /> : null}
      {tab === "payouts" ? <PayoutsTab /> : null}
      {tab === "domains" ? <DomainsTab /> : null}
      {tab === "webhooks" ? <WebhooksTab /> : null}
      {tab === "security" ? <SecurityTab /> : null}
      {tab === "integrations" ? <IntegrationsTab /> : null}
      {tab === "account" ? <AccountTab /> : null}
    </div>
  );
}
