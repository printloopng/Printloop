import type { Metadata } from "next";
import { AuthFrame } from "@printloop/ui";
import { AdoptSession } from "./AdoptSession";

export const metadata: Metadata = { title: "Support session" };

export default function ImpersonatePage() {
  return (
    <AuthFrame kicker="PrintLoop support" suffix="SHOP CONSOLE" title="Opening the shop…">
      <AdoptSession />
    </AuthFrame>
  );
}
