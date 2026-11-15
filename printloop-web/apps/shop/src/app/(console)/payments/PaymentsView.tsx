"use client";

import { PageHeader } from "@printloop/ui";
import { useIsOwner } from "@/lib/shop-context";
import { PayoutsTab } from "../settings/PayoutsTab";

export function PaymentsView() {
  const owner = useIsOwner();
  return (
    <div>
      <PageHeader
        kicker="Setup"
        title="Payments"
        description={
          owner
            ? "The bank account Paystack pays on every order. Only you, as the owner, can change it."
            : "The payment account is set by the shop owner. You can see what is on file."
        }
      />
      <PayoutsTab />
    </div>
  );
}
