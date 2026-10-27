"use client";

import { Section } from "@printloop/ui";
import { TwoFactorPanel } from "@printloop/auth/two-factor";

export function SecurityTab() {
  return (
    <Section title="Two-step sign-in" description="Ask for a code from an authenticator app every time you sign in. Recommended for owners and admins.">
      <TwoFactorPanel />
    </Section>
  );
}
