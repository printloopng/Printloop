"use client";

import { useState } from "react";
import { PageHeader, Tabs } from "@printloop/ui";
import { PricingTab } from "./PricingTab";
import { PromotionsTab } from "./PromotionsTab";
import { EditingTab } from "./EditingTab";
import { PrinterProfilesTab } from "./PrinterProfilesTab";

type Tab = "prices" | "promotions" | "editing" | "profiles";

export function CatalogueView() {
  const [tab, setTab] = useState<Tab>("prices");
  return (
    <div>
      <PageHeader kicker="Setup" title="Prices & promotions" description="What customers pay. Changes apply to new quotes immediately." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "prices", label: "Price list" },
          { value: "promotions", label: "Promo codes" },
          { value: "editing", label: "Editing fees" },
          { value: "profiles", label: "Printer profiles" },
        ]}
      />
      {tab === "prices" ? <PricingTab /> : tab === "promotions" ? <PromotionsTab /> : tab === "editing" ? <EditingTab /> : <PrinterProfilesTab />}
    </div>
  );
}
