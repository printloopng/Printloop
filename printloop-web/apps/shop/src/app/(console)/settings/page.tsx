import type { Metadata } from "next";
import { SettingsView } from "./SettingsView";
import { isSettingsTab } from "./tabs";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <SettingsView initialTab={isSettingsTab(tab) ? tab : "location"} />;
}
