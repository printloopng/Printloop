import type { Metadata } from "next";
import { PaymentsView } from "./PaymentsView";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return <PaymentsView />;
}
