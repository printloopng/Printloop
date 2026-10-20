import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import { getCurrentUser } from "@printloop/auth/server";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  return (
    <>
      <PageHeader kicker="Settings" title="Your account." description="Profile, security, your desktop print driver and your data." />
      {user ? <SettingsView user={user} /> : null}
    </>
  );
}
