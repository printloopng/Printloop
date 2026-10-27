import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import { TwoFactorPanel } from "@printloop/auth/two-factor";

export const metadata: Metadata = { title: "My security" };

export default function SecurityPage() {
  return (
    <div>
      <PageHeader kicker="System" title="My security" description="Two-step sign-in protects an account that can suspend shops and see everyone's data." />
      <TwoFactorPanel />
    </div>
  );
}
