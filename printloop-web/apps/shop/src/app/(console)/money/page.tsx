import type { Metadata } from "next";
import { MoneyView } from "./MoneyView";

export const metadata: Metadata = { title: "Money" };

export default function MoneyPage() {
  return <MoneyView />;
}
