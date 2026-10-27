import type { Metadata } from "next";
import { KiosksView } from "./KiosksView";

export const metadata: Metadata = { title: "Kiosk fleet" };

export default function KiosksPage() {
  return <KiosksView />;
}
