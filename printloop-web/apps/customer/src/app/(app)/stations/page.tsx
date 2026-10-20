import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import { StationsView } from "./StationsView";

export const metadata: Metadata = { title: "Stations" };

export default function StationsPage() {
  return (
    <>
      <PageHeader kicker="Stations" title="Where to collect." description="Printers at your shop, with live status and queue length." />
      <StationsView />
    </>
  );
}
