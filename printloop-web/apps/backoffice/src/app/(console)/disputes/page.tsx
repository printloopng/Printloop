import type { Metadata } from "next";
import { DisputesView } from "./DisputesView";

export const metadata: Metadata = { title: "Disputes" };

export default function DisputesPage() {
  return <DisputesView />;
}
