import type { Metadata } from "next";
import { ReliabilityView } from "./ReliabilityView";

export const metadata: Metadata = { title: "Reliability" };

export default function ReliabilityPage() {
  return <ReliabilityView />;
}
