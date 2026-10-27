import type { Metadata } from "next";
import { PayoutsView } from "./PayoutsView";
import { isPayoutFilter } from "./filters";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <PayoutsView initial={isPayoutFilter(status) ? status : "all"} />;
}
